# AutoLab Pro — Windows Desktop Host

This folder contains the Electron host for the Windows desktop build.

## Build

- `npm install`
- `npm run desktop:dev` — builds the React UI and local API, then opens the desktop shell.
- `npm run desktop:dist` — creates a Windows x64 NSIS installer in `release/`.

The desktop host loads the production UI from a loopback-only Express service. Workspace data is stored under Electron's per-user application data directory, not beside the installed executable.

## Hardware status — important

The Electron host is a native Windows application shell, not a completed VCI driver. It intentionally reports `vciSdkReady: false` until the Autocom/VCI vendor SDK and licensed driver files are supplied and integrated. A visible USB device, open COM port, or successful application launch must never be reported as an ECU connection.

The intended hardware path is:

`AutoLab Pro UI → Electron native host → vendor VCI SDK / Windows driver → CAN, CAN-FD, K-Line or DoIP interface → vehicle ECU`

This removes browser WebSerial/WebUSB restrictions. It does not remove the need for a vendor driver/API or protocol-specific ECU implementation.

## Database status

The existing vehicle data in `src/data/vehicleDatabase.ts` is a starter catalogue, not a verified global coverage database for every make/model/engine/ECU from 1980–2026. Add records only with provenance and a confidence/verification status. Do not infer ECU addresses, security algorithms, wiring or programming procedures from model year alone.
