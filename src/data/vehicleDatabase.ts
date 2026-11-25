import type {
  CalibrationMapTable,
  CoreNode,
  DtcItem,
  EraGeneration,
  PartCatalogItem,
  VehicleRecord,
} from '../types/autolab';

export const ERA_GENERATIONS: EraGeneration[] = [
  {
    era: '1980 – 1995',
    title: 'OBD-I & Early Analog/Digital Injection',
    protocols: 'Blink Codes, Bosch K-Line, ALDL, EEC-IV',
    ecus: 'Bosch Motronic M1.x/M3.x, Jetronic, GM ECM, Nissan ECCS',
    arch: 'Point-to-Point Wiring, Discrete Engine/ABS/SRS',
  },
  {
    era: '1996 – 2004',
    title: 'OBD-II / EOBD Standardization',
    protocols: 'ISO 9141-2, KWP2000 (ISO 14230), J1850 PWM/VPW',
    ecus: 'Bosch ME7.x, EDC15, Siemens MS41/43, Denso 16-bit',
    arch: 'K-Line Diagnostic Bus + Early 125/250k CAN',
  },
  {
    era: '2005 – 2011',
    title: 'High-Speed CAN & Multi-Module Gateway',
    protocols: 'CAN 500k (ISO 15765), LIN, MOST',
    ecus: 'Bosch MED9/EDC16, ME9.7, CAS2/3, ZF 6HP, DSG DQ250',
    arch: 'Central Gateway (CGW), Powertrain/Body/Chassis CAN',
  },
  {
    era: '2012 – 2017',
    title: 'UDS Unified Diagnostics & FlexRay',
    protocols: 'UDS (ISO 14229), CAN 500k, FlexRay, Early DoIP',
    ecus: 'Bosch MED17/EDC17, Simos 18, FEM/BDC, ZF 8HP',
    arch: 'Seed/Key Security, EPB, Radar/Camera ADAS L1',
  },
  {
    era: '2018 – 2022',
    title: 'CAN-FD, DoIP & Cyber Gateways (SGW/SFD)',
    protocols: 'CAN-FD (2–5 Mbps), DoIP (ISO 13400)',
    ecus: 'Bosch MG1/MD1, Simos 19, Tesla MCU2/BMS, BYD VCU',
    arch: 'Security Gateways (FCA SGW / VW SFD), HV 400V EV',
  },
  {
    era: '2023 – 2026',
    title: 'Zonal E/E, SDV & UNECE R155 SecOC',
    protocols: 'Automotive Ethernet 100/1000BASE-T1 DoIP, SecOC',
    ecus: 'Zonal Controllers, 800V SiC Inverters, Qualcomm/Orin ADAS',
    arch: 'Central Compute + Zonal Gateways, OTA & Digital Key UWB',
  },
];

