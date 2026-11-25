export type NavView =
  | 'dashboard'
  | 'tuning'
  | 'maps'
  | 'functions'
  | 'tcu'
  | 'diagnostics'
  | 'database'
  | 'settings'
  | 'logs'
  | 'about';

export type DiagSubTab = 'topo' | 'dtc' | 'live' | 'act' | 'uds';
export type FuncSubTab = 'coding' | 'adapt' | 'immo' | 'safety';
export type DbSubTab = 'vehicles' | 'keys' | 'parts' | 'eras' | 'custom';
export type MapsSubTab = 'tables' | 'hex';

export type TransportKind = 'none' | 'webserial' | 'webusb' | 'websocket' | 'bench';

export type VciAdapterType =
  | 'WebSerial USB OBD-II / ELM327 / STN (Direct COM)'
  | 'WebUSB Direct Hardware (FTDI / Autocom VCI / CH340)'
  | 'DoIP Ethernet / Wi-Fi OBD Gateway (Direct WebSocket)'
  | 'K-Line / ISO 9141-2 / KWP2000 Direct COM';

export type ObdProtocolCode = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'A';

export type IgnitionState = 'OFF' | 'KL15_ON' | 'ENGINE_IDLE' | 'DYNO_PULL';

export type EcuSessionState =
  | 'NO_SESSION'
  | 'WAITING_FOR_ECU'
  | 'SESSION_ACTIVE';

export interface HardwareLinkState {
  transport: TransportKind;
  statusLabel: string;
  deviceLabel: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  detectedProtocol: string | null;
  baudRate: number;
  protocolCode: ObdProtocolCode;
  wsEndpoint: string;
  autoConnectSavedUsb: boolean;
  lastMessage: string;
}

export interface CodingConfigState {
  region: string;
  trans: string;
  light: string;
}

export interface EraGeneration {
  era: string;
  title: string;
  protocols: string;
  ecus: string;
  arch: string;
}

export interface VehicleRecord {
  make: string;
  region: string;
  model: string;
  from: number;
  to: number;
  engines: string;
  ecu: string;
  proto: string;
  wmi: string;
}

export interface KeyProgrammingRecord {
  id: string;
  make: string;
  region: string;
  model: string;
  from: number;
  to: number;
  immoSystem: string;
  transponderChip: string;
  remoteFreq: string;
  keyBlade: string;
  keyType:
    | 'Mechanical / Pre-IMMO'
    | 'Fixed / Early Transponder'
    | 'Rolling Transponder / Folding'
    | 'Smart Prox / PEPS'
    | 'NFC / UWB Digital Key';
  aklSupported: 'OBD Full' | 'OBD + Adapter' | 'Bench / EEPROM' | 'Dealer / SecOC';
  securityAccess: string;
  programmingMethod: string;
}

export interface PartCatalogItem {
  sys: string;
  cat:
    | 'Control Module (ECU)'
    | 'Sensor / Transducer'
    | 'Actuator / Solenoid'
    | 'Mechanical / Wear Part'
    | 'HV / Safety Device';
  name: string;
  bus: string;
  spec: string;
  span: string;
}

export interface ActiveVehicleProfile {
  displayName: string;
  make: string;
  model: string;
  year: number;
  ecu: string;
  fullEcu: string;
  vin: string;
  proto: string;
  engines: string;
  swVersion: string;
  cvn: string;
  flashCount: number;
}

export interface CoreNode {
  id: string;
  name: string;
  bus: string;
  status: 'Online' | 'Missing' | 'Offline' | 'Waiting';
  dtc: number;
  voltage: string;
}

export interface DtcItem {
  nodeId: string;
  mod: string;
  code: string;
  type: 'Pending' | 'Historical' | 'Confirmed';
  desc: string;
  ff: string;
}

export interface TelemetrySample {
  t: number;
  rpm: number;
  speed: number;
  load: number;
  temp: number;
  batt: number;
  map: number;
  ign: number;
}

export interface VaultSnapshot {
  label: string;
  timestamp: string;
  cvn: string;
  data: Uint8Array;
}

export interface UdsFrameEntry {
  id: string;
  txId: string;
  tx: string;
  rx: string;
  lat: string;
  note: string;
}

export interface CalibrationMapTable {
  id: string;
  name: string;
  unit: string;
  xLabel: string;
  yLabel: string;
  xAxis: string[];
  yAxis: string[];
  stock: number[][];
  current: number[][];
  minVal: number;
  maxVal: number;
  step: number;
}

export interface AuditLogEntry {
  time: string;
  source: string;
  msg: string;
  level: 'info' | 'ok' | 'warn' | 'err';
}
