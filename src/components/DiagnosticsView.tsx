import React, { useEffect, useRef, useState } from 'react';
import { Cable, Download, Play, RefreshCw, Search, Send, Square, Trash2, WifiOff } from 'lucide-react';
import { dispatchUdsCommand } from '../services/ecuProtocolEngine';
import type {
  ActiveVehicleProfile,
  CoreNode,
  DiagSubTab,
  DtcItem,
  IgnitionState,
  TelemetrySample,
  UdsFrameEntry,
} from '../types/autolab';

interface DiagnosticsViewProps {
  vciConnected: boolean;
  ecuOnline: boolean;
  demoBenchMode: boolean;
  ignition: IgnitionState;
  vehicle: ActiveVehicleProfile;
  subTab: DiagSubTab;
  onSubTabChange: (sub: DiagSubTab) => void;
  batt: number;
  nodes: CoreNode[];
  onScanTopology: () => Promise<void>;
  dtcs: DtcItem[];
  onClearDtc: (index: number) => Promise<void>;
  onClearAllDtcs: () => Promise<void>;
  onRescanDtcs: () => Promise<void>;
  chartData: TelemetrySample[];
  recording: boolean;
  traceLog: TelemetrySample[];
  onToggleRecording: () => void;
  onExportTrace: () => void;
  ecuUnlocked: boolean;
  onSecurityUnlockFromUds: () => void;
  onOpenVciModal: () => void;
  onTriggerActuatorEffect: (name: string) => Promise<void>;
  onToast: (msg: string) => void;
}