export const INITIAL_VEHICLE_DB: VehicleRecord[] = [
  { make: 'BMW', region: 'European', model: '3 Series E30 / E36', from: 1982, to: 1999, engines: 'M20 / M40 / M50 / S50', ecu: 'Bosch Motronic M1.3 / MS41', proto: 'OBD-I / ADS / K-Line', wmi: 'WBA' },
  { make: 'BMW', region: 'European', model: '3 / 5 Series E46 / E39 / E60', from: 1998, to: 2010, engines: 'M54 / N52 / M57 / N54', ecu: 'Siemens MS43 / MSV70 / MSD80', proto: 'KWP2000 / D-CAN 500k', wmi: 'WBA' },
  { make: 'BMW', region: 'European', model: '3 / 4 Series F30 / F32', from: 2012, to: 2019, engines: 'N20 / N55 / B48 / B58', ecu: 'Bosch MED17.1 / MEVD17.2 / MG1', proto: 'UDS / CAN-FD / ENET DoIP', wmi: 'WBA' },
  { make: 'BMW', region: 'European', model: 'G20 / G30 / G80 / i4 / iX', from: 2019, to: 2026, engines: 'B48 / B58 / S58 / eDrive 5.0', ecu: 'Bosch MG1CS201 / MD1CP002 / SME', proto: 'DoIP Ethernet / SecOC', wmi: 'WBA' },
  { make: 'Mercedes-Benz', region: 'European', model: '190E W201 / E-Class W124', from: 1982, to: 1996, engines: 'M102 / M103 / M104 / OM602', ecu: 'Bosch KE-Jetronic / HFM', proto: 'Blink Code / K-Line 38-pin', wmi: 'WDB' },
  { make: 'Mercedes-Benz', region: 'European', model: 'C/E/S W203 / W211 / W221', from: 2000, to: 2013, engines: 'M112 / M272 / M273 / OM642', ecu: 'Bosch ME2.8 / ME9.7 / EDC16', proto: 'KWP2000 / CAN-C', wmi: 'WDD' },
  { make: 'Mercedes-Benz', region: 'European', model: 'W205 / W213 / W206 / EQS', from: 2014, to: 2026, engines: 'M274 / M254 / M256 / eATS', ecu: 'Bosch MED17.7 / MG1CP002 / CPC', proto: 'UDS / CAN-FD / DoIP ZenZefi', wmi: 'W1K' },
  { make: 'Volkswagen', region: 'European', model: 'Golf Mk1 / Mk2 / Mk3 / Passat B3', from: 1980, to: 1998, engines: '1.6 / 1.8 / 2.0 / VR6 / TDI', ecu: 'Bosch Digifant / Motronic M2.9', proto: 'OBD-I / K-Line (KW1281)', wmi: 'WVW' },
  { make: 'Volkswagen', region: 'European', model: 'Golf Mk5 / Mk6 / Mk7 / Passat B6–B8', from: 2003, to: 2020, engines: '1.4 TSI / 2.0 TSI / 2.0 TDI', ecu: 'Bosch MED9.1 / MED17.5 / Simos 18', proto: 'TP2.0 / UDS CAN 500k', wmi: 'WVW' },
  { make: 'Volkswagen', region: 'European', model: 'Golf Mk8 / Tiguan / ID.4 / ID.7', from: 2020, to: 2026, engines: '1.5 eTSI / 2.0 TSI / APP550 EV', ecu: 'Bosch MG1CS011 / Simos 19 / ICAS1', proto: 'CAN-FD / DoIP / SFD2', wmi: 'WVW' },
  { make: 'Audi', region: 'European', model: '80 / 100 / A4 B5–B8 / A6 C5–C7', from: 1984, to: 2018, engines: '1.8T / 2.0 TFSI / 3.0 TDI', ecu: 'Bosch ME7.5 / MED17.1 / EDC17', proto: 'K-Line / TP2.0 / UDS', wmi: 'WAU' },
  { make: 'Audi', region: 'European', model: 'A4 B9 / Q8 / e-tron GT / Q6 e-tron', from: 2019, to: 2026, engines: 'EA888 Gen4 / PPE 800V EV', ecu: 'Bosch MG1CS002 / PPE VCU / HCP', proto: 'CAN-FD / DoIP / SFD2', wmi: 'WAU' },
  { make: 'Porsche', region: 'European', model: '911 (964/993/996/997/991/992) & Taycan', from: 1989, to: 2026, engines: '3.6 Flat-6 / 4.0 GT / 800V EV', ecu: 'Motronic M2.1 / SDI9 / MG1CS047', proto: 'K-Line / UDS / DoIP', wmi: 'WP0' },
  { make: 'Skoda', region: 'European', model: 'Octavia Mk1–Mk4 / Superb / Enyaq', from: 1996, to: 2026, engines: '1.4 TSI / 2.0 TDI / MEB EV', ecu: 'Simos / EDC17 / MG1 / ICAS', proto: 'K-Line / UDS / DoIP SFD', wmi: 'TMB' },
  { make: 'Land Rover', region: 'European', model: 'Defender / Range Rover L322–L460', from: 1987, to: 2026, engines: 'TD5 / 4.4 V8 / P400 / PHEV', ecu: 'Lucas 14CUX / MED17.8 / MG1', proto: 'K-Line / CAN / DoIP CCF', wmi: 'SAL' },
  { make: 'Volvo', region: 'European', model: '240 / 850 / XC60 / XC90 / EX90', from: 1980, to: 2026, engines: 'Redblock / B4204T / SPA2 EV', ecu: 'LH-Jetronic / Bosch ME7 / MG1', proto: 'Blink / CAN / DoIP Ethernet', wmi: 'YV1' },
  { make: 'Renault', region: 'European', model: 'Clio / Megane I–V / Austral EV', from: 1990, to: 2026, engines: 'K4M / 1.3 TCe / E-Tech EV', ecu: 'Siemens Sirius / EMS3155 / Valeo', proto: 'K-Line / CAN / DoIP SGW', wmi: 'VF1' },
  { make: 'Peugeot', region: 'European', model: '205 / 406 / 308 / 3008 / e-3008', from: 1983, to: 2026, engines: 'XU / EP6 / 1.5 BlueHDi / STLA EV', ecu: 'Bosch ME7.4 / MED17.4 / MD1CS003', proto: 'K-Line / CAN / DoIP SGW', wmi: 'VF3' },
  { make: 'Citroën', region: 'European', model: 'BX / Saxo / C4 / C5 / C5 Aircross', from: 1982, to: 2026, engines: 'XU / TU / PureTech / BlueHDi', ecu: 'Bosch ME7.4 / Valeo VD46 / MD1', proto: 'K-Line / CAN / DoIP SGW', wmi: 'VF7' },
  { make: 'Opel', region: 'European', model: 'Kadett / Corsa / Astra / Insignia / Mokka', from: 1982, to: 2026, engines: 'Ecotec / 1.4T / 1.6 CDTI / PureTech', ecu: 'Delco / Bosch ME7.6 / E98 / VD56', proto: 'KW82 / KWP2000 / GMLAN / UDS', wmi: 'W0L' },
  { make: 'Fiat', region: 'European', model: 'Uno / Punto / Tipo / 500e', from: 1983, to: 2026, engines: 'FIRE / MultiAir / MultiJet / EV', ecu: 'Marelli IAW 59F / 8GMF / 11MP', proto: 'K-Line / CAN / FCA SGW', wmi: 'ZFA' },
  { make: 'Toyota', region: 'Japanese', model: 'Corolla E80–E120 / Land Cruiser J70–J100', from: 1983, to: 2007, engines: '4A-GE / 1FZ-FE / 1ZZ / 2UZ-FE', ecu: 'Denso TCCS / Toyota 16-bit', proto: 'OBD-I TE1-E1 / ISO 9141-2', wmi: 'JT2' },
  { make: 'Toyota', region: 'Japanese', model: 'Camry / Corolla / Hilux / Land Cruiser J200–J300 / bZ4X', from: 2008, to: 2026, engines: '2GR-FE / A25A Hybrid / F33A / EV', ecu: 'Denso Gen2 / Gen3 / Gen4 RH850', proto: 'CAN 500k / CAN-FD / UDS', wmi: 'JTD' },
  { make: 'Lexus', region: 'Japanese', model: 'LS400 / IS250 / RX350 / NX / RZ450e', from: 1989, to: 2026, engines: '1UZ-FE / 2GR-FKS / Direct4 EV', ecu: 'Denso TCCS / Gen3 / HV-ECU', proto: 'OBD-I / CAN / CAN-FD', wmi: 'JTH' },
  { make: 'Honda', region: 'Japanese', model: 'Civic / Accord (EF/EG/EK/EP/FD/FE/FL)', from: 1984, to: 2026, engines: 'D16 / B16 / K20A / L15B / e:HEV', ecu: 'Keihin OBD0/1 / Keihin SH7058 / Bosch', proto: 'DLC 2-pin / K-Line / CAN-FD', wmi: 'JHM' },
  { make: 'Nissan', region: 'Japanese', model: 'Sunny / Skyline / Patrol / Qashqai / Ariya', from: 1982, to: 2026, engines: 'SR20 / RB26 / VQ35 / VR30 / e-POWER', ecu: 'Nissan ECCS Consult I / Hitachi SH', proto: 'Consult DDL / K-Line / CAN-FD', wmi: 'JN1' },
  { make: 'Infiniti', region: 'Japanese', model: 'G35 / FX35 / Q50 / QX60 / QX80', from: 1990, to: 2026, engines: 'VQ35 / VR30DDTT / KR20DDET', ecu: 'Hitachi MEC / Bosch', proto: 'K-Line / CAN / UDS SGW', wmi: 'JNK' },
  { make: 'Mazda', region: 'Japanese', model: 'RX-7 / 3 / 6 / CX-5 / CX-60 / CX-90', from: 1980, to: 2026, engines: '13B / Skyactiv-G / Skyactiv-X', ecu: 'Denso / Mitsubishi E6T', proto: 'OBD-I / CAN 500k / UDS', wmi: 'JM1' },
  { make: 'Subaru', region: 'Japanese', model: 'Impreza WRX / Forester / Outback / Solterra', from: 1985, to: 2026, engines: 'EJ20 / EJ25 / FA24 / e-Boxer', ecu: 'Denso / Hitachi SH7058 / RH850', proto: 'SSM-I / SSM-II / CAN-FD', wmi: 'JF1' },
  { make: 'Mitsubishi', region: 'Japanese', model: 'Lancer Evo / Pajero / Outlander PHEV', from: 1982, to: 2026, engines: '4G63 / 6G72 / 4B11 / PHEV', ecu: 'Melco / Denso MH8304F', proto: 'MUT-I / MUT-II / CAN UDS', wmi: 'JA3' },
  { make: 'Suzuki', region: 'Japanese', model: 'Swift / Vitara / Jimny (SJ410 – JB74)', from: 1981, to: 2026, engines: 'G13B / M16A / K15B / Boosterjet', ecu: 'Denso / Bosch ME17.9.6', proto: 'SDL / K-Line / CAN 500k', wmi: 'JS2' },
  { make: 'Hyundai', region: 'Korean', model: 'Excel / Accent / Elantra / Sonata (1985–2010)', from: 1985, to: 2010, engines: 'Alpha / Beta / Theta / CRDi', ecu: 'Kefico / Bosch M7.9.8 / EDC16', proto: 'OBD-I / ISO 9141 / KWP2000', wmi: 'KMH' },
  { make: 'Hyundai', region: 'Korean', model: 'Elantra CN7 / Tucson / Palisade / Ioniq 5 & 6', from: 2011, to: 2026, engines: 'Gamma / Smartstream / E-GMP 800V', ecu: 'Continental SIM2K-250 / MEG17.9 / VCU', proto: 'UDS / CAN-FD / DoIP', wmi: 'KMH' },
  { make: 'Kia', region: 'Korean', model: 'Cerato / Sportage / Sorento / EV6 / EV9', from: 1992, to: 2026, engines: '1.6 GDI / 2.5T / E-GMP 800V EV', ecu: 'Kefico CPEGD / SIM2K / BMS', proto: 'K-Line / CAN / CAN-FD', wmi: 'KNA' },
  { make: 'Genesis', region: 'Korean', model: 'G70 / G80 / GV70 / GV80 / GV60 EV', from: 2015, to: 2026, engines: '3.3T / 3.5T / E-GMP Dual Motor', ecu: 'Bosch MG1 / Continental / VCU', proto: 'CAN-FD / DoIP SecOC', wmi: 'KMT' },
  { make: 'Ford', region: 'American', model: 'Mustang Fox / Crown Vic / F-150 (1980–2004)', from: 1980, to: 2004, engines: '5.0 Windsor / 4.6 Modular / 7.3L', ecu: 'Ford EEC-IV / EEC-V', proto: 'OBD-I / J1850 PWM', wmi: '1FA' },
  { make: 'Ford', region: 'American', model: 'Mustang S550–S650 / F-150 / Bronco / Mach-E', from: 2005, to: 2026, engines: 'EcoBoost / 5.0 Coyote / EV', ecu: 'Bosch MEDG17 / MG1CS015 / BECM', proto: 'HS-CAN / MS-CAN / CAN-FD DoIP', wmi: '1FT' },
  { make: 'Chevrolet', region: 'American', model: 'Camaro / Corvette / Silverado / Blazer EV', from: 1980, to: 2026, engines: 'SBC 350 / LS1–LT4 / Ultium EV', ecu: 'GM Delco / E38 / E92 / E99', proto: 'ALDL / J1850 VPW / GMLAN / VIP DoIP', wmi: '1G1' },
  { make: 'GMC / Cadillac', region: 'American', model: 'Yukon / Sierra / Escalade / Lyriq EV', from: 1988, to: 2026, engines: 'Vortec / L87 6.2L / Ultium EV', ecu: 'GM E38 / E90 / VIP Global B', proto: 'ALDL / GMLAN / Ethernet VIP', wmi: '1GY' },
  { make: 'Jeep / Dodge / Chrysler', region: 'American', model: 'Cherokee XJ–WL / Wrangler / Charger / Ram', from: 1984, to: 2026, engines: '4.0 I6 / 5.7 Hemi / 6.2 Hellcat / Hurricane', ecu: 'Chrysler SBEC / NGC / GPEC2A / GPEC5', proto: 'CCD / SCI / CAN / FCA SGW', wmi: '1C4' },
  { make: 'Tesla', region: 'American', model: 'Model S / Model 3 / Model X / Model Y / Cybertruck', from: 2012, to: 2026, engines: 'AC Induction / IPM-SynRM 400V–800V', ecu: 'MCU1–3 / BMS / DI / VCFront-Left-Right', proto: 'Tesla CAN / Ethernet DoIP / 48V LV', wmi: '5YJ' },
  { make: 'BYD', region: 'Chinese / EV', model: 'F3 / Tang / Han / Atto 3 / Seal / Yangwang', from: 2006, to: 2026, engines: 'DM-i Hybrid / e-Platform 3.0 Blade EV', ecu: 'BYD VCU / BMS / e-Axle 8-in-1', proto: 'CAN / CAN-FD / DoIP', wmi: 'LGX' },
  { make: 'Geely', region: 'Chinese / EV', model: 'Emgrand / Coolray / Monjaro / Galaxy E8', from: 2008, to: 2026, engines: '1.5TD / 2.0TD / SEA EV', ecu: 'Bosch MED17 / MG1 / ZEEKR VCU', proto: 'CAN / CAN-FD / DoIP', wmi: 'L6T' },
  { make: 'Chery', region: 'Chinese / EV', model: 'Tiggo 4 / Tiggo 7 / Tiggo 8 Pro / Omoda / Jetour T2', from: 2005, to: 2026, engines: 'ACTECO 1.5T / 1.6TGDI / 2.0T / PHEV', ecu: 'Bosch ME17 / MED17.8.10 / MG1', proto: 'K-Line / CAN / UDS', wmi: 'LVV' },
  { make: 'MG', region: 'Chinese / EV', model: 'MG5 / MG6 / ZS / HS / MG4 EV', from: 2010, to: 2026, engines: '1.5T / NetBlue / MSP EV', ecu: 'UAES MED17 / MG1 / SAIC BMS', proto: 'CAN / CAN-FD / DoIP', wmi: 'LSJ' },
  { make: 'Changan / Haval', region: 'Chinese / EV', model: 'UNI-T / UNI-K / Jolion / Haval H6', from: 2012, to: 2026, engines: 'BlueCore NE1.5T / GW4B15 / DHT', ecu: 'Bosch MG1 / Delphi MT92 / Continental', proto: 'CAN / CAN-FD / UDS SGW', wmi: 'LS4' },
  { make: 'Lada', region: 'Russian', model: '2104 / 2105 / 2107 / Niva 2121 (Classic & 4x4)', from: 1980, to: 2012, engines: '1.3 / 1.5 / 1.6 / 1.7i (21214)', ecu: 'GM TBI / Bosch M1.5.4 / Yanvar 5.1 / M7.9.7', proto: 'ALDL / K-Line (ISO 9141-2)', wmi: 'XTA' },
  { make: 'Lada', region: 'Russian', model: 'Samara (2108–2115) / 110 / 111 / 112', from: 1984, to: 2014, engines: '1.3 / 1.5 / 1.6 8V & 16V (21114/21124)', ecu: 'Yanvar 5.1 / 7.2 / Bosch MP7.0 / M7.9.7', proto: 'K-Line (ISO 9141-2 / KWP2000)', wmi: 'XTA' },
  { make: 'Lada', region: 'Russian', model: 'Kalina / Priora / Granta / Largus', from: 2004, to: 2026, engines: '1.6 8V (11186/11182) / 1.6 16V (21127) / EV', ecu: 'Bosch ME17.9.7 / Itelma M74 / M74.9 / EMS3120', proto: 'KWP2000 / CAN 500k / UDS', wmi: 'XTA' },
  { make: 'Lada', region: 'Russian', model: 'Vesta / XRAY / Niva Travel / Iskra / Aura', from: 2015, to: 2026, engines: '1.6 (21129) / 1.8 EVO (21179) / H4M', ecu: 'Itelma M86 / M74M / M74.9 / EMS3125', proto: 'CAN 500k / UDS (ISO 14229)', wmi: 'XTA' },
];

