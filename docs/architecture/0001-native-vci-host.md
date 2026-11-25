# ADR 0001 — Native in-process VCI host for Windows

- Status: Proposed implementation direction
- Date: 2026-11-25
- Scope: Windows desktop host and Autocom CDP+ integration
- Protected branches: `main` is not modified by this decision.

## Context

The validated Autocom installation exposes a 32-bit .NET Framework VCI stack:

- `VciDrivers.dll` is x86 and targets .NET Framework 4.5.1.
- The connected CDP+ was discovered through the vendor stack and identified as VCI serial `100251`, platform `CDP+`, OBD firmware `1622`.
- Real reads of the VCI serial, platform name, and OBD firmware succeeded in a 32-bit PowerShell process.
- The current Electron desktop branch targets Windows x64.

A 64-bit process cannot load an x86 in-process DLL. A separate 32-bit helper/bridge would violate the product constraint and is not an acceptable workaround.

Electron's Windows ia32 distribution is time-limited: Electron 43 is the final release series with Windows x86 binaries, and its support ends in January 2027. Electron 44+ is 64-bit only. Therefore, pinning the product to Electron ia32 is not the durable production architecture.

## Decision

Adopt a Windows-native x86 application host using C# and .NET Framework 4.8.1, with the existing React UI rendered inside Microsoft WebView2.

The native C# host is the actual desktop application process and owns the VCI lifecycle. The Autocom assemblies and their x86 dependencies are loaded into that same host process. WebView2 is the UI renderer; it is not a VCI relay or a custom bridge process.

The React UI communicates with the native host through a narrowly scoped, request/response WebView2 message contract. The host must validate message names, payload schemas, request IDs, and caller/navigation origin. No arbitrary .NET reflection, filesystem access, or raw vendor command execution is exposed to page JavaScript.

## Why this is preferred

1. Preserves the tested x86 vendor SDK without pretending it can load into x64.
2. Keeps VCI operations in the main native application process; no separate VCI bridge executable.
3. Retains the existing React UI and most presentation logic.
4. Avoids shipping a production app on Electron ia32 after its support window.
5. Uses a supported .NET Framework line and WebView2's documented .NET Framework integration.

## Explicit constraints

- Do not change or merge `main`.
- Keep the existing Electron PR #1 open and draft until the replacement host is validated.
- Do not commit, publish, or redistribute proprietary Autocom DLLs, firmware, license files, or vendor drivers.
- Resolve vendor assemblies from a user-selected or documented local Autocom installation directory; verify hashes/versions and architecture before loading.
- Do not use `Fake`, `Demo`, simulated ECU responses, or synthetic seed/key results in hardware mode.
- Do not report VCI connected until the native driver has opened the physical VCI and completed a real identity read.
- Do not report ECU connected until a separate, protocol-correct vehicle communication test succeeds.
- Keep programming, coding writes, DTC clearing, security access, actuator tests, and firmware operations disabled until each feature has a separately reviewed safety contract and hardware validation.
- Never send undocumented VCI commands. The observed `*60b` EOBD firmware command remains unapproved for transmission until its protocol meaning is independently established.

## Compatibility gate

The current vendor stack targets .NET Framework 4.5.1. The host will target .NET Framework 4.8.1, but compatibility is a test requirement, not an assumption. The first native-host spike must prove:

1. x86 process and CLR version at runtime.
2. Successful loading of the exact local vendor assemblies and dependencies.
3. Enumeration of the physical CDP+ device by its FTDI USB descriptor.
4. Driver connection and clean disconnect.
5. Real read-only identity responses matching the known VCI serial, platform, and firmware.
6. Repeated connect/read/disconnect cycles without leaks, stale device claims, or port lockups.

If any compatibility gate fails, stop and investigate; do not silently fall back to fake data or an out-of-process bridge.

## Migration plan

### Phase 1 — Native host proof of concept
Create a .NET Framework 4.8.1 x86 WPF/WinForms host with WebView2. Load vendor assemblies from the local installation path only. Implement discovery, connect, identity reads, status events, and deterministic cleanup.

### Phase 2 — Secure UI contract
Replace the Electron preload API with a versioned WebView2 message protocol. Move workspace persistence behind the host contract or another in-process storage layer. Remove the loopback Express service from the packaged desktop path; do not expose an unauthenticated localhost API.

### Phase 3 — Hardware truth and safety gates
Separate application readiness, VCI transport, ECU session, and verified ECU identity into distinct states. Gate all write-capable UI actions behind explicit capabilities returned by the native host. Demo-bench behavior must be visibly isolated and impossible to mistake for real vehicle data.

### Phase 4 — Validation and packaging
Add Windows CI for the x86 .NET host and React build. Run tests without proprietary binaries in CI, and run a separate local hardware acceptance checklist against the licensed installation. Package only AutoLab-owned files and redistributable dependencies.

### Phase 5 — Retire the Electron host
Only after parity, persistence migration, installer validation, and hardware acceptance pass, supersede the Electron PR. No merge to `main` without explicit owner approval.

## Current truth

The repository currently has an Electron x64 desktop shell and no integrated VCI SDK. The PowerShell session proves the vendor stack can communicate with the physical adapter; it does not prove the new AutoLab native host yet. This ADR records the architecture decision and test gates, not a claim that integration is complete.
