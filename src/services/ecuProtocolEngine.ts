import { NRC_TABLE } from '../data/vehicleDatabase';
import type {
  ActiveVehicleProfile,
  CalibrationMapTable,
  DtcItem,
  TransportKind,
} from '../types/autolab';
import { webSerialDriver } from './webSerialObd';
import { webUsbDriver } from './webUsbDirect';
import { wsObdDriver } from './wsObdTransport';

export const DTC_DESCRIPTION_DB: Record<string, { mod: string; nodeId: string; desc: string }> = {
  P0100: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Mass or Volume Air Flow Circuit Malfunction' },
  P0101: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Mass Air Flow Circuit Range / Performance' },
  P0113: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Intake Air Temperature Sensor 1 Circuit High' },
  P0118: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Engine Coolant Temperature Sensor 1 Circuit High' },
  P0130: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'O2 Sensor Circuit (Bank 1 Sensor 1)' },
  P0171: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'System Too Lean (Bank 1 Fuel Trim)' },
  P0172: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'System Too Rich (Bank 1 Fuel Trim)' },
  P0234: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Turbocharger / Supercharger Overboost Condition' },
  P0299: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Turbocharger / Supercharger Underboost' },
  P0300: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Random / Multiple Cylinder Misfire Detected' },
  P0301: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Cylinder 1 Misfire Detected' },
  P0302: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Cylinder 2 Misfire Detected' },
  P0335: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Crankshaft Position Sensor A Circuit' },
  P0420: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'Catalyst System Efficiency Below Threshold' },
  P0500: { mod: 'ABS / Vehicle Speed', nodeId: '0x760', desc: 'Vehicle Speed Sensor A Signal Fault' },
  P0562: { mod: 'Power Supply', nodeId: '0x7E0', desc: 'System Voltage Low (KL30 < 11.5V)' },
  P0606: { mod: 'Engine (ECM)', nodeId: '0x7E0', desc: 'ECM / PCM Internal Processor Fault' },
  P1612: { mod: 'IMMO / Security', nodeId: '0x7C0', desc: 'Immobilizer / ECU Coding Communication Error' },
  U0100: { mod: 'CAN Gateway', nodeId: '0x710', desc: 'Lost Communication With ECM / PCM A' },
  U0101: { mod: 'Transmission (TCU)', nodeId: '0x7E1', desc: 'Lost Communication With TCM' },
  U0121: { mod: 'ABS / ESP', nodeId: '0x760', desc: 'Lost Communication With ABS Control Module' },
  U0155: { mod: 'Instrument Cluster', nodeId: '0x720', desc: 'Lost Communication With IPC Cluster' },
  B1193: { mod: 'SRS / Airbag', nodeId: '0x750', desc: 'Crash Event Storage Full (EDR)' },
  C0031: { mod: 'ABS / ESP', nodeId: '0x760', desc: 'Left Front Wheel Speed Sensor Circuit' },
};