export const INITIAL_PARTS_CATALOG: PartCatalogItem[] = [
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Control Module (ECU)', name: 'ECM / DME Engine Control Unit', bus: 'CAN / CAN-FD / K-Line', spec: '12V Supply | 5V Sensor Ref (±0.05V)', span: '1980–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Control Module (ECU)', name: 'Lada AvtoVAZ ECM (Yanvar 5.1/7.2, Bosch ME17.9.7, Itelma M74/M86)', bus: 'K-Line / CAN 500k', spec: 'K-Line Pin 7 / CAN 6-14 | e-Gas & IMMO EEPROM', span: '1994–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Sensor / Transducer', name: 'Crankshaft Position Sensor (CKP)', bus: 'Hall 5V / Inductive VR', spec: 'VR: 450–1200 Ω | Hall: 0–5V Square Wave', span: '1982–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Sensor / Transducer', name: 'Camshaft Position Sensor (CMP)', bus: 'Hall Digital 5V/3.3V', spec: 'Phase Sync ±1.5° Crank', span: '1990–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Sensor / Transducer', name: 'MAF / MAP Manifold Pressure & Mass Air', bus: 'Analog 0–5V / SENT / LIN', spec: 'Idle MAP: 28–42 kPa | Baro: 101 kPa', span: '1980–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Sensor / Transducer', name: 'Oxygen / Wideband Lambda Sensor (O2)', bus: 'Heater PWM + Nernst/Pump Cell', spec: 'Narrow: 0.1–0.9V | LSU 4.9 Lambda 1.00', span: '1980–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Actuator / Solenoid', name: 'Electronic Throttle Body (ETB) + Dual TPS', bus: 'H-Bridge PWM + Dual Inverted 5V', spec: 'TPS1+TPS2 = 5.0V Sum Check', span: '2000–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Actuator / Solenoid', name: 'GDI High-Pressure Fuel Injector (Piezo/Solenoid)', bus: '65V–180V Peak & Hold', spec: 'Solenoid: 1.2–2.4 Ω | Piezo: 180–210 kΩ', span: '2007–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Actuator / Solenoid', name: 'Ignition Coil-on-Plug (COP) & Power Stage', bus: '5V/12V Trigger + Ion-Sense', spec: 'Primary 0.5–1.2 Ω | Dwell 2.2–3.5 ms', span: '1995–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Actuator / Solenoid', name: 'Turbo Wastegate / VGT Smart Actuator', bus: 'PWM / CAN / SENT', spec: 'Position Calibration 0–100% Travel', span: '2004–2026' },
  { sys: '01. Engine Management (ICE/Hybrid)', cat: 'Mechanical / Wear Part', name: 'High-Pressure Fuel Pump (HPFP) & Cam Follower', bus: 'Spill Valve PWM', spec: 'Rail Pressure: 40–350 bar (GDI) / 2500 bar (CRDi)', span: '2004–2026' },
  { sys: '02. Transmission & Drivetrain', cat: 'Control Module (ECU)', name: 'TCU / Mechatronic Module (ZF 6HP/8HP, DSG, CVT)', bus: 'CAN-FD / FlexRay', spec: 'ATF Temp Range -40 to +145 °C', span: '1992–2026' },
  { sys: '02. Transmission & Drivetrain', cat: 'Actuator / Solenoid', name: 'EDS Proportional Pressure & Shift Solenoids', bus: 'Current-Controlled PWM (0–1.2A)', spec: '5.0–5.6 Ω @ 20 °C', span: '1994–2026' },
  { sys: '02. Transmission & Drivetrain', cat: 'Sensor / Transducer', name: 'Input / Output Turbine Speed & Clutch Pressure', bus: 'Hall / SENT', spec: 'Kiss-Point Adaptation ±25 mbar', span: '1995–2026' },
  { sys: '02. Transmission & Drivetrain', cat: 'Mechanical / Wear Part', name: 'Dual-Clutch Pack / Torque Converter Lockup / Haldex Pump', bus: 'PWM Clutch Control', spec: 'Fill Time 15–45 ms', span: '1988–2026' },
  { sys: '03. High-Voltage EV / Hybrid & BMS', cat: 'Control Module (ECU)', name: 'BMS Battery Management & Cell Supervisors (CSC)', bus: 'IsoSPI / CAN-FD', spec: 'Cell Delta < 15 mV | Pack 350–900 VDC', span: '2010–2026' },
  { sys: '03. High-Voltage EV / Hybrid & BMS', cat: 'HV / Safety Device', name: 'Traction Inverter / SiC MCU (DC-to-3Phase AC)', bus: 'CAN-FD / Resolver', spec: 'Insulation Resistance > 500 Ω/V', span: '2004–2026' },
  { sys: '03. High-Voltage EV / Hybrid & BMS', cat: 'HV / Safety Device', name: 'Main HV Contactors, Pre-Charge & HVIL Loop', bus: '12V Coil + HVIL Sense', spec: 'HVIL Loop Continuity < 5 Ω', span: '2004–2026' },
  { sys: '03. High-Voltage EV / Hybrid & BMS', cat: 'HV / Safety Device', name: 'On-Board Charger (OBC 11–22kW) & DC-DC Converter', bus: 'CAN / PLC ISO 15118', spec: 'LV Output 13.8–14.5V (or 48V)', span: '2010–2026' },
  { sys: '04. Braking, Stability & EPB', cat: 'Control Module (ECU)', name: 'ABS / DSC / ESP Hydraulic Control Unit', bus: 'CAN-C / FlexRay', spec: 'Pump Motor Current 15–35A Peak', span: '1985–2026' },
  { sys: '04. Braking, Stability & EPB', cat: 'Sensor / Transducer', name: 'Active Wheel Speed Sensor (WSS - GMR/Hall)', bus: '7mA / 14mA Current Loop', spec: 'Direction + Air Gap Pulse Encoding', span: '1985–2026' },
  { sys: '04. Braking, Stability & EPB', cat: 'Sensor / Transducer', name: '6-Axis IMU (Yaw Rate & Lateral/Longitudinal G)', bus: 'Private CAN', spec: 'Zero-Point Calibration ±0.1°/s', span: '1998–2026' },
  { sys: '04. Braking, Stability & EPB', cat: 'Actuator / Solenoid', name: 'EPB Electric Parking Brake Caliper Actuator & iBooster', bus: 'CAN / Motor H-Bridge', spec: 'Retract/Service Mode 12V 8–18A', span: '2005–2026' },
  { sys: '05. Steering & Chassis Dynamics', cat: 'Control Module (ECU)', name: 'EPS Electric Power Steering Rack & Torque Sensor', bus: 'CAN-FD / FlexRay', spec: 'Torque Balance ±0.1 Nm | End-Stop Learn', span: '2002–2026' },
  { sys: '05. Steering & Chassis Dynamics', cat: 'Sensor / Transducer', name: 'Steering Angle Sensor (SAS Optical/AMR)', bus: 'CAN / SZL Clockspring', spec: 'Range ±780° | Resolution 0.1°', span: '1998–2026' },
  { sys: '05. Steering & Chassis Dynamics', cat: 'Actuator / Solenoid', name: 'Air Suspension Compressor, Valve Block & Height Sensors', bus: 'CAN / LIN / 5V Hall', spec: 'Tank Pressure 10–16 bar | Level Cal mm', span: '1994–2026' },
  { sys: '06. Restraints & Passive Safety (SRS)', cat: 'Control Module (ECU)', name: 'SRS / ACSM Airbag & EDR Crash Recorder', bus: 'CAN-B / K-Line', spec: 'Backup Cap Reserve ≥ 150 ms', span: '1988–2026' },
  { sys: '06. Restraints & Passive Safety (SRS)', cat: 'HV / Safety Device', name: 'Airbag Squibs, Pretensioners & Battery Pyrofuse', bus: 'Twisted Pair 2-Wire', spec: 'Normal Resistance: 1.8 – 3.2 Ω', span: '1988–2026' },
  { sys: '06. Restraints & Passive Safety (SRS)', cat: 'Sensor / Transducer', name: 'Satellite Crash Sensors (PSI5 Acceleration/Pressure)', bus: 'PSI5 Current Modulated', spec: 'Manchester Sync @ 125 kbps', span: '2000–2026' },
  { sys: '07. ADAS, Radar & Autonomous Vision', cat: 'Sensor / Transducer', name: 'Long-Range 77GHz Front Radar & Corner BSD Radars', bus: 'CAN-FD / Ethernet', spec: 'Azimuth Align ±0.50° | Target 1.2m', span: '2010–2026' },
  { sys: '07. ADAS, Radar & Autonomous Vision', cat: 'Sensor / Transducer', name: 'Forward Mono/Stereo Camera (KAFAS / Mobileye / Orin)', bus: 'LVDS / 100BASE-T1', spec: 'Static Target / Dynamic Lane Cal', span: '2012–2026' },
  { sys: '07. ADAS, Radar & Autonomous Vision', cat: 'Sensor / Transducer', name: 'Ultrasonic PDC Park Sensors & 360° Surround Cameras', bus: 'LIN / DSI3 / GMSL2', spec: '48 kHz Echo / Coax 6V Phantom', span: '1999–2026' },
  { sys: '08. Immobilizer, Security & Access', cat: 'Control Module (ECU)', name: 'IMMO / CAS / FEM / BDC / SGW Security Gateway', bus: 'CAN / DoIP / LIN', spec: 'AES-128 / Hitag-Pro / SecOC', span: '1995–2026' },
  { sys: '08. Immobilizer, Security & Access', cat: 'Control Module (ECU)', name: 'Lada APS-4 / APS-6 / ЦБКЭ Immobilizer & Smart Key Module', bus: 'K-Line / LIN / CAN', spec: 'Master Red Key + PCF7936/7941 Learning', span: '1997–2026' },
  { sys: '08. Immobilizer, Security & Access', cat: 'Sensor / Transducer', name: 'PEPS LF Antennas (125kHz), UWB & Digital Key BLE', bus: 'LIN / CAN-FD', spec: 'UWB ToF ±10 cm Relay Protection', span: '2006–2026' },
  { sys: '08. Immobilizer, Security & Access', cat: 'Actuator / Solenoid', name: 'ELV Electronic Steering Column Lock', bus: 'LIN / Encrypted K-Line', spec: 'Lock/Unlock Bolt Position Hall', span: '2005–2026' },
  { sys: '09. Body Control & Comfort (BCM)', cat: 'Control Module (ECU)', name: 'BCM / Zonal Body Controller & Smart Junction Box', bus: 'CAN-B / LIN / Ethernet', spec: 'eFuse Solid-State Overcurrent Trip', span: '1992–2026' },
  { sys: '09. Body Control & Comfort (BCM)', cat: 'Actuator / Solenoid', name: 'HVAC Blend Doors, Blower PWM & Electric A/C Compressor', bus: 'LIN / HV CAN', spec: 'Auto Flap Normalization End-Stops', span: '1985–2026' },
  { sys: '10. Lighting & Matrix Vision', cat: 'Control Module (ECU)', name: 'Matrix LED / Laser Headlight Driver & AFS', bus: 'Private CAN / LIN', spec: 'Pixel LED Binning & Leveling Zero', span: '2004–2026' },
  { sys: '11. Infotainment, Cluster & Telematics', cat: 'Control Module (ECU)', name: 'Digital Instrument Cluster (KOMBI) / IVI Head Unit / eCall', bus: 'MOST / Ethernet / CAN', spec: 'Component Protection + Odometer Sync', span: '1986–2026' },
  { sys: '12. Fuel, Exhaust & Emissions', cat: 'Sensor / Transducer', name: 'NOx Sensors, DPF Differential Pressure & EGT', bus: 'CAN / 0–5V', spec: 'DPF Soot Load < 35g | Regen 620 °C', span: '2005–2026' },
  { sys: '12. Fuel, Exhaust & Emissions', cat: 'Actuator / Solenoid', name: 'SCR AdBlue Dosing Injector & Tank Heater/Level', bus: 'CAN / PWM', spec: 'Urea Concentration 32.5% Quality', span: '2010–2026' },
  { sys: '13. Thermal Management & Cooling', cat: 'Actuator / Solenoid', name: 'Electric Water Pump, Coolant Multi-Valve & Active Grille', bus: 'LIN / BSD / PWM', spec: '8-Way Heat Pump Valve Sweep', span: '2006–2026' },
  { sys: '14. Networking, Gateways & Power', cat: 'Control Module (ECU)', name: 'Central Gateway (CGW/ZGW), IBS Battery Sensor & LIN Alternator', bus: 'DoIP / CAN-FD / LIN', spec: 'Quiescent Draw < 35 mA | SOH/SOC %', span: '2003–2026' },
];

