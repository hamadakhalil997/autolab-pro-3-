import React from 'react';
import {
  Activity,
  BarChart3,
  BatteryCharging,
  Cable,
  Check,
  Clock,
  Cpu,
  Gauge,
  LayoutGrid,
  Pointer,
  ShieldCheck,
  Thermometer,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type {
  ActiveVehicleProfile,
  DiagSubTab,
  EcuSessionState,
  FuncSubTab,
  HardwareLinkState,
  IgnitionState,
  NavView,
  TelemetrySample,
} from '../types/autolab';

interface DashboardViewProps {
  vciConnected: boolean;
  ecuSession: EcuSessionState;
  ignition: IgnitionState;
  demoBenchMode: boolean;
  vehicle: ActiveVehicleProfile;
  hardwareLink: HardwareLinkState;
  rpm: number;
  speed: number;
  load: number;
  temp: number;
  batt: number;
  chartData: TelemetrySample[];
  onOpenVciModal: () => void;
  onQuickOpenEcuSession: () => void;
  onOpenDatabase: () => void;
  onOpenModule: (view: NavView, sub: DiagSubTab | FuncSubTab) => void;
}

interface SegmentedGaugeProps {
  title: string;
  value: number;
  max: number;
  unit: string;
  subLabel?: string;
  redlineStart?: number;
  active: boolean;
  icon: React.ReactNode;
}

const SegmentedArcGauge: React.FC<SegmentedGaugeProps> = ({
  title,
  value,
  max,
  unit,
  subLabel,
  redlineStart,
  active,
  icon,
}) => {
  const segments = 22;
  const startDeg = -215;
  const endDeg = 35;
  const totalSpan = endDeg - startDeg;
  const ratio = active ? Math.max(0, Math.min(1, value / max)) : 0;
  const activeCount = Math.round(ratio * segments);

  const cx = 100;
  const cy = 92;
  const rInner = 54;
  const rOuter = 71;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  return (
    <div className="autolab-glass-card rounded-xl px-3.5 py-2 flex flex-col items-center justify-between relative overflow-hidden min-h-0">
      <div className="w-full flex items-center justify-between text-xs font-semibold text-slate-100 z-10">
        <span>{title}</span>
        {icon}
      </div>

      <svg className="w-full max-w-[178px] h-[106px] overflow-visible" viewBox="0 0 200 122">
        <defs>
          <filter id={`arcGlow-${title}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M 48 113 A 61 61 0 1 1 152 113"
          fill="none"
          stroke="rgba(56, 189, 248, 0.22)"
          strokeWidth="1.2"
        />

        {Array.from({ length: segments }).map((_, i) => {
          const frac = i / (segments - 1);
          const deg = startDeg + frac * totalSpan;
          const rad = toRad(deg);
          const x1 = cx + Math.cos(rad) * rInner;
          const y1 = cy + Math.sin(rad) * rInner;
          const x2 = cx + Math.cos(rad) * rOuter;
          const y2 = cy + Math.sin(rad) * rOuter;

          const isActive = i < activeCount;
          const isRedZone =
            redlineStart !== undefined ? frac * max >= redlineStart : i >= segments - 2;

          let stroke = 'rgba(26, 46, 82, 0.72)';
          let useGlow = false;

          if (isRedZone) {
            stroke = isActive ? '#ef4444' : 'rgba(220, 38, 38, 0.45)';
            useGlow = isActive;
          } else if (isActive) {
            stroke = frac < 0.42 ? '#00d2ff' : '#2563eb';
            useGlow = true;
          } else if (redlineStart !== undefined && frac < 0.22) {
            stroke = 'rgba(0, 210, 255, 0.35)';
          }

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={6}
              strokeLinecap="butt"
              filter={useGlow ? `url(#arcGlow-${title})` : undefined}
            />
          );
        })}

        {subLabel && (
          <text x="100" y="62" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontWeight="600">
            {subLabel}
          </text>
        )}
        <text
          x="100"
          y={subLabel ? '96' : '91'}
          textAnchor="middle"
          fill={active ? '#ffffff' : '#64748b'}
          fontSize="31"
          fontWeight="800"
          className="font-mono tabular-nums"
        >
          {active ? Math.round(value) : '--'}
        </text>
        <text x="100" y="113" textAnchor="middle" fill="#94a3b8" fontSize="10.5" fontWeight="600">
          {unit}
        </text>
      </svg>
    </div>
  );
};

