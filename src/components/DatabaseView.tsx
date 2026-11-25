import React, { useMemo, useRef, useState } from 'react';
import { Download, FolderUp, KeyRound, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import type {
  DbSubTab,
  EraGeneration,
  KeyProgrammingRecord,
  PartCatalogItem,
  VehicleRecord,
} from '../types/autolab';

interface DatabaseViewProps {
  eras: EraGeneration[];
  vehicles: VehicleRecord[];
  keysDb: KeyProgrammingRecord[];
  parts: PartCatalogItem[];
  subTab: DbSubTab;
  onSubTabChange: (sub: DbSubTab) => void;
  onLoadVehicle: (vehicle: VehicleRecord, selectedYear?: number) => void;
  onAddCustomVehicle: (vehicle: VehicleRecord) => void;
  onAddCustomKey: (keyRecord: KeyProgrammingRecord) => void;
  onLoadKeyProfile: (
    keyRec: KeyProgrammingRecord,
    selectedYear: number,
    openImmoTab: boolean
  ) => void;
  onMergeDatabase: (
    vehicles: VehicleRecord[],
    parts: PartCatalogItem[],
    keys?: KeyProgrammingRecord[]
  ) => void;
  onToast: (msg: string) => void;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  eras,
  vehicles,
  keysDb,
  parts,
  subTab,
  onSubTabChange: setSubTab,
  onLoadVehicle,
  onAddCustomVehicle,
  onAddCustomKey,
  onLoadKeyProfile,
  onMergeDatabase,
  onToast,
}) => {

  // Cascading Vehicles filters (Region -> Make -> Model -> Year)
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [makeFilter, setMakeFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [vehicleSearch, setVehicleSearch] = useState<string>('');

  // Cascading Keys & IMMO filters (Region -> Make -> Model -> Year)
  const [keyRegionFilter, setKeyRegionFilter] = useState<string>('');
  const [keyMakeFilter, setKeyMakeFilter] = useState<string>('');
  const [keyModelFilter, setKeyModelFilter] = useState<string>('');
  const [keyYearFilter, setKeyYearFilter] = useState<string>('');
  const [keySearch, setKeySearch] = useState<string>('');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  // Parts filters
  const [partSysFilter, setPartSysFilter] = useState<string>('');
  const [partCatFilter, setPartCatFilter] = useState<string>('');
  const [partSearch, setPartSearch] = useState<string>('');

  // Custom vehicle form
  const [addMake, setAddMake] = useState('');
  const [addModel, setAddModel] = useState('');
  const [addFrom, setAddFrom] = useState('2020');
  const [addTo, setAddTo] = useState('2026');
  const [addEcu, setAddEcu] = useState('');
  const [addProto, setAddProto] = useState('');

  // Custom key form
  const [customEntryType, setCustomEntryType] = useState<'vehicle' | 'key'>('key');
  const [kMake, setKMake] = useState('');
  const [kModel, setKModel] = useState('');
  const [kFrom, setKFrom] = useState('2018');
  const [kTo, setKTo] = useState('2026');
  const [kImmo, setKImmo] = useState('');
  const [kChip, setKChip] = useState('');
  const [kFreq, setKFreq] = useState('433.92 MHz (FSK)');
  const [kBlade, setKBlade] = useState('');
  const [kPinMethod, setKPinMethod] = useState('');
  const [kSteps, setKSteps] = useState('');

  const importRef = useRef<HTMLInputElement>(null);

  // ---- Vehicles Cascading Options ----
  const vehicleMakes = useMemo(() => {
    const pool = regionFilter ? vehicles.filter((v) => v.region === regionFilter) : vehicles;
    return [...new Set(pool.map((v) => v.make))].sort();
  }, [vehicles, regionFilter]);

  const vehicleModels = useMemo(() => {
    const pool = vehicles.filter((v) => {
      if (regionFilter && v.region !== regionFilter) return false;
      if (makeFilter && v.make !== makeFilter) return false;
      return true;
    });
    return [...new Set(pool.map((v) => v.model))];
  }, [vehicles, regionFilter, makeFilter]);

  const vehicleYears = useMemo(() => {
    const matching = vehicles.filter((v) => {
      if (regionFilter && v.region !== regionFilter) return false;
      if (makeFilter && v.make !== makeFilter) return false;
      if (modelFilter && v.model !== modelFilter) return false;
      return true;
    });
    const minY = matching.length ? Math.min(...matching.map((v) => v.from)) : 1980;
    const maxY = matching.length ? Math.max(...matching.map((v) => v.to)) : 2026;
    const arr: number[] = [];
    for (let y = maxY; y >= minY; y--) arr.push(y);
    return arr;
  }, [vehicles, regionFilter, makeFilter, modelFilter]);

  const filteredVehicles = useMemo(() => {
    const yr = yearFilter ? parseInt(yearFilter, 10) : NaN;
    const q = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (regionFilter && v.region !== regionFilter) return false;
      if (makeFilter && v.make !== makeFilter) return false;
      if (modelFilter && v.model !== modelFilter) return false;
      if (!isNaN(yr) && (yr < v.from || yr > v.to)) return false;
      if (q && !`${v.make} ${v.model} ${v.engines} ${v.ecu} ${v.proto}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [vehicles, regionFilter, makeFilter, modelFilter, yearFilter, vehicleSearch]);

  // ---- Keys & IMMO Cascading Options ----
  const keyMakes = useMemo(() => {
    const pool = keyRegionFilter ? keysDb.filter((k) => k.region === keyRegionFilter) : keysDb;
    return [...new Set(pool.map((k) => k.make))].sort();
  }, [keysDb, keyRegionFilter]);

  const keyModels = useMemo(() => {
    const pool = keysDb.filter((k) => {
      if (keyRegionFilter && k.region !== keyRegionFilter) return false;
      if (keyMakeFilter && k.make !== keyMakeFilter) return false;
      return true;
    });
    return [...new Set(pool.map((k) => k.model))];
  }, [keysDb, keyRegionFilter, keyMakeFilter]);

  const keyYears = useMemo(() => {
    const matching = keysDb.filter((k) => {
      if (keyRegionFilter && k.region !== keyRegionFilter) return false;
      if (keyMakeFilter && k.make !== keyMakeFilter) return false;
      if (keyModelFilter && k.model !== keyModelFilter) return false;
      return true;
    });
    const minY = matching.length ? Math.min(...matching.map((k) => k.from)) : 1980;
    const maxY = matching.length ? Math.max(...matching.map((k) => k.to)) : 2026;
    const arr: number[] = [];
    for (let y = maxY; y >= minY; y--) arr.push(y);
    return arr;
  }, [keysDb, keyRegionFilter, keyMakeFilter, keyModelFilter]);

  const filteredKeys = useMemo(() => {
    const yr = keyYearFilter ? parseInt(keyYearFilter, 10) : NaN;
    const q = keySearch.trim().toLowerCase();
    return keysDb.filter((k) => {
      if (keyRegionFilter && k.region !== keyRegionFilter) return false;
      if (keyMakeFilter && k.make !== keyMakeFilter) return false;
      if (keyModelFilter && k.model !== keyModelFilter) return false;
      if (!isNaN(yr) && (yr < k.from || yr > k.to)) return false;
      if (
        q &&
        !`${k.make} ${k.model} ${k.immoSystem} ${k.transponderChip} ${k.remoteFreq} ${k.keyBlade} ${k.securityAccess}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [keysDb, keyRegionFilter, keyMakeFilter, keyModelFilter, keyYearFilter, keySearch]);

  const activeKeyPreview = useMemo(() => {
    if (selectedKeyId) {
      const explicit = filteredKeys.find((k) => k.id === selectedKeyId);
      if (explicit) return explicit;
    }
    return filteredKeys[0] ?? null;
  }, [filteredKeys, selectedKeyId]);

  const systems = useMemo(() => [...new Set(parts.map((p) => p.sys))], [parts]);
  const allUniqueMakes = useMemo(() => [...new Set(vehicles.map((v) => v.make))], [vehicles]);

  const filteredParts = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    return parts.filter((p) => {
      if (partSysFilter && p.sys !== partSysFilter) return false;
      if (partCatFilter && p.cat !== partCatFilter) return false;
      if (q && !`${p.sys} ${p.cat} ${p.name} ${p.bus} ${p.spec}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [parts, partSysFilter, partCatFilter, partSearch]);

  const handleAddCustomVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const make = addMake.trim();
    const model = addModel.trim();
    if (!make || !model) {
      onToast('Enter Make and Model');
      return;
    }
    const from = Math.min(2026, Math.max(1980, parseInt(addFrom, 10) || 2020));
    const to = Math.min(2026, Math.max(from, parseInt(addTo, 10) || 2026));
    const ecu = addEcu.trim() || 'Bosch MG1';
    const proto = addProto.trim() || 'UDS / CAN-FD';
    onAddCustomVehicle({
      make,
      region: 'Custom',
      model,
      from,
      to,
      engines: 'Custom Powertrain',
      ecu,
      proto,
      wmi: make.slice(0, 3).toUpperCase(),
    });
    setAddMake('');
    setAddModel('');
    setAddEcu('');
    setAddProto('');
    setSubTab('vehicles');
  };

  const handleAddCustomKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const make = kMake.trim();
    const model = kModel.trim();
    if (!make || !model) {
      onToast('Enter Make and Model for Key DB entry');
      return;
    }
    const from = Math.min(2026, Math.max(1980, parseInt(kFrom, 10) || 2018));
    const to = Math.min(2026, Math.max(from, parseInt(kTo, 10) || 2026));
    const newRec: KeyProgrammingRecord = {
      id: `custom-key-${Date.now()}`,
      make,
      region: 'Custom',
      model,
      from,
      to,
      immoSystem: kImmo.trim() || 'BCM / PEPS IMMO',
      transponderChip: kChip.trim() || '4A Hitag-AES',
      remoteFreq: kFreq.trim() || '433.92 MHz (FSK)',
      keyBlade: kBlade.trim() || 'HU66',
      keyType: 'Smart Prox / PEPS',
      aklSupported: 'OBD + Adapter',
      securityAccess: kPinMethod.trim() || 'OBD PIN / EEPROM Read',
      programmingMethod:
        kSteps.trim() || 'Connect via OBD CAN -> Authenticate IMMO PIN -> Learn transponder on coil.',
    };
    onAddCustomKey(newRec);
    setKMake('');
    setKModel('');
    setKImmo('');
    setKChip('');
    setKBlade('');
    setKPinMethod('');
    setKSteps('');
    setSelectedKeyId(newRec.id);
    setSubTab('keys');
  };

  const handleExportDB = () => {
    const payload = {
      eras,
      vehicles_1980_2026: vehicles,
      key_immo_db_1980_2026: keysDb,
      systems_and_parts: parts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autolab_master_db_1980_2026.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Exported Master Vehicle, Key & Parts DB 1980–2026 (.json)');
  };

  const handleImportDB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const newVehicles = Array.isArray(parsed.vehicles_1980_2026) ? parsed.vehicles_1980_2026 : [];
        const newParts = Array.isArray(parsed.systems_and_parts) ? parsed.systems_and_parts : [];
        const newKeys = Array.isArray(parsed.key_immo_db_1980_2026)
          ? parsed.key_immo_db_1980_2026
          : [];
        onMergeDatabase(newVehicles, newParts, newKeys);
        onToast(
          `Merged ${newVehicles.length} vehicles, ${newKeys.length} key profiles & ${newParts.length} parts`
        );
      } catch {
        onToast('Invalid JSON database file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2.5 border-b border-sky-500/20">
        <div>
          <h1 className="text-lg font-bold text-white">
            Global Vehicle, Key &amp; IMMO, System &amp; Parts Database (1980 – 2026)
          </h1>
          <p className="text-xs text-sky-300 mt-0.5">
            {allUniqueMakes.length} Global OEMs · {keysDb.length} IMMO/Key Profiles (1980–2026) · 6 Protocol Eras · 14 System Domains
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['vehicles', 'Makes & Models'],
              ['keys', 'Keys & IMMO DB (1980–2026)'],
              ['parts', 'Systems & Parts'],
              ['eras', 'Era Protocol Matrix'],
              ['custom', 'Add / Import'],
            ] as [DbSubTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
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

      {/* SUB 1: VEHICLES 1980-2026 (CASCADING SELECTORS) */}
      {subTab === 'vehicles' && (
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/80 p-3.5 flex flex-col gap-3 flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-[140px_165px_210px_135px_1fr_auto] gap-2 items-center">
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setMakeFilter('');
                setModelFilter('');
                setYearFilter('');
              }}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">All Regions</option>
              <option value="European">European</option>
              <option value="Japanese">Japanese</option>
              <option value="Korean">Korean</option>
              <option value="American">American</option>
              <option value="Chinese / EV">Chinese / EV</option>
              <option value="Russian">Russian (Lada)</option>
              <option value="Custom">Custom</option>
            </select>

            <select
              value={makeFilter}
              onChange={(e) => {
                setMakeFilter(e.target.value);
                setModelFilter('');
                setYearFilter('');
              }}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">1. Make ({vehicleMakes.length})</option>
              {vehicleMakes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value);
                setYearFilter('');
              }}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">2. Model ({vehicleModels.length})</option>
              {vehicleModels.map((mdl) => (
                <option key={mdl} value={mdl}>
                  {mdl}
                </option>
              ))}
            </select>

            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">3. Year (1980–2026)</option>
              {vehicleYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              placeholder="Filter engine, chassis, ECU (MED17, Yanvar, MG1)..."
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
            />

            <span className="text-xs font-mono tabular-nums text-sky-300 font-semibold px-2 whitespace-nowrap">
              {filteredVehicles.length} Profiles
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto autolab-scroll border border-sky-500/20 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#091428] z-10">
                <tr className="border-b border-sky-500/25 text-sky-300">
                  <th className="py-2.5 px-3 font-semibold">Make</th>
                  <th className="py-2.5 px-3 font-semibold">Model / Chassis</th>
                  <th className="py-2.5 px-3 font-semibold">Years</th>
                  <th className="py-2.5 px-3 font-semibold">Powertrain / Engines</th>
                  <th className="py-2.5 px-3 font-semibold">Primary ECU Family</th>
                  <th className="py-2.5 px-3 font-semibold">Protocol / Architecture</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <div className="mb-2">No vehicle profiles match the active filters.</div>
                      <button
                        type="button"
                        onClick={() => {
                          setYearFilter('');
                          setMakeFilter('');
                          setModelFilter('');
                          setRegionFilter('');
                          setVehicleSearch('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((v, idx) => {
                    const selectedYear = yearFilter ? parseInt(yearFilter, 10) : v.to;
                    return (
                      <tr
                        key={`${v.make}-${v.model}-${v.from}-${idx}`}
                        className="border-b border-sky-500/10 hover:bg-sky-500/10 transition-colors"
                      >
                        <td className="py-2 px-3">
                          <div className="font-bold text-white">{v.make}</div>
                          <div className="text-[10.5px] text-slate-400">{v.region}</div>
                        </td>
                        <td className="py-2 px-3 text-slate-100">{v.model}</td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {v.from}–{v.to}
                        </td>
                        <td className="py-2 px-3 text-slate-300">{v.engines}</td>
                        <td className="py-2 px-3 font-mono text-sky-300">{v.ecu}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-200">{v.proto}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onLoadVehicle(v, selectedYear)}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            Load into Workspace
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB 2: KEYS & IMMOBILIZER DATABASE (1980-2026) WITH CASCADING SELECTORS */}
      {subTab === 'keys' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Cascading Selection Bar: Region -> Make -> Model -> Year */}
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-sky-400" />
                Cascading Key &amp; Transponder Finder (Make → Model → Year · 1980–2026)
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                <span>{filteredKeys.length} Matching Key Profiles</span>
                {(keyRegionFilter || keyMakeFilter || keyModelFilter || keyYearFilter || keySearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setKeyRegionFilter('');
                      setKeyMakeFilter('');
                      setKeyModelFilter('');
                      setKeyYearFilter('');
                      setKeySearch('');
                      setSelectedKeyId(null);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[140px_170px_240px_135px_1fr] gap-2 items-center">
              <select
                value={keyRegionFilter}
                onChange={(e) => {
                  setKeyRegionFilter(e.target.value);
                  setKeyMakeFilter('');
                  setKeyModelFilter('');
                  setKeyYearFilter('');
                  setSelectedKeyId(null);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
              >
                <option value="">All Regions</option>
                <option value="European">European</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="American">American</option>
                <option value="Chinese / EV">Chinese / EV</option>
                <option value="Russian">Russian (Lada)</option>
                <option value="Custom">Custom</option>
              </select>

              <select
                value={keyMakeFilter}
                onChange={(e) => {
                  setKeyMakeFilter(e.target.value);
                  setKeyModelFilter('');
                  setKeyYearFilter('');
                  setSelectedKeyId(null);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
              >
                <option value="">1. Select Make ({keyMakes.length})</option>
                {keyMakes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={keyModelFilter}
                onChange={(e) => {
                  setKeyModelFilter(e.target.value);
                  setKeyYearFilter('');
                  setSelectedKeyId(null);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
              >
                <option value="">2. Select Model ({keyModels.length})</option>
                {keyModels.map((mdl) => (
                  <option key={mdl} value={mdl}>
                    {mdl}
                  </option>
                ))}
              </select>

              <select
                value={keyYearFilter}
                onChange={(e) => {
                  setKeyYearFilter(e.target.value);
                  setSelectedKeyId(null);
                }}
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
              >
                <option value="">3. Select Year ({keyYears.length})</option>
                {keyYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder="Search chip (ID46, 8A, MQB48, Hitag-AES), freq (433/315), blade (HU66, TOY48)..."
                className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
              />
            </div>
          </div>

          {/* Active Selected Key Hardware Specification Inspector */}
          {activeKeyPreview && (
            <div className="rounded-xl border border-sky-400/40 bg-[#09162d]/95 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-sky-500/20">
                <div>
                  <div className="text-sm font-bold text-white">
                    {activeKeyPreview.make} — {activeKeyPreview.model}{' '}
                    <span className="font-mono text-sky-300">
                      ({keyYearFilter || `${activeKeyPreview.from}–${activeKeyPreview.to}`})
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>{activeKeyPreview.region}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeKeyPreview.keyType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-400 font-semibold">
                      AKL: {activeKeyPreview.aklSupported}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onLoadKeyProfile(
                        activeKeyPreview,
                        keyYearFilter ? parseInt(keyYearFilter, 10) : activeKeyPreview.to,
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#16315e] hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Load Vehicle Profile
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onLoadKeyProfile(
                        activeKeyPreview,
                        keyYearFilter ? parseInt(keyYearFilter, 10) : activeKeyPreview.to,
                        true
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Open in IMMO Programmer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400 mb-0.5">IMMO Control Module</div>
                  <div className="font-mono font-semibold text-white">{activeKeyPreview.immoSystem}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400 mb-0.5">Transponder Chip / Crypto</div>
                  <div className="font-mono font-semibold text-sky-300">{activeKeyPreview.transponderChip}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400 mb-0.5">Remote RF / UWB Frequency</div>
                  <div className="font-mono font-semibold text-emerald-400">{activeKeyPreview.remoteFreq}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-slate-400 mb-0.5">Mechanical Blade Profile</div>
                  <div className="font-mono font-semibold text-amber-300">{activeKeyPreview.keyBlade}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-sky-300 font-semibold mb-1">
                    PIN / CS / ISN Security Access Method
                  </div>
                  <div className="font-mono text-slate-200 leading-relaxed">
                    {activeKeyPreview.securityAccess}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#060e1c]/90 border border-sky-500/20">
                  <div className="text-[11px] text-emerald-400 font-semibold mb-1">
                    Step-by-Step Key Programming &amp; AKL Procedure
                  </div>
                  <div className="text-slate-200 leading-relaxed">
                    {activeKeyPreview.programmingMethod}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Keys Table */}
          <div className="flex-1 min-h-0 overflow-auto autolab-scroll rounded-xl border border-sky-500/25 bg-[#0e1b32]/75">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#091428] z-10">
                <tr className="border-b border-sky-500/25 text-sky-300">
                  <th className="py-2.5 px-3 font-semibold">Make &amp; Model</th>
                  <th className="py-2.5 px-3 font-semibold">Years</th>
                  <th className="py-2.5 px-3 font-semibold">IMMO System</th>
                  <th className="py-2.5 px-3 font-semibold">Transponder Chip</th>
                  <th className="py-2.5 px-3 font-semibold">Frequency</th>
                  <th className="py-2.5 px-3 font-semibold">Blade</th>
                  <th className="py-2.5 px-3 font-semibold">AKL</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeys.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No Key/IMMO profiles match the selected Make, Model, or Year.
                    </td>
                  </tr>
                ) : (
                  filteredKeys.map((k) => {
                    const selected = activeKeyPreview?.id === k.id;
                    const yrToLoad = keyYearFilter ? parseInt(keyYearFilter, 10) : k.to;
                    return (
                      <tr
                        key={k.id}
                        onClick={() => setSelectedKeyId(k.id)}
                        className={`border-b border-sky-500/10 cursor-pointer transition-colors ${
                          selected ? 'bg-sky-500/18' : 'hover:bg-sky-500/10'
                        }`}
                      >
                        <td className="py-2 px-3">
                          <div className="font-bold text-white">{k.make}</div>
                          <div className="text-[11px] text-slate-300">{k.model}</div>
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {k.from}–{k.to}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-200">{k.immoSystem}</td>
                        <td className="py-2 px-3 font-mono text-sky-300">{k.transponderChip}</td>
                        <td className="py-2 px-3 font-mono text-emerald-400 whitespace-nowrap">{k.remoteFreq}</td>
                        <td className="py-2 px-3 font-mono text-amber-300 whitespace-nowrap">{k.keyBlade}</td>
                        <td className="py-2 px-3 font-mono text-slate-200 whitespace-nowrap">{k.aklSupported}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadKeyProfile(k, yrToLoad, true);
                            }}
                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                          >
                            Program Key
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB 3: SYSTEMS, ECUS & PARTS */}
      {subTab === 'parts' && (
        <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/80 p-3.5 flex flex-col gap-3 flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-[240px_190px_1fr_auto] gap-2 items-center">
            <select
              value={partSysFilter}
              onChange={(e) => setPartSysFilter(e.target.value)}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">All 14 Vehicle Systems</option>
              {systems.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={partCatFilter}
              onChange={(e) => setPartCatFilter(e.target.value)}
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-2.5 py-2 text-xs outline-none focus:border-sky-400"
            >
              <option value="">All Categories</option>
              <option value="Control Module (ECU)">Control Module (ECU)</option>
              <option value="Sensor / Transducer">Sensor / Transducer</option>
              <option value="Actuator / Solenoid">Actuator / Solenoid</option>
              <option value="Mechanical / Wear Part">Mechanical / Wear Part</option>
              <option value="HV / Safety Device">HV / Safety Device</option>
            </select>

            <input
              type="text"
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              placeholder="Search component, sensor, actuator, ECU, resistance/voltage spec..."
              className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
            />

            <span className="text-xs font-mono tabular-nums text-emerald-400 font-semibold px-2 whitespace-nowrap">
              {filteredParts.length} Items
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto autolab-scroll border border-sky-500/20 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#091428] z-10">
                <tr className="border-b border-sky-500/25 text-sky-300">
                  <th className="py-2.5 px-3 font-semibold">System Domain</th>
                  <th className="py-2.5 px-3 font-semibold">Category</th>
                  <th className="py-2.5 px-3 font-semibold">Unit / Device / Part Name</th>
                  <th className="py-2.5 px-3 font-semibold">Bus / Interface</th>
                  <th className="py-2.5 px-3 font-semibold">Diagnostic / Electrical Spec</th>
                  <th className="py-2.5 px-3 font-semibold">Year Span</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((p, idx) => (
                  <tr
                    key={`${p.name}-${idx}`}
                    className="border-b border-sky-500/10 hover:bg-sky-500/10 transition-colors"
                  >
                    <td className="py-2 px-3 text-sky-300">{p.sys}</td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{p.cat}</td>
                    <td className="py-2 px-3 font-semibold text-white">{p.name}</td>
                    <td className="py-2 px-3 font-mono text-slate-300">{p.bus}</td>
                    <td className="py-2 px-3 font-mono text-emerald-400">{p.spec}</td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {p.span}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB 4: 1980-2026 ERA MATRIX */}
      {subTab === 'eras' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {eras.map((era) => (
            <div
              key={era.era}
              className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between text-xs font-mono font-bold text-sky-300">
                <span>{era.era}</span>
                <span className="text-slate-400">Generation</span>
              </div>
              <div className="text-sm font-bold text-white">{era.title}</div>
              <div className="font-mono text-[11.5px] text-slate-300 space-y-1.5 leading-relaxed pt-1 border-t border-sky-500/15">
                <div>
                  <span className="text-sky-300 font-semibold">Protocols:</span> {era.protocols}
                </div>
                <div>
                  <span className="text-sky-300 font-semibold">ECUs:</span> {era.ecus}
                </div>
                <div>
                  <span className="text-sky-300 font-semibold">Architecture:</span> {era.arch}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUB 5: IMPORT / ADD CUSTOM VEHICLE OR KEY PROFILE */}
      {subTab === 'custom' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-sky-300">Add Custom Entry (1980–2026)</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setCustomEntryType('key')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    customEntryType === 'key'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#060e1c] text-slate-300 border border-sky-500/30'
                  }`}
                >
                  Key / IMMO Profile
                </button>
                <button
                  type="button"
                  onClick={() => setCustomEntryType('vehicle')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                    customEntryType === 'vehicle'
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#060e1c] text-slate-300 border border-sky-500/30'
                  }`}
                >
                  Vehicle / ECU Profile
                </button>
              </div>
            </div>

            {customEntryType === 'vehicle' ? (
              <form onSubmit={handleAddCustomVehicle} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={addMake}
                    onChange={(e) => setAddMake(e.target.value)}
                    placeholder="Make (e.g. Porsche)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={addModel}
                    onChange={(e) => setAddModel(e.target.value)}
                    placeholder="Model / Chassis (e.g. 911 992 GT3)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2026}
                    value={addFrom}
                    onChange={(e) => setAddFrom(e.target.value)}
                    placeholder="From Year"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2026}
                    value={addTo}
                    onChange={(e) => setAddTo(e.target.value)}
                    placeholder="To Year"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={addEcu}
                    onChange={(e) => setAddEcu(e.target.value)}
                    placeholder="ECU (e.g. Bosch MG1CS047)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={addProto}
                    onChange={(e) => setAddProto(e.target.value)}
                    placeholder="Protocol (e.g. UDS / DoIP)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors self-start"
                >
                  <Plus className="w-4 h-4" />
                  Save Vehicle to Database
                </button>
              </form>
            ) : (
              <form onSubmit={handleAddCustomKeySubmit} className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={kMake}
                    onChange={(e) => setKMake(e.target.value)}
                    placeholder="Make (e.g. Toyota)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={kModel}
                    onChange={(e) => setKModel(e.target.value)}
                    placeholder="Model (e.g. Land Cruiser 300)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2026}
                    value={kFrom}
                    onChange={(e) => setKFrom(e.target.value)}
                    placeholder="From Year"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <input
                    type="number"
                    min={1980}
                    max={2026}
                    value={kTo}
                    onChange={(e) => setKTo(e.target.value)}
                    placeholder="To Year"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs font-mono outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={kImmo}
                    onChange={(e) => setKImmo(e.target.value)}
                    placeholder="IMMO System (e.g. Certification ECU 8A-BA)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={kChip}
                    onChange={(e) => setKChip(e.target.value)}
                    placeholder="Chip (e.g. Texas 8A / Hitag-AES)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={kFreq}
                    onChange={(e) => setKFreq(e.target.value)}
                    placeholder="Frequency (e.g. 433.92 MHz)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                  <input
                    type="text"
                    value={kBlade}
                    onChange={(e) => setKBlade(e.target.value)}
                    placeholder="Key Blade (e.g. TOY51 / HU66)"
                    className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                  />
                </div>
                <input
                  type="text"
                  value={kPinMethod}
                  onChange={(e) => setKPinMethod(e.target.value)}
                  placeholder="PIN / Security Access (e.g. 30-Pin Direct Read / OBD ISK)"
                  className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                />
                <input
                  type="text"
                  value={kSteps}
                  onChange={(e) => setKSteps(e.target.value)}
                  placeholder="Programming Procedure Summary..."
                  className="bg-[#060e1c] border border-sky-500/35 rounded-lg text-slate-100 px-3 py-2 text-xs outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors self-start"
                >
                  <Plus className="w-4 h-4" />
                  Save Key / IMMO Entry
                </button>
              </form>
            )}
          </div>

          <div className="rounded-xl border border-sky-500/30 bg-[#0e1b32]/85 p-4 flex flex-col gap-3">
            <div className="text-sm font-bold text-sky-300">Import / Export Full JSON Database</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Export the complete 1980–2026 Vehicle, Key/IMMO Transponder, ECU, and 14-System Parts catalog to JSON or
              merge external datasets directly into the backend workspace.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleExportDB}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-400/50 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Export Master DB (.json)
              </button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportDB} />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#183a70]/80 hover:bg-blue-600 border border-sky-400/45 text-white text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              >
                <FolderUp className="w-4 h-4" />
                Import / Merge JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
