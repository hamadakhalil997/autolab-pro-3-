import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FlaskConical,
  FolderOpen,
  KeyRound,
  Lock,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Unlock,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { crc32 } from '../services/ecuProtocolEngine';
import { parseIntelHexToBinary } from '../services/ftdiD2xxDefs';
import type {
  ActiveVehicleProfile,
  CalibrationMapTable,
  IgnitionState,
  MapsSubTab,
  VaultSnapshot,
} from '../types/autolab';

interface TuningViewProps {
  vciConnected: boolean;
  ecuOnline: boolean;
  ignition: IgnitionState;
  vehicle: ActiveVehicleProfile;
  batt: number;
  ecuUnlocked: boolean;
  securitySeed: string | null;
  pendingMapEdits: number;
  vaultCount: number;
  onRequestSeed: () => Promise<void>;
  onSendSecurityKey: () => Promise<void>;
  onReadEcuFlash: () => Promise<void>;
  onLoadBinaryFile: (bytes: Uint8Array, label: string) => void;
  onSaveBackup: () => void;
  onFlashCompleted: (benchMode: boolean) => Promise<void>;
  onOpenVciModal: () => void;
  onOpenMaps: () => void;
  onToast: (msg: string) => void;
}

export const TuningView: React.FC<TuningViewProps> = ({
  vciConnected,
  ecuOnline,
  ignition,
  vehicle,
  batt,
  ecuUnlocked,
  securitySeed,
  pendingMapEdits,
  vaultCount,
  onRequestSeed,
  onSendSecurityKey,
  onReadEcuFlash,
  onLoadBinaryFile,
  onSaveBackup,
  onFlashCompleted,
  onOpenVciModal,
  onOpenMaps,
  onToast,
}) => {
  const [flashProto, setFlashProto] = useState(vehicle.proto);
  const [flashMode, setFlashMode] = useState('OBD Partial Calibration Map');
  const [compatText, setCompatText] = useState(
    pendingMapEdits > 0
      ? `Ready: ${pendingMapEdits} edited calibration map cell(s) staged from Maps Editor`
      : 'Waiting for calibration .bin file or edited Maps table...'
  );
  const [flashReadyFile, setFlashReadyFile] = useState(pendingMapEdits > 0);
  const [progress, setProgress] = useState(0);
  const [stageText, setStageText] = useState('Idle');
  const [flashing, setFlashing] = useState(false);

  const activeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setFlashProto(vehicle.proto);
  }, [vehicle.proto]);

  useEffect(() => {
    return () => {
      if (activeTimerRef.current !== null) {
        window.clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    };
  }, []);

  const vciOk = vciConnected && ecuOnline;
  const ignOk = ignition !== 'OFF';
  const voltageOk = batt >= 12.5;
  const backupOk = vaultCount > 0;
  const canFlash = vciOk && ignOk && voltageOk && ecuUnlocked && backupOk && !flashing;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = new Uint8Array(reader.result as ArrayBuffer);
      const parsed = parseIntelHexToBinary(raw, 65536);
      const arr = parsed.bytes;
      const sum = crc32(arr).toString(16).padStart(8, '0').toUpperCase();
      onLoadBinaryFile(arr, f.name);
      setFlashReadyFile(true);
      const hexTag = parsed.isIntelHex
        ? ` · Intel HEX (${parsed.recordCount} recs, ${parsed.checksumErrors === 0 ? 'Checksum OK' : `${parsed.checksumErrors} CS ERR`}${parsed.detectedTargets.length ? `, ${parsed.detectedTargets.join('/')}` : ''})`
        : '';
      setCompatText(`Loaded: ${f.name} (${arr.length} B) · CRC-32: 0x${sum}${hexTag}`);
    };
    reader.readAsArrayBuffer(f);
    e.target.value = '';
  };

  const stageCalibrationBuffer = () => {
    setFlashReadyFile(true);
    setCompatText(`Staged Active Buffer (${vehicle.ecu} · CVN ${vehicle.cvn})`);
    onToast(`Working binary buffer staged for ${vehicle.ecu}`);
  };

  const runReadEcu = () => {
    if (!vciOk || !ignOk) {
      onToast('Connect hardware / Bench ECU and turn KL15 Ignition ON first');
      return;
    }
    if (flashing) return;
    setFlashing(true);
    const steps: [number, string][] = [
      [25, 'Reading ECU Identification (0x22 F1 90 / F1 87)...'],
      [65, 'Dumping Calibration Sectors into Working Buffer...'],
      [100, 'ECU Read Complete · Archived in Vault'],
    ];
    let i = 0;
    activeTimerRef.current = window.setInterval(() => {
      setProgress(steps[i][0]);
      setStageText(steps[i][1]);
      i += 1;
      if (i >= steps.length) {
        if (activeTimerRef.current !== null) window.clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
        void onReadEcuFlash().finally(() => setFlashing(false));
      }
    }, 380);
  };

  const startFlash = (bench = false) => {
    if (!vciOk) return onToast('Blocked: VCI or ECU offline');
    if (!ignOk) return onToast('Blocked: Turn Ignition KL15 ON');
    if (!voltageOk) return onToast('Blocked: Battery < 12.5V');
    if (!ecuUnlocked) return onToast('Blocked: Unlock Security Access (0x27) first');
    if (flashing) return;

    if (!flashReadyFile && pendingMapEdits === 0) stageCalibrationBuffer();
    if (bench) setFlashMode('Boot / Bench Recovery Mode');

    setFlashing(true);
    const stages: [number, string][] = [
      [20, 'Stage 1/4: Entering Programming Session (0x10 02)...'],
      [48, 'Stage 2/4: Erasing Calibration Sector (0x31 01 FF 00)...'],
      [78, 'Stage 3/4: Writing Blocks & Computing CRC-32...'],
      [100, 'Stage 4/4: Verifying CVN & Resetting ECU (0x11 01)...'],
    ];

    let step = 0;
    activeTimerRef.current = window.setInterval(() => {
      setProgress(stages[step][0]);
      setStageText(stages[step][1]);
      step += 1;
      if (step >= stages.length) {
        if (activeTimerRef.current !== null) window.clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
        void onFlashCompleted(bench).finally(() => setFlashing(false));
      }
    }, 450);
  };

  const interlocks = [
    { label: 'VCI & ECU Link', ok: vciOk, val: vciOk ? 'Online' : 'Offline' },
    { label: 'Terminal KL15', ok: ignOk, val: ignOk ? ignition.replace('_', ' ') : 'OFF' },
    { label: 'Battery >= 12.5V', ok: voltageOk, val: `${batt.toFixed(1)} V` },
    { label: 'Security 0x27', ok: ecuUnlocked, val: ecuUnlocked ? 'Unlocked' : 'Locked' },
    { label: 'Vault Backup', ok: backupOk, val: `${vaultCount} Snapshot(s)` },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-sky-500/20">
        <div>
          <h1 className="text-lg font-bold text-white">ECU Flashing &amp; Calibration Pipeline</h1>
          <p className="text-xs text-sky-300 mt-0.5">
            UDS 0x27 Seed/Key Security · Pre-Flash Safety Interlocks · Read/Write Calibration · Boot/Bench Recovery
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!vciOk && (
            <button
              type="button"
              onClick={onOpenVciModal}
              className="px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
            >
              Connect Hardware
            </button>
          )}
          <span
            className={`font-mono text-xs font-semibold tabular-nums ${
              canFlash ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {canFlash ? 'Pre-Flash Gate: ARMED & READY' : 'Pre-Flash Gate: INTERLOCK ACTIVE'}
          </span>
        </div>
      </div>

      {/* Interlock Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {interlocks.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-sky-500/25 bg-[#0a162b] px-3 py-2 flex items-center justify-between gap-2 text-xs"
          >
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 truncate">{item.label}</div>
              <div className={`font-mono font-bold truncate ${item.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                {item.val}
              </div>
            </div>
            {item.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ECU Info + 0x27 Challenge/Response */}
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
          <div className="text-sm font-bold text-sky-300">ECU Identification &amp; Security Access (0x27)</div>
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Target Control Unit</td>
                <td className="py-2 text-white font-semibold">
                  {vehicle.make} — {vehicle.fullEcu}
                </td>
              </tr>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Software / Boot</td>
                <td className="py-2 text-slate-200">{vehicle.swVersion}</td>
              </tr>
              <tr className="border-b border-sky-500/15">
                <td className="py-2 text-slate-400">Flash Counter / CVN</td>
                <td className="py-2 text-slate-200 tabular-nums">
                  {vehicle.flashCount} Writes | CVN: {vehicle.cvn}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-400">Security 0x27 State</td>
                <td className={`py-2 font-semibold ${ecuUnlocked ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ecuUnlocked
                    ? 'Unlocked (Level 0x03 Key Accepted)'
                    : securitySeed
                    ? `Seed: ${securitySeed} (Ready for Key)`
                    : 'Locked (Request Seed 0x27 01)'}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!vciOk || !ignOk}
              onClick={() => void onRequestSeed()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5" />
              1. Request Seed (0x27 01)
            </button>
            <button
              type="button"
              disabled={!vciOk || !ignOk || !securitySeed || ecuUnlocked}
              onClick={() => void onSendSecurityKey()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 border border-emerald-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {ecuUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              2. Send Key (0x27 02)
            </button>
            <button
              type="button"
              onClick={onSaveBackup}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              Archive Backup
            </button>
          </div>
        </div>

        {/* Read / Write / Recovery */}
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-sky-300">Flash / Re-Flash &amp; Compatibility Gate</span>
            {pendingMapEdits > 0 && (
              <button
                type="button"
                onClick={onOpenMaps}
                className="text-xs font-mono text-amber-400 hover:underline cursor-pointer"
              >
                {pendingMapEdits} Staged Map Edit(s)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={flashProto}
              onChange={(e) => setFlashProto(e.target.value)}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option>{vehicle.proto}</option>
              <option>UDS over CAN-FD (ISO 14229)</option>
              <option>DoIP Ethernet (ISO 13400)</option>
              <option>KWP2000 / K-Line (ISO 14230)</option>
              <option>Direct USB OBD-II / J2534</option>
            </select>
            <select
              value={flashMode}
              onChange={(e) => setFlashMode(e.target.value)}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option>OBD Partial Calibration Map</option>
              <option>Full OBD Flash</option>
              <option>Boot / Bench Recovery Mode</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="file"
              accept=".bin,.hex,.eep,.ori,.txt"
              onChange={handleFileChange}
              className="flex-1 min-w-[180px] bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={stageCalibrationBuffer}
              className="px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Stage Active Buffer
            </button>
          </div>

          <div
            className={`font-mono text-xs ${
              flashReadyFile || pendingMapEdits > 0 ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {pendingMapEdits > 0
              ? `Staged: ${pendingMapEdits} modified table cell(s) ready to flash to ${vehicle.ecu}`
              : compatText}
          </div>

          <div className="w-full h-3.5 rounded-full bg-[#050b18] border border-sky-500/35 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-700 to-sky-400 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono text-xs text-sky-300 tabular-nums">
              {stageText} ({progress}%)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!vciOk || !ignOk || flashing}
                onClick={runReadEcu}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Read ECU
              </button>
              <button
                type="button"
                disabled={!canFlash}
                onClick={() => startFlash(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5" />
                Erase → Write → Verify
              </button>
              <button
                type="button"
                disabled={!canFlash}
                onClick={() => startFlash(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-700/80 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed border border-rose-400/50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Wrench className="w-3.5 h-3.5" />
                Bench Recovery
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MAPS VIEW (CALIBRATION TABLES + HEX LAB) ====================
interface MapsViewProps {
  vehicle: ActiveVehicleProfile;
  maps: CalibrationMapTable[];
  onUpdateMaps: (maps: CalibrationMapTable[]) => void;
  onGoToFlash: () => void;
  origBuffer: Uint8Array;
  workBuffer: Uint8Array;
  vault: VaultSnapshot[];
  onUpdateWorkBuffer: (buf: Uint8Array) => void;
  onLoadDump: (buf: Uint8Array, label: string) => void;
  onReloadEcuDump: () => void;
  onRollback: () => void;
  onToast: (msg: string) => void;
}

export const MapsView: React.FC<MapsViewProps> = ({
  vehicle,
  maps,
  onUpdateMaps,
  onGoToFlash,
  origBuffer,
  workBuffer,
  vault,
  onUpdateWorkBuffer,
  onLoadDump,
  onReloadEcuDump,
  onRollback,
  onToast,
}) => {
  const [subTab, setSubTab] = useState<MapsSubTab>('tables');
  const [activeMapId, setActiveMapId] = useState(maps[0]?.id ?? 'torque');
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number }>({ r: 2, c: 4 });

  // Hex Lab state
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [byteInput, setByteInput] = useState(
    workBuffer[0]?.toString(16).padStart(2, '0').toUpperCase() ?? '00'
  );
  const [searchInput, setSearchInput] = useState('');
  const [highlights, setHighlights] = useState<number[]>([]);
  const [csValid, setCsValid] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0];

  const totalModifiedCells = useMemo(() => {
    let count = 0;
    for (const m of maps) {
      for (let r = 0; r < m.current.length; r++) {
        for (let c = 0; c < m.current[r].length; c++) {
          if (m.current[r][c] !== m.stock[r][c]) count++;
        }
      }
    }
    return count;
  }, [maps]);

  const adjustCell = (delta: number) => {
    if (!activeMap) return;
    const { r, c } = selectedCell;
    const nextMaps = maps.map((m) => {
      if (m.id !== activeMap.id) return m;
      const copy = m.current.map((row) => [...row]);
      const val = Math.max(m.minVal, Math.min(m.maxVal, +(copy[r][c] + delta).toFixed(1)));
      copy[r][c] = val;
      return { ...m, current: copy };
    });
    onUpdateMaps(nextMaps);
  };

  const applyStage1Preset = () => {
    const nextMaps = maps.map((m) => {
      const copy = m.current.map((row, ri) =>
        row.map((val, ci) => {
          const stockVal = m.stock[ri][ci];
          if (m.id === 'torque' && ri >= 1 && ci >= 2) {
            return Math.min(m.maxVal, Math.round(stockVal * 1.14));
          }
          if (m.id === 'boost' && ri >= 1 && ci >= 2) {
            return Math.min(m.maxVal, Math.round(stockVal + 180));
          }
          if (m.id === 'spark' && ri >= 1 && ci >= 2) {
            return Math.min(m.maxVal, +(stockVal + 1.5).toFixed(1));
          }
          if (m.id === 'rail' && ri >= 2 && ci >= 3) {
            return Math.min(m.maxVal, Math.round(stockVal + 15));
          }
          return stockVal;
        })
      );
      return { ...m, current: copy };
    });
    onUpdateMaps(nextMaps);
    onToast(`Applied Stage 1 Calibration Preset for ${vehicle.ecu} & patched working binary`);
  };

  const restoreStockMaps = () => {
    const nextMaps = maps.map((m) => ({
      ...m,
      current: m.stock.map((row) => [...row]),
    }));
    onUpdateMaps(nextMaps);
    onToast('Restored all Calibration Maps to OEM Stock');
  };

  // Hex Checksums
  const checksums = useMemo(() => {
    const b = workBuffer;
    let s8 = 0;
    let s16 = 0;
    let s32 = 0;
    let x8 = 0;
    for (let i = 0; i < b.length; i++) {
      s8 = (s8 + b[i]) & 0xff;
      x8 ^= b[i];
    }
    for (let i = 0; i + 1 < b.length; i += 2) {
      s16 = (s16 + (b[i] | (b[i + 1] << 8))) & 0xffff;
    }
    for (let i = 0; i + 3 < b.length; i += 4) {
      s32 = (s32 + ((b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0)) >>> 0;
    }
    return {
      size: b.length,
      x8: x8.toString(16).padStart(2, '0').toUpperCase(),
      s8: s8.toString(16).padStart(2, '0').toUpperCase(),
      s16: s16.toString(16).padStart(4, '0').toUpperCase(),
      s32: s32.toString(16).padStart(8, '0').toUpperCase(),
      crc: crc32(b).toString(16).padStart(8, '0').toUpperCase(),
    };
  }, [workBuffer]);

  const diffs = useMemo(() => {
    const list: string[] = [];
    const len = Math.min(origBuffer.length, workBuffer.length);
    for (let i = 0; i < len; i++) {
      if (workBuffer[i] !== origBuffer[i]) {
        list.push(
          `0x${i.toString(16).toUpperCase()}: ${origBuffer[i]
            .toString(16)
            .padStart(2, '0')
            .toUpperCase()}→${workBuffer[i].toString(16).padStart(2, '0').toUpperCase()}`
        );
      }
    }
    return list;
  }, [origBuffer, workBuffer]);

  const rows = useMemo(() => {
    const max = Math.min(workBuffer.length, 2048);
    const out: { offset: number; bytes: number[]; ascii: string }[] = [];
    for (let r = 0; r < max; r += 16) {
      const bytes: number[] = [];
      let ascii = '';
      for (let c = 0; c < 16 && r + c < max; c++) {
        const b = workBuffer[r + c];
        bytes.push(b);
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      }
      out.push({ offset: r, bytes, ascii });
    }
    return out;
  }, [workBuffer]);

  const selectByte = (idx: number) => {
    setSelectedOffset(idx);
    setByteInput(workBuffer[idx].toString(16).padStart(2, '0').toUpperCase());
  };

  const applyByte = () => {
    const val = parseInt(byteInput.trim(), 16);
    if (isNaN(val) || val < 0 || val > 255) {
      onToast('Invalid hex byte');
      return;
    }
    const next = new Uint8Array(workBuffer);
    next[selectedOffset] = val;
    setCsValid(false);
    onUpdateWorkBuffer(next);
  };

  const searchPattern = () => {
    const q = searchInput.trim();
    if (!q) return;
    const cleanHex = q.replace(/\s+/g, '');
    const pat: number[] = [];
    if (/^[0-9a-fA-F]+$/.test(cleanHex) && cleanHex.length % 2 === 0) {
      for (let i = 0; i < cleanHex.length; i += 2) pat.push(parseInt(cleanHex.slice(i, i + 2), 16));
    } else {
      for (let i = 0; i < q.length; i++) pat.push(q.charCodeAt(i));
    }
    for (let i = 0; i <= workBuffer.length - pat.length; i++) {
      if (pat.every((b, j) => workBuffer[i + j] === b)) {
        setSelectedOffset(i);
        setHighlights(pat.map((_, j) => i + j));
        onToast(`Found at 0x${i.toString(16).toUpperCase()}`);
        return;
      }
    }
    setHighlights([]);
    onToast('Pattern not found');
  };

  const stampCrc32 = () => {
    if (workBuffer.length < 4) return;
    const next = new Uint8Array(workBuffer);
    const c = crc32(next.slice(0, next.length - 4));
    const n = next.length;
    next[n - 4] = c & 0xff;
    next[n - 3] = (c >>> 8) & 0xff;
    next[n - 2] = (c >>> 16) & 0xff;
    next[n - 1] = (c >>> 24) & 0xff;
    setCsValid(true);
    onUpdateWorkBuffer(next);
    onToast('CRC-32 Stamped');
  };

  const handleOpenBin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const raw = new Uint8Array(r.result as ArrayBuffer);
      const parsed = parseIntelHexToBinary(raw, 65536);
      onLoadDump(parsed.bytes, f.name);
      setHighlights([]);
      setCsValid(parsed.isIntelHex ? parsed.checksumErrors === 0 : false);
      if (parsed.isIntelHex) {
        const targetStr = parsed.detectedTargets.length > 0 ? ` [${parsed.detectedTargets.join('/')}]` : '';
        const dateStr = parsed.buildStamp ? ` · ${parsed.buildStamp}` : '';
        const protoCount = parsed.detectedProtocols.length > 0 ? ` · ${parsed.detectedProtocols.length} VCI protocols` : '';
        onToast(
          `Decoded Intel HEX${targetStr}${dateStr}: ${parsed.bytes.length} B (${parsed.recordCount} recs, ${parsed.checksumErrors} errors${protoCount})`
        );
      }
    };
    r.readAsArrayBuffer(f);
    e.target.value = '';
  };

  const exportPatchedBin = () => {
    const blob = new Blob([new Uint8Array(workBuffer)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${vehicle.ecu}_patched.bin`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast(`Exported ${vehicle.ecu}_patched.bin`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-sky-500/20">
        <div>
          <h1 className="text-lg font-bold text-white">ECU Calibration Maps &amp; Hex Lab</h1>
          <p className="text-xs text-sky-300 mt-0.5">
            {vehicle.displayName} · {vehicle.ecu} · Edit 2D/3D Fuel, Boost, Spark &amp; Torque Tables or Raw Binary
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('tables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'tables'
                ? 'bg-blue-600 border-sky-300 text-white'
                : 'bg-[#0e1d38]/80 border-sky-500/30 text-slate-300 hover:text-white'
            }`}
          >
            Calibration Tables (2D/3D)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('hex')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'hex'
                ? 'bg-blue-600 border-sky-300 text-white'
                : 'bg-[#0e1d38]/80 border-sky-500/30 text-slate-300 hover:text-white'
            }`}
          >
            Binary / Hex &amp; CRC-32 Lab
          </button>
        </div>
      </div>

      {/* SUBTAB 1: CALIBRATION TABLES */}
      {subTab === 'tables' && activeMap && (
        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-3">
          {/* Map Selector List */}
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3 flex flex-col gap-2">
            <div className="text-xs font-bold text-sky-300 mb-1">ECU Calibration Maps</div>
            {maps.map((m) => {
              const edits = m.current.reduce(
                (acc, row, ri) =>
                  acc + row.filter((v, ci) => v !== m.stock[ri][ci]).length,
                0
              );
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveMapId(m.id)}
                  className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    activeMap.id === m.id
                      ? 'bg-blue-600/30 border-sky-400 text-white'
                      : 'bg-[#060e1c] border-sky-500/20 text-slate-300 hover:border-sky-400/50'
                  }`}
                >
                  <div className="text-xs font-bold truncate">{m.name}</div>
                  <div className="flex items-center justify-between text-[11px] font-mono mt-0.5">
                    <span className="text-slate-400">Unit: {m.unit}</span>
                    {edits > 0 && <span className="text-amber-400">{edits} edited</span>}
                  </div>
                </button>
              );
            })}

            <div className="pt-2 mt-auto border-t border-sky-500/20 flex flex-col gap-2">
              <button
                type="button"
                onClick={applyStage1Preset}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                Apply Stage 1 Preset
              </button>
              <button
                type="button"
                onClick={restoreStockMaps}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore OEM Stock
              </button>
              {totalModifiedCells > 0 && (
                <button
                  type="button"
                  onClick={onGoToFlash}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Flash {totalModifiedCells} Change(s) in Tuning
                </button>
              )}
            </div>
          </div>

          {/* 2D Heat-Map Table Editor */}
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-white">{activeMap.name}</div>
                <div className="text-xs text-slate-400 font-mono">
                  Y: {activeMap.yLabel} · X: {activeMap.xLabel} · Unit: {activeMap.unit}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustCell(-activeMap.step * 2)}
                  className="px-2.5 py-1.5 rounded bg-[#183a70] hover:bg-blue-600 text-white font-mono text-xs font-bold cursor-pointer"
                >
                  -{activeMap.step * 2}
                </button>
                <button
                  type="button"
                  onClick={() => adjustCell(-activeMap.step)}
                  className="px-2.5 py-1.5 rounded bg-[#183a70] hover:bg-blue-600 text-white font-mono text-xs font-bold cursor-pointer"
                >
                  -{activeMap.step}
                </button>
                <button
                  type="button"
                  onClick={() => adjustCell(activeMap.step)}
                  className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold cursor-pointer"
                >
                  +{activeMap.step}
                </button>
                <button
                  type="button"
                  onClick={() => adjustCell(activeMap.step * 2)}
                  className="px-2.5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-bold cursor-pointer"
                >
                  +{activeMap.step * 2}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-sky-500/20 rounded-lg">
              <table className="w-full border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="bg-[#091428] border-b border-sky-500/25">
                    <th className="py-2 px-3 text-left text-sky-300">
                      {activeMap.yLabel} \ {activeMap.xLabel}
                    </th>
                    {activeMap.xAxis.map((x) => (
                      <th key={x} className="py-2 px-3 text-center text-sky-300">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeMap.current.map((row, ri) => (
                    <tr key={ri} className="border-b border-sky-500/10">
                      <td className="py-2 px-3 font-bold text-sky-300 bg-[#091428]/70">
                        {activeMap.yAxis[ri]}
                      </td>
                      {row.map((val, ci) => {
                        const stockVal = activeMap.stock[ri][ci];
                        const delta = +(val - stockVal).toFixed(1);
                        const isSel = selectedCell.r === ri && selectedCell.c === ci;
                        const heatRatio = Math.max(
                          0,
                          Math.min(1, (val - activeMap.minVal) / (activeMap.maxVal - activeMap.minVal))
                        );
                        const bgClass =
                          heatRatio > 0.72
                            ? 'bg-rose-950/55'
                            : heatRatio > 0.45
                            ? 'bg-blue-950/60'
                            : 'bg-[#060e1c]';

                        return (
                          <td
                            key={ci}
                            onClick={() => setSelectedCell({ r: ri, c: ci })}
                            className={`py-2.5 px-3 text-center cursor-pointer transition-colors border border-sky-500/10 ${bgClass} ${
                              isSel ? 'ring-2 ring-inset ring-sky-400' : ''
                            }`}
                          >
                            <div className="font-bold text-white">{val}</div>
                            {delta !== 0 && (
                              <div className={`text-[10px] ${delta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {delta > 0 ? `+${delta}` : delta}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>
                Selected Cell [{activeMap.yAxis[selectedCell.r]}, {activeMap.xAxis[selectedCell.c]}]:{' '}
                <strong className="text-white">
                  {activeMap.current[selectedCell.r][selectedCell.c]} {activeMap.unit}
                </strong>{' '}
                (Stock: {activeMap.stock[selectedCell.r][selectedCell.c]} {activeMap.unit})
              </span>
              <span className={totalModifiedCells > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                {totalModifiedCells > 0
                  ? `${totalModifiedCells} cell(s) modified vs Stock`
                  : 'Stock Calibration Active'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: BINARY / HEX LAB */}
      {subTab === 'hex' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".bin,.hex,.eep,.ori,.txt" className="hidden" onChange={handleOpenBin} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open .BIN/.HEX
            </button>
            <button
              type="button"
              onClick={onReloadEcuDump}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Reload Active ECU Dump
            </button>
            <button
              type="button"
              onClick={exportPatchedBin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/50 text-white text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Patched .BIN
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-3">
            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-bold text-sky-300">Hex / ASCII Editor &amp; Pattern Search</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Hex or ASCII"
                    className="w-36 bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-1 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <button
                    type="button"
                    onClick={searchPattern}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Search className="w-3 h-3" />
                    Find
                  </button>
                </div>
              </div>

              <div className="font-mono text-xs bg-[#050b16] border border-sky-500/25 rounded-lg p-2.5 max-h-[280px] overflow-y-auto autolab-scroll leading-relaxed">
                {rows.map((r) => (
                  <div
                    key={r.offset}
                    className="grid grid-cols-[74px_1fr_138px] gap-2.5 px-1 hover:bg-sky-500/10 rounded"
                  >
                    <span className="text-sky-400 tabular-nums">
                      0x{r.offset.toString(16).padStart(6, '0').toUpperCase()}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {r.bytes.map((b, c) => {
                        const idx = r.offset + c;
                        const isMod = origBuffer[idx] !== undefined && b !== origBuffer[idx];
                        const isSel = idx === selectedOffset || highlights.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => selectByte(idx)}
                            className={`px-0.5 rounded cursor-pointer ${
                              isSel
                                ? 'bg-blue-600 text-white font-bold'
                                : isMod
                                ? 'text-amber-400 font-bold'
                                : 'text-slate-200 hover:bg-sky-500/30'
                            }`}
                          >
                            {b.toString(16).padStart(2, '0').toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-slate-400 tracking-wide truncate">{r.ascii}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-slate-300 tabular-nums">
                  Offset 0x{selectedOffset.toString(16).toUpperCase().padStart(4, '0')}
                </span>
                <input
                  type="text"
                  maxLength={2}
                  value={byteInput}
                  onChange={(e) => setByteInput(e.target.value)}
                  className="w-14 bg-[#060e1c] border border-sky-500/35 rounded-md text-slate-100 px-2 py-1 text-xs font-mono text-center outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={applyByte}
                  className="px-2.5 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer"
                >
                  Apply Byte
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sky-300">Checksum &amp; CRC-32 Engine</span>
                  <span className={`font-mono text-xs font-bold ${csValid ? 'text-emerald-400' : 'text-sky-300'}`}>
                    {csValid ? 'CRC VALID' : 'COMPUTED'}
                  </span>
                </div>
                <div className="font-mono text-xs text-slate-300 leading-relaxed tabular-nums">
                  <div>
                    Size: <strong className="text-white">{checksums.size} B</strong> | XOR-8:{' '}
                    <strong className="text-white">0x{checksums.x8}</strong>
                  </div>
                  <div>
                    8-bit: <strong className="text-white">0x{checksums.s8}</strong> | 16-bit:{' '}
                    <strong className="text-white">0x{checksums.s16}</strong>
                  </div>
                  <div>
                    32-bit: <strong className="text-white">0x{checksums.s32}</strong>
                  </div>
                  <div>
                    CRC-32: <strong className="text-emerald-400">0x{checksums.crc}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={stampCrc32}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer self-start"
                >
                  <Check className="w-3.5 h-3.5" />
                  Recalculate &amp; Stamp CRC-32 Footer
                </button>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-2.5 flex-1">
                <div className="text-sm font-bold text-sky-300">Diff &amp; Backup Rollback Vault</div>
                <div className="font-mono text-[11.5px] max-h-[100px] overflow-y-auto autolab-scroll text-amber-400 tabular-nums">
                  {diffs.length === 0 ? (
                    <span className="text-emerald-400">Original == Working Buffer (0 byte delta)</span>
                  ) : (
                    <div>
                      <div className="font-bold mb-1">{diffs.length} byte(s) changed:</div>
                      <div>{diffs.slice(0, 24).join(' | ')}</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-sky-500/15 mt-auto">
                  <span className="text-xs text-sky-300 font-mono tabular-nums">
                    Vault Snapshots: {vault.length}
                  </span>
                  <button
                    type="button"
                    onClick={onRollback}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700/80 hover:bg-rose-600 border border-rose-400/50 text-white text-xs font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Instant Rollback
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
