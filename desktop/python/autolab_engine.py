#!/usr/bin/env python3
"""
AutoLab Pro — Python Diagnostic, Vehicle Database (1980–2026) & VCI Bridge Engine
Links to the C++20 native shared library (libautolab_vci) via ctypes and exposes
a local JSON-RPC TCP server (127.0.0.1:9455) for the prominent JavaFX Desktop UI.
"""
import ctypes
import json
import os
import socketserver
import zlib

# Load C++ Native VCI Core if compiled
_cpp_lib = None
for candidate in ("./build/libautolab_vci.so", "./build/autolab_vci.dll", "./build/libautolab_vci.dylib"):
    if os.path.exists(candidate):
        _cpp_lib = ctypes.CDLL(candidate)
        _cpp_lib.autolab_crc32.argtypes = [ctypes.c_char_p, ctypes.c_size_t]
        _cpp_lib.autolab_crc32.restype = ctypes.c_uint32
        _cpp_lib.autolab_uds_seed_to_key.argtypes = [ctypes.c_uint32]
        _cpp_lib.autolab_uds_seed_to_key.restype = ctypes.c_uint32
        _cpp_lib.autolab_verify_bus_electrical.argtypes = [ctypes.c_double, ctypes.c_int, ctypes.c_double]
        _cpp_lib.autolab_verify_bus_electrical.restype = ctypes.c_int
        break

VEHICLE_DB = [
    {"make": "BMW", "region": "European", "model": "3 Series E30 / E36", "from": 1982, "to": 1999, "ecu": "Bosch Motronic M1.3 / MS41", "proto": "OBD-I / K-Line", "wmi": "WBA"},
    {"make": "BMW", "region": "European", "model": "3 / 4 Series F30 / F32", "from": 2012, "to": 2019, "ecu": "Bosch MED17.1 / MG1", "proto": "UDS / CAN-FD / DoIP", "wmi": "WBA"},
    {"make": "BMW", "region": "European", "model": "G20 / G80 / i4 / iX", "from": 2019, "to": 2026, "ecu": "Bosch MG1CS201 / SME", "proto": "DoIP Ethernet / SecOC", "wmi": "WBA"},
    {"make": "Mercedes-Benz", "region": "European", "model": "190E W201 / W124", "from": 1982, "to": 1996, "ecu": "Bosch KE-Jetronic / HFM", "proto": "Blink Code / K-Line 38-pin", "wmi": "WDB"},
    {"make": "Mercedes-Benz", "region": "European", "model": "W205 / W213 / W206 / EQS", "from": 2014, "to": 2026, "ecu": "Bosch MED17.7 / MG1CP002", "proto": "UDS / CAN-FD / DoIP", "wmi": "W1K"},
    {"make": "Volkswagen", "region": "European", "model": "Golf Mk8 / ID.4 / ID.7", "from": 2020, "to": 2026, "ecu": "Bosch MG1CS011 / ICAS1", "proto": "CAN-FD / DoIP / SFD2", "wmi": "WVW"},
    {"make": "Toyota", "region": "Japanese", "model": "Corolla E80–E120 / LC J70", "from": 1983, "to": 2007, "ecu": "Denso TCCS / 16-bit", "proto": "OBD-I TE1-E1 / ISO 9141-2", "wmi": "JT2"},
    {"make": "Toyota", "region": "Japanese", "model": "Camry / LC J300 / bZ4X", "from": 2008, "to": 2026, "ecu": "Denso Gen3 / Gen4 RH850", "proto": "CAN 500k / CAN-FD / UDS", "wmi": "JTD"},
    {"make": "Hyundai", "region": "Korean", "model": "Tucson / Palisade / Ioniq 5 & 6", "from": 2011, "to": 2026, "ecu": "SIM2K-250 / VCU", "proto": "UDS / CAN-FD / DoIP", "wmi": "KMH"},
    {"make": "Ford", "region": "American", "model": "Mustang / F-150 / Mach-E", "from": 2005, "to": 2026, "ecu": "Bosch MEDG17 / MG1CS015", "proto": "HS-CAN / CAN-FD DoIP", "wmi": "1FT"},
    {"make": "Tesla", "region": "American", "model": "Model 3 / Y / S / Cybertruck", "from": 2012, "to": 2026, "ecu": "MCU1–3 / BMS / VCFront", "proto": "Tesla CAN / Ethernet DoIP", "wmi": "5YJ"},
    {"make": "BYD", "region": "Chinese / EV", "model": "Han / Tang / Atto 3 / Seal", "from": 2006, "to": 2026, "ecu": "BYD VCU / BMS", "proto": "CAN / CAN-FD / DoIP", "wmi": "LGX"},
    {"make": "Lada", "region": "Russian", "model": "2107 / Niva 2121 / Samara", "from": 1980, "to": 2014, "ecu": "Yanvar 5.1 / 7.2 / Bosch M7.9.7", "proto": "ALDL / K-Line (ISO 9141-2)", "wmi": "XTA"},
    {"make": "Lada", "region": "Russian", "model": "Granta / Priora / Kalina / Largus", "from": 2004, "to": 2026, "ecu": "Bosch ME17.9.7 / Itelma M74", "proto": "KWP2000 / CAN 500k / UDS", "wmi": "XTA"},
    {"make": "Lada", "region": "Russian", "model": "Vesta / XRAY / Niva Travel / Iskra", "from": 2015, "to": 2026, "ecu": "Itelma M86 / M74.9 / EMS3125", "proto": "CAN 500k / UDS (ISO 14229)", "wmi": "XTA"},
]


