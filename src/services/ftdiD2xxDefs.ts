// FTDI D2XX Native Driver Constants & Hardware Register Definitions
// Ported directly from ftd2xx.h (FTDI FT232x / FT245x / FT2232x / FT4232x / FT-X Series)

export const FT_VENDOR_ID = 0x0403;

export const FT_KNOWN_OBD_PIDS: Record<number, string> = {
  0x6001: 'FT232R / FT232BM USB-UART (OBD / K-Line / ELM327)',
  0x6010: 'FT2232C / FT2232H Dual High-Speed USB-UART/MPSSE',
  0x6011: 'FT4232H Quad High-Speed USB-UART',
  0x6014: 'FT232H Single High-Speed USB-UART/FIFO',
  0x6015: 'FT-X Series (FT230X / FT231X VCP/OBD)',
  0xd6da: 'Autocom / Delphi CDP+ Diagnostic VCI (FTDI D2XX)',
  0xd6db: 'Autocom / Delphi CDP+ Pro VCI (FTDI D2XX)',
};

// Device Status (ftd2xx.h enum)
export const FT_STATUS = {
  FT_OK: 0,
  FT_INVALID_HANDLE: 1,
  FT_DEVICE_NOT_FOUND: 2,
  FT_DEVICE_NOT_OPENED: 3,
  FT_IO_ERROR: 4,
  FT_INSUFFICIENT_RESOURCES: 5,
  FT_INVALID_PARAMETER: 6,
  FT_INVALID_BAUD_RATE: 7,
  FT_NOT_SUPPORTED: 17,
} as const;

// Device Types (ftd2xx.h FT_DEVICE enum)
export const FT_DEVICE_NAMES: Record<number, string> = {
  0x0200: 'FT_DEVICE_AM',
  0x0400: 'FT_DEVICE_BM',
  0x0500: 'FT_DEVICE_2232C',
  0x0600: 'FT_DEVICE_232R',
  0x0700: 'FT_DEVICE_2232H',
  0x0800: 'FT_DEVICE_4232H',
  0x0900: 'FT_DEVICE_232H',
  0x1000: 'FT_DEVICE_X_SERIES',
};

// Baud Rates from ftd2xx.h + Automotive K-Line / CAN-HS rates
export const FT_BAUD_RATES = [
  10400, // ISO 9141-2 / ISO 14230 K-Line standard
  19200,
  38400, // Standard ELM327 / FT_BAUD_38400
  57600,
  115200,
  230400,
  460800,
  500000, // High-speed STN1110/OBDLink CAN
  921600, // FT_BAUD_921600
] as const;

// Data characteristics
export const FT_BITS_8 = 8;
export const FT_BITS_7 = 7;
export const FT_STOP_BITS_1 = 0;
export const FT_STOP_BITS_2 = 2;
export const FT_PARITY_NONE = 0;

// Flow Control (ftd2xx.h)
export const FT_FLOW_NONE = 0x0000;
export const FT_FLOW_RTS_CTS = 0x0100;
export const FT_FLOW_DTR_DSR = 0x0200;
export const FT_FLOW_XON_XOFF = 0x0400;

// Purge RX/TX Buffers (ftd2xx.h)
export const FT_PURGE_RX = 1;
export const FT_PURGE_TX = 2;

// Bit Modes (ftd2xx.h)
export const FT_BITMODE_RESET = 0x00;
export const FT_BITMODE_ASYNC_BITBANG = 0x01;
export const FT_BITMODE_MPSSE = 0x02;

// FTDI USB SIO Control Requests (matching D2XX kernel/user mode protocol)
export const FTDI_SIO_RESET = 0x00;
export const FTDI_SIO_SET_MODEM_CTRL = 0x01;
export const FTDI_SIO_SET_FLOW_CTRL = 0x02;
export const FTDI_SIO_SET_BAUDRATE = 0x03;
export const FTDI_SIO_SET_DATA = 0x04;
export const FTDI_SIO_GET_MODEM_STATUS = 0x05;
export const FTDI_SIO_SET_LATENCY_TIMER = 0x09;
export const FTDI_SIO_GET_LATENCY_TIMER = 0x0a;
export const FTDI_SIO_SET_BITMODE = 0x0b;

// SIO_SET_MODEM_CTRL bitmasks (DTR/RTS)
export const FTDI_MODEM_DTR_HIGH = 0x0101;
export const FTDI_MODEM_DTR_LOW = 0x0100;
export const FTDI_MODEM_RTS_HIGH = 0x0202;
export const FTDI_MODEM_RTS_LOW = 0x0200;

export function identifyFtdiChip(productId: number, bcdDevice?: number): string {
  if (FT_KNOWN_OBD_PIDS[productId]) {
    return FT_KNOWN_OBD_PIDS[productId];
  }
  if (bcdDevice !== undefined && FT_DEVICE_NAMES[bcdDevice]) {
    return `FTDI ${FT_DEVICE_NAMES[bcdDevice]}`;
  }
  return 'FTDI USB-Serial Controller';
}