export const BASE_CORE_NODES: Omit<CoreNode, 'dtc'>[] = [
  { id: '0x7E0', name: 'ECM / DME (Engine)', bus: 'CAN-FD', status: 'Online', voltage: '13.7V' },
  { id: '0x7E1', name: 'TCU / Mechatronic', bus: 'CAN-FD', status: 'Online', voltage: '13.7V' },
  { id: '0x760', name: 'ABS / DSC / ESP', bus: 'CAN-C', status: 'Online', voltage: '13.6V' },
  { id: '0x740', name: 'BCM / ZGW Gateway', bus: 'DoIP', status: 'Online', voltage: '13.7V' },
  { id: '0x750', name: 'SRS / Airbag EDR', bus: 'CAN-B', status: 'Online', voltage: '13.5V' },
  { id: '0x730', name: 'IMMO / PEPS / ELV', bus: 'CAN-B', status: 'Online', voltage: '13.7V' },
  { id: '0x720', name: 'Instrument Cluster', bus: 'CAN-B', status: 'Online', voltage: '13.7V' },
  { id: '0x710', name: 'EPS Steering / SAS', bus: 'CAN-C', status: 'Online', voltage: '13.6V' },
  { id: '0x7A0', name: 'Front ADAS Radar', bus: 'CAN-FD', status: 'Online', voltage: '13.5V' },
  { id: '0x7A4', name: 'ADAS Forward Camera', bus: 'DoIP', status: 'Online', voltage: '13.5V' },
  { id: '0x770', name: 'EPB Parking Brake', bus: 'CAN-C', status: 'Online', voltage: '13.6V' },
  { id: '0x780', name: 'Air Suspension / HV BMS', bus: 'CAN-C', status: 'Online', voltage: '13.7V' },
  { id: '0x012', name: 'Alternator / IBS', bus: 'LIN-1', status: 'Online', voltage: '13.8V' },
  { id: '0x7B0', name: 'Rear Radar / BSD', bus: 'CAN-FD', status: 'Missing', voltage: '0.0V' },
];

