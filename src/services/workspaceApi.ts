import type {
  AuditLogEntry,
  CodingConfigState,
  KeyProgrammingRecord,
  ObdProtocolCode,
  PartCatalogItem,
  TelemetrySample,
  VciAdapterType,
  VehicleRecord,
} from '../types/autolab';

export interface WorkspacePayload {
  customVehicles: VehicleRecord[];
  customParts: PartCatalogItem[];
  customKeys: KeyProgrammingRecord[];
  codingHistory: string[];
  logs: AuditLogEntry[];
  settings: {
    vciAdapter: VciAdapterType;
    baudRate: number;
    protocolCode: ObdProtocolCode;
    wsEndpoint: string;
    autoConnectSavedUsb: boolean;
    targetIdle: number;
    tcuSportMode: boolean;
    coding: CodingConfigState;
  };
}

export async function fetchWorkspace(): Promise<WorkspacePayload | null> {
  try {
    const res = await fetch('/api/workspace');
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; workspace?: WorkspacePayload };
    return json.ok && json.workspace ? json.workspace : null;
  } catch {
    return null;
  }
}

export async function persistCustomVehicles(vehicles: VehicleRecord[]): Promise<void> {
  try {
    await fetch('/api/workspace/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicles }),
    });
  } catch {
    // non-fatal offline fallback
  }
}

export async function persistCustomKeys(keys: KeyProgrammingRecord[]): Promise<void> {
  try {
    await fetch('/api/workspace/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    });
  } catch {
    // non-fatal offline fallback
  }
}

export async function persistCustomParts(parts: PartCatalogItem[]): Promise<void> {
  try {
    await fetch('/api/workspace/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
    });
  } catch {
    // non-fatal offline fallback
  }
}

export async function persistWorkspaceSettings(
  patch: Partial<WorkspacePayload['settings']>
): Promise<void> {
  try {
    await fetch('/api/workspace/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch {
    // non-fatal
  }
}

export async function persistCodingEntry(
  entry: string,
  coding: CodingConfigState
): Promise<void> {
  try {
    await fetch('/api/workspace/coding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry, coding }),
    });
  } catch {
    // non-fatal
  }
}

export async function persistLogEntry(entry: AuditLogEntry): Promise<void> {
  try {
    await fetch('/api/workspace/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // non-fatal
  }
}

export async function clearPersistedLogs(): Promise<void> {
  try {
    await fetch('/api/workspace/logs', { method: 'DELETE' });
  } catch {
    // non-fatal
  }
}

export async function persistVaultMetadata(meta: {
  label: string;
  timestamp: string;
  cvn: string;
  size: number;
  crc32: string;
}): Promise<void> {
  try {
    await fetch('/api/workspace/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
  } catch {
    // non-fatal
  }
}

export async function persistTraceSession(
  vehicle: string,
  ecu: string,
  samples: TelemetrySample[]
): Promise<void> {
  try {
    await fetch('/api/workspace/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle, ecu, samples }),
    });
  } catch {
    // non-fatal
  }
}