/**
 * Computes exact FTDI baud rate divisor (value + index high-bits)
 * supporting fractional sub-integers (0, .125, .25, .375, .5, .625, .75, .875)
 * critical for 10400 baud ISO 9141-2 / KWP2000 K-Line & 38400/115200/921600 rates.
 */
export function computeFtdiDivisor(
  baudRate: number,
  isHighSpeedChip = false
): { value: number; indexHigh: number } {
  const fracCodes = [0, 3, 2, 4, 1, 5, 6, 7]; // 0, 0.5, 0.25, 0.125, 0.375, 0.625, 0.75, 0.875
  const baseClk = isHighSpeedChip && baudRate > 1200 ? 12000000 : 3000000;
  const bestDivisor = Math.max(1, Math.round((baseClk * 8) / baudRate));
  const intPart = bestDivisor >> 3;
  const fracIndex = bestDivisor & 0x07;
  const encodedFrac = fracCodes[fracIndex] ?? 0;

  let raw = (intPart & 0x3fff) | ((encodedFrac & 0x03) << 14);
  if (baudRate === 3000000) raw = 0;
  if (baudRate === 2000000) raw = 1;

  const indexHigh = ((encodedFrac >> 2) & 0x01) | (isHighSpeedChip && baseClk === 12000000 ? 0x02 : 0);
  return {
    value: raw & 0xffff,
    indexHigh: indexHigh & 0xff,
  };
}

// Autocom CDP / DS800E / SDP / ADP186 Firmware Protocol Matrix (extracted from uploaded Jun 16 2016 Intel HEX firmware)
export interface VciFirmwareProtocolDef {
  id: string;
  label: string;
  bus: 'CAN' | 'WWH-OBD' | 'K-LINE' | 'J1850' | 'J1939';
  baudOrRate: string;
  elmProtocolCode?: string;
}

export const AUTOCOM_VCI_FIRMWARE_TARGETS = ['CDP', 'DS800E', 'SDP', 'ADP186'] as const;

export const AUTOCOM_CDP_FIRMWARE_PROTOCOLS: VciFirmwareProtocolDef[] = [
  { id: 'ISO27145_29_500', label: 'ISO 27145-4 (CAN 29-500)', bus: 'WWH-OBD', baudOrRate: '500 kbps', elmProtocolCode: '7' },
  { id: 'ISO27145_29_250', label: 'ISO 27145-4 (CAN 29-250)', bus: 'WWH-OBD', baudOrRate: '250 kbps' },
  { id: 'ISO27145_11_500', label: 'ISO 27145-4 (CAN 11-500)', bus: 'WWH-OBD', baudOrRate: '500 kbps', elmProtocolCode: '6' },
  { id: 'ISO27145_11_250', label: 'ISO 27145-4 (CAN 11-250)', bus: 'WWH-OBD', baudOrRate: '250 kbps', elmProtocolCode: '8' },
  { id: 'ISO15765_29_500', label: 'ISO 15765-4 (CAN 29-500)', bus: 'CAN', baudOrRate: '500 kbps', elmProtocolCode: '7' },
  { id: 'ISO15765_29_250', label: 'ISO 15765-4 (CAN 29-250)', bus: 'CAN', baudOrRate: '250 kbps' },
  { id: 'ISO15765_11_500', label: 'ISO 15765-4 (CAN 11-500)', bus: 'CAN', baudOrRate: '500 kbps', elmProtocolCode: '6' },
  { id: 'ISO15765_11_250', label: 'ISO 15765-4 (CAN 11-250)', bus: 'CAN', baudOrRate: '250 kbps', elmProtocolCode: '8' },
  { id: 'ISO14230_FAST', label: 'ISO 14230-4 (KW2000) Fast', bus: 'K-LINE', baudOrRate: '10400 baud', elmProtocolCode: '5' },
  { id: 'ISO14230_SLOW', label: 'ISO 14230-4 (KW2000) Slow', bus: 'K-LINE', baudOrRate: '10400 baud', elmProtocolCode: '4' },
  { id: 'ISO9141_CARB', label: 'ISO 9141-2 (CARB)', bus: 'K-LINE', baudOrRate: '10400 baud', elmProtocolCode: '3' },
  { id: 'J1850_VPW', label: 'ISO 519-4 (SAE-J1850 VPW)', bus: 'J1850', baudOrRate: '10.4 kbps' },
  { id: 'J1850_PWM', label: 'ISO 519-4 (SAE-J1850 PWM)', bus: 'J1850', baudOrRate: '41.6 kbps' },
  { id: 'SAE_J1939_21', label: 'SAE J1939-21', bus: 'J1939', baudOrRate: '250 / 500 kbps' },
];

export interface IntelHexParseResult {
  isIntelHex: boolean;
  bytes: Uint8Array;
  recordCount: number;
  checksumErrors: number;
  baseAddress: number;
  endAddress: number;
  detectedTargets: string[];
  detectedProtocols: string[];
  buildStamp: string | null;
}