export const INITIAL_DTCS: DtcItem[] = [
  {
    nodeId: '0x7E0',
    mod: 'ECM (MED17.1)',
    code: 'P0171',
    type: 'Pending',
    desc: 'System Too Lean (Bank 1)',
    ff: 'RPM: 1840 | Load: 34% | Temp: 86°C | STFT: +18.2%',
  },
  {
    nodeId: '0x750',
    mod: 'SRS / Airbag',
    code: 'B1193',
    type: 'Historical',
    desc: 'Crash Event Storage Full (EDR)',
    ff: 'Batt: 12.1V | Ign Cycles: 4 | Speed: 0 km/h',
  },
];

export const NRC_TABLE: Record<string, string> = {
  '11': 'serviceNotSupported',
  '12': 'subFunctionNotSupported',
  '22': 'conditionsNotCorrect',
  '31': 'requestOutOfRange',
  '33': 'securityAccessDenied',
  '35': 'invalidKey',
  '78': 'responsePending',
};

export function getBusNodesForVehicle(
  year: number,
  proto: string,
  dtcs: DtcItem[],
  vciConnected: boolean,
  ecuOnline: boolean,
  battVolts: number
): CoreNode[] {
  const isLegacy = year <= 1995;
  const isObd2 = year >= 1996 && year <= 2004;
  const isModernEvOrZonal = year >= 2023 || proto.includes('DoIP');

  return BASE_CORE_NODES.map((node) => {
    const dtcCount = dtcs.filter((d) => d.nodeId === node.id).length;
    const vStr = vciConnected && ecuOnline ? `${battVolts.toFixed(1)}V` : '0.0V';

    if (!vciConnected) {
      return { ...node, status: 'Offline', dtc: 0, voltage: '0.0V' };
    }

    if (!ecuOnline) {
      return { ...node, status: 'Waiting', dtc: 0, voltage: '0.0V' };
    }

    if (isLegacy) {
      if (node.id === '0x7E0') return { ...node, bus: 'K-Line / OBD-I', dtc: dtcCount, voltage: vStr };
      if (node.id === '0x760' || node.id === '0x750') return { ...node, bus: 'Blink / K-Line', dtc: dtcCount, voltage: vStr };
      if (node.id.startsWith('0x7A') || node.id === '0x7B0' || node.id === '0x770' || node.id === '0x780') {
        return { ...node, bus: 'N/A (Pre-CAN)', status: 'Missing', dtc: 0, voltage: '0.0V' };
      }
      return { ...node, bus: 'Discrete', dtc: dtcCount, voltage: vStr };
    }

    if (isObd2) {
      if (node.id.startsWith('0x7A') || node.id === '0x7B0') {
        return { ...node, bus: 'N/A (Pre-ADAS)', status: 'Missing', dtc: 0, voltage: '0.0V' };
      }
      return {
        ...node,
        bus: node.bus.includes('FD') || node.bus === 'DoIP' ? 'ISO 9141 / KWP' : 'CAN 125k',
        dtc: dtcCount,
        voltage: vStr,
      };
    }

    if (isModernEvOrZonal) {
      return {
        ...node,
        bus: node.id === '0x740' || node.id === '0x7A4' ? '100BASE-T1 DoIP' : node.bus,
        dtc: dtcCount,
        voltage: node.status === 'Missing' ? '0.0V' : vStr,
      };
    }

    return {
      ...node,
      dtc: dtcCount,
      voltage: node.status === 'Missing' ? '0.0V' : vStr,
    };
  });
}

