import React, { useState } from 'react';
import {
  Activity,
  Cable,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Globe,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Usb,
  WifiOff,
  X,
} from 'lucide-react';
import { FT_BAUD_RATES } from '../services/ftdiD2xxDefs';
import type {
  ActiveVehicleProfile,
  EcuSessionState,
  HardwareLinkState,
  IgnitionState,
  ObdProtocolCode,
  VciAdapterType,
} from '../types/autolab';

interface VciConnectionModalProps {
  open: boolean;
  onClose: () => void;
  vciAdapter: VciAdapterType;
  onChangeAdapter: (adapter: VciAdapterType) => void;
  vciConnected: boolean;
  ecuSession: EcuSessionState;
  ignition: IgnitionState;
  onChangeIgnition: (state: IgnitionState) => void;
  demoBenchMode: boolean;
  onToggleDemoBench: (enabled: boolean) => void;
  vehicle: ActiveVehicleProfile;
  batt: number;
  hardwareLink: HardwareLinkState;
  onChangeBaudRate: (baud: number) => void;
  onChangeProtocolCode: (code: ObdProtocolCode) => void;
  onChangeWsEndpoint: (url: string) => void;
  onConnectWebSerial: () => Promise<void>;
  onConnectWebUsb: () => Promise<void>;
  onConnectWebSocket: () => Promise<void>;
  onScanSavedHardware: () => Promise<void>;
  onReadAdapterInfo: () => Promise<void>;
  onOpenEcuSession: () => Promise<void>;
  onDisconnectAll: () => void;
  handshakeSteps: { step: string; detail: string; status: 'done' | 'active' | 'pending' | 'error' }[];
  isHandshaking: boolean;
  onOpenDatabase: () => void;
}

const BAUD_RATES = [...FT_BAUD_RATES];

const PROTOCOL_OPTIONS: { code: ObdProtocolCode; label: string }[] = [
  { code: '0', label: 'ATSP0 — Auto Detect Bus Protocol' },
  { code: '6', label: 'ATSP6 — ISO 15765-4 / 27145-4 CAN (11-bit, 500 kbps)' },
  { code: '7', label: 'ATSP7 — ISO 15765-4 / 27145-4 CAN (29-bit, 500 kbps)' },
  { code: '8', label: 'ATSP8 — ISO 15765-4 / 27145-4 CAN (11-bit, 250 kbps)' },
  { code: '9', label: 'ATSP9 — ISO 15765-4 / 27145-4 CAN (29-bit, 250 kbps)' },
  { code: 'A', label: 'ATSPA — SAE J1939-21 Heavy-Duty CAN (250 kbps)' },
  { code: '5', label: 'ATSP5 — ISO 14230-4 (KW2000) Fast Init' },
  { code: '4', label: 'ATSP4 — ISO 14230-4 (KW2000) 5-Baud Slow Init' },
  { code: '3', label: 'ATSP3 — ISO 9141-2 (CARB K-Line)' },
  { code: '2', label: 'ATSP2 — ISO 519-4 (SAE-J1850 VPW 10.4k)' },
  { code: '1', label: 'ATSP1 — ISO 519-4 (SAE-J1850 PWM 41.6k)' },
];

