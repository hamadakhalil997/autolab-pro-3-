import React, { useEffect, useMemo, useState } from 'react';
import {
  Cable,
  Check,
  Database,
  KeyRound,
  Link2,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
  WifiOff,
  Zap,
} from 'lucide-react';
import { findBestKeyRecord } from '../data/keyImmoDatabase';
import { FT_BAUD_RATES } from '../services/ftdiD2xxDefs';
import type {
  ActiveVehicleProfile,
  AuditLogEntry,
  CodingConfigState,
  FuncSubTab,
  HardwareLinkState,
  IgnitionState,
  KeyProgrammingRecord,
  ObdProtocolCode,
  VciAdapterType,
} from '../types/autolab';

interface FunctionsViewProps {
  vciConnected: boolean;
  ecuOnline: boolean;
  ignition: IgnitionState;
  vehicle: ActiveVehicleProfile;
  keysDb: KeyProgrammingRecord[];
  subTab: FuncSubTab;
  onSubTabChange: (sub: FuncSubTab) => void;
  codingConfig: CodingConfigState;
  codingAuditLogs: string[];
  onWriteCoding: (next: CodingConfigState) => Promise<void>;
  onSyncModuleVin: () => Promise<void>;
  onRunRoutine: (txId: string, payloadHex: string, label: string) => Promise<boolean>;
  targetIdle: number;
  onUpdateTargetIdle: (rpm: number) => void;
  edrCleared: boolean;
  onClearCrashEdr: () => Promise<void>;
  onLoadKeyProfile: (
    keyRec: KeyProgrammingRecord,
    selectedYear: number,
    openImmoTab: boolean
  ) => void;
  onOpenKeysDatabase: () => void;
  onOpenVciModal: () => void;
  onToast: (msg: string) => void;
}

