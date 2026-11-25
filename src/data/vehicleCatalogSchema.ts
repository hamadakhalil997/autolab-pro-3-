/**
 * Import contract for a sourced, auditable vehicle catalogue.
 * A model/year match alone is never sufficient to infer ECU addressing,
 * security access, wiring, or programming procedures.
 */
export type VehicleRecordVerification =
  | 'unverified'
  | 'source-checked'
  | 'vehicle-validated';

export interface VehicleCatalogRecord {
  id: string;
  make: string;
  model: string;
  generation: string;
  yearFrom: number;
  yearTo: number;
  market: string[];
  engines: string[];
  transmissionOptions: string[];
  ecuSystems: string[];
  diagnosticProtocols: string[];
  sourceName: string;
  sourceUrl: string;
  sourceRevision?: string;
  verification: VehicleRecordVerification;
  verifiedAt?: string;
  notes?: string;
}

export function validateVehicleCatalogRecord(
  value: unknown
): value is VehicleCatalogRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<VehicleCatalogRecord>;
  const textFields: (keyof VehicleCatalogRecord)[] = [
    'id', 'make', 'model', 'generation', 'sourceName', 'sourceUrl',
  ];
  if (textFields.some((key) => typeof record[key] !== 'string' || !String(record[key]).trim())) {
    return false;
  }
  if (
    !Number.isInteger(record.yearFrom) ||
    !Number.isInteger(record.yearTo) ||
    Number(record.yearFrom) < 1886 ||
    Number(record.yearTo) > 2026 ||
    Number(record.yearFrom) > Number(record.yearTo)
  ) return false;
  const arrays: (keyof VehicleCatalogRecord)[] = [
    'market', 'engines', 'transmissionOptions', 'ecuSystems', 'diagnosticProtocols',
  ];
  if (arrays.some((key) => !Array.isArray(record[key]) || !(record[key] as unknown[]).every((item) => typeof item === 'string'))) {
    return false;
  }
  if (!['unverified', 'source-checked', 'vehicle-validated'].includes(String(record.verification))) {
    return false;
  }
  try {
    const url = new URL(String(record.sourceUrl));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  } catch {
    return false;
  }
  if (record.verification !== 'unverified' && !record.verifiedAt) return false;
  return true;
}