export const VciConnectionModal: React.FC<VciConnectionModalProps> = ({
  open,
  onClose,
  vciAdapter,
  onChangeAdapter,
  vciConnected,
  ecuSession,
  ignition,
  onChangeIgnition,
  demoBenchMode,
  onToggleDemoBench,
  vehicle,
  batt,
  hardwareLink,
  onChangeBaudRate,
  onChangeProtocolCode,
  onChangeWsEndpoint,
  onConnectWebSerial,
  onConnectWebUsb,
  onConnectWebSocket,
  onScanSavedHardware,
  onReadAdapterInfo,
  onOpenEcuSession,
  onDisconnectAll,
  handshakeSteps,
  isHandshaking,
  onOpenDatabase,
}) => {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const isLegacy = vehicle.year <= 1995;
  const isDoip = vehicle.proto.includes('DoIP') || vehicle.year >= 2020;

  const runTask = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-[#071122] border border-sky-400/45 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0a1830] border-b border-sky-500/25 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Cable className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">
                Direct Hardware Connection Manager (Zero-Bridge Browser Engine)
              </h2>
              <p className="text-xs text-sky-300 truncate">
                Direct WebSerial COM · Direct WebUSB FTDI/OBD · Direct DoIP WebSocket · ISO 14229 UDS Handshake
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleDemoBench(!demoBenchMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap transition-colors ${
                demoBenchMode
                  ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                  : 'bg-[#10213f] border-sky-500/30 text-slate-300 hover:text-white'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {demoBenchMode ? 'Bench ECU Mode: ON' : 'Activate Bench ECU'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#142646] hover:bg-sky-600/40 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto autolab-scroll grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT COLUMN: Direct Transport Binding + Adapter Inspection + Terminal KL15 */}
          <div className="flex flex-col gap-3.5">
            {/* 1. Direct Adapter Transport */}
            <div className="rounded-xl border border-sky-500/25 bg-[#0b1830]/90 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-300">
                  1. Direct Hardware Interface (No Bridge Needed)
                </span>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    demoBenchMode
                      ? 'text-amber-300'
                      : vciConnected
                      ? 'text-emerald-400'
                      : 'text-sky-300'
                  }`}
                >
                  {hardwareLink.statusLabel}
                </span>
              </div>

              <select
                value={vciAdapter}
                onChange={(e) => onChangeAdapter(e.target.value as VciAdapterType)}
                className="bg-[#050c1a] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
              >
                <option value="WebSerial USB OBD-II / ELM327 / STN (Direct COM)">
                  WebSerial USB OBD-II / ELM327 / STN (Direct COM)
                </option>
                <option value="WebUSB Direct Hardware (FTDI / Autocom VCI / CH340)">
                  WebUSB Direct Hardware (FTDI / Autocom VCI / CH340)
                </option>
                <option value="K-Line / ISO 9141-2 / KWP2000 Direct COM">
                  K-Line / ISO 9141-2 / KWP2000 Direct COM
                </option>
                <option value="DoIP Ethernet / Wi-Fi OBD Gateway (Direct WebSocket)">
                  DoIP Ethernet / Wi-Fi OBD Gateway (Direct WebSocket)
                </option>
              </select>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={hardwareLink.baudRate}
                  onChange={(e) => onChangeBaudRate(Number(e.target.value))}
                  aria-label="Serial Baud Rate"
                  className="bg-[#050c1a] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs font-mono outline-none focus:border-sky-400"
                >
                  {BAUD_RATES.map((b) => (
                    <option key={b} value={b}>
                      {b} baud
                    </option>
                  ))}
                </select>
                <select
                  value={hardwareLink.protocolCode}
                  onChange={(e) => onChangeProtocolCode(e.target.value as ObdProtocolCode)}
                  aria-label="OBD Protocol"
                  className="bg-[#050c1a] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none focus:border-sky-400"
                >
                  {PROTOCOL_OPTIONS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {vciAdapter === 'DoIP Ethernet / Wi-Fi OBD Gateway (Direct WebSocket)' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={hardwareLink.wsEndpoint}
                    onChange={(e) => onChangeWsEndpoint(e.target.value)}
                    placeholder="ws://192.168.0.10:35000"
                    className="flex-1 bg-[#050c1a] border border-sky-500/35 rounded-lg text-sky-200 px-2.5 py-1.5 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runTask(onConnectWebSocket)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Connect Socket
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runTask(onConnectWebSerial)}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-45 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Usb className="w-3.5 h-3.5" />
                  USB COM
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runTask(onConnectWebUsb)}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-[#142a4d] hover:bg-blue-600 border border-sky-400/35 disabled:opacity-45 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  WebUSB
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runTask(onScanSavedHardware)}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-[#142a4d] hover:bg-blue-600 border border-sky-400/35 disabled:opacity-45 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Search className="w-3.5 h-3.5" />
                  Scan USB
                </button>
                <button
                  type="button"
                  disabled={!vciConnected && !demoBenchMode}
                  onClick={onDisconnectAll}
                  className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-rose-700/80 hover:bg-rose-600 disabled:opacity-45 border border-rose-400/45 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Power className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            </div>

            {/* 2. Direct Adapter Telemetry & Descriptor Panel */}
            <div className="rounded-xl border border-sky-500/25 bg-[#0b1830]/90 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" />
                  2. Adapter Diagnostics (ATI / ATDP / ATRV)
                </span>
                <button
                  type="button"
                  disabled={busy || (!vciConnected && !demoBenchMode)}
                  onClick={() => void runTask(onReadAdapterInfo)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Activity className="w-3 h-3" />
                  Read Adapter Info
                </button>
              </div>

              <div className="rounded-lg bg-[#050c1a] border border-sky-500/20 p-2.5 font-mono text-[11px] text-slate-300 space-y-1 tabular-nums">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Active Transport:</span>
                  <span className="text-sky-300 uppercase">{hardwareLink.transport}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Bound Device:</span>
                  <span className="text-white truncate">{hardwareLink.deviceLabel || 'None'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">VID / PID / Serial:</span>
                  <span className="text-slate-200 truncate">
                    {hardwareLink.vendorId || '--'} / {hardwareLink.productId || '--'}{' '}
                    {hardwareLink.serialNumber ? `· SN ${hardwareLink.serialNumber}` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Firmware / Protocol:</span>
                  <span className="text-emerald-300 truncate">
                    {hardwareLink.firmwareVersion || '--'} · {hardwareLink.detectedProtocol || '--'}
                  </span>
                </div>
                <div className="pt-1 border-t border-sky-500/15 text-[10.5px] text-slate-400 truncate">
                  {hardwareLink.lastMessage}
                </div>
              </div>
            </div>

            {/* 3. Terminal Power State */}
            <div className="rounded-xl border border-sky-500/25 bg-[#0b1830]/90 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300">
                  3. Vehicle Terminal KL15 &amp; DLC-16 Pinout
                </span>
                <span className="font-mono text-xs text-white tabular-nums">{batt.toFixed(1)} V</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    ['OFF', 'Key OFF'],
                    ['KL15_ON', 'KL15 ON'],
                    ['ENGINE_IDLE', 'Engine Idle'],
                    ['DYNO_PULL', 'Dyno Pull'],
                  ] as [IgnitionState, string][]
                ).map(([st, lbl]) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onChangeIgnition(st)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      ignition === st
                        ? 'bg-blue-600 border-sky-300 text-white'
                        : 'bg-[#050c1a] border-sky-500/25 text-slate-300 hover:border-sky-400/50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-300 pt-1 tabular-nums">
                <div>
                  CAN 6/14:{' '}
                  <span className={isLegacy ? 'text-slate-500' : vciConnected ? 'text-sky-300' : 'text-slate-500'}>
                    {isLegacy ? 'N/A (Legacy)' : vciConnected ? '60.2 Ω · Clean' : 'Standby'}
                  </span>
                </div>
                <div>
                  K-Line Pin 7:{' '}
                  <span className={vciConnected ? 'text-emerald-400' : 'text-slate-500'}>
                    {vciConnected ? (isLegacy ? '12.1V Active' : '11.9V Idle') : 'Standby'}
                  </span>
                </div>
                <div className="col-span-2">
                  DoIP Ethernet:{' '}
                  <span className={isDoip && vciConnected ? 'text-sky-300' : 'text-slate-500'}>
                    {isDoip ? (vciConnected ? '100BASE-T1 Link Ready' : 'Standby') : 'Not Used for Model Year'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Vehicle Selection & Real ECU Session Handshake */}
          <div className="flex flex-col gap-3.5">
            <div className="rounded-xl border border-sky-500/25 bg-[#0b1830]/90 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-300">
                  4. Target Vehicle &amp; ECU Profile (1980–2026 DB)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDatabase();
                  }}
                  className="text-[11px] font-semibold text-sky-300 hover:text-white underline cursor-pointer whitespace-nowrap"
                >
                  Change Vehicle
                </button>
              </div>
              <div className="font-mono text-xs text-slate-200 space-y-1">
                <div>
                  Vehicle: <strong className="text-white">{vehicle.displayName}</strong>
                </div>
                <div>
                  ECU: <strong className="text-sky-300">{vehicle.fullEcu}</strong>
                </div>
                <div>
                  Protocol: <strong className="text-emerald-400">{vehicle.proto}</strong>
                </div>
                <div>
                  VIN: <strong className="text-white tabular-nums">{vehicle.vin}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/25 bg-[#0b1830]/90 p-3.5 flex flex-col gap-2.5 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-300">5. Vehicle ECU Session Handshake</span>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    ecuSession === 'SESSION_ACTIVE'
                      ? 'text-emerald-400'
                      : ecuSession === 'WAITING_FOR_ECU'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {ecuSession === 'SESSION_ACTIVE'
                    ? 'ECU ONLINE'
                    : ecuSession === 'WAITING_FOR_ECU'
                    ? 'WAITING FOR ECU'
                    : 'NO ECU SESSION'}
                </span>
              </div>

              <div
                className={`rounded-lg px-3 py-2 text-[11.5px] border ${
                  ecuSession === 'SESSION_ACTIVE'
                    ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                    : ecuSession === 'WAITING_FOR_ECU'
                    ? 'bg-amber-950/35 border-amber-500/40 text-amber-200'
                    : 'bg-sky-950/40 border-sky-500/35 text-sky-100'
                }`}
              >
                {ecuSession === 'SESSION_ACTIVE'
                  ? `ECU Session verified (${demoBenchMode ? 'Bench ECU' : hardwareLink.transport.toUpperCase()}) on ${vehicle.ecu}.`
                  : ecuSession === 'WAITING_FOR_ECU'
                  ? 'Adapter bound directly in browser. Turn vehicle KL15 ignition ON and click Open & Verify ECU Session.'
                  : 'Connect directly via USB COM (WebSerial), WebUSB, DoIP Socket, or click Activate Bench ECU above.'}
              </div>

              <div className="space-y-2 flex-1">
                {handshakeSteps.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[#050c1a] border border-sky-500/15 text-xs"
                  >
                    <span className="mt-0.5 shrink-0">
                      {s.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {s.status === 'active' && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />}
                      {s.status === 'pending' && <Cpu className="w-4 h-4 text-slate-500" />}
                      {s.status === 'error' && <WifiOff className="w-4 h-4 text-rose-400" />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{s.step}</div>
                      <div className="font-mono text-[11px] text-slate-400 truncate">{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={isHandshaking}
                onClick={() => void onOpenEcuSession()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer whitespace-nowrap shadow-[0_4px_16px_rgba(37,99,235,0.4)]"
              >
                <ShieldCheck className="w-4 h-4" />
                {isHandshaking
                  ? 'Opening ECU Diagnostic Session...'
                  : 'Open & Verify ECU Session (10 03 + 22 F1 90)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