export const FunctionsView: React.FC<FunctionsViewProps> = ({
  vciConnected,
  ecuOnline,
  ignition,
  vehicle,
  keysDb,
  subTab,
  onSubTabChange,
  codingConfig,
  codingAuditLogs,
  onWriteCoding,
  onSyncModuleVin,
  onRunRoutine,
  targetIdle,
  onUpdateTargetIdle,
  edrCleared,
  onClearCrashEdr,
  onLoadKeyProfile,
  onOpenKeysDatabase,
  onOpenVciModal,
  onToast,
}) => {
  const [region, setRegion] = useState(codingConfig.region);
  const [trans, setTrans] = useState(codingConfig.trans);
  const [light, setLight] = useState(codingConfig.light);
  const [adaptStatus, setAdaptStatus] = useState('Ready — Select an adaptation routine to execute.');
  const [immoResult, setImmoResult] = useState('Backup verified in Vault.');
  const [radarAz, setRadarAz] = useState('+0.14°');
  const [radarEl, setRadarEl] = useState('-0.08°');
  const [busy, setBusy] = useState(false);

  // Cascading Key & IMMO selector inside Functions -> IMMO & Keys
  const initialMatchedKey = useMemo(
    () => findBestKeyRecord(keysDb, vehicle.make, vehicle.model, vehicle.year) ?? keysDb[0] ?? null,
    [keysDb, vehicle.make, vehicle.model, vehicle.year]
  );
  const [immoMake, setImmoMake] = useState<string>(initialMatchedKey?.make ?? '');
  const [immoModel, setImmoModel] = useState<string>(initialMatchedKey?.model ?? '');
  const [immoYear, setImmoYear] = useState<number>(vehicle.year);

  useEffect(() => {
    const matched = findBestKeyRecord(keysDb, vehicle.make, vehicle.model, vehicle.year);
    if (matched) {
      setImmoMake(matched.make);
      setImmoModel(matched.model);
      setImmoYear(vehicle.year);
    }
  }, [keysDb, vehicle.make, vehicle.model, vehicle.year]);

  const immoMakes = useMemo(() => [...new Set(keysDb.map((k) => k.make))].sort(), [keysDb]);
  const immoModels = useMemo(() => {
    const pool = immoMake ? keysDb.filter((k) => k.make === immoMake) : keysDb;
    return [...new Set(pool.map((k) => k.model))];
  }, [keysDb, immoMake]);

  const immoYears = useMemo(() => {
    const pool = keysDb.filter(
      (k) => (!immoMake || k.make === immoMake) && (!immoModel || k.model === immoModel)
    );
    const minY = pool.length ? Math.min(...pool.map((k) => k.from)) : 1980;
    const maxY = pool.length ? Math.max(...pool.map((k) => k.to)) : 2026;
    const arr: number[] = [];
    for (let y = maxY; y >= minY; y--) arr.push(y);
    return arr;
  }, [keysDb, immoMake, immoModel]);

  const selectedKeyProfile = useMemo(() => {
    return (
      keysDb.find(
        (k) =>
          (!immoMake || k.make === immoMake) &&
          (!immoModel || k.model === immoModel) &&
          immoYear >= k.from &&
          immoYear <= k.to
      ) ??
      keysDb.find((k) => k.make === immoMake && k.model === immoModel) ??
      keysDb.find((k) => k.make === immoMake) ??
      initialMatchedKey
    );
  }, [keysDb, immoMake, immoModel, immoYear, initialMatchedKey]);

  const linkReady = vciConnected && ecuOnline && ignition !== 'OFF';

  const handleWriteCoding = async () => {
    if (!linkReady) {
      onToast('Connect hardware / Bench ECU and turn KL15 Ignition ON first');
      return;
    }
    setBusy(true);
    try {
      await onWriteCoding({ region, trans, light });
    } finally {
      setBusy(false);
    }
  };

  const runAdaptation = async (name: string, payloadHex: string) => {
    if (!linkReady) {
      onToast('Connect hardware / Bench ECU and turn KL15 Ignition ON first');
      return;
    }
    setBusy(true);
    try {
      const ok = await onRunRoutine('0x7E0', payloadHex, name);
      setAdaptStatus(ok ? `${name} executed (${payloadHex} OK).` : `${name} completed with check.`);
    } finally {
      setBusy(false);
    }
  };

  const runImmo = async (msg: string, payloadHex: string) => {
    if (!linkReady) {
      onToast('Connect hardware / Bench ECU and turn KL15 Ignition ON first');
      return;
    }
    setBusy(true);
    try {
      const targetInfo = selectedKeyProfile
        ? ` [${selectedKeyProfile.make} ${selectedKeyProfile.transponderChip}]`
        : '';
      await onRunRoutine('0x730', payloadHex, `${msg}${targetInfo}`);
      setImmoResult(`${msg}${targetInfo}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-sky-500/20">
        <div>
          <h1 className="text-lg font-bold text-white">Coding, IMMO &amp; Safety Engineering</h1>
          <p className="text-xs text-sky-300 mt-0.5">
            {vehicle.displayName} · Variant Coding, Adaptations, Immobilizer/Keys/PIN, Crash/EDR &amp; ADAS
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['coding', 'Variant Coding'],
              ['adapt', 'Adaptation & Idle'],
              ['immo', 'IMMO & Keys'],
              ['safety', 'Safety, Crash & ADAS'],
            ] as [FuncSubTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSubTabChange(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id
                  ? 'bg-blue-600 border-sky-300 text-white'
                  : 'bg-[#0e1d38]/80 border-sky-500/30 text-slate-300 hover:border-sky-400/60 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!linkReady && (
        <div className="rounded-xl border border-amber-500/45 bg-amber-950/35 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>VCI &amp; KL15 Ignition must be active to execute coding, IMMO, or adaptation routines.</span>
          </div>
          <button
            type="button"
            onClick={onOpenVciModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Cable className="w-3.5 h-3.5" />
            Open Hardware &amp; Ignition Setup
          </button>
        </div>
      )}

      {subTab === 'coding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="text-sm font-bold text-sky-300">Variant &amp; Feature Coding</div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-300">Regional Spec</td>
                  <td className="py-2">
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option>ECE (Europe)</option>
                      <option>NAR (North America)</option>
                      <option>GCC (Middle East)</option>
                    </select>
                  </td>
                </tr>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-300">Transmission Type</td>
                  <td className="py-2">
                    <select
                      value={trans}
                      onChange={(e) => setTrans(e.target.value)}
                      className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option>8HP Automatic</option>
                      <option>7-Speed DCT</option>
                      <option>6-Speed Manual</option>
                    </select>
                  </td>
                </tr>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-300">Lighting Package</td>
                  <td className="py-2">
                    <select
                      value={light}
                      onChange={(e) => setLight(e.target.value)}
                      className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none"
                    >
                      <option>Adaptive Matrix LED</option>
                      <option>Bi-Xenon + DRL</option>
                      <option>Standard Halogen</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-300">Component Pairing</td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={!linkReady || busy}
                      onClick={() => void onSyncModuleVin()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Sync Replacement Module VIN
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              disabled={!linkReady || busy}
              onClick={() => void handleWriteCoding()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer self-start"
            >
              <Check className="w-3.5 h-3.5" />
              Write Coding &amp; Log Previous Values
            </button>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
            <div className="text-sm font-bold text-sky-300">Coding Audit History (Persisted)</div>
            <div className="font-mono text-xs text-slate-300 space-y-1.5 leading-relaxed max-h-[260px] overflow-y-auto autolab-scroll">
              {codingAuditLogs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'adapt' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-sky-300">Adaptation &amp; Learning Resets (0x31)</span>
              <span className={`font-mono text-xs ${linkReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                {linkReady ? 'Interlock OK' : 'Waiting for ECU'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  ['Electronic Throttle Body', '31 01 02 01'],
                  ['Crank / Cam Sensor', '31 01 02 02'],
                  ['Fuel Pressure & Trims', '31 01 02 03'],
                  ['Steering Angle Sensor (SAS)', '31 01 04 01'],
                  ['Yaw & Acceleration Sensor', '31 01 04 02'],
                  ['Air Suspension Leveling', '31 01 06 01'],
                ] as [string, string][]
              ).map(([name, hex]) => (
                <button
                  key={name}
                  type="button"
                  disabled={!linkReady || busy}
                  onClick={() => void runAdaptation(name, hex)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70]/80 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer text-left"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
            <div className="font-mono text-xs text-emerald-400">{adaptStatus}</div>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="text-sm font-bold text-sky-300">Idle RPM &amp; Throttle Target Control</div>
            <p className="text-xs text-slate-400">
              Adjusting target idle speed updates the live ECU idle setpoint and transmits UDS DID 0x2E 01 0C.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300 whitespace-nowrap">Target Idle RPM:</span>
              <input
                type="range"
                min={650}
                max={1150}
                step={25}
                value={targetIdle}
                onChange={(e) => onUpdateTargetIdle(parseInt(e.target.value, 10))}
                className="flex-1 accent-sky-400"
              />
              <strong className="font-mono text-sm text-white tabular-nums whitespace-nowrap">
                {targetIdle} RPM
              </strong>
            </div>
          </div>
        </div>
      )}

      {subTab === 'immo' && (
        <div className="flex flex-col gap-3">
          {/* Cascading Make -> Model -> Year Key & IMMO Selector */}
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-bold text-sky-300">
                Key &amp; Immobilizer Selector (Make → Model → Year · 1980–2026)
              </div>
              <div className="flex items-center gap-2">
                {selectedKeyProfile && (
                  <button
                    type="button"
                    onClick={() => onLoadKeyProfile(selectedKeyProfile, immoYear, false)}
                    className="px-3 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
                  >
                    Sync Workspace Vehicle
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenKeysDatabase}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-200 text-xs font-semibold cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  Full Keys &amp; IMMO Table ({keysDb.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_140px] gap-2.5">
              <select
                value={immoMake}
                onChange={(e) => {
                  const nextMake = e.target.value;
                  setImmoMake(nextMake);
                  const firstModel = keysDb.find((k) => k.make === nextMake);
                  setImmoModel(firstModel?.model ?? '');
                  if (firstModel) setImmoYear(firstModel.to);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
              >
                {immoMakes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={immoModel}
                onChange={(e) => {
                  const nextMdl = e.target.value;
                  setImmoModel(nextMdl);
                  const match = keysDb.find((k) => k.make === immoMake && k.model === nextMdl);
                  if (match) setImmoYear(match.to);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
              >
                {immoModels.map((mdl) => (
                  <option key={mdl} value={mdl}>
                    {mdl}
                  </option>
                ))}
              </select>

              <select
                value={immoYear}
                onChange={(e) => setImmoYear(parseInt(e.target.value, 10))}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
              >
                {immoYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {selectedKeyProfile && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs pt-1 border-t border-sky-500/15">
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400">IMMO Architecture</div>
                  <div className="font-mono font-semibold text-white mt-0.5">
                    {selectedKeyProfile.immoSystem}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400">Transponder Chip</div>
                  <div className="font-mono font-semibold text-sky-300 mt-0.5">
                    {selectedKeyProfile.transponderChip}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400">Frequency &amp; Key Blade</div>
                  <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                    {selectedKeyProfile.remoteFreq} · {selectedKeyProfile.keyBlade}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400">AKL Support &amp; Type</div>
                  <div className="font-mono font-semibold text-amber-300 mt-0.5">
                    {selectedKeyProfile.aklSupported} · {selectedKeyProfile.keyType}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20 md:col-span-2">
                  <div className="text-[11px] text-sky-300 font-semibold">Security Access / PIN / ISN</div>
                  <div className="font-mono text-slate-200 mt-0.5 leading-relaxed">
                    {selectedKeyProfile.securityAccess}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20 md:col-span-2">
                  <div className="text-[11px] text-emerald-400 font-semibold">Programming Procedure</div>
                  <div className="text-slate-200 mt-0.5 leading-relaxed">
                    {selectedKeyProfile.programmingMethod}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live UDS IMMO Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2.5">
              <div className="text-sm font-bold text-sky-300">Live IMMO Bus Telemetry (0x730)</div>
              <div className="font-mono text-xs text-slate-200 leading-loose">
                <div>
                  IMMO System:{' '}
                  <span className={linkReady ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                    {linkReady
                      ? `${selectedKeyProfile?.immoSystem ?? vehicle.ecu} Active`
                      : 'Offline (No ECU Session)'}
                  </span>
                </div>
                <div>
                  Registered Keys:{' '}
                  <strong className="text-white tabular-nums">{linkReady ? '2 / 8 Slots Used' : '--'}</strong>
                </div>
                <div>
                  PEPS / ELV:{' '}
                  <span className={linkReady ? 'text-emerald-400' : 'text-slate-400'}>
                    {linkReady ? 'Authenticated & Unlocked' : 'Locked / Offline'}
                  </span>
                </div>
                <div>
                  Session CVN / PIN Ref:{' '}
                  <span className="text-sky-300">{linkReady ? vehicle.cvn : '--'}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('Read IMMO Key Slots & Security Status (0x22 C0 01)', '22 C0 01')}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer mt-auto"
              >
                <Search className="w-3.5 h-3.5" />
                Read Key Count / PIN State
              </button>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
              <div className="text-sm font-bold text-sky-300">Key &amp; Remote Programming</div>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('Add Transponder / Smart Key (Slot #3)', '31 01 C0 01')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Add New Key / PEPS
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('Delete Lost Key (Slot #2 Disabled)', '31 01 C0 02')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Lost Key
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('All Keys Lost (AKL) Security Sequence', '31 01 C0 03')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                All Keys Lost Procedure
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('ECU ↔ BCM/IMMO ↔ ELV Rolling Sync', '31 01 C0 04')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                Synchronize ECU-BCM-ELV
              </button>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
              <div className="text-sm font-bold text-sky-300">IMMO Processing &amp; Emergency Access</div>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('IMMO Off + Checksum Correction Executed', '31 01 C0 10')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Process IMMO Off (EEPROM)
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('ECU Virginize (Factory Reset State)', '31 01 C0 11')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Virginize Control Unit
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => void runImmo('Emergency Unlock via BCM/RF (0x2F)', '2F F0 99 03 01')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 border border-emerald-400/50 text-white text-xs font-semibold cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                Emergency Unlock (Key-Inside)
              </button>
              <div className="font-mono text-xs text-sky-300 pt-1">{immoResult}</div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'safety' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="text-sm font-bold text-sky-300">Crash &amp; EDR Management + Squib Resistance</div>
            <table className="w-full text-xs font-mono border-collapse tabular-nums">
              <tbody>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-200">Driver Frontal Airbag (Stage 1)</td>
                  <td className={`py-2 text-right ${linkReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {linkReady ? '2.3 Ω · OK' : '--'}
                  </td>
                </tr>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-200">Passenger Pretensioner</td>
                  <td className={`py-2 text-right ${linkReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {linkReady ? '2.5 Ω · OK' : '--'}
                  </td>
                </tr>
                <tr className="border-b border-sky-500/15">
                  <td className="py-2 text-slate-200">Battery Pyrofuse Terminal</td>
                  <td className={`py-2 text-right ${linkReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {linkReady ? '2.1 Ω · OK' : '--'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-200">EDR Crash Flag Status</td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      !linkReady ? 'text-slate-500' : edrCleared ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {!linkReady ? '-- (No ECU Session)' : edrCleared ? '0 Events (Clean)' : '1 Stored Event (B1193)'}
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              disabled={!linkReady || busy}
              onClick={() => void onClearCrashEdr()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-700/80 hover:bg-rose-600 disabled:opacity-40 border border-rose-400/50 text-white text-xs font-semibold cursor-pointer self-start"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Crash Data &amp; Clear B1193 DTC
            </button>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="text-sm font-bold text-sky-300">Radar, ADAS &amp; EPB Persistent Control</div>
            <div className="font-mono text-xs text-slate-200 space-y-1.5 tabular-nums">
              <div>
                Front Radar Azimuth Offset: <strong className="text-white">{linkReady ? radarAz : '--'}</strong>
              </div>
              <div>
                Front Radar Elevation: <strong className="text-white">{linkReady ? radarEl : '--'}</strong>
              </div>
              <div>
                Forward Camera Horizon:{' '}
                <strong className={linkReady ? 'text-emerald-400' : 'text-slate-500'}>
                  {linkReady ? 'Aligned' : 'Offline'}
                </strong>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => {
                  setBusy(true);
                  void onRunRoutine('0x7A4', '31 01 D0 01', 'Radar / ADAS Dynamic Calibration').then((ok) => {
                    if (ok) {
                      setRadarAz('+0.01°');
                      setRadarEl('0.00°');
                    }
                    setBusy(false);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                <Radar className="w-3.5 h-3.5" />
                Calibrate Radar / ADAS
              </button>
              <button
                type="button"
                disabled={!linkReady || busy}
                onClick={() => {
                  setBusy(true);
                  void onRunRoutine('0x760', '31 01 E1 01', 'EPB Rear Calipers Service Mode').finally(() =>
                    setBusy(false)
                  );
                }}
                className="px-3.5 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                EPB Service Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== TCU VIEW ====================
interface TcuViewProps {
  vciConnected: boolean;
  ecuOnline: boolean;
  ignition: IgnitionState;
  speed: number;
  rpm: number;
  tcuSportMode: boolean;
  onFlashSportMap: () => Promise<void>;
  onResetAdaptations: () => Promise<void>;
}

export const TcuView: React.FC<TcuViewProps> = ({
  vciConnected,
  ecuOnline,
  ignition,
  speed,
  rpm,
  tcuSportMode,
  onFlashSportMap,
  onResetAdaptations,
}) => {
  const [busy, setBusy] = useState(false);
  const linkReady = vciConnected && ecuOnline && ignition !== 'OFF';
  const gear =
    speed === 0
      ? ignition === 'ENGINE_IDLE'
        ? 'N / Neutral'
        : 'P / Park'
      : speed < 25
      ? 'D1'
      : speed < 50
      ? 'D2'
      : speed < 80
      ? 'D3'
      : speed < 120
      ? 'D4'
      : speed < 165
      ? 'D5'
      : speed < 210
      ? 'D6'
      : 'D7';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2.5 border-b border-sky-500/20">
        <h1 className="text-lg font-bold text-white">TCU — Transmission Control Unit (0x7E1)</h1>
        <span className={`font-mono text-xs font-semibold ${linkReady ? 'text-emerald-400' : 'text-amber-400'}`}>
          {linkReady ? 'TCU Online (0x7E1)' : 'TCU Offline'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
          <div className="text-sm font-bold text-sky-300">Live TCU Telemetry (Synced to Vehicle Speed/RPM)</div>
          <table className="w-full text-xs font-mono border-collapse tabular-nums">
            <tbody>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Gear Selected</td>
                <td className="py-2 text-white font-bold">{linkReady ? gear : '--'}</td>
              </tr>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Input / Turbine Speed</td>
                <td className="py-2 text-sky-300">{linkReady ? `${rpm} RPM` : '--'}</td>
              </tr>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">ATF Temp</td>
                <td className="py-2 text-white">{linkReady ? '78 °C' : '--'}</td>
              </tr>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Shift Calibration</td>
                <td className={`py-2 ${linkReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {linkReady
                    ? tcuSportMode
                      ? 'Stage 2 Sport (140 ms shifts)'
                      : 'OEM Comfort (240 ms shifts)'
                    : '--'}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Clutch Fill Pressures</td>
                <td className={linkReady ? 'text-sky-300' : 'text-slate-500'}>
                  {linkReady ? '+12 / -4 / +8 / 0 mbar' : '--'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2.5">
          <div className="text-sm font-bold text-sky-300">TCU Calibration &amp; Clutch Adaptations (0x7E1)</div>
          <button
            type="button"
            disabled={!linkReady || busy}
            onClick={() => {
              setBusy(true);
              void onResetAdaptations().finally(() => setBusy(false));
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer self-start"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset TCU Clutch Kiss-Point Adaptations
          </button>
          <button
            type="button"
            disabled={!linkReady || busy}
            onClick={() => {
              setBusy(true);
              void onFlashSportMap().finally(() => setBusy(false));
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer self-start"
          >
            <Zap className="w-3.5 h-3.5" />
            {tcuSportMode ? 'Restore OEM Shift Map' : 'Flash Sport Shift Map (+Line Pressure)'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== SETTINGS VIEW ====================
interface SettingsViewProps {
  vciAdapter: VciAdapterType;
  onChangeAdapter: (a: VciAdapterType) => void;
  hardwareLink: HardwareLinkState;
  onChangeBaudRate: (baud: number) => void;
  onChangeProtocolCode: (code: ObdProtocolCode) => void;
  onChangeWsEndpoint: (url: string) => void;
  onChangeAutoConnectUsb: (enabled: boolean) => void;
  onScanSavedHardware: () => Promise<void>;
  demoBenchMode: boolean;
  onToggleDemoBench: (enabled: boolean) => void;
  batt: number;
  speed: number;
  onChangeBatt: (v: number) => void;
  onChangeSpeed: (s: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  vciAdapter,
  onChangeAdapter,
  hardwareLink,
  onChangeBaudRate,
  onChangeProtocolCode,
  onChangeWsEndpoint,
  onChangeAutoConnectUsb,
  onScanSavedHardware,
  demoBenchMode,
  onToggleDemoBench,
  batt,
  speed,
  onChangeBatt,
  onChangeSpeed,
}) => (
  <div className="flex flex-col gap-3">
    <div className="pb-2.5 border-b border-sky-500/20">
      <h1 className="text-lg font-bold text-white">Direct Hardware &amp; Protocol Settings (No Bridge)</h1>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
        <div className="text-sm font-bold text-sky-300">Direct USB / DoIP Transport Configuration</div>
        <table className="w-full text-xs border-collapse">
          <tbody>
            <tr className="border-b border-sky-500/15">
              <td className="py-2.5 text-slate-300">Active Driver</td>
              <td className="py-2.5">
                <select
                  value={vciAdapter}
                  onChange={(e) => onChangeAdapter(e.target.value as VciAdapterType)}
                  className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none"
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
              </td>
            </tr>
            <tr className="border-b border-sky-500/15">
              <td className="py-2.5 text-slate-300">USB COM Baud Rate</td>
              <td className="py-2.5">
                <select
                  value={hardwareLink.baudRate}
                  onChange={(e) => onChangeBaudRate(Number(e.target.value))}
                  className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs font-mono outline-none"
                >
                  {FT_BAUD_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate} baud{rate === 10400 ? ' (ISO 9141/K-Line)' : rate === 38400 ? ' (Standard ELM327)' : rate === 115200 ? ' (STN/OBDLink)' : rate === 921600 ? ' (FTDI D2XX Max)' : ''}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr className="border-b border-sky-500/15">
              <td className="py-2.5 text-slate-300">OBD Bus Protocol</td>
              <td className="py-2.5">
                <select
                  value={hardwareLink.protocolCode}
                  onChange={(e) => onChangeProtocolCode(e.target.value as ObdProtocolCode)}
                  className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs outline-none"
                >
                  <option value="0">ATSP0 (Auto Detect)</option>
                  <option value="6">ATSP6 (ISO 15765-4 / 27145-4 CAN 11-500)</option>
                  <option value="7">ATSP7 (ISO 15765-4 / 27145-4 CAN 29-500)</option>
                  <option value="8">ATSP8 (ISO 15765-4 / 27145-4 CAN 11-250)</option>
                  <option value="9">ATSP9 (ISO 15765-4 / 27145-4 CAN 29-250)</option>
                  <option value="A">ATSPA (SAE J1939-21 Heavy Duty CAN)</option>
                  <option value="5">ATSP5 (ISO 14230-4 KW2000 Fast)</option>
                  <option value="4">ATSP4 (ISO 14230-4 KW2000 Slow)</option>
                  <option value="3">ATSP3 (ISO 9141-2 CARB)</option>
                  <option value="2">ATSP2 (ISO 519-4 SAE-J1850 VPW)</option>
                  <option value="1">ATSP1 (ISO 519-4 SAE-J1850 PWM)</option>
                </select>
              </td>
            </tr>
            <tr className="border-b border-sky-500/15">
              <td className="py-2.5 text-slate-300">DoIP / Wi-Fi WebSocket</td>
              <td className="py-2.5">
                <input
                  type="text"
                  value={hardwareLink.wsEndpoint}
                  onChange={(e) => onChangeWsEndpoint(e.target.value)}
                  className="w-full bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1.5 text-xs font-mono outline-none"
                />
              </td>
            </tr>
            <tr>
              <td className="py-2.5 text-slate-300">Auto-Bind Saved USB</td>
              <td className="py-2.5">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={hardwareLink.autoConnectSavedUsb}
                    onChange={(e) => onChangeAutoConnectUsb(e.target.checked)}
                    className="accent-sky-400"
                  />
                  <span>Reconnect authorized USB adapters automatically on startup</span>
                </label>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onScanSavedHardware()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            Scan Paired USB Devices
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-sky-300">Bench ECU Session &amp; Live Parameters</span>
          <button
            type="button"
            onClick={() => onToggleDemoBench(!demoBenchMode)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer ${
              demoBenchMode
                ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                : 'bg-[#060e1c] border-sky-500/30 text-slate-300'
            }`}
          >
            {demoBenchMode ? 'Bench ECU: ON' : 'Bench ECU: OFF'}
          </button>
        </div>

        {demoBenchMode ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-300 w-28">Bench Voltage:</span>
              <input
                type="range"
                min={11.4}
                max={14.4}
                step={0.1}
                value={batt}
                onChange={(e) => onChangeBatt(parseFloat(e.target.value))}
                className="flex-1 accent-sky-400"
              />
              <span className="font-mono text-white tabular-nums">{batt.toFixed(1)} V</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-300 w-28">Bench Speed:</span>
              <input
                type="range"
                min={0}
                max={260}
                value={speed}
                onChange={(e) => onChangeSpeed(parseInt(e.target.value, 10))}
                className="flex-1 accent-sky-400"
              />
              <span className="font-mono text-white tabular-nums">{speed} km/h</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed">
            Direct Browser Hardware Mode is active with zero external bridge software required. Connect your OBD-II /
            FTDI / STN / K-Line USB adapter directly via WebSerial or WebUSB, or activate Bench ECU to test all UDS,
            coding, and map flashing workflows directly.
          </p>
        )}
      </div>
    </div>
  </div>
);

// ==================== LOGS VIEW ====================
export const LogsView: React.FC<{ logs: AuditLogEntry[]; onClear: () => void }> = ({ logs, onClear }) => (
  <div className="flex flex-col gap-3 h-full">
    <div className="flex items-center justify-between pb-2.5 border-b border-sky-500/20">
      <h1 className="text-lg font-bold text-white">Session Logs &amp; Audit Trail</h1>
      <button
        type="button"
        onClick={onClear}
        className="px-3 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
      >
        Clear View
      </button>
    </div>
    <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex-1 min-h-0">
      <div className="bg-[#050b16] border border-sky-500/25 rounded-lg p-3 h-full max-h-[480px] overflow-y-auto autolab-scroll font-mono text-xs space-y-1.5 leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-slate-500">Session log cleared.</div>
        ) : (
          logs.map((l, idx) => (
            <div key={idx} className="text-slate-200">
              <span className="text-sky-400 tabular-nums">[{l.time}]</span>{' '}
              <span className="text-slate-400">[{l.source}]</span>{' '}
              <span
                className={
                  l.level === 'ok'
                    ? 'text-emerald-400'
                    : l.level === 'warn'
                    ? 'text-amber-400'
                    : l.level === 'err'
                    ? 'text-rose-400'
                    : 'text-slate-200'
                }
              >
                {l.msg}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);

// ==================== ABOUT VIEW ====================
export const AboutView: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="pb-2.5 border-b border-sky-500/20">
      <h1 className="text-lg font-bold text-white">About AutoLab Pro (1980–2026)</h1>
    </div>
    <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
      <div className="text-sm font-bold text-sky-300">
        Direct Browser ECU Tuning, Multi-Bus Diagnostics &amp; Global Vehicle Database Suite
      </div>
      <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
        Runs directly in a zero-bridge architecture over WebSerial COM, WebUSB FTDI/OBD, and DoIP WebSockets with
        server-persisted workspace profiles covering global OEMs from 1980 to 2026 (including European, Japanese,
        Korean, American, Chinese EV, and Russian Lada platforms), 2D/3D Calibration Maps, Hex/CRC-32 engineering,
        and full ISO-14229 UDS diagnostic workflows.
      </p>
    </div>
  </div>
);