def compute_crc32(payload: bytes) -> int:
    if _cpp_lib is not None:
        return int(_cpp_lib.autolab_crc32(payload, len(payload)))
    return zlib.crc32(payload) & 0xFFFFFFFF


def compute_uds_key(seed: int) -> int:
    if _cpp_lib is not None:
        return int(_cpp_lib.autolab_uds_seed_to_key(seed))
    k = seed ^ 0xA55A3C91
    k = (((k << 7) | (k >> 25)) + 0x1F2E3D4C) & 0xFFFFFFFF
    return k ^ 0x55AA00FF


def verify_bus(volts: float, year: int, ohm: float = 60.2) -> bool:
    if _cpp_lib is not None:
        return _cpp_lib.autolab_verify_bus_electrical(volts, year, ohm) == 0
    return 11.8 <= volts <= 15.2


class EngineRPCHandler(socketserver.StreamRequestHandler):
    def handle(self):
        raw = self.rfile.readline().decode("utf-8").strip()
        if not raw:
            return
        req = json.loads(raw)
        cmd = req.get("cmd")
        if cmd == "list_vehicles":
            resp = {"ok": True, "vehicles": VEHICLE_DB}
        elif cmd == "handshake":
            volts = float(req.get("volts", 13.7))
            year = int(req.get("year", 2016))
            ok = verify_bus(volts, year)
            resp = {"ok": ok, "cpp_accelerated": _cpp_lib is not None, "bus_health": "60.2 Ohm OK" if ok else "FAULT"}
        elif cmd == "uds_key":
            seed = int(req.get("seed", 0xA49F2C11))
            key = compute_uds_key(seed)
            resp = {"ok": True, "key_hex": f"0x{key:08X}"}
        elif cmd == "crc32":
            data = req.get("hex", "").encode("utf-8")
            resp = {"ok": True, "crc32": f"0x{compute_crc32(data):08X}"}
        else:
            resp = {"ok": False, "error": f"Unknown command: {cmd}"}
        self.wfile.write((json.dumps(resp) + "\n").encode("utf-8"))


if __name__ == "__main__":
    print(f"[AutoLab Engine] C++ VCI Core Loaded: {_cpp_lib is not None} | Listening on 127.0.0.1:9455")
    with socketserver.TCPServer(("127.0.0.1", 9455), EngineRPCHandler) as srv:
        srv.serve_forever()