export function describeDtcCode(code: string): { mod: string; nodeId: string; desc: string } {
  const upper = code.trim().toUpperCase();
  if (DTC_DESCRIPTION_DB[upper]) {
    return DTC_DESCRIPTION_DB[upper];
  }
  const sysPrefix = upper[0];
  if (sysPrefix === 'U') {
    return { mod: 'CAN Gateway / Bus', nodeId: '0x710', desc: `Network Communication Fault (${upper})` };
  }
  if (sysPrefix === 'C') {
    return { mod: 'ABS / Chassis', nodeId: '0x760', desc: `Chassis / Wheel Speed Fault (${upper})` };
  }
  if (sysPrefix === 'B') {
    return { mod: 'BCM / SRS Body', nodeId: '0x750', desc: `Body / Restraint Fault (${upper})` };
  }
  return { mod: 'OBD-II ECU', nodeId: '0x7E0', desc: `Powertrain Diagnostic Trouble Code (${upper})` };
}

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function computeSeedKey(seedHex: string, ecuName: string): string {
  const bytes = seedHex
    .trim()
    .split(/\s+/)
    .map((h) => parseInt(h, 16))
    .filter((n) => !Number.isNaN(n));
  const s = [bytes[0] ?? 0xa4, bytes[1] ?? 0x9f, bytes[2] ?? 0x2c, bytes[3] ?? 0x11];
  let salt = 0x5b;
  for (let i = 0; i < ecuName.length; i++) {
    salt = (salt ^ ecuName.charCodeAt(i)) & 0xff;
  }
  const key = s.map((b, idx) => (((b ^ (0x5a + idx * 0x13)) + salt) & 0xff));
  return key.map((k) => k.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function syncMapsToEcuBuffer(
  maps: CalibrationMapTable[],
  baseBuffer: Uint8Array
): Uint8Array {
  const next = new Uint8Array(baseBuffer);
  let cursor = 0x0140;
  for (const m of maps) {
    for (let r = 0; r < m.current.length; r++) {
      for (let c = 0; c < m.current[r].length; c++) {
        if (cursor + 1 >= next.length - 4) break;
        const scaled = Math.max(0, Math.min(65535, Math.round(m.current[r][c] * 10)));
        next[cursor] = scaled & 0xff;
        next[cursor + 1] = (scaled >>> 8) & 0xff;
        cursor += 2;
      }
    }
  }
  if (next.length >= 4) {
    const c = crc32(next.slice(0, next.length - 4));
    const n = next.length;
    next[n - 4] = c & 0xff;
    next[n - 3] = (c >>> 8) & 0xff;
    next[n - 2] = (c >>> 16) & 0xff;
    next[n - 1] = (c >>> 24) & 0xff;
  }
  return next;
}

export function getActivePhysicalTransport(): TransportKind {
  if (webSerialDriver.isOpen) return 'webserial';
  if (webUsbDriver.isOpen) return 'webusb';
  if (wsObdDriver.isOpen) return 'websocket';
  return 'none';
}

export interface UdsTxResult {
  txId: string;
  tx: string;
  rx: string;
  lat: string;
  note: string;
  ok: boolean;
  seed?: string;
  unlocked?: boolean;
  clearedDtcs?: boolean;
}

export function decodeRawUdsReply(txPayload: string, rawReply: string): { ok: boolean; note: string } {
  const cleanRx = rawReply.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (!cleanRx || rawReply.toUpperCase().includes('NO DATA')) {
    return { ok: false, note: 'No ECU reply (NO DATA)' };
  }
  if (cleanRx.startsWith('7F') && cleanRx.length >= 6) {
    const nrc = cleanRx.slice(4, 6);
    return {
      ok: false,
      note: `NRC 0x${nrc}: ${NRC_TABLE[nrc] ?? 'negativeResponse'}`,
    };
  }
  const sid = txPayload.replace(/\s+/g, '').slice(0, 2).toUpperCase();
  const posSid = ((parseInt(sid, 16) + 0x40) & 0xff).toString(16).padStart(2, '0').toUpperCase();
  if (cleanRx.includes(posSid)) {
    return { ok: true, note: `Positive ECU Response (SID 0x${posSid})` };
  }
  return { ok: false, note: `Unverified ECU response: expected positive SID 0x${posSid}` };
}

export async function dispatchUdsCommand(params: {
  txId: string;
  payload: string;
  demoBenchMode: boolean;
  vehicle: ActiveVehicleProfile;
  ecuUnlocked: boolean;
  securitySeed: string | null;
  dtcs: DtcItem[];
}): Promise<UdsTxResult> {
  const txId = params.txId.trim() || '0x7E0';
  const tx = params.payload.trim().toUpperCase();
  const physical = getActivePhysicalTransport();
  const t0 = performance.now();

  if (physical !== 'none') {
    let rawResp = '';
    if (physical === 'webserial') {
      rawResp = await webSerialDriver.sendTargetedCommand(txId, tx);
    } else if (physical === 'webusb') {
      rawResp = await webUsbDriver.sendTargetedCommand(txId, tx);
    } else {
      rawResp = await wsObdDriver.sendTargetedCommand(txId, tx);
    }

    const lat = (performance.now() - t0).toFixed(1);
    const decoded = decodeRawUdsReply(tx, rawResp);
    const cleanHex = rawResp.toUpperCase().replace(/[^0-9A-F]/g, '');
    let seed: string | undefined;
    let unlocked: boolean | undefined;

    if (cleanHex.includes('6701') && cleanHex.length >= cleanHex.indexOf('6701') + 12) {
      const idx = cleanHex.indexOf('6701') + 4;
      seed = [
        cleanHex.slice(idx, idx + 2),
        cleanHex.slice(idx + 2, idx + 4),
        cleanHex.slice(idx + 4, idx + 6),
        cleanHex.slice(idx + 6, idx + 8),
      ].join(' ');
    }
    if (cleanHex.includes('6702')) {
      unlocked = true;
    }

    return {
      txId,
      tx,
      rx: rawResp || 'NO DATA',
      lat,
      note: `${physical.toUpperCase()} · ${decoded.note}`,
      ok: decoded.ok,
      seed,
      unlocked,
      clearedDtcs: cleanHex.includes('54'),
    };
  }

  if (!params.demoBenchMode) {
    return {
      txId,
      tx,
      rx: 'OFFLINE',
      lat: '0.0',
      note: 'No active VCI transport or Bench ECU session',
      ok: false,
    };
  }

  // Deterministic ISO-14229 Bench ECU State Machine
  const parts = tx.split(/\s+/);
  const sid = parts[0] ?? '';
  const sub = parts[1] ?? '';
  const lat = (2.4 + Math.random() * 2.2).toFixed(1);

  if (sid === '10') {
    return {
      txId,
      tx,
      rx: `50 ${sub || '03'} 00 32 01 F4`,
      lat,
      note: `Diagnostic Session ${sub === '02' ? 'Programming (0x02)' : 'Extended (0x03)'} Active`,
      ok: true,
    };
  }

  if (sid === '3E') {
    return { txId, tx, rx: '7E 00', lat, note: 'TesterPresent Keep-Alive OK', ok: true };
  }

  if (sid === '22' && sub === 'F1') {
    const did = parts[2] ?? '90';
    if (did === '90') {
      const vinHex = params.vehicle.vin
        .slice(0, 17)
        .split('')
        .map((ch) => ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      return {
        txId,
        tx,
        rx: `62 F1 90 ${vinHex}`,
        lat,
        note: `VIN Verified: ${params.vehicle.vin}`,
        ok: true,
      };
    }
    return {
      txId,
      tx,
      rx: `62 F1 ${did} 41 4C 50 52 4F`,
      lat,
      note: `Read DID 0xF1${did} (${params.vehicle.ecu})`,
      ok: true,
    };
  }

  if (sid === '27' && sub === '01') {
    const seedBytes = params.vehicle.cvn
      .padEnd(8, 'A')
      .slice(0, 8)
      .match(/.{1,2}/g)
      ?.join(' ') ?? 'A4 9F 2C 11';
    return {
      txId,
      tx,
      rx: `67 01 ${seedBytes}`,
      lat,
      note: `Security Seed Returned (${seedBytes})`,
      ok: true,
      seed: seedBytes,
    };
  }

  if (sid === '27' && sub === '02') {
    return {
      txId,
      tx,
      rx: '67 02',
      lat,
      note: 'Security Access Level 0x03 Granted',
      ok: true,
      unlocked: true,
    };
  }

  if (sid === '2E') {
    if (!params.ecuUnlocked && txId === '0x7E0') {
      return {
        txId,
        tx,
        rx: '7F 2E 33',
        lat,
        note: 'NRC 0x33: Unlock Security (0x27) to write engine DID',
        ok: false,
      };
    }
    return {
      txId,
      tx,
      rx: `6E ${sub || 'F1'} ${parts[2] ?? '90'}`,
      lat,
      note: `WriteDataByIdentifier Confirmed on ${txId}`,
      ok: true,
    };
  }

  if (sid === '2F') {
    return {
      txId,
      tx,
      rx: `6F ${sub || 'F0'} ${parts[2] ?? '10'} 03`,
      lat,
      note: `IOControl Actuator Active on ${txId}`,
      ok: true,
    };
  }

  if (sid === '31') {
    return {
      txId,
      tx,
      rx: `71 ${sub || '01'} ${parts[2] ?? '00'} ${parts[3] ?? '00'}`,
      lat,
      note: `RoutineControl Completed on ${txId}`,
      ok: true,
    };
  }

  if (sid === '14') {
    return {
      txId,
      tx,
      rx: '54',
      lat,
      note: `Cleared DTC Memory on ${txId}`,
      ok: true,
      clearedDtcs: true,
    };
  }

  if (sid === '19') {
    return {
      txId,
      tx,
      rx: `59 02 FF ${params.dtcs.length ? '01 71 2F' : '00'}`,
      lat,
      note: `${params.dtcs.length} DTC(s) Reported`,
      ok: true,
    };
  }

  if (sid === '11') {
    return {
      txId,
      tx,
      rx: `51 ${sub || '01'}`,
      lat,
      note: 'ECU Hard Reset Executed',
      ok: true,
    };
  }

  const nrc = params.ecuUnlocked ? '22' : '33';
  return {
    txId,
    tx,
    rx: `7F ${sid} ${nrc}`,
    lat,
    note: `NRC 0x${nrc}: ${NRC_TABLE[nrc] ?? 'conditionsNotCorrect'}`,
    ok: false,
  };
}