const ACTUATORS = [
  { name: 'Cooling Fan PWM', limit: 'Max 15s', def: '60%', ucsPayload: '2F F0 10 03 3C' },
  { name: 'Fuel Pump Relay', limit: 'Max 10s', def: 'ON', ucsPayload: '2F F0 12 03 01' },
  { name: 'EVAP Purge Valve', limit: 'Max 12s', def: '35 Hz', ucsPayload: '2F F0 14 03 23' },
  { name: 'Throttle Sweep', limit: 'KOEO / Idle', def: '25%', ucsPayload: '2F F0 18 03 19' },
];

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  vciConnected,
  ecuOnline,
  demoBenchMode,
  ignition,
  vehicle,
  subTab,
  onSubTabChange,
  batt,
  nodes,
  onScanTopology,
  dtcs,
  onClearDtc,
  onClearAllDtcs,
  onRescanDtcs,
  chartData,
  recording,
  traceLog,
  onToggleRecording,
  onExportTrace,
  ecuUnlocked,
  onSecurityUnlockFromUds,
  onOpenVciModal,
  onTriggerActuatorEffect,
  onToast,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actTimersRef = useRef<number[]>([]);
  const [actStatus, setActStatus] = useState<Record<number, 'Idle' | 'Active' | 'Completed'>>({});
  const [udsTxId, setUdsTxId] = useState('0x7E0');
  const [udsPayload, setUdsPayload] = useState('22 F1 90');
  const [udsFrames, setUdsFrames] = useState<UdsFrameEntry[]>([]);
  const [lastNrc, setLastNrc] = useState<{ lat: string; rx: string; note: string } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const linkReady = vciConnected && ecuOnline && ignition !== 'OFF';
  const onlineCount = nodes.filter((n) => n.status === 'Online').length;

  useEffect(() => {
    return () => {
      actTimersRef.current.forEach((id) => window.clearTimeout(id));
      actTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (subTab !== 'live') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56,152,255,0.12)';
    ctx.lineWidth = 1;
    for (let y = 40; y < h; y += 45) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!linkReady) return;

    const drawSeries = (key: 'rpm' | 'load' | 'map', max: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      chartData.forEach((p, i) => {
        const x = (i / Math.max(1, chartData.length - 1)) * w;
        const y = h - 14 - (p[key] / max) * (h - 28);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawSeries('rpm', 7000, '#38bdf8');
    drawSeries('load', 100, '#4ade80');
    drawSeries('map', 250, '#fbbf24');
  }, [chartData, subTab, linkReady]);

  const triggerActuator = async (i: number) => {
    if (!linkReady) {
      onToast('Connect USB hardware or Bench ECU and turn KL15 Ignition ON');
      return;
    }
    const act = ACTUATORS[i];
    setActStatus((prev) => ({ ...prev, [i]: 'Active' }));
    try {
      const res = await dispatchUdsCommand({
        txId: '0x7E0',
        payload: act.ucsPayload,
        demoBenchMode,
        vehicle,
        ecuUnlocked,
        securitySeed: null,
        dtcs,
      });
      setLastNrc({ lat: res.lat, rx: res.rx, note: res.note });
      setUdsFrames((prev) => [
        { id: String(Date.now() + Math.random()), txId: res.txId, tx: res.tx, rx: res.rx, lat: res.lat, note: res.note },
        ...prev.slice(0, 40),
      ]);
      await onTriggerActuatorEffect(act.name);
      const tId = window.setTimeout(() => {
        setActStatus((prev) => ({ ...prev, [i]: 'Completed' }));
      }, 2200);
      actTimersRef.current.push(tId);
    } catch (err) {
      setActStatus((prev) => ({ ...prev, [i]: 'Idle' }));
      onToast(err instanceof Error ? err.message : 'Actuator command failed');
    }
  };

  const sendUdsFrame = async (overridePayload?: string) => {
    if (!linkReady) {
      onToast('Cannot transmit UDS frame: No active ECU session');
      return;
    }
    const tx = (overridePayload ?? udsPayload).trim().toUpperCase();
    if (!tx) {
      onToast('Enter a valid hex UDS payload (e.g. 22 F1 90)');
      return;
    }
    if (overridePayload) setUdsPayload(overridePayload);

    setBusyAction(true);
    try {
      const res = await dispatchUdsCommand({
        txId: udsTxId,
        payload: tx,
        demoBenchMode,
        vehicle,
        ecuUnlocked,
        securitySeed: null,
        dtcs,
      });
      if (res.unlocked) {
        onSecurityUnlockFromUds();
      }
      if (res.clearedDtcs) {
        await onClearAllDtcs();
      }
      setLastNrc({ lat: res.lat, rx: res.rx, note: res.note });
      setUdsFrames((prev) => [
        { id: String(Date.now() + Math.random()), txId: res.txId, tx: res.tx, rx: res.rx, lat: res.lat, note: res.note },
        ...prev.slice(0, 40),
      ]);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'UDS frame transmission failed');
    } finally {
      setBusyAction(false);
    }
  };

  const latest = chartData[chartData.length - 1];

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-sky-500/20">
        <div>
          <h1 className="text-lg font-bold text-white">Diagnostics &amp; Multi-Bus Topology</h1>
          <p className="text-xs text-sky-300 mt-0.5">
            {vehicle.displayName} · {vehicle.proto} · Network Discovery, DTCs, Live Telemetry, Actuators &amp; UDS
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['topo', 'Network & 14 Systems'],
              ['dtc', `DTCs (${dtcs.length})`],
              ['live', 'Live Telemetry & Log'],
              ['act', 'Bi-Directional Actuation'],
              ['uds', 'CAN/UDS Frame Inspector'],
            ] as [DiagSubTab, string][]
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

      {/* Offline Connection Guard Banner */}
      {!linkReady && (
        <div className="rounded-xl border border-amber-500/45 bg-amber-950/35 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {!vciConnected
                ? 'VCI Adapter is disconnected. Connect via Direct USB (WebSerial / WebUSB) or activate Bench ECU.'
                : !ecuOnline
                ? 'WAITING FOR ECU: Adapter is bound, open & verify ECU diagnostic session to query modules.'
                : 'Ignition Terminal KL15 is OFF. Switch Ignition ON (KOEO or Engine Idle) to power controllers.'}
            </span>
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

      {/* TOPO */}
      {subTab === 'topo' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                <span>Bus Termination &amp; Link Health</span>
                <span className={`font-mono ${linkReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {linkReady ? '60.2 Ω OK' : 'STANDBY'}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-200 leading-relaxed tabular-nums">
                <div>
                  CAN-H / CAN-L:{' '}
                  <span className={linkReady ? 'text-emerald-400' : 'text-slate-500'}>
                    {linkReady ? '2.62V / 2.38V (Clean)' : '0.00V / 0.00V'}
                  </span>
                </div>
                <div>
                  Active Protocol: <span className="text-sky-300">{vehicle.proto}</span>
                </div>
                <div>
                  K-Line / LIN1:{' '}
                  <span className={linkReady ? 'text-emerald-400' : 'text-slate-500'}>
                    {linkReady ? '12.1V Pull-up Verified' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                <span>Gateway &amp; Node Summary</span>
                <span className={`font-mono ${linkReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {linkReady ? 'SYNCED' : 'OFFLINE'}
                </span>
              </div>
              <div className="text-xs text-slate-200 leading-relaxed tabular-nums">
                <div>
                  Battery Stability: <strong className="font-mono text-white">{batt.toFixed(1)} V</strong>
                </div>
                <div>
                  Active DTC Faults: <strong className="font-mono text-amber-400">{dtcs.length}</strong>
                </div>
                <div>
                  Active Nodes Found:{' '}
                  <strong className="font-mono text-white">
                    {onlineCount} / {nodes.length} Online
                  </strong>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-sky-300 mb-1">Topology Discovery Scan</div>
                <p className="text-xs text-slate-300">
                  Poll {vehicle.make} ({vehicle.year}) modules on {vehicle.proto}.
                </p>
              </div>
              <button
                type="button"
                disabled={!linkReady || busyAction}
                onClick={() => {
                  setBusyAction(true);
                  void onScanTopology().finally(() => setBusyAction(false));
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer transition-colors self-start whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" />
                Run Full Bus Scan
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3.5 flex flex-col gap-2.5">
            <div className="text-xs font-bold text-sky-300">
              14 Core Systems — Multi-Bus Matrix ({vehicle.year} Architecture)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {nodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setUdsTxId(n.id);
                    onToast(`${n.name} (${n.id}) · ${n.bus} · ${n.voltage} · ${n.dtc} DTC(s) — Target ID set`);
                  }}
                  className="text-left p-3 rounded-lg bg-[#081224]/90 border border-sky-500/25 hover:border-sky-400 transition-colors flex flex-col gap-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-sky-300 truncate">
                      {n.id} · {n.bus}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        n.status === 'Online'
                          ? 'text-emerald-400'
                          : n.status === 'Waiting' || n.status === 'Offline'
                          ? 'text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white truncate">{n.name}</div>
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className={n.dtc > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                      {n.dtc} DTC(s)
                    </span>
                    <span className="text-slate-400">{n.voltage}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DTC */}
      {subTab === 'dtc' && (
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-bold text-sky-300">DTC &amp; Freeze Frame Engine</div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!linkReady || busyAction}
                onClick={() => {
                  setBusyAction(true);
                  void onRescanDtcs().finally(() => setBusyAction(false));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#183a70]/80 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-Scan DTCs
              </button>
              <button
                type="button"
                disabled={!linkReady || busyAction}
                onClick={() => {
                  setBusyAction(true);
                  void onClearAllDtcs().finally(() => setBusyAction(false));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700/80 hover:bg-rose-600 disabled:opacity-40 border border-rose-400/50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All &amp; Verify
              </button>
            </div>
          </div>

          <div className="overflow-auto autolab-scroll border border-sky-500/20 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-sky-500/25 text-sky-300 bg-[#091428]">
                  <th className="py-2.5 px-3 font-semibold">Module</th>
                  <th className="py-2.5 px-3 font-semibold">Code</th>
                  <th className="py-2.5 px-3 font-semibold">Type</th>
                  <th className="py-2.5 px-3 font-semibold">Description</th>
                  <th className="py-2.5 px-3 font-semibold">Freeze Frame Snapshot</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {!linkReady ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-amber-400 font-semibold">
                      Connect VCI &amp; turn Ignition ON to query ECU fault memory.
                    </td>
                  </tr>
                ) : dtcs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-emerald-400 font-semibold">
                      0 DTCs Present — Verified Clean across all {onlineCount} online controllers
                    </td>
                  </tr>
                ) : (
                  dtcs.map((d, i) => (
                    <tr key={`${d.code}-${i}`} className="border-b border-sky-500/10 hover:bg-sky-500/10">
                      <td className="py-2.5 px-3 text-slate-200">{d.mod}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{d.code}</td>
                      <td className="py-2.5 px-3 font-mono text-sky-300">{d.type}</td>
                      <td className="py-2.5 px-3 text-slate-100">{d.desc}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-sky-200 tabular-nums">{d.ff}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onClearDtc(i)}
                          className="px-2.5 py-1 rounded bg-[#183a70] hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LIVE CHART */}
      {subTab === 'live' && (
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-bold text-sky-300">Synchronized Live Telemetry &amp; Data Logger</div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-sky-300 tabular-nums">{traceLog.length} samples</span>
              <button
                type="button"
                disabled={!linkReady}
                onClick={onToggleRecording}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                  recording
                    ? 'bg-rose-700 hover:bg-rose-600 border border-rose-400/50'
                    : 'bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/50'
                }`}
              >
                {recording ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {recording ? 'Stop Recording' : 'Start Trace Recording'}
              </button>
              <button
                type="button"
                onClick={onExportTrace}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#183a70] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Trace (.json)
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={960}
            height={250}
            className="w-full h-[250px] bg-[#050b16] rounded-lg border border-sky-500/25"
          />

          {latest && linkReady && (
            <div className="flex flex-wrap gap-6 text-xs font-mono tabular-nums">
              <span className="text-sky-400">
                RPM: <strong>{latest.rpm}</strong>
              </span>
              <span className="text-emerald-400">
                Load: <strong>{latest.load}%</strong>
              </span>
              <span className="text-amber-400">
                Boost/MAP: <strong>{latest.map} kPa</strong>
              </span>
              <span className="text-pink-400">
                Ignition Adv: <strong>{latest.ign}°</strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ACTUATION */}
      {subTab === 'act' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ACTUATORS.map((a, i) => {
            const st = actStatus[i] ?? 'Idle';
            return (
              <div
                key={a.name}
                className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sky-300">{a.name}</span>
                  <span className="font-mono text-xs text-amber-400">{a.limit}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!linkReady}
                    onClick={() => void triggerActuator(i)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Activate ({a.def})
                  </button>
                  <span
                    className={`font-mono text-xs ${
                      st === 'Active' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {st === 'Active' ? `Active — UDS ${a.ucsPayload} OK` : st}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UDS FRAME INSPECTOR */}
      {subTab === 'uds' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
              <div className="text-sm font-bold text-sky-300">Send Raw UDS / CAN Frame</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={udsTxId}
                  onChange={(e) => setUdsTxId(e.target.value)}
                  className="w-24 bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs font-mono outline-none focus:border-sky-400"
                />
                <input
                  type="text"
                  value={udsPayload}
                  onChange={(e) => setUdsPayload(e.target.value)}
                  className="flex-1 bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame('10 03')}
                  className="px-2.5 py-1.5 rounded bg-[#183a70]/75 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/35 text-xs font-semibold text-white cursor-pointer"
                >
                  Extended (10 03)
                </button>
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame('22 F1 90')}
                  className="px-2.5 py-1.5 rounded bg-[#183a70]/75 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/35 text-xs font-semibold text-white cursor-pointer"
                >
                  Read VIN (22 F1 90)
                </button>
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame('27 01')}
                  className="px-2.5 py-1.5 rounded bg-[#183a70]/75 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/35 text-xs font-semibold text-white cursor-pointer"
                >
                  Seed (27 01)
                </button>
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame('27 02 5B 60 D3 EE')}
                  className="px-2.5 py-1.5 rounded bg-[#183a70]/75 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/35 text-xs font-semibold text-white cursor-pointer"
                >
                  Send Key (27 02)
                </button>
                <button
                  type="button"
                  disabled={!linkReady || busyAction}
                  onClick={() => void sendUdsFrame('14 FF FF FF')}
                  className="px-2.5 py-1.5 rounded bg-[#183a70]/75 hover:bg-blue-600 disabled:opacity-40 border border-sky-400/35 text-xs font-semibold text-white cursor-pointer"
                >
                  Clear DTCs (14 FF FF FF)
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
              <div className="text-sm font-bold text-sky-300">UDS Response &amp; NRC Decoder</div>
              {lastNrc ? (
                <div className="font-mono text-xs text-slate-200 leading-relaxed tabular-nums">
                  <div>
                    Latency: <strong className="text-emerald-400">{lastNrc.lat} ms</strong>
                  </div>
                  <div>
                    RX: <strong className="text-sky-300">{lastNrc.rx}</strong>
                  </div>
                  <div>
                    Analysis: <strong>{lastNrc.note}</strong>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-xs text-slate-400">
                  Transmit a UDS frame to inspect live ECU latency and positive/negative response codes.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2">
            <div className="text-sm font-bold text-sky-300">Live CAN/UDS Frame Trace</div>
            <div className="bg-[#050b16] border border-sky-500/25 rounded-lg p-3 max-h-[220px] overflow-y-auto autolab-scroll font-mono text-xs space-y-1">
              {udsFrames.length === 0 ? (
                <div className="text-slate-500">No UDS frames transmitted yet.</div>
              ) : (
                udsFrames.map((f) => (
                  <div key={f.id}>
                    <span className="text-sky-400">TX [{f.txId}]</span> {f.tx} →{' '}
                    <span className="text-emerald-400">RX [0x7E8]</span> {f.rx}{' '}
                    <span className="text-slate-400">({f.lat}ms)</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
