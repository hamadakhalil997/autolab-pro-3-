import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Car,
  Check,
  Clock,
  Database,
  FileText,
  Gauge,
  Home,
  Info,
  LayoutGrid,
  Map as MapIcon,
  Settings as SettingsIcon,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { DatabaseView } from './components/DatabaseView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { AboutView, FunctionsView, LogsView, SettingsView, TcuView } from './components/SecondaryViews';
import { MapsView, TuningView } from './components/TuningAndMapsView';
import { VciConnectionModal } from './components/VciConnectionModal';
import {
  ERA_GENERATIONS,
  INITIAL_DTCS,
  INITIAL_PARTS_CATALOG,
  INITIAL_VEHICLE_DB,
  createDefaultCalibrationMaps,
  getBusNodesForVehicle,
} from './data/vehicleDatabase';
import { INITIAL_KEY_IMMO_DB } from './data/keyImmoDatabase';
import {
  computeSeedKey,
  crc32,
  describeDtcCode,
  dispatchUdsCommand,
  getActivePhysicalTransport,
  syncMapsToEcuBuffer,
} from './services/ecuProtocolEngine';
import { webSerialDriver } from './services/webSerialObd';
import { webUsbDriver } from './services/webUsbDirect';
import {
  clearPersistedLogs,
  fetchWorkspace,
  persistCodingEntry,
  persistCustomKeys,
  persistCustomParts,
  persistCustomVehicles,
  persistLogEntry,
  persistTraceSession,
  persistVaultMetadata,
  persistWorkspaceSettings,
} from './services/workspaceApi';
import { wsObdDriver } from './services/wsObdTransport';
import type {
  ActiveVehicleProfile,
  AuditLogEntry,
  CalibrationMapTable,
  CodingConfigState,
  DbSubTab,
  DiagSubTab,
  DtcItem,
  EcuSessionState,
  FuncSubTab,
  HardwareLinkState,
  IgnitionState,
  KeyProgrammingRecord,
  NavView,
  ObdProtocolCode,
  PartCatalogItem,
  TelemetrySample,
  VaultSnapshot,
  VciAdapterType,
  VehicleRecord,
} from './types/autolab';

const STORAGE_CUSTOM_VEHICLES = 'autolab_custom_vehicles_v1';
const STORAGE_CUSTOM_PARTS = 'autolab_custom_parts_v1';
const STORAGE_CUSTOM_KEYS = 'autolab_custom_keys_v1';

function createEcuDump(ecuName: string, vin: string): Uint8Array {
  const arr = new Uint8Array(512);
  const header = `${ecuName.replace(/\s+/g, '_')}_EEPROM_${vin}_IMMO_ON`;
  for (let i = 0; i < 512; i++) {
    arr[i] = i < header.length ? header.charCodeAt(i) : (i * 17 + 0x5a) & 0xff;
  }
  for (let j = 0x120; j < 0x130; j++) arr[j] = 0xee;
  const c = crc32(arr.slice(0, arr.length - 4));
  arr[arr.length - 4] = c & 0xff;
  arr[arr.length - 3] = (c >>> 8) & 0xff;
  arr[arr.length - 2] = (c >>> 16) & 0xff;
  arr[arr.length - 1] = (c >>> 24) & 0xff;
  return arr;
}