export function createDefaultCalibrationMaps(ecuName: string): CalibrationMapTable[] {
  const clone2d = (m: number[][]) => m.map((r) => [...r]);

  const driverWishStock = [
    [35, 55, 80, 105, 130, 155],
    [40, 75, 115, 160, 205, 245],
    [45, 95, 155, 220, 285, 340],
    [45, 110, 185, 265, 340, 395],
    [40, 115, 195, 275, 350, 405],
  ];

  const boostTargetStock = [
    [1020, 1050, 1120, 1240, 1380, 1480],
    [1040, 1120, 1280, 1480, 1690, 1840],
    [1050, 1180, 1410, 1680, 1920, 2080],
    [1050, 1210, 1450, 1740, 1980, 2120],
    [1040, 1190, 1420, 1690, 1910, 2020],
  ];

  const ignitionTimingStock = [
    [14.0, 16.5, 19.0, 22.0, 24.5, 26.0],
    [12.5, 14.0, 16.5, 18.0, 19.5, 20.5],
    [10.0, 11.5, 13.0, 14.5, 15.5, 16.5],
    [8.0, 9.0, 10.5, 11.5, 12.5, 13.5],
    [6.5, 7.5, 8.5, 9.5, 10.5, 11.5],
  ];

  const railPressureStock = [
    [45, 60, 85, 110, 135, 155],
    [50, 80, 115, 145, 175, 195],
    [55, 95, 135, 170, 195, 215],
    [60, 105, 150, 185, 210, 230],
    [60, 110, 155, 190, 215, 235],
  ];

  return [
    {
      id: 'torque',
      name: `Driver Wish Torque (${ecuName})`,
      unit: 'Nm',
      xLabel: 'Pedal %',
      yLabel: 'RPM',
      xAxis: ['10%', '25%', '45%', '65%', '85%', '100%'],
      yAxis: ['1000', '2000', '3500', '5000', '6500'],
      stock: driverWishStock,
      current: clone2d(driverWishStock),
      minVal: 10,
      maxVal: 650,
      step: 5,
    },
    {
      id: 'boost',
      name: 'Target Boost Pressure (MAP)',
      unit: 'mbar',
      xLabel: 'Load %',
      yLabel: 'RPM',
      xAxis: ['20%', '35%', '50%', '70%', '85%', '100%'],
      yAxis: ['1500', '2500', '3500', '5000', '6200'],
      stock: boostTargetStock,
      current: clone2d(boostTargetStock),
      minVal: 950,
      maxVal: 2800,
      step: 25,
    },
    {
      id: 'spark',
      name: 'Base Ignition Timing Advance',
      unit: '°BTDC',
      xLabel: 'RPM',
      yLabel: 'Load %',
      xAxis: ['1200', '2200', '3200', '4400', '5600', '6600'],
      yAxis: ['25%', '45%', '65%', '85%', '100%'],
      stock: ignitionTimingStock,
      current: clone2d(ignitionTimingStock),
      minVal: -5,
      maxVal: 42,
      step: 0.5,
    },
    {
      id: 'rail',
      name: 'GDI / Rail Fuel Pressure Target',
      unit: 'bar',
      xLabel: 'Fuel Mass',
      yLabel: 'RPM',
      xAxis: ['15mg', '30mg', '45mg', '60mg', '75mg', '90mg'],
      yAxis: ['1000', '2000', '3200', '4800', '6400'],
      stock: railPressureStock,
      current: clone2d(railPressureStock),
      minVal: 30,
      maxVal: 350,
      step: 5,
    },
  ];
}