function buildSparklineGeometry(
  samples: TelemetrySample[],
  key: 'load' | 'temp' | 'batt',
  min: number,
  max: number
): { line: string; area: string } {
  const slice = samples.length ? samples.slice(-24) : [];
  if (slice.length < 2) {
    return {
      line: '0,34 130,34',
      area: '0,44 0,34 130,34 130,44',
    };
  }
  const pts = slice.map((s, idx) => {
    const x = (idx / Math.max(1, slice.length - 1)) * 130;
    const norm = Math.max(0, Math.min(1, (s[key] - min) / Math.max(1, max - min)));
    const y = 39 - norm * 31;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return {
    line: pts.join(' '),
    area: `0,44 ${pts.join(' ')} 130,44`,
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  vciConnected,
  ecuSession,
  ignition,
  demoBenchMode,
  vehicle,
  hardwareLink,
  rpm,
  speed,
  load,
  temp,
  batt,
  chartData,
  onOpenVciModal,
  onQuickOpenEcuSession,
  onOpenDatabase,
  onOpenModule,
}) => {
  const linkActive = vciConnected && ecuSession === 'SESSION_ACTIVE' && ignition !== 'OFF';
  const isWaiting = vciConnected && ecuSession === 'WAITING_FOR_ECU';

  const loadGeo = buildSparklineGeometry(chartData, 'load', 0, 100);
  const tempGeo = buildSparklineGeometry(chartData, 'temp', 40, 115);
  const battGeo = buildSparklineGeometry(chartData, 'batt', 11, 15);

  const statusHeadline =
    ecuSession === 'SESSION_ACTIVE' && vciConnected
      ? ignition === 'OFF'
        ? 'ECU Sleep'
        : 'Connected'
      : isWaiting
      ? 'WAITING FOR ECU'
      : 'Disconnected';

  const lightsLit = vciConnected && ignition !== 'OFF';

  return (
    <div className="h-full grid grid-rows-[minmax(0,1fr)_auto_auto] gap-2.5">
      {/* Top Row: Studio Coupe Photo Stage + Stacked RPM / Speed Gauges */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_248px] gap-2.5 min-h-0">
        {/* Hero Vehicle Stage */}
        <div className="relative rounded-xl border border-sky-400/45 overflow-hidden flex flex-col justify-between min-h-0 bg-[#030916] shadow-[0_0_24px_rgba(14,165,233,0.14)]">
          <img
            src="/assets/hero-coupe.webp"
            alt={`${vehicle.displayName} Diagnostic Stage`}
            className={`absolute inset-0 w-full h-full object-cover object-[38%_58%] pointer-events-none select-none transition-all duration-500 ${
              lightsLit ? 'brightness-105 contrast-105' : 'brightness-85 saturate-90'
            }`}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 38% 60%, transparent 45%, rgba(2, 7, 18, 0.55) 100%)',
            }}
          />

          {/* Frosted Top-Right Vehicle Status Card */}
          <div className="relative z-10 m-3 sm:absolute sm:top-3.5 sm:right-3.5 sm:w-[274px] sm:m-0 p-3.5 rounded-xl bg-[#07142b]/76 backdrop-blur-md border border-sky-300/40 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-slate-200">Vehicle Status</span>
              <div className="flex items-center gap-1">
                {demoBenchMode && (
                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    BENCH ECU
                  </span>
                )}
                <button
                  type="button"
                  onClick={onOpenDatabase}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/40 text-sky-100 border border-sky-400/35 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {vehicle.make} {vehicle.year}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[20px] leading-none font-bold text-white mb-2.5">
              <span
                className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
                  linkActive
                    ? 'bg-emerald-500 shadow-[0_0_16px_rgba(34,197,94,0.85)]'
                    : isWaiting
                    ? 'bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.8)]'
                    : 'bg-rose-600 shadow-[0_0_12px_rgba(225,29,72,0.65)]'
                }`}
              >
                {linkActive ? (
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                ) : isWaiting ? (
                  <Clock className="w-4 h-4 text-white" />
                ) : (
                  <WifiOff className="w-4 h-4 text-white" />
                )}
              </span>
              <span className="truncate tracking-tight">{statusHeadline}</span>
            </div>

            <div className="font-mono text-[11.5px] text-slate-200 space-y-0.5 leading-snug">
              <div className="truncate">
                ECU:{' '}
                <span className="text-sky-200 font-semibold">
                  {linkActive || isWaiting || demoBenchMode
                    ? vehicle.ecu
                    : `${vehicle.ecu} (Standby)`}
                </span>
              </div>
              <div className="truncate tabular-nums">
                VIN:{' '}
                <span className="text-sky-200 font-semibold">
                  {linkActive ? vehicle.vin : 'Awaiting ECU Link'}
                </span>
              </div>
            </div>

            {!linkActive && (
              <div className="mt-2.5 pt-2 border-t border-sky-400/20 flex items-center justify-between gap-2">
                {isWaiting ? (
                  <button
                    type="button"
                    onClick={onQuickOpenEcuSession}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Open &amp; Verify ECU Session
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenVciModal}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#142c57] hover:bg-blue-600 border border-sky-400/45 text-sky-100 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Cable className="w-3.5 h-3.5" />
                    {hardwareLink.deviceLabel ? 'Reconnect Hardware' : 'Connect USB / Hardware'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Stacked Segmented RPM + Speed Arc Gauges */}
        <div className="grid grid-cols-2 xl:grid-cols-1 xl:grid-rows-2 gap-2.5 min-h-0">
          <SegmentedArcGauge
            title="RPM"
            subLabel="RPM"
            value={rpm}
            max={7000}
            unit="RPM"
            redlineStart={5600}
            active={linkActive}
            icon={<Cpu className="w-4 h-4 text-sky-400 autolab-cyan-glow" />}
          />
          <SegmentedArcGauge
            title="Speed"
            value={speed}
            max={260}
            unit="km/h"
            active={linkActive}
            icon={<Gauge className="w-4 h-4 text-sky-400 autolab-cyan-glow" />}
          />
        </div>
      </div>

      {/* Middle Row: 3 Sparkline Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 shrink-0">
        <div className="autolab-glass-card rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-100">
              <Activity className="w-4 h-4 text-sky-400 shrink-0 autolab-cyan-glow" />
              <span className="truncate">Engine Load</span>
            </div>
            <div className="text-2xl leading-tight font-extrabold text-white font-mono tabular-nums mt-0.5">
              {linkActive ? `${load.toFixed(1)}%` : '--'}
            </div>
          </div>
          <svg className="w-[120px] h-[40px] shrink-0" viewBox="0 0 130 44">
            <defs>
              <linearGradient id="sparkBlue1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.48" />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon fill="url(#sparkBlue1)" points={loadGeo.area} />
            <polyline fill="none" stroke="#38bdf8" strokeWidth="2" points={loadGeo.line} />
          </svg>
        </div>

        <div className="autolab-glass-card rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-100">
              <Thermometer className="w-4 h-4 text-sky-400 shrink-0 autolab-cyan-glow" />
              <span className="truncate">Coolant Temp</span>
            </div>
            <div className="text-2xl leading-tight font-extrabold text-white font-mono tabular-nums mt-0.5">
              {linkActive ? `${temp.toFixed(0)}°C` : '--'}
            </div>
          </div>
          <svg className="w-[120px] h-[40px] shrink-0" viewBox="0 0 130 44">
            <defs>
              <linearGradient id="sparkBlue2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.48" />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon fill="url(#sparkBlue2)" points={tempGeo.area} />
            <polyline fill="none" stroke="#38bdf8" strokeWidth="2" points={tempGeo.line} />
          </svg>
        </div>

        <div className="autolab-glass-card rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-100">
              <BatteryCharging className="w-4 h-4 text-sky-400 shrink-0 autolab-cyan-glow" />
              <span className="truncate">Battery</span>
            </div>
            <div className="text-2xl leading-tight font-extrabold text-white font-mono tabular-nums mt-0.5">
              {vciConnected ? `${batt.toFixed(1)} V` : '0.0 V'}
            </div>
          </div>
          <svg className="w-[120px] h-[40px] shrink-0" viewBox="0 0 130 44">
            <defs>
              <linearGradient id="sparkBlue3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={batt >= 12.5 ? '#38bdf8' : '#f59e0b'} stopOpacity="0.48" />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon fill="url(#sparkBlue3)" points={battGeo.area} />
            <polyline
              fill="none"
              stroke={batt >= 12.5 ? '#38bdf8' : '#f59e0b'}
              strokeWidth="2"
              points={battGeo.line}
            />
          </svg>
        </div>
      </div>

      {/* Bottom Row: 4 Glowing Action Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => onOpenModule('diagnostics', 'topo')}
          className="autolab-glass-card rounded-xl hover:bg-[#142c57] hover:border-sky-400/80 transition-all py-3 px-4 flex flex-col items-center justify-center gap-1.5 text-slate-100 cursor-pointer group"
        >
          <LayoutGrid className="w-6 h-6 text-sky-400 autolab-cyan-glow group-hover:scale-105 transition-transform" />
          <span className="text-[13px] font-semibold whitespace-nowrap">14 Core Systems</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModule('diagnostics', 'live')}
          className="autolab-glass-card rounded-xl hover:bg-[#142c57] hover:border-sky-400/80 transition-all py-3 px-4 flex flex-col items-center justify-center gap-1.5 text-slate-100 cursor-pointer group"
        >
          <BarChart3 className="w-6 h-6 text-sky-400 autolab-cyan-glow group-hover:scale-105 transition-transform" />
          <span className="text-[13px] font-semibold whitespace-nowrap">Live Graphs</span>
        </button>

        <button
          type="button"
          onClick={onOpenVciModal}
          className="autolab-glass-card rounded-xl hover:bg-[#142c57] hover:border-sky-400/80 transition-all py-3 px-4 flex flex-col items-center justify-center gap-1.5 text-slate-100 cursor-pointer group"
        >
          <Pointer className="w-6 h-6 text-sky-400 autolab-cyan-glow group-hover:scale-105 transition-transform" />
          <span className="text-[13px] font-semibold whitespace-nowrap">Quick Actions</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModule('functions', 'adapt')}
          className="autolab-glass-card rounded-xl hover:bg-[#142c57] hover:border-sky-400/80 transition-all py-3 px-4 flex flex-col items-center justify-center gap-1.5 text-slate-100 cursor-pointer group"
        >
          <Wrench className="w-6 h-6 text-sky-400 autolab-cyan-glow group-hover:scale-105 transition-transform" />
          <span className="text-[13px] font-semibold whitespace-nowrap">Maintenance</span>
        </button>
      </div>
    </div>
  );
};