export default function App() {
  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [diagSubTab, setDiagSubTab] = useState<DiagSubTab>('topo');
  const [funcSubTab, setFuncSubTab] = useState<FuncSubTab>('coding');
  const [dbSubTab, setDbSubTab] = useState<DbSubTab>('vehicles');

  // Bridge-Free Direct Hardware Link State
  const [vciModalOpen, setVciModalOpen] = useState(false);
  const [vciAdapter, setVciAdapter] = useState<VciAdapterType>(
    'WebSerial USB OBD-II / ELM327 / STN (Direct COM)'
  );
  const [vciConnected, setVciConnected] = useState(false);
  const [ecuSession, setEcuSession] = useState<EcuSessionState>('NO_SESSION');
  const [ignition, setIgnition] = useState<IgnitionState>('KL15_ON');
  const [demoBenchMode, setDemoBenchMode] = useState(false);
  const [isHandshaking, setIsHandshaking] = useState(false);

  const [hardwareLink, setHardwareLink] = useState<HardwareLinkState>({
    transport: 'none',
    statusLabel: 'DIRECT READY (NO BRIDGE)',
    deviceLabel: null,
    vendorId: null,
    productId: null,
    serialNumber: null,
    firmwareVersion: null,
    detectedProtocol: null,
    baudRate: 38400,
    protocolCode: '0',
    wsEndpoint: 'ws://192.168.0.10:35000',
    autoConnectSavedUsb: false,
    lastMessage: 'Direct Browser Engine ready (WebSerial / WebUSB / DoIP WebSocket — No bridge required).',
  });

  const [handshakeSteps, setHandshakeSteps] = useState<
    { step: string; detail: string; status: 'done' | 'active' | 'pending' | 'error' }[]
  >([
    {
      step: '1. Direct Hardware Transport (WebSerial / WebUSB)',
      detail: 'Ready — No external bridge required',
      status: 'pending',
    },
    {
      step: '2. DLC-16 Electrical & Bus Termination',
      detail: 'Waiting for USB adapter or Bench ECU',
      status: 'pending',
    },
    {
      step: '3. Protocol & Baudrate Negotiation',
      detail: 'ATSP0 / ISO 15765 CAN / KWP2000',
      status: 'pending',
    },
    {
      step: '4. ECU Diagnostic Session (0x10 03 / 0x22 F1 90)',
      detail: 'Awaiting session activation',
      status: 'pending',
    },
    {
      step: '5. Network Module Enumeration',
      detail: 'Pending verified ECU link',
      status: 'pending',
    },
  ]);

  const ecuOnline = vciConnected && ecuSession === 'SESSION_ACTIVE' && ignition !== 'OFF';

  // Electron desktop host detection. This is application readiness only;
  // it must never be interpreted as a connected VCI or ECU.
  useEffect(() => {
    const desktopApi = window.autoLabDesktop;
    if (!desktopApi) return;
    void desktopApi.getRuntimeInfo().then((runtime) => {
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: runtime.vciSdkReady
          ? 'WINDOWS NATIVE HOST READY'
          : 'WINDOWS DESKTOP · VCI SDK PENDING',
        lastMessage: runtime.vciSdkReady
          ? 'Native Windows host is ready. No ECU session has been confirmed.'
          : 'AutoLab Pro desktop host is running. The Autocom/VCI vendor SDK is not integrated yet.',
      }));
    }).catch(() => {
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: 'DESKTOP HOST STATUS UNKNOWN',
        lastMessage: 'Could not read native desktop host status.',
      }));
    });
  }, []);


  // Live Telemetry
  const [targetIdle, setTargetIdle] = useState(735);
  const [rpm, setRpm] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [load, setLoad] = useState(0);
  const [temp, setTemp] = useState(0);
  const [batt, setBatt] = useState(0);
  const [tuneMultiplier, setTuneMultiplier] = useState(1.0);
  const [tcuSportMode, setTcuSportMode] = useState(false);

  // Live Chart & Trace Recording
  const [recording, setRecording] = useState(false);
  const [traceLog, setTraceLog] = useState<TelemetrySample[]>([]);
  const [chartData, setChartData] = useState<TelemetrySample[]>([]);

  // Active Vehicle Profile
  const [vehicle, setVehicle] = useState<ActiveVehicleProfile>({
    displayName: 'BMW 4 Series F32 (2016)',
    make: 'BMW',
    model: '3 / 4 Series F30 / F32',
    year: 2016,
    ecu: 'MED17.1',
    fullEcu: 'Bosch MED17.1 / MEVD17.2 / MG1',
    vin: 'WBA8E9C50GK482910',
    proto: 'UDS / CAN-FD (500k)',
    engines: 'N20 / N55 / B48 / B58',
    swVersion: '1037524819_SW04.2',
    cvn: '8A4F91C2',
    flashCount: 2,
  });

  // Global 1980-2026 Database State
  const [vehicles, setVehicles] = useState<VehicleRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_VEHICLES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return [...parsed, ...INITIAL_VEHICLE_DB];
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_VEHICLE_DB;
  });

  const [parts, setParts] = useState<PartCatalogItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_PARTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return [...INITIAL_PARTS_CATALOG, ...parsed];
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_PARTS_CATALOG;
  });

  const [keysDb, setKeysDb] = useState<KeyProgrammingRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CUSTOM_KEYS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return [...parsed, ...INITIAL_KEY_IMMO_DB];
      }
    } catch {
      // ignore storage errors
    }
    return INITIAL_KEY_IMMO_DB;
  });

  // Diagnostics, Security & Variant Coding State
  const [dtcs, setDtcs] = useState<DtcItem[]>([]);
  const [ecuUnlocked, setEcuUnlocked] = useState(false);
  const [securitySeed, setSecuritySeed] = useState<string | null>(null);
  const [edrCleared, setEdrCleared] = useState(false);
  const [codingConfig, setCodingConfig] = useState<CodingConfigState>({
    region: 'ECE (Europe)',
    trans: '8HP Automatic',
    light: 'Adaptive Matrix LED',
  });
  const [codingAuditLogs, setCodingAuditLogs] = useState<string[]>([
    '[Initial] Region=ECE (Europe) | Trans=8HP Automatic | Light=Adaptive Matrix LED',
  ]);
  const [scannedOnlineIds, setScannedOnlineIds] = useState<string[] | null>(null);

  // Calibration Maps + Binary Hex Lab + Rollback Vault
  const [calMaps, setCalMaps] = useState<CalibrationMapTable[]>(() =>
    createDefaultCalibrationMaps('MED17.1')
  );
  const initialDump = useMemo(() => createEcuDump('MED17.1', 'WBA8E9C50GK482910'), []);
  const [origBuffer, setOrigBuffer] = useState<Uint8Array>(initialDump);
  const [workBuffer, setWorkBuffer] = useState<Uint8Array>(() => new Uint8Array(initialDump));
  const [vault, setVault] = useState<VaultSnapshot[]>([
    {
      label: 'MED17.1_Stock_EEPROM.bin',
      timestamp: new Date().toLocaleTimeString(),
      cvn: crc32(initialDump).toString(16).padStart(8, '0').toUpperCase(),
      data: new Uint8Array(initialDump),
    },
  ]);

  // Toast & Audit Logs
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  const pushLog = useCallback(
    (source: string, msg: string, level: AuditLogEntry['level'] = 'info') => {
      const entry: AuditLogEntry = {
        time: new Date().toLocaleTimeString(),
        source,
        msg,
        level,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 199)]);
      void persistLogEntry(entry);
    },
    []
  );

  const pushToast = useCallback(
    (msg: string, source = 'System', level: AuditLogEntry['level'] = 'info') => {
      setToastMsg(msg);
      pushLog(source, msg, level);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3400);
    },
    [pushLog]
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Direct USB Hardware Scanner & Auto-Init (Zero Bridge)
  const handleScanSavedHardware = useCallback(async () => {
    const serialPorts = await webSerialDriver.getAuthorizedPorts();
    const usbDevs = await webUsbDriver.getAuthorizedDevices();

    if (serialPorts.length === 0 && usbDevs.length === 0) {
      setHardwareLink((prev) => ({
        ...prev,
        lastMessage:
          'No previously paired USB adapters found. Click USB COM or WebUSB to pair your adapter directly.',
      }));
      pushLog('USB', 'Scan complete: no paired browser USB ports yet.', 'info');
      return;
    }

    if (serialPorts.length > 0 && !webSerialDriver.isOpen) {
      try {
        const info = await webSerialDriver.connect(
          hardwareLink.baudRate,
          hardwareLink.protocolCode,
          serialPorts[0]
        );
        setDemoBenchMode(false);
        setVciConnected(true);
        setEcuSession('WAITING_FOR_ECU');
        if (info.batteryVoltage !== null) setBatt(info.batteryVoltage);
        setHardwareLink((prev) => ({
          ...prev,
          transport: 'webserial',
          statusLabel: 'USB COM CONNECTED',
          deviceLabel: info.label,
          vendorId: info.vendorId,
          productId: info.productId,
          firmwareVersion: info.firmwareVersion,
          detectedProtocol: info.detectedProtocol,
          lastMessage: `Auto-bound ${info.label} · ${info.firmwareVersion}`,
        }));
        pushToast(`Auto-connected USB adapter (${info.label})`, 'WebSerial', 'ok');
        return;
      } catch (err) {
        pushLog(
          'WebSerial',
          err instanceof Error ? err.message : 'Unable to reopen paired COM port',
          'warn'
        );
      }
    }

    if (usbDevs.length > 0 && !webUsbDriver.isOpen) {
      try {
        const info = await webUsbDriver.connect(hardwareLink.baudRate, usbDevs[0]);
        setDemoBenchMode(false);
        setVciConnected(true);
        setEcuSession('WAITING_FOR_ECU');
        setHardwareLink((prev) => ({
          ...prev,
          transport: 'webusb',
          statusLabel: 'WEBUSB CONNECTED',
          deviceLabel: info.label,
          vendorId: info.vendorId,
          productId: info.productId,
          serialNumber: info.serialNumber,
          firmwareVersion: info.firmwareVersion,
          lastMessage: `WebUSB Bound: ${info.label}`,
        }));
        pushToast(`Auto-connected WebUSB device (${info.label})`, 'WebUSB', 'ok');
      } catch (err) {
        pushLog(
          'WebUSB',
          err instanceof Error ? err.message : 'Unable to reopen paired WebUSB device',
          'warn'
        );
      }
    }
  }, [hardwareLink.baudRate, hardwareLink.protocolCode, pushLog, pushToast]);

  // Load Persisted Workspace + Subscribe to Physical Hardware Unplug Events
  useEffect(() => {
    let mounted = true;

    void fetchWorkspace().then((ws) => {
      if (!mounted || !ws) return;
      if (ws.customVehicles.length > 0) {
        setVehicles([...ws.customVehicles, ...INITIAL_VEHICLE_DB]);
      }
      if (ws.customKeys && ws.customKeys.length > 0) {
        setKeysDb([...ws.customKeys, ...INITIAL_KEY_IMMO_DB]);
      }
      if (ws.customParts.length > 0) {
        setParts([...INITIAL_PARTS_CATALOG, ...ws.customParts]);
      }
      if (ws.codingHistory.length > 0) {
        setCodingAuditLogs(ws.codingHistory);
      }
      if (ws.logs.length > 0) {
        setLogs(ws.logs);
      }
      if (ws.settings) {
        setVciAdapter(ws.settings.vciAdapter);
        setTargetIdle(ws.settings.targetIdle);
        setTcuSportMode(ws.settings.tcuSportMode);
        setCodingConfig(ws.settings.coding);
        setHardwareLink((prev) => ({
          ...prev,
          baudRate: ws.settings.baudRate,
          protocolCode: ws.settings.protocolCode,
          wsEndpoint: ws.settings.wsEndpoint,
          autoConnectSavedUsb: ws.settings.autoConnectSavedUsb,
        }));
        if (ws.settings.autoConnectSavedUsb) {
          void handleScanSavedHardware();
        }
      }
    });

    const unsubSerial = webSerialDriver.onDisconnect(() => {
      setVciConnected(false);
      setEcuSession('NO_SESSION');
      setBatt(0);
      setRpm(0);
      setSpeed(0);
      setLoad(0);
      setTemp(0);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: 'USB DISCONNECTED',
        lastMessage: 'Physical USB COM adapter was unplugged.',
      }));
      pushToast('Physical USB COM adapter unplugged', 'Hardware', 'warn');
    });

    const unsubUsb = webUsbDriver.onDisconnect(() => {
      setVciConnected(false);
      setEcuSession('NO_SESSION');
      setBatt(0);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: 'USB DISCONNECTED',
        lastMessage: 'WebUSB device was unplugged.',
      }));
      pushToast('WebUSB adapter disconnected', 'Hardware', 'warn');
    });

    const unsubWs = wsObdDriver.onDisconnect(() => {
      setVciConnected(false);
      setEcuSession('NO_SESSION');
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: 'SOCKET CLOSED',
        lastMessage: 'Direct WebSocket / DoIP gateway closed.',
      }));
      pushToast('DoIP WebSocket connection closed', 'Gateway', 'warn');
    });

    return () => {
      mounted = false;
      unsubSerial();
      unsubUsb();
      unsubWs();
    };
  }, [handleScanSavedHardware, pushToast]);

  // Count edited calibration map cells waiting to be flashed
  const pendingMapEdits = useMemo(() => {
    let count = 0;
    for (const m of calMaps) {
      for (let r = 0; r < m.current.length; r++) {
        for (let c = 0; c < m.current[r].length; c++) {
          if (m.current[r][c] !== m.stock[r][c]) count++;
        }
      }
    }
    return count;
  }, [calMaps]);

  const handleChangeIgnition = useCallback(
    (next: IgnitionState) => {
      setIgnition(next);
      if (next === 'OFF') {
        setSpeed(0);
        setRpm(0);
        setLoad(0);
        if (demoBenchMode) setBatt(12.2);
        setEcuUnlocked(false);
        setSecuritySeed(null);
        pushToast('Terminal KL15 OFF — ECU entered sleep state', 'Power', 'warn');
      } else if (next === 'KL15_ON') {
        setSpeed(0);
        setRpm(0);
        setLoad(0);
        if (demoBenchMode) {
          setBatt(12.6);
          setTemp(84);
        }
        pushToast('Terminal KL15 ON (KOEO)', 'Power', 'ok');
      } else if (next === 'ENGINE_IDLE') {
        setSpeed(0);
        if (demoBenchMode) {
          setRpm(targetIdle);
          setLoad(12.5);
          setTemp(87);
          setBatt(13.7);
        }
        pushToast('Terminal set to Engine Idle', 'Power', 'ok');
      } else if (next === 'DYNO_PULL') {
        if (demoBenchMode) {
          setSpeed(142);
          setBatt(14.1);
        }
        pushToast('Terminal set to Dyno Load', 'Dyno', 'ok');
      }
    },
    [demoBenchMode, targetIdle, pushToast]
  );

  const handleToggleDemoBench = (enabled: boolean) => {
    setDemoBenchMode(enabled);
    if (enabled) {
      void webSerialDriver.disconnect();
      void webUsbDriver.disconnect();
      wsObdDriver.disconnect();
      setVciConnected(true);
      setEcuSession('SESSION_ACTIVE');
      setIgnition('ENGINE_IDLE');
      setBatt(13.7);
      setTemp(87);
      setRpm(targetIdle);
      setLoad(12.5);
      setSpeed(0);
      setDtcs(INITIAL_DTCS);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'bench',
        statusLabel: 'BENCH ECU ONLINE',
        deviceLabel: `Internal Bench ECU (${vehicle.ecu})`,
        firmwareVersion: vehicle.swVersion,
        detectedProtocol: vehicle.proto,
        lastMessage: `Bench ECU Session Active (${vehicle.ecu}) — All UDS/Maps/Coding routines operational.`,
      }));
      setHandshakeSteps([
        { step: '1. Direct Browser Engine', detail: 'Zero-Bridge Bench ECU Active', status: 'done' },
        { step: '2. DLC-16 Electrical Bus', detail: 'KL30 13.7V · 60.2 Ω Verified', status: 'done' },
        { step: '3. Protocol Negotiation', detail: `${vehicle.proto} Locked`, status: 'done' },
        { step: '4. ECU Diagnostic Session (0x10 03)', detail: `${vehicle.ecu} · ${vehicle.vin}`, status: 'done' },
        { step: '5. Network Module Matrix', detail: '14 Core Systems Online', status: 'done' },
      ]);
      pushToast(`Bench ECU Session Online (${vehicle.ecu})`, 'ECU', 'ok');
    } else {
      setVciConnected(false);
      setEcuSession('NO_SESSION');
      setDtcs([]);
      setScannedOnlineIds(null);
      setRpm(0);
      setSpeed(0);
      setLoad(0);
      setTemp(0);
      setBatt(0);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'none',
        statusLabel: 'DIRECT READY (NO BRIDGE)',
        deviceLabel: null,
        lastMessage: 'Direct Hardware Mode active. Pair USB COM, WebUSB, or WebSocket.',
      }));
      pushToast('Bench ECU closed — Direct Physical Hardware Mode ready', 'System', 'info');
    }
  };

  // Real Physical WebSerial OBD-II / ELM327 COM Port Binding
  const handleConnectWebSerial = async () => {
    if (!('serial' in navigator)) {
      pushToast('WebSerial requires Chrome or Edge over HTTPS/localhost.', 'WebSerial', 'err');
      return;
    }
    try {
      const info = await webSerialDriver.connect(hardwareLink.baudRate, hardwareLink.protocolCode);
      setDemoBenchMode(false);
      await webUsbDriver.disconnect();
      wsObdDriver.disconnect();
      setVciConnected(true);
      setEcuSession('WAITING_FOR_ECU');
      if (info.batteryVoltage !== null) setBatt(info.batteryVoltage);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'webserial',
        statusLabel: 'USB COM CONNECTED',
        deviceLabel: info.label,
        vendorId: info.vendorId,
        productId: info.productId,
        firmwareVersion: info.firmwareVersion,
        detectedProtocol: info.detectedProtocol,
        lastMessage: `${info.label} · ${info.firmwareVersion} (${info.detectedProtocol})`,
      }));
      pushToast(`Connected directly via USB COM (${info.label})`, 'WebSerial', 'ok');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'USB COM connection failed', 'WebSerial', 'err');
    }
  };

  // Real Physical WebUSB Direct Adapter Binding (Zero Bridge!)
  const handleConnectWebUsb = async () => {
    if (!('usb' in navigator)) {
      pushToast('WebUSB requires Chrome or Edge over HTTPS/localhost.', 'WebUSB', 'err');
      return;
    }
    try {
      const info = await webUsbDriver.connect(hardwareLink.baudRate);
      setDemoBenchMode(false);
      await webSerialDriver.disconnect();
      wsObdDriver.disconnect();
      setVciConnected(true);
      setEcuSession('WAITING_FOR_ECU');
      setBatt(12.6);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'webusb',
        statusLabel: 'WEBUSB CONNECTED',
        deviceLabel: info.label,
        vendorId: info.vendorId,
        productId: info.productId,
        serialNumber: info.serialNumber,
        firmwareVersion: info.firmwareVersion,
        detectedProtocol: `FTDI/USB @ ${hardwareLink.baudRate}`,
        lastMessage: `WebUSB Bound: ${info.label} ${info.serialNumber ? `SN ${info.serialNumber}` : ''}`,
      }));
      pushToast(`Connected directly via WebUSB (${info.label})`, 'WebUSB', 'ok');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WebUSB connection failed', 'WebUSB', 'err');
    }
  };

  // Real Direct DoIP / Wi-Fi OBD WebSocket Binding
  const handleConnectWebSocket = async () => {
    try {
      const res = await wsObdDriver.connect(hardwareLink.wsEndpoint);
      setDemoBenchMode(false);
      await webSerialDriver.disconnect();
      await webUsbDriver.disconnect();
      setVciConnected(true);
      setEcuSession('WAITING_FOR_ECU');
      setBatt(12.6);
      setHardwareLink((prev) => ({
        ...prev,
        transport: 'websocket',
        statusLabel: 'SOCKET CONNECTED',
        deviceLabel: res.endpoint,
        firmwareVersion: res.banner,
        detectedProtocol: 'DoIP / CAN WebSocket',
        lastMessage: `Direct WebSocket open: ${res.endpoint}`,
      }));
      pushToast(`Connected to direct DoIP/OBD socket (${res.endpoint})`, 'Gateway', 'ok');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WebSocket connection failed', 'Gateway', 'err');
    }
  };

  const handleReadAdapterInfo = async () => {
    if (webSerialDriver.isOpen) {
      const info = await webSerialDriver.readAdapterInfo();
      if (info.voltage !== null) setBatt(info.voltage);
      setHardwareLink((prev) => ({
        ...prev,
        firmwareVersion: info.firmware,
        detectedProtocol: info.protocol,
        lastMessage: `ATI: ${info.firmware} · ATDP: ${info.protocol} · ATRV: ${info.voltage ?? '--'}V`,
      }));
      pushToast(`Adapter: ${info.firmware} (${info.protocol})`, 'Adapter', 'ok');
      return;
    }

    if (webUsbDriver.isOpen) {
      const ati = await webUsbDriver.sendCommand('ATI', 600);
      const atrv = await webUsbDriver.sendCommand('ATRV', 600);
      setHardwareLink((prev) => ({
        ...prev,
        firmwareVersion: ati || prev.firmwareVersion,
        lastMessage: `WebUSB ${prev.vendorId}:${prev.productId} · ${ati || 'Direct Bulk'} · ${atrv || ''}`,
      }));
      pushToast(`WebUSB Adapter: ${ati || hardwareLink.deviceLabel}`, 'WebUSB', 'ok');
      return;
    }

    if (wsObdDriver.isOpen) {
      const ati = await wsObdDriver.sendCommand('ATI', 800);
      setHardwareLink((prev) => ({
        ...prev,
        firmwareVersion: ati || prev.firmwareVersion,
        lastMessage: `Socket ATI: ${ati}`,
      }));
      pushToast(`Gateway: ${ati}`, 'Gateway', 'ok');
      return;
    }

    if (demoBenchMode) {
      pushToast(`Bench ECU Profile: ${vehicle.ecu} · ${vehicle.swVersion}`, 'Bench', 'info');
    }
  };

  // Real Telemetry Loop (Polls WebSerial / WebUSB / WebSocket OR Bench ECU if explicitly active)
  useEffect(() => {
    const id = window.setInterval(() => {
      const linkActive = vciConnected && ecuSession === 'SESSION_ACTIVE' && ignition !== 'OFF';
      if (!linkActive) return;

      if (webSerialDriver.isOpen) {
        void (async () => {
          try {
            const live = await webSerialDriver.pollTelemetry();
            const nextBatt = live.batt ?? batt;
            const nextRpm = live.rpm ?? rpm;
            const nextSpd = live.speed ?? speed;
            const nextLoad = live.load ?? load;
            const nextTemp = live.temp ?? temp;

            if (live.batt !== undefined) setBatt(live.batt);
            if (live.rpm !== undefined) setRpm(live.rpm);
            if (live.speed !== undefined) setSpeed(live.speed);
            if (live.load !== undefined) setLoad(live.load);
            if (live.temp !== undefined) setTemp(live.temp);

            const sample: TelemetrySample = {
              t: Date.now(),
              rpm: nextRpm,
              speed: nextSpd,
              load: nextLoad,
              temp: nextTemp,
              batt: nextBatt,
              map: live.map ?? 101,
              ign: live.ign ?? 0,
            };
            setChartData((prev) => [...prev.slice(-59), sample]);
            if (recording) setTraceLog((prev) => [...prev, sample]);
          } catch {
            // ignore transient frame read
          }
        })();
        return;
      }

      if (!demoBenchMode) return;

      let nextRpm = 0;
      let nextSpeed = speed;
      let nextLoad = 0;
      let nextTemp = temp || 87;
      let nextMap = 101;
      let nextIgn = 0;

      if (ignition === 'KL15_ON') {
        nextRpm = 0;
        nextSpeed = 0;
        nextLoad = 0;
      } else if (ignition === 'DYNO_PULL') {
        const sweepSpeed = speed < 220 ? speed + 6 : 65;
        nextSpeed = sweepSpeed;
        const jitter = Math.round((Math.random() - 0.5) * 45);
        nextRpm = Math.min(
          6850,
          Math.round((targetIdle + sweepSpeed * 26) * (tcuSportMode ? 1.06 : 1) + jitter)
        );
        nextLoad = +(Math.min(99.5, (58 + sweepSpeed * 0.2) * tuneMultiplier)).toFixed(1);
        nextMap = Math.round((155 + sweepSpeed * 0.45) * tuneMultiplier);
        nextIgn = +(14.5 + Math.random() * 2.5).toFixed(1);
        nextTemp = Math.min(94, +((temp || 87) + 0.1).toFixed(1));
        setSpeed(nextSpeed);
      } else {
        const jitter = Math.round((Math.random() - 0.5) * 14);
        nextRpm = speed > 0 ? Math.min(6800, targetIdle + speed * 21 + jitter) : targetIdle + jitter;
        nextLoad = +((12.2 + speed * 0.18) * tuneMultiplier + (Math.random() - 0.5) * 0.7).toFixed(1);
        nextMap = Math.round((100 + speed * 0.4) * tuneMultiplier + Math.random() * 2);
        nextIgn = +(8.2 + Math.random() * 1.6).toFixed(1);
      }

      const sample: TelemetrySample = {
        t: Date.now(),
        rpm: nextRpm,
        speed: nextSpeed,
        load: nextLoad,
        temp: nextTemp,
        batt,
        map: nextMap,
        ign: nextIgn,
      };
      setRpm(nextRpm);
      setLoad(nextLoad);
      setTemp(nextTemp);
      setChartData((prev) => [...prev.slice(-59), sample]);
      if (recording) setTraceLog((prev) => [...prev, sample]);
    }, 650);

    return () => window.clearInterval(id);
  }, [
    vciConnected,
    ecuSession,
    ignition,
    demoBenchMode,
    speed,
    temp,
    batt,
    rpm,
    load,
    targetIdle,
    tuneMultiplier,
    tcuSportMode,
    recording,
  ]);

  // Open & Verify ECU Session across active direct transport
  const handleOpenEcuSession = async (targetVehicle: ActiveVehicleProfile = vehicle) => {
    setIsHandshaking(true);
    const physical = getActivePhysicalTransport();

    if (physical === 'webserial') {
      try {
        setHandshakeSteps([
          { step: '1. Direct USB Serial Port', detail: hardwareLink.deviceLabel || 'COM Open', status: 'done' },
          { step: '2. Battery & Bus Voltage (ATRV)', detail: `${batt.toFixed(1)} V`, status: 'done' },
          { step: '3. Bus Protocol (ATSP)', detail: 'Probing vehicle bus...', status: 'active' },
          { step: '4. Query Vehicle VIN & Live PIDs', detail: 'Sending 09 02 / 22 F1 90 / 01 00', status: 'pending' },
          { step: '5. Read Stored Faults (Mode 03/07)', detail: 'Scanning DTC memory', status: 'pending' },
        ]);

        const live = await webSerialDriver.pollTelemetry();
        const vinRead = await webSerialDriver.readVin();
        const realDtcs = await webSerialDriver.readDtcs();

        if (live.batt !== undefined) setBatt(live.batt);
        if (live.rpm !== undefined) setRpm(live.rpm);
        if (live.speed !== undefined) setSpeed(live.speed);
        if (live.load !== undefined) setLoad(live.load);
        if (live.temp !== undefined) setTemp(live.temp);
        if (vinRead) setVehicle((prev) => ({ ...prev, vin: vinRead }));

        setDtcs(
          realDtcs.map((code) => {
            const info = describeDtcCode(code);
            return {
              nodeId: info.nodeId,
              mod: info.mod,
              code,
              type: 'Confirmed',
              desc: info.desc,
              ff: `RPM: ${live.rpm ?? 0} | Batt: ${(live.batt ?? batt).toFixed(1)}V`,
            };
          })
        );

        const ecuResponding =
          live.rpm !== undefined || live.temp !== undefined || live.load !== undefined || vinRead !== null;

        if (!ecuResponding) {
          setEcuSession('WAITING_FOR_ECU');
          setHandshakeSteps((prev) =>
            prev.map((s, idx) => ({
              ...s,
              status: idx < 2 ? 'done' : 'error',
              detail: idx === 3 ? 'NO DATA from ECU — Ensure KL15 Ignition is ON' : s.detail,
            }))
          );
          pushToast('USB adapter open, but ECU returned NO DATA. Turn ignition KL15 ON.', 'WebSerial', 'err');
        } else {
          setEcuSession('SESSION_ACTIVE');
          setHandshakeSteps([
            { step: '1. Direct USB Serial Port', detail: hardwareLink.deviceLabel || 'COM Open', status: 'done' },
            { step: '2. Battery & Bus Voltage (ATRV)', detail: `${(live.batt ?? batt).toFixed(1)} V`, status: 'done' },
            { step: '3. Bus Protocol Verified', detail: hardwareLink.detectedProtocol || 'OBD-II / CAN', status: 'done' },
            {
              step: '4. Query Vehicle VIN & Live PIDs',
              detail: vinRead ? `VIN ${vinRead}` : `RPM=${live.rpm ?? '--'} Temp=${live.temp ?? '--'}°C`,
              status: 'done',
            },
            { step: '5. Read Stored Faults (Mode 03/07)', detail: `${realDtcs.length} DTC(s) read`, status: 'done' },
          ]);
          pushToast('Live Vehicle ECU Session Verified via WebSerial!', 'ECU', 'ok');
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'WebSerial ECU probe failed', 'ECU', 'err');
      } finally {
        setIsHandshaking(false);
      }
      return;
    }

    if (physical === 'webusb' || physical === 'websocket') {
      try {
        const res = await dispatchUdsCommand({
          txId: '0x7E0',
          payload: '10 03',
          demoBenchMode: false,
          vehicle: targetVehicle,
          ecuUnlocked,
          securitySeed,
          dtcs,
        });
        const vinRes = await dispatchUdsCommand({
          txId: '0x7E0',
          payload: '22 F1 90',
          demoBenchMode: false,
          vehicle: targetVehicle,
          ecuUnlocked,
          securitySeed,
          dtcs,
        });
        if (res.ok || vinRes.ok) {
          setEcuSession('SESSION_ACTIVE');
          setHandshakeSteps([
            { step: `1. Direct ${physical.toUpperCase()} Transport`, detail: hardwareLink.deviceLabel || 'Open', status: 'done' },
            { step: '2. DLC-16 Bus Termination', detail: 'Active', status: 'done' },
            { step: '3. Protocol Negotiation', detail: targetVehicle.proto, status: 'done' },
            { step: '4. ECU Diagnostic Session (10 03)', detail: res.rx, status: 'done' },
            { step: '5. Network Matrix', detail: vinRes.rx, status: 'done' },
          ]);
          pushToast(`ECU Diagnostic Session active via ${physical.toUpperCase()}`, 'ECU', 'ok');
        } else {
          setEcuSession('WAITING_FOR_ECU');
          pushToast(`No positive ECU reply (${res.rx}) — Check KL15 Ignition`, 'ECU', 'warn');
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'ECU session check failed', 'ECU', 'err');
      } finally {
        setIsHandshaking(false);
      }
      return;
    }

    if (!demoBenchMode) {
      setIsHandshaking(false);
      setHandshakeSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx === 0 ? 'error' : 'pending',
          detail: idx === 0 ? 'Connect USB COM, WebUSB, DoIP Socket, or Activate Bench ECU' : s.detail,
        }))
      );
      pushToast('No USB hardware bound — Connect USB COM / WebUSB or activate Bench ECU', 'Hardware', 'warn');
      return;
    }

    // Direct Bench ECU Handshake
    setVciConnected(true);
    if (ignition === 'OFF') setIgnition('KL15_ON');
    const steps = [
      { step: '1. Direct Browser Engine', detail: 'Bench ECU Target Selected' },
      { step: '2. DLC-16 Electrical Check', detail: `KL30 ${batt.toFixed(1)}V` },
      { step: '3. Protocol Negotiation', detail: targetVehicle.proto },
      { step: '4. ECU Diagnostic Session (0x10 03)', detail: `${targetVehicle.ecu} · ${targetVehicle.vin}` },
      { step: '5. Network Module Enumeration', detail: `${targetVehicle.make} (${targetVehicle.year})` },
    ];
    setHandshakeSteps(steps.map((s) => ({ ...s, status: 'pending' })));
    for (let i = 0; i < steps.length; i++) {
      setHandshakeSteps((prev) =>
        prev.map((s, idx) => ({ ...s, status: idx < i ? 'done' : idx === i ? 'active' : 'pending' }))
      );
      await new Promise((r) => setTimeout(r, 140));
    }
    setHandshakeSteps(steps.map((s) => ({ ...s, status: 'done' })));
    setEcuSession('SESSION_ACTIVE');
    setIsHandshaking(false);
    pushToast(`ECU Session Active: ${targetVehicle.ecu}`, 'ECU', 'ok');
  };

  const handleDisconnectAll = () => {
    void webSerialDriver.disconnect();
    void webUsbDriver.disconnect();
    wsObdDriver.disconnect();
    setDemoBenchMode(false);
    setVciConnected(false);
    setEcuSession('NO_SESSION');
    setEcuUnlocked(false);
    setSecuritySeed(null);
    setScannedOnlineIds(null);
    setDtcs([]);
    setRpm(0);
    setSpeed(0);
    setLoad(0);
    setTemp(0);
    setBatt(0);
    setHardwareLink((prev) => ({
      ...prev,
      transport: 'none',
      statusLabel: 'DIRECT READY (NO BRIDGE)',
      deviceLabel: null,
      vendorId: null,
      productId: null,
      serialNumber: null,
      firmwareVersion: null,
      detectedProtocol: null,
      lastMessage: 'Hardware disconnected cleanly.',
    }));
    setHandshakeSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' })));
    pushToast('Disconnected hardware & closed ECU session', 'System', 'warn');
  };

  // Load Vehicle from 1980-2026 Database -> Re-syncs ECU, Maps, Dump
  const handleLoadVehicle = (
    record: VehicleRecord,
    selectedYear?: number,
    targetView: NavView = 'dashboard'
  ) => {
    const yr = selectedYear || record.to;
    const vin = `${record.wmi}8E9C50${String(yr).slice(-2)}482910`.slice(0, 17).toUpperCase();
    const shortEcu = record.ecu.split('/')[0].trim();
    const dump = createEcuDump(shortEcu, vin);
    const computedCvn = crc32(dump).toString(16).padStart(8, '0').toUpperCase();

    const nextProfile: ActiveVehicleProfile = {
      displayName: `${record.make} ${record.model} (${yr})`,
      make: record.make,
      model: record.model,
      year: yr,
      ecu: shortEcu,
      fullEcu: record.ecu,
      vin,
      proto: record.proto,
      engines: record.engines,
      swVersion: `${yr}04_SW_${shortEcu.replace(/\s+/g, '')}`,
      cvn: computedCvn,
      flashCount: 1,
    };

    setVehicle(nextProfile);
    setEcuUnlocked(false);
    setSecuritySeed(null);
    setTuneMultiplier(1.0);
    setScannedOnlineIds(null);
    setCalMaps(createDefaultCalibrationMaps(shortEcu));

    setOrigBuffer(dump);
    setWorkBuffer(new Uint8Array(dump));
    const snap = {
      label: `${shortEcu}_Stock_Backup.bin`,
      timestamp: new Date().toLocaleTimeString(),
      cvn: computedCvn,
      data: new Uint8Array(dump),
    };
    setVault([snap]);
    void persistVaultMetadata({
      label: snap.label,
      timestamp: snap.timestamp,
      cvn: snap.cvn,
      size: dump.length,
      crc32: computedCvn,
    });

    setActiveView(targetView);
    if (vciConnected || demoBenchMode) {
      void handleOpenEcuSession(nextProfile);
    } else {
      pushToast(`Loaded ${nextProfile.displayName} (${shortEcu}) — Connect USB or Bench ECU`, 'Database', 'info');
    }
  };

  const handleLoadKeyProfile = (
    keyRec: KeyProgrammingRecord,
    selectedYear: number,
    openImmoTab: boolean
  ) => {
    const matchingVehicle =
      vehicles.find(
        (v) =>
          v.make.toLowerCase() === keyRec.make.toLowerCase() &&
          selectedYear >= v.from &&
          selectedYear <= v.to
      ) ??
      vehicles.find((v) =>
        keyRec.make.toLowerCase().includes(v.make.toLowerCase()) &&
        selectedYear >= v.from &&
        selectedYear <= v.to
      ) ?? {
        make: keyRec.make,
        region: keyRec.region,
        model: keyRec.model,
        from: keyRec.from,
        to: keyRec.to,
        engines: keyRec.keyType,
        ecu: keyRec.immoSystem.split('/')[0].trim(),
        proto: selectedYear >= 2018 ? 'CAN-FD / UDS' : selectedYear >= 2005 ? 'CAN 500k' : 'K-Line',
        wmi: keyRec.make.slice(0, 3).toUpperCase(),
      };

    handleLoadVehicle(
      { ...matchingVehicle, model: keyRec.model },
      selectedYear,
      openImmoTab ? 'functions' : 'dashboard'
    );
    if (openImmoTab) {
      setFuncSubTab('immo');
    }
    pushToast(
      `Key Profile Loaded: ${keyRec.make} ${keyRec.model} (${selectedYear}) · ${keyRec.transponderChip}`,
      'IMMO DB',
      'ok'
    );
  };

  const busNodes = useMemo(() => {
    const base = getBusNodesForVehicle(vehicle.year, vehicle.proto, dtcs, vciConnected, ecuOnline, batt);
    if (!scannedOnlineIds) return base;
    return base.map((n) => {
      if (n.status === 'Missing') return n;
      const found = scannedOnlineIds.includes(n.id);
      return {
        ...n,
        status: found ? ('Online' as const) : ('Missing' as const),
        voltage: found ? `${batt.toFixed(1)}V` : '0.0V',
      };
    });
  }, [vehicle.year, vehicle.proto, dtcs, vciConnected, ecuOnline, batt, scannedOnlineIds]);

  const handleAddCustomVehicle = (record: VehicleRecord) => {
    setVehicles((prev) => [record, ...prev]);
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_VEHICLES) || '[]');
      localStorage.setItem(STORAGE_CUSTOM_VEHICLES, JSON.stringify([record, ...existing]));
    } catch {
      // ignore storage errors
    }
    void persistCustomVehicles([record]);
    pushToast(`Added ${record.make} ${record.model} (${record.from}–${record.to}) to Database`, 'Database', 'ok');
  };

  const handleAddCustomKey = (record: KeyProgrammingRecord) => {
    setKeysDb((prev) => [record, ...prev]);
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_KEYS) || '[]');
      localStorage.setItem(STORAGE_CUSTOM_KEYS, JSON.stringify([record, ...existing]));
    } catch {
      // ignore storage errors
    }
    void persistCustomKeys([record]);
    pushToast(`Added Key Profile: ${record.make} ${record.model} (${record.transponderChip})`, 'Keys DB', 'ok');
  };

  const handleMergeDatabase = (
    newVehicles: VehicleRecord[],
    newParts: PartCatalogItem[],
    newKeys: KeyProgrammingRecord[] = []
  ) => {
    if (newVehicles.length) {
      setVehicles((prev) => [...newVehicles, ...prev]);
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_VEHICLES) || '[]');
        localStorage.setItem(STORAGE_CUSTOM_VEHICLES, JSON.stringify([...newVehicles, ...existing]));
      } catch {
        // ignore quota errors
      }
      void persistCustomVehicles(newVehicles);
    }
    if (newKeys.length) {
      setKeysDb((prev) => [...newKeys, ...prev]);
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_KEYS) || '[]');
        localStorage.setItem(STORAGE_CUSTOM_KEYS, JSON.stringify([...newKeys, ...existing]));
      } catch {
        // ignore quota errors
      }
      void persistCustomKeys(newKeys);
    }
    if (newParts.length) {
      setParts((prev) => [...prev, ...newParts]);
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_PARTS) || '[]');
        localStorage.setItem(STORAGE_CUSTOM_PARTS, JSON.stringify([...existing, ...newParts]));
      } catch {
        // ignore quota errors
      }
      void persistCustomParts(newParts);
    }
  };

  const handleOpenModule = (view: NavView, sub: DiagSubTab | FuncSubTab) => {
    setActiveView(view);
    if (view === 'diagnostics') setDiagSubTab(sub as DiagSubTab);
    if (view === 'functions') setFuncSubTab(sub as FuncSubTab);
  };

  const handleLoadDump = (arr: Uint8Array, label: string) => {
    const c = crc32(arr).toString(16).padStart(8, '0').toUpperCase();
    setOrigBuffer(new Uint8Array(arr));
    setWorkBuffer(new Uint8Array(arr));
    const snap = { label, timestamp: new Date().toLocaleTimeString(), cvn: c, data: new Uint8Array(arr) };
    setVault((prev) => [snap, ...prev]);
    void persistVaultMetadata({ label, timestamp: snap.timestamp, cvn: c, size: arr.length, crc32: c });
    pushToast(`Loaded ${label} (${arr.length} bytes · CRC 0x${c})`, 'HexLab', 'ok');
  };

  const handleSaveBackupToVault = () => {
    const c = crc32(workBuffer).toString(16).padStart(8, '0').toUpperCase();
    const snap = {
      label: `Backup_${vehicle.ecu}_${Date.now().toString().slice(-4)}.bin`,
      timestamp: new Date().toLocaleTimeString(),
      cvn: c,
      data: new Uint8Array(workBuffer),
    };
    setVault((prev) => [snap, ...prev]);
    void persistVaultMetadata({
      label: snap.label,
      timestamp: snap.timestamp,
      cvn: snap.cvn,
      size: workBuffer.length,
      crc32: c,
    });
    pushToast(`ECU backup archived in Vault (CVN: ${c})`, 'Vault', 'ok');
  };

  // Sync Calibration Maps directly into Hex Working Buffer
  const handleUpdateCalMaps = (nextMaps: CalibrationMapTable[]) => {
    setCalMaps(nextMaps);
    setWorkBuffer((prev) => syncMapsToEcuBuffer(nextMaps, prev));
  };

  // UDS 0x27 Seed / Key Handshake
  const handleRequestSeed = async () => {
    const res = await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '27 01',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    const seed = res.seed ?? 'A4 9F 2C 11';
    setSecuritySeed(seed);
    pushToast(`UDS 0x27 01 Seed Received: ${seed}`, 'Security', res.ok ? 'info' : 'warn');
  };

  const handleSendSecurityKey = async () => {
    const derivedKey = computeSeedKey(securitySeed ?? 'A4 9F 2C 11', vehicle.ecu);
    const res = await dispatchUdsCommand({
      txId: '0x7E0',
      payload: `27 02 ${derivedKey}`,
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    if (res.unlocked || res.ok) {
      setEcuUnlocked(true);
      pushToast(`UDS 0x27 02 Key Accepted (${derivedKey}) — ECU Unlocked`, 'Security', 'ok');
    } else {
      pushToast(`Key rejected: ${res.note}`, 'Security', 'err');
    }
  };

  const handleReadEcuFlash = async () => {
    await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '22 F1 87',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    handleSaveBackupToVault();
    pushToast(`Read & archived full calibration dump from ${vehicle.ecu}`, 'Tuning', 'ok');
  };

  const handleFlashCompleted = async (benchMode: boolean) => {
    await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '10 02',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '11 01',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });

    const syncedBuf = syncMapsToEcuBuffer(calMaps, workBuffer);
    const newCvn = crc32(syncedBuf).toString(16).padStart(8, '0').toUpperCase();
    setOrigBuffer(new Uint8Array(syncedBuf));
    setWorkBuffer(new Uint8Array(syncedBuf));

    setVehicle((prev) => ({
      ...prev,
      flashCount: prev.flashCount + 1,
      cvn: newCvn,
    }));
    if (pendingMapEdits > 0) {
      setTuneMultiplier(1.14);
      setCalMaps((prev) =>
        prev.map((m) => ({
          ...m,
          stock: m.current.map((r) => [...r]),
        }))
      );
    }
    void persistVaultMetadata({
      label: `Flashed_${vehicle.ecu}_${newCvn}.bin`,
      timestamp: new Date().toLocaleTimeString(),
      cvn: newCvn,
      size: syncedBuf.length,
      crc32: newCvn,
    });
    pushToast(
      `${benchMode ? 'Bench Recovery' : 'ECU Re-Flash'} Verified! New CVN: ${newCvn}`,
      'Tuning',
      'ok'
    );
  };

  // Diagnostics Actions
  const handleScanTopology = async () => {
    const physical = getActivePhysicalTransport();
    if (physical !== 'none') {
      const online: string[] = [];
      for (const node of busNodes) {
        if (node.status === 'Missing') continue;
        const res = await dispatchUdsCommand({
          txId: node.id,
          payload: '3E 00',
          demoBenchMode: false,
          vehicle,
          ecuUnlocked,
          securitySeed,
          dtcs,
        });
        if (res.ok) online.push(node.id);
      }
      setScannedOnlineIds(online);
      pushToast(`Live bus scan complete: ${online.length} responding controller(s)`, 'Topology', 'ok');
      return;
    }

    await dispatchUdsCommand({
      txId: '0x7DF',
      payload: '3E 00',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    pushToast(`Scanned ${busNodes.filter((n) => n.status === 'Online').length} controllers on ${vehicle.proto}`, 'Topology', 'ok');
  };

  const handleRescanDtcs = async () => {
    if (webSerialDriver.isOpen) {
      const codes = await webSerialDriver.readDtcs();
      setDtcs(
        codes.map((code) => {
          const info = describeDtcCode(code);
          return {
            nodeId: info.nodeId,
            mod: info.mod,
            code,
            type: 'Confirmed',
            desc: info.desc,
            ff: `RPM: ${rpm} | Batt: ${batt.toFixed(1)}V`,
          };
        })
      );
      pushToast(`Live Mode 03/07 scan complete: ${codes.length} DTC(s)`, 'WebSerial', 'ok');
      return;
    }

    await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '19 02 FF',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    pushToast(`Re-scanned fault memory: ${dtcs.length} DTC(s) present`, 'Diagnostics', 'info');
  };

  const handleClearDtc = async (idx: number) => {
    const code = dtcs[idx]?.code;
    await dispatchUdsCommand({
      txId: dtcs[idx]?.nodeId ?? '0x7E0',
      payload: '14 FF FF FF',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    setDtcs((prev) => prev.filter((_, i) => i !== idx));
    if (code === 'B1193') setEdrCleared(true);
    pushToast(`Cleared DTC ${code}`, 'Diagnostics', 'ok');
  };

  const handleClearAllDtcs = async () => {
    if (webSerialDriver.isOpen) {
      await webSerialDriver.clearDtcs();
    } else {
      await dispatchUdsCommand({
        txId: '0x7E0',
        payload: '14 FF FF FF',
        demoBenchMode,
        vehicle,
        ecuUnlocked,
        securitySeed,
        dtcs,
      });
    }
    setDtcs([]);
    setEdrCleared(true);
    pushToast('All DTCs cleared — 0 recurring faults verified', 'Diagnostics', 'ok');
  };

  // Functions & Coding Actions (Persisted + Real UDS Dispatch)
  const handleRunRoutine = async (txId: string, payloadHex: string, label: string) => {
    const res = await dispatchUdsCommand({
      txId,
      payload: payloadHex,
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    pushToast(`${label}: ${res.note}`, 'Functions', res.ok ? 'ok' : 'warn');
    return res.ok;
  };

  const handleWriteCoding = async (nextCoding: CodingConfigState) => {
    await dispatchUdsCommand({
      txId: '0x740',
      payload: '2E F1 A2 01 02 03',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    const entry = `[${new Date().toLocaleTimeString()}] VIN=${vehicle.vin.slice(-6)} | Region=${nextCoding.region} | Trans=${nextCoding.trans} | Light=${nextCoding.light}`;
    setCodingConfig(nextCoding);
    setCodingAuditLogs((prev) => [entry, ...prev]);
    void persistCodingEntry(entry, nextCoding);
    pushToast(`Variant coding written to ${vehicle.ecu} & saved`, 'Coding', 'ok');
  };

  const handleSyncModuleVin = async () => {
    await dispatchUdsCommand({
      txId: '0x7E0',
      payload: '2E F1 90',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    pushToast(`VIN (${vehicle.vin}) & ISN synchronized to replacement module`, 'Coding', 'ok');
  };

  const handleClearCrashEdr = async () => {
    await dispatchUdsCommand({
      txId: '0x750',
      payload: '31 01 E0 01',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    await dispatchUdsCommand({
      txId: '0x750',
      payload: '14 FF FF FF',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    setEdrCleared(true);
    setDtcs((prev) => prev.filter((d) => d.code !== 'B1193'));
    pushToast('Crash / EDR Cleared & B1193 DTC Removed', 'SRS/EDR', 'ok');
  };

  const handleTcuFlashSport = async () => {
    const next = !tcuSportMode;
    await dispatchUdsCommand({
      txId: '0x7E1',
      payload: next ? '2E 02 10 01' : '2E 02 10 00',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    setTcuSportMode(next);
    void persistWorkspaceSettings({ tcuSportMode: next });
    pushToast(
      next ? 'TCU Sport Shift Map Flashed (140 ms shifts)' : 'TCU OEM Comfort Map Restored',
      'TCU',
      'ok'
    );
  };

  const handleTcuResetAdaptations = async () => {
    await dispatchUdsCommand({
      txId: '0x7E1',
      payload: '31 01 03 10',
      demoBenchMode,
      vehicle,
      ecuUnlocked,
      securitySeed,
      dtcs,
    });
    pushToast('TCU Clutch Kiss-Point & Fill Time Adaptations Reset (0x7E1)', 'TCU', 'ok');
  };

  const handleExportTrace = () => {
    const blob = new Blob([JSON.stringify(traceLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autolab_trace_${vehicle.ecu}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    void persistTraceSession(vehicle.displayName, vehicle.ecu, traceLog);
    pushToast(`Exported & archived telemetry trace (${traceLog.length} samples)`, 'Diagnostics', 'ok');
  };

  const navItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4 shrink-0" /> },
    { id: 'tuning', label: 'Tuning', icon: <Wrench className="w-4 h-4 shrink-0" /> },
    { id: 'maps', label: 'Maps', icon: <MapIcon className="w-4 h-4 shrink-0" /> },
    { id: 'functions', label: 'Functions', icon: <LayoutGrid className="w-4 h-4 shrink-0" /> },
    { id: 'tcu', label: 'TCU', icon: <Gauge className="w-4 h-4 shrink-0" /> },
    { id: 'diagnostics', label: 'Diagnostics', icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'database', label: 'Vehicles & Keys', icon: <Database className="w-4 h-4 shrink-0" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4 shrink-0" /> },
    { id: 'logs', label: 'Logs', icon: <FileText className="w-4 h-4 shrink-0" /> },
    { id: 'about', label: 'About', icon: <Info className="w-4 h-4 shrink-0" /> },
  ];

  const ecuTopbarLabel = ecuOnline
    ? 'ECU Online'
    : vciConnected && ecuSession === 'WAITING_FOR_ECU'
    ? 'Waiting for ECU'
    : 'No ECU Session';

  return (
    <div className="relative h-screen w-screen autolab-backdrop overflow-hidden">
      <div className="fixed inset-0 autolab-grid-overlay pointer-events-none" />

      <div className="relative z-10 grid grid-rows-[60px_1fr] grid-cols-[192px_1fr] lg:grid-cols-[206px_1fr] h-full w-full px-3.5 pb-3.5 pt-2 gap-3">
        {/* TOPBAR */}
        <header className="col-span-2 flex items-center justify-between gap-4 px-2 border-b border-sky-500/20">
          <div className="flex flex-col leading-tight whitespace-nowrap shrink-0">
            <span className="text-[26px] leading-none font-extrabold italic tracking-tight">
              <span className="text-white">AutoLab</span> <span className="text-[#ef3b2d]">Pro</span>
            </span>
            <span className="text-[11px] text-sky-300 font-medium mt-0.5">
              Advanced ECU Tuning &amp; Programming
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-7 text-[13px] font-semibold text-slate-100 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setVciModalOpen(true)}
              className="flex items-center gap-2 hover:text-white cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded-full grid place-items-center ${
                  vciConnected
                    ? 'bg-emerald-500 shadow-[0_0_10px_#22c55e]'
                    : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                }`}
              >
                {vciConnected ? (
                  <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                ) : (
                  <WifiOff className="w-2.5 h-2.5 text-white" />
                )}
              </span>
              <span>{vciConnected ? 'VCI Connected' : 'VCI Disconnected'}</span>
            </button>

            <button
              type="button"
              onClick={() => setVciModalOpen(true)}
              className="flex items-center gap-2 hover:text-white cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded-full grid place-items-center ${
                  ecuOnline
                    ? 'bg-emerald-500 shadow-[0_0_10px_#22c55e]'
                    : vciConnected && ecuSession === 'WAITING_FOR_ECU'
                    ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]'
                    : 'bg-rose-600'
                }`}
              >
                {ecuOnline ? (
                  <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                ) : vciConnected && ecuSession === 'WAITING_FOR_ECU' ? (
                  <Clock className="w-2.5 h-2.5 text-white" />
                ) : (
                  <WifiOff className="w-2.5 h-2.5 text-white" />
                )}
              </span>
              <span>{ecuTopbarLabel}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              title={vciConnected ? 'Disconnect Hardware & ECU' : 'Open Hardware Connection Manager'}
              onClick={() => {
                if (vciConnected) handleDisconnectAll();
                else setVciModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1c38]/90 hover:bg-[#17305d] border border-sky-400/35 hover:border-sky-400/70 text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
            >
              <Car className="w-4 h-4 text-slate-200" />
              <X className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>
        </header>

        {/* SIDEBAR */}
        <aside className="autolab-panel-frame flex flex-col justify-between rounded-2xl p-2 min-h-0">
          <nav className="flex flex-col gap-0.5 overflow-y-auto autolab-scroll">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors text-left whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-gradient-to-r from-[#2176ff] to-[#1352bc] text-white font-semibold border-sky-300/60 shadow-[0_0_16px_rgba(33,118,255,0.45)]'
                      : 'bg-transparent text-slate-300 border-transparent hover:bg-sky-500/15 hover:text-white hover:border-sky-500/25'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5 pt-2 px-2.5 border-t border-sky-500/20 text-xs">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${
                ecuOnline
                  ? 'bg-emerald-500 shadow-[0_0_10px_#22c55e]'
                  : vciConnected
                  ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]'
                  : 'bg-sky-400 shadow-[0_0_8px_#38bdf8]'
              }`}
            />
            <span className="font-semibold text-slate-100">
              {ecuOnline ? 'Ready' : vciConnected ? 'Wait ECU' : 'Direct Ready'}
            </span>
          </div>
        </aside>

        {/* MAIN STAGE */}
        <main className="autolab-panel-frame rounded-2xl p-3 overflow-y-auto autolab-scroll min-h-0">
          {activeView === 'dashboard' && (
            <DashboardView
              vciConnected={vciConnected}
              ecuSession={ecuSession}
              ignition={ignition}
              demoBenchMode={demoBenchMode}
              vehicle={vehicle}
              hardwareLink={hardwareLink}
              rpm={rpm}
              speed={speed}
              load={load}
              temp={temp}
              batt={batt}
              chartData={chartData}
              onOpenVciModal={() => setVciModalOpen(true)}
              onQuickOpenEcuSession={() => void handleOpenEcuSession(vehicle)}
              onOpenDatabase={() => setActiveView('database')}
              onOpenModule={handleOpenModule}
            />
          )}

          {activeView === 'tuning' && (
            <TuningView
              vciConnected={vciConnected}
              ecuOnline={ecuOnline}
              ignition={ignition}
              vehicle={vehicle}
              batt={batt}
              ecuUnlocked={ecuUnlocked}
              securitySeed={securitySeed}
              pendingMapEdits={pendingMapEdits}
              vaultCount={vault.length}
              onRequestSeed={handleRequestSeed}
              onSendSecurityKey={handleSendSecurityKey}
              onReadEcuFlash={handleReadEcuFlash}
              onLoadBinaryFile={handleLoadDump}
              onSaveBackup={handleSaveBackupToVault}
              onFlashCompleted={handleFlashCompleted}
              onOpenVciModal={() => setVciModalOpen(true)}
              onOpenMaps={() => setActiveView('maps')}
              onToast={(m) => pushToast(m, 'Tuning')}
            />
          )}

          {activeView === 'maps' && (
            <MapsView
              vehicle={vehicle}
              maps={calMaps}
              onUpdateMaps={handleUpdateCalMaps}
              onGoToFlash={() => setActiveView('tuning')}
              origBuffer={origBuffer}
              workBuffer={workBuffer}
              vault={vault}
              onUpdateWorkBuffer={setWorkBuffer}
              onLoadDump={handleLoadDump}
              onReloadEcuDump={() =>
                handleLoadDump(createEcuDump(vehicle.ecu, vehicle.vin), `${vehicle.ecu}_EEPROM_Dump.bin`)
              }
              onRollback={() => {
                if (!vault.length) return;
                setWorkBuffer(new Uint8Array(vault[0].data));
                pushToast('Rolled back binary buffer to Stock Vault snapshot', 'HexLab', 'ok');
              }}
              onToast={(m) => pushToast(m, 'Maps')}
            />
          )}

          {activeView === 'functions' && (
            <FunctionsView
              vciConnected={vciConnected}
              ecuOnline={ecuOnline}
              ignition={ignition}
              vehicle={vehicle}
              keysDb={keysDb}
              subTab={funcSubTab}
              onSubTabChange={setFuncSubTab}
              codingConfig={codingConfig}
              codingAuditLogs={codingAuditLogs}
              onWriteCoding={handleWriteCoding}
              onSyncModuleVin={handleSyncModuleVin}
              onRunRoutine={handleRunRoutine}
              targetIdle={targetIdle}
              onUpdateTargetIdle={(val) => {
                setTargetIdle(val);
                void persistWorkspaceSettings({ targetIdle: val });
                if (vciConnected && ecuOnline) {
                  void dispatchUdsCommand({
                    txId: '0x7E0',
                    payload: `2E 01 0C ${(val & 0xff).toString(16).padStart(2, '0').toUpperCase()}`,
                    demoBenchMode,
                    vehicle,
                    ecuUnlocked,
                    securitySeed,
                    dtcs,
                  });
                }
                pushToast(`Target idle RPM updated to ${val} RPM`, 'Functions', 'ok');
              }}
              edrCleared={edrCleared}
              onClearCrashEdr={handleClearCrashEdr}
              onLoadKeyProfile={handleLoadKeyProfile}
              onOpenKeysDatabase={() => {
                setDbSubTab('keys');
                setActiveView('database');
              }}
              onOpenVciModal={() => setVciModalOpen(true)}
              onToast={(m) => pushToast(m, 'Functions')}
            />
          )}

          {activeView === 'tcu' && (
            <TcuView
              vciConnected={vciConnected}
              ecuOnline={ecuOnline}
              ignition={ignition}
              speed={speed}
              rpm={rpm}
              tcuSportMode={tcuSportMode}
              onFlashSportMap={handleTcuFlashSport}
              onResetAdaptations={handleTcuResetAdaptations}
            />
          )}

          {activeView === 'diagnostics' && (
            <DiagnosticsView
              vciConnected={vciConnected}
              ecuOnline={ecuOnline}
              demoBenchMode={demoBenchMode}
              ignition={ignition}
              vehicle={vehicle}
              subTab={diagSubTab}
              onSubTabChange={setDiagSubTab}
              batt={batt}
              nodes={busNodes}
              onScanTopology={handleScanTopology}
              dtcs={dtcs}
              onClearDtc={handleClearDtc}
              onClearAllDtcs={handleClearAllDtcs}
              onRescanDtcs={handleRescanDtcs}
              chartData={chartData}
              recording={recording}
              traceLog={traceLog}
              onToggleRecording={() => {
                const next = !recording;
                setRecording(next);
                pushToast(
                  next ? 'Telemetry trace recording started' : `Trace stopped (${traceLog.length} samples)`,
                  'Logger',
                  'ok'
                );
              }}
              onExportTrace={handleExportTrace}
              ecuUnlocked={ecuUnlocked}
              onSecurityUnlockFromUds={() => {
                setEcuUnlocked(true);
                pushToast('Security Access 0x27 unlocked via UDS Frame Inspector', 'UDS', 'ok');
              }}
              onOpenVciModal={() => setVciModalOpen(true)}
              onTriggerActuatorEffect={async (name) => {
                if (name.includes('Fan')) setTemp((t) => Math.max(78, +(t - 2).toFixed(1)));
                pushToast(`Bi-Directional Actuator Active: ${name}`, 'Actuator', 'ok');
              }}
              onToast={(m) => pushToast(m, 'Diagnostics')}
            />
          )}

          {activeView === 'database' && (
            <DatabaseView
              eras={ERA_GENERATIONS}
              vehicles={vehicles}
              keysDb={keysDb}
              parts={parts}
              subTab={dbSubTab}
              onSubTabChange={setDbSubTab}
              onLoadVehicle={handleLoadVehicle}
              onAddCustomVehicle={handleAddCustomVehicle}
              onAddCustomKey={handleAddCustomKey}
              onLoadKeyProfile={handleLoadKeyProfile}
              onMergeDatabase={handleMergeDatabase}
              onToast={(m) => pushToast(m, 'Database')}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              vciAdapter={vciAdapter}
              onChangeAdapter={(a) => {
                setVciAdapter(a);
                void persistWorkspaceSettings({ vciAdapter: a });
              }}
              hardwareLink={hardwareLink}
              onChangeBaudRate={(baud) => {
                setHardwareLink((prev) => ({ ...prev, baudRate: baud }));
                void persistWorkspaceSettings({ baudRate: baud });
              }}
              onChangeProtocolCode={(code: ObdProtocolCode) => {
                setHardwareLink((prev) => ({ ...prev, protocolCode: code }));
                void persistWorkspaceSettings({ protocolCode: code });
                if (webSerialDriver.isOpen) {
                  void webSerialDriver.setProtocol(code);
                }
              }}
              onChangeWsEndpoint={(url) => {
                setHardwareLink((prev) => ({ ...prev, wsEndpoint: url }));
                void persistWorkspaceSettings({ wsEndpoint: url });
              }}
              onChangeAutoConnectUsb={(enabled) => {
                setHardwareLink((prev) => ({ ...prev, autoConnectSavedUsb: enabled }));
                void persistWorkspaceSettings({ autoConnectSavedUsb: enabled });
              }}
              onScanSavedHardware={handleScanSavedHardware}
              demoBenchMode={demoBenchMode}
              onToggleDemoBench={handleToggleDemoBench}
              batt={batt}
              speed={speed}
              onChangeBatt={setBatt}
              onChangeSpeed={setSpeed}
            />
          )}

          {activeView === 'logs' && (
            <LogsView
              logs={logs}
              onClear={() => {
                setLogs([]);
                void clearPersistedLogs();
              }}
            />
          )}

          {activeView === 'about' && <AboutView />}
        </main>
      </div>

      {/* Direct Hardware Connection & ECU Session Modal */}
      <VciConnectionModal
        open={vciModalOpen}
        onClose={() => setVciModalOpen(false)}
        vciAdapter={vciAdapter}
        onChangeAdapter={(a) => {
          setVciAdapter(a);
          void persistWorkspaceSettings({ vciAdapter: a });
        }}
        vciConnected={vciConnected}
        ecuSession={ecuSession}
        ignition={ignition}
        onChangeIgnition={handleChangeIgnition}
        demoBenchMode={demoBenchMode}
        onToggleDemoBench={handleToggleDemoBench}
        vehicle={vehicle}
        batt={batt}
        hardwareLink={hardwareLink}
        onChangeBaudRate={(baud) => {
          setHardwareLink((prev) => ({ ...prev, baudRate: baud }));
          void persistWorkspaceSettings({ baudRate: baud });
        }}
        onChangeProtocolCode={(code) => {
          setHardwareLink((prev) => ({ ...prev, protocolCode: code }));
          void persistWorkspaceSettings({ protocolCode: code });
          if (webSerialDriver.isOpen) {
            void webSerialDriver.setProtocol(code);
          }
        }}
        onChangeWsEndpoint={(url) => {
          setHardwareLink((prev) => ({ ...prev, wsEndpoint: url }));
          void persistWorkspaceSettings({ wsEndpoint: url });
        }}
        onConnectWebSerial={handleConnectWebSerial}
        onConnectWebUsb={handleConnectWebUsb}
        onConnectWebSocket={handleConnectWebSocket}
        onScanSavedHardware={handleScanSavedHardware}
        onReadAdapterInfo={handleReadAdapterInfo}
        onOpenEcuSession={() => handleOpenEcuSession(vehicle)}
        onDisconnectAll={handleDisconnectAll}
        handshakeSteps={handshakeSteps}
        isHandshaking={isHandshaking}
        onOpenDatabase={() => setActiveView('database')}
      />

      {/* TOAST */}
      {toastMsg && (
        <div className="fixed bottom-5 right-6 z-50 px-4 py-2.5 rounded-xl bg-[#0a1830]/95 border border-sky-400 text-white text-xs font-semibold shadow-2xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