/**
 * Parses Intel HEX (.hex) ECU calibration / VCI firmware files into contiguous binary bytes,
 * validates record checksums, and inspects embedded Autocom/ECU firmware strings.
 */
export function parseIntelHexToBinary(rawBytes: Uint8Array, maxBinaryBytes = 65536): IntelHexParseResult {
  const headText = new TextDecoder('ascii', { fatal: false }).decode(rawBytes.slice(0, 128)).trimStart();
  if (!headText.startsWith(':')) {
    return {
      isIntelHex: false,
      bytes: rawBytes.slice(0, maxBinaryBytes),
      recordCount: 0,
      checksumErrors: 0,
      baseAddress: 0,
      endAddress: Math.min(rawBytes.length, maxBinaryBytes),
      detectedTargets: [],
      detectedProtocols: [],
      buildStamp: null,
    };
  }

  const fullText = new TextDecoder('ascii', { fatal: false }).decode(rawBytes);
  const lines = fullText.split(/\r?\n/);

  let segmentBase = 0;
  let linearBase = 0;
  let recordCount = 0;
  let checksumErrors = 0;
  let minAddr = Infinity;
  let maxAddr = 0;

  const chunks: { addr: number; data: number[] }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith(':') || line.length < 11) continue;
    recordCount += 1;

    const byteCount = parseInt(line.slice(1, 3), 16);
    if (Number.isNaN(byteCount) || line.length < 11 + byteCount * 2) {
      checksumErrors += 1;
      continue;
    }

    let sum = 0;
    const rawRec: number[] = [];
    let hexValid = true;
    for (let i = 1; i <= 9 + byteCount * 2; i += 2) {
      const b = parseInt(line.slice(i, i + 2), 16);
      if (Number.isNaN(b)) {
        hexValid = false;
        break;
      }
      rawRec.push(b);
      sum = (sum + b) & 0xff;
    }

    if (!hexValid || sum !== 0) {
      checksumErrors += 1;
      continue;
    }

    const offset = (rawRec[1] << 8) | rawRec[2];
    const recType = rawRec[3];

    if (recType === 0x00 && byteCount > 0) {
      const absAddr = linearBase + segmentBase + offset;
      const data = rawRec.slice(4, 4 + byteCount);
      chunks.push({ addr: absAddr, data });
      if (absAddr < minAddr) minAddr = absAddr;
      if (absAddr + data.length > maxAddr) maxAddr = absAddr + data.length;
    } else if (recType === 0x01) {
      break;
    } else if (recType === 0x02 && byteCount >= 2) {
      segmentBase = ((rawRec[4] << 8) | rawRec[5]) << 4;
      linearBase = 0;
    } else if (recType === 0x04 && byteCount >= 2) {
      linearBase = ((rawRec[4] << 8) | rawRec[5]) << 16;
      segmentBase = 0;
    }
  }

  if (chunks.length === 0 || !Number.isFinite(minAddr)) {
    return {
      isIntelHex: true,
      bytes: rawBytes.slice(0, maxBinaryBytes),
      recordCount,
      checksumErrors,
      baseAddress: 0,
      endAddress: 0,
      detectedTargets: [],
      detectedProtocols: [],
      buildStamp: null,
    };
  }

  // Concatenate decoded data chunks directly if address space has large segment gaps,
  // otherwise map linearly from minAddr.
  const span = maxAddr - minAddr;
  const totalDataBytes = chunks.reduce((acc, c) => acc + c.data.length, 0);
  let decodedAll: Uint8Array;

  if (span > 0 && span <= Math.max(totalDataBytes * 2, maxBinaryBytes)) {
    decodedAll = new Uint8Array(span).fill(0xff);
    for (const c of chunks) {
      const rel = c.addr - minAddr;
      for (let i = 0; i < c.data.length; i++) {
        if (rel + i < decodedAll.length) decodedAll[rel + i] = c.data[i];
      }
    }
  } else {
    decodedAll = new Uint8Array(totalDataBytes);
    let cursor = 0;
    for (const c of chunks) {
      decodedAll.set(c.data, cursor);
      cursor += c.data.length;
    }
  }

  // Scan decoded payload for embedded VCI targets, protocols & build stamp
  const asciiPayload = Array.from(decodedAll, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' ')).join('');
  const detectedTargets = AUTOCOM_VCI_FIRMWARE_TARGETS.filter((t) => asciiPayload.includes(t));
  const detectedProtocols = AUTOCOM_CDP_FIRMWARE_PROTOCOLS
    .map((p) => p.label)
    .filter((lbl) => asciiPayload.includes(lbl));
  const dateMatch = asciiPayload.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}/
  );

  return {
    isIntelHex: true,
    bytes: decodedAll.slice(0, maxBinaryBytes),
    recordCount,
    checksumErrors,
    baseAddress: minAddr,
    endAddress: maxAddr,
    detectedTargets,
    detectedProtocols,
    buildStamp: dateMatch ? dateMatch[0] : null,
  };
}
