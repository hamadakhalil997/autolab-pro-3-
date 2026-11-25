// AutoLab Pro — C++20 Native VCI, UDS Security & Checksum Core Shared Library
// Exposes C-ABI functions consumed by Python (ctypes) and Java (JNI/JNA/IPC).
#include <cstdint>
#include <cstddef>
#include <cstring>

#ifdef _WIN32
#define AUTOLAB_EXPORT extern "C" __declspec(dllexport)
#else
#define AUTOLAB_EXPORT extern "C" __attribute__((visibility("default")))
#endif

namespace autolab {

constexpr uint32_t CRC32_POLY = 0xEDB88320u;

uint32_t compute_crc32(const uint8_t* data, size_t len) {
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; ++i) {
        crc ^= data[i];
        for (int b = 0; b < 8; ++b) {
            crc = (crc >> 1) ^ (CRC32_POLY & -(crc & 1u));
        }
    }
    return ~crc;
}

uint32_t derive_uds_key_level03(uint32_t seed) {
    // OEM-style bitwise XOR + rotate key derivation for UDS 0x27 Level 0x03
    uint32_t k = seed ^ 0xA55A3C91u;
    k = ((k << 7) | (k >> 25)) + 0x1F2E3D4Cu;
    return k ^ 0x55AA00FFu;
}

} // namespace autolab

AUTOLAB_EXPORT uint32_t autolab_crc32(const uint8_t* data, size_t length) {
    if (!data || length == 0) return 0;
    return autolab::compute_crc32(data, length);
}

AUTOLAB_EXPORT uint32_t autolab_uds_seed_to_key(uint32_t seed) {
    return autolab::derive_uds_key_level03(seed);
}

AUTOLAB_EXPORT int autolab_verify_bus_electrical(double kl30_volts, int year, double termination_ohm) {
    if (kl30_volts < 11.8 || kl30_volts > 15.2) return -1; // Voltage out of range
    if (year >= 2005 && (termination_ohm < 52.0 || termination_ohm > 68.0)) return -2; // CAN bus fault
    return 0; // Electrical health OK
}
