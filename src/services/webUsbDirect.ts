// Direct Browser WebUSB Hardware Driver (FTDI D2XX SIO / Autocom / CH340 / CP210x / STN) — Zero Bridge Required
import {
  FT_BITS_8,
  FT_BITMODE_RESET,
  FT_FLOW_NONE,
  FT_PARITY_NONE,
  FT_PURGE_RX,
  FT_PURGE_TX,
  FT_STOP_BITS_1,
  FT_VENDOR_ID,
  FTDI_MODEM_DTR_HIGH,
  FTDI_MODEM_RTS_HIGH,
  FTDI_SIO_RESET,
  FTDI_SIO_SET_BAUDRATE,
  FTDI_SIO_SET_BITMODE,
  FTDI_SIO_SET_DATA,
  FTDI_SIO_SET_FLOW_CTRL,
  FTDI_SIO_SET_LATENCY_TIMER,
  FTDI_SIO_SET_MODEM_CTRL,
  computeFtdiDivisor,
  identifyFtdiChip,
} from './ftdiD2xxDefs';

export interface WebUsbDeviceSummary {
  label: string;
  vendorId: string;
  productId: string;
  serialNumber: string | null;
  manufacturerName: string | null;
  productName: string | null;
  firmwareVersion: string | null;
}

interface UsbEndpointLike {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
  packetSize: number;
}

interface UsbAlternateInterfaceLike {
  endpoints: UsbEndpointLike[];
}

interface UsbInterfaceLike {
  interfaceNumber: number;
  alternates: UsbAlternateInterfaceLike[];
}

interface UsbConfigurationLike {
  interfaces: UsbInterfaceLike[];
}

interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  opened: boolean;
  configuration?: UsbConfigurationLike | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  controlTransferOut: (
    setup: {
      requestType: 'standard' | 'class' | 'vendor';
      recipient: 'device' | 'interface' | 'endpoint' | 'other';
      request: number;
      value: number;
      index: number;
    },
    data?: BufferSource
  ) => Promise<{ status: string }>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<{ status: string }>;
  transferIn: (
    endpointNumber: number,
    length: number
  ) => Promise<{ data?: DataView; status: string }>;
}

const KNOWN_USB_FILTERS = [
  { vendorId: 0x0403 }, // FTDI (Autocom CDP+, VAG K+DCAN, Tactrix, OBDLink EX)
  { vendorId: 0x1a86 }, // WCH CH340/CH341
  { vendorId: 0x10c4 }, // Silicon Labs CP210x
  { vendorId: 0x0483 }, // STMicroelectronics STN1110/ST-Link
  { vendorId: 0x067b }, // Prolific PL2303
];

export class WebUsbDirectDriver {
  private device: UsbDeviceLike | null = null;
  private interfaceNumber = 0;
  private endpointIn = 1;
  private endpointOut = 2;
  private cmdQueue: Promise<unknown> = Promise.resolve();
  private lastHeader = '';
  private disconnectHandlers = new Set<() => void>();
  private boundUsbDisconnect: ((ev: { device?: UsbDeviceLike }) => void) | null = null;

  get isOpen(): boolean {
    return this.device !== null && this.device.opened;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectHandlers.add(cb);
    return () => {
      this.disconnectHandlers.delete(cb);
    };
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.cmdQueue.then(task, task);
    this.cmdQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async getAuthorizedDevices(): Promise<UsbDeviceLike[]> {
    const nav = navigator as Navigator & {
      usb?: { getDevices?: () => Promise<UsbDeviceLike[]> };
    };
    if (!nav.usb?.getDevices) return [];
    try {
      return await nav.usb.getDevices();
    } catch {
      return [];
    }
  }

  async connect(baudRate = 38400, existingDevice?: UsbDeviceLike): Promise<WebUsbDeviceSummary> {
    const nav = navigator as Navigator & {
      usb?: {
        requestDevice: (opts: { filters: { vendorId: number }[] }) => Promise<UsbDeviceLike>;
        addEventListener?: (type: string, listener: (ev: { device?: UsbDeviceLike }) => void) => void;
        removeEventListener?: (type: string, listener: (ev: { device?: UsbDeviceLike }) => void) => void;
      };
    };
    if (!nav.usb) {
      throw new Error('WebUSB API requires Chrome or Edge over HTTPS / localhost.');
    }

    if (this.isOpen) {
      await this.disconnect();
    }

    const dev = existingDevice ?? (await nav.usb.requestDevice({ filters: KNOWN_USB_FILTERS }));
    await dev.open();
    if (!dev.configuration) {
      await dev.selectConfiguration(1);
    }

    const interfaces = dev.configuration?.interfaces ?? [];
    let chosenIface = interfaces[0];
    for (const iface of interfaces) {
      const eps = iface.alternates[0]?.endpoints ?? [];
      if (eps.some((e) => e.direction === 'in') && eps.some((e) => e.direction === 'out')) {
        chosenIface = iface;
        break;
      }
    }

    if (!chosenIface) {
      await dev.close();
      throw new Error('USB device has no usable bulk IN/OUT interface.');
    }

    this.interfaceNumber = chosenIface.interfaceNumber;
    await dev.claimInterface(this.interfaceNumber);

    const endpoints = chosenIface.alternates[0]?.endpoints ?? [];
    this.endpointIn = endpoints.find((e) => e.direction === 'in')?.endpointNumber ?? 1;
    this.endpointOut = endpoints.find((e) => e.direction === 'out')?.endpointNumber ?? 2;

    const isFtdi = dev.vendorId === FT_VENDOR_ID;
    // Configure FTDI SIO chip directly via D2XX control transfers if VID == 0x0403
    if (isFtdi) {
      await this.configureFtdiSio(dev, baudRate);
    }

    this.device = dev;
    this.lastHeader = '';

    this.boundUsbDisconnect = (ev) => {
      if (!ev.device || ev.device === this.device) {
        void this.disconnect().then(() => {
          this.disconnectHandlers.forEach((cb) => cb());
        });
      }
    };
    nav.usb.addEventListener?.('disconnect', this.boundUsbDisconnect);

    const chipDescription = isFtdi
      ? identifyFtdiChip(dev.productId)
      : dev.productName || 'USB VCI Adapter';

    let firmwareVersion: string | null = null;
    try {
      const atz = await this.sendCommand('ATZ', 900);
      if (atz) {
        firmwareVersion = atz;
        await this.sendCommand('ATE0', 400);
        await this.sendCommand('ATS0', 400);
      }
    } catch {
      firmwareVersion = isFtdi
        ? `${chipDescription} (D2XX 2ms Latency)`
        : 'Direct USB Bulk Endpoint Bound';
    }

    const vendorId = `0x${dev.vendorId.toString(16).toUpperCase().padStart(4, '0')}`;
    const productId = `0x${dev.productId.toString(16).toUpperCase().padStart(4, '0')}`;

    return {
      label: `${dev.productName || chipDescription} (${vendorId}:${productId})`,
      vendorId,
      productId,
      serialNumber: dev.serialNumber ?? null,
      manufacturerName: dev.manufacturerName ?? null,
      productName: dev.productName ?? chipDescription,
      firmwareVersion: firmwareVersion ?? `${chipDescription} Ready`,
    };
  }

  private async configureFtdiSio(dev: UsbDeviceLike, baudRate: number): Promise<void> {
    const portIndex = this.interfaceNumber + 1;
    const isHighSpeed = dev.productId === 0x6010 || dev.productId === 0x6011 || dev.productId === 0x6014;
    const { value: baudValue, indexHigh } = computeFtdiDivisor(baudRate, isHighSpeed);
    const dataCharacteristics = FT_BITS_8 | (FT_PARITY_NONE << 8) | (FT_STOP_BITS_1 << 11);

    try {
      // FT_ResetDevice + FT_Purge(RX | TX)
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_RESET,
        value: 0,
        index: portIndex,
      });
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_RESET,
        value: FT_PURGE_RX,
        index: portIndex,
      });
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_RESET,
        value: FT_PURGE_TX,
        index: portIndex,
      });
      // FT_SetBitMode(FT_BITMODE_RESET)
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_BITMODE,
        value: FT_BITMODE_RESET,
        index: portIndex,
      });
      // FT_SetBaudRate (with exact fractional divisor)
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_BAUDRATE,
        value: baudValue,
        index: (indexHigh << 8) | portIndex,
      });
      // FT_SetDataCharacteristics (8N1)
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_DATA,
        value: dataCharacteristics,
        index: portIndex,
      });
      // FT_SetFlowControl(FT_FLOW_NONE)
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_FLOW_CTRL,
        value: FT_FLOW_NONE,
        index: portIndex,
      });
      // FT_SetDtr / FT_SetRts
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_MODEM_CTRL,
        value: FTDI_MODEM_DTR_HIGH,
        index: portIndex,
      });
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_MODEM_CTRL,
        value: FTDI_MODEM_RTS_HIGH,
        index: portIndex,
      });
      // FT_SetLatencyTimer(2ms) for fast UDS/KWP2000 polling
      await dev.controlTransferOut({
        requestType: 'vendor',
        recipient: 'device',
        request: FTDI_SIO_SET_LATENCY_TIMER,
        value: 2,
        index: portIndex,
      });
    } catch {
      // Ignore if device uses non-standard USB endpoints
    }
  }

  async sendKLineFastInitPulse(): Promise<void> {
    if (!this.device || !this.device.opened || this.device.vendorId !== FT_VENDOR_ID) return;
    const portIndex = this.interfaceNumber + 1;
    const baseData = FT_BITS_8 | (FT_PARITY_NONE << 8) | (FT_STOP_BITS_1 << 11);
    // FT_SetBreakOn (0x4000) for 25 ms K-Line wake-up pulse
    await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: FTDI_SIO_SET_DATA,
      value: baseData | 0x4000,
      index: portIndex,
    });
    await new Promise((r) => setTimeout(r, 25));
    // FT_SetBreakOff
    await this.device.controlTransferOut({
      requestType: 'vendor',
      recipient: 'device',
      request: FTDI_SIO_SET_DATA,
      value: baseData,
      index: portIndex,
    });
    await new Promise((r) => setTimeout(r, 25));
  }

  sendCommand(cmd: string, timeoutMs = 1100): Promise<string> {
    return this.enqueue(async () => {
      if (!this.device || !this.device.opened) {
        throw new Error('WebUSB device is not open.');
      }
      const bytes = new TextEncoder().encode(`${cmd.trim()}\r`);
      await this.device.transferOut(this.endpointOut, bytes);

      const decoder = new TextDecoder();
      let acc = '';
      const started = Date.now();
      const isFtdi = this.device.vendorId === 0x0403;

      while (Date.now() - started < timeoutMs) {
        try {
          const readTask = this.device.transferIn(this.endpointIn, 64);
          const timeoutTask = new Promise<{ data?: DataView; status: string }>((resolve) =>
            setTimeout(() => resolve({ status: 'timeout' }), 150)
          );
          const res = await Promise.race([readTask, timeoutTask]);
          if (res.data && res.data.byteLength > 0) {
            const raw = new Uint8Array(
              res.data.buffer,
              res.data.byteOffset,
              res.data.byteLength
            );
            // FTDI bulk IN packets prepend 2 modem-status bytes
            const payload = isFtdi && raw.length >= 2 ? raw.slice(2) : raw;
            if (payload.length > 0) {
              acc += decoder.decode(payload, { stream: true });
              if (acc.includes('>')) break;
            }
          }
        } catch {
          break;
        }
      }
      return acc.replace(/>/g, '').trim();
    });
  }

  async sendTargetedCommand(txId: string, payloadHex: string, timeoutMs = 1300): Promise<string> {
    const cleanHeader = txId.replace(/^0x/i, '').trim().toUpperCase();
    if (cleanHeader && cleanHeader !== this.lastHeader && /^[0-9A-F]{3,8}$/.test(cleanHeader)) {
      await this.sendCommand(`ATSH ${cleanHeader}`, 450);
      this.lastHeader = cleanHeader;
    }
    return this.sendCommand(payloadHex.replace(/\s+/g, ''), timeoutMs);
  }

  async disconnect(): Promise<void> {
    const nav = navigator as Navigator & {
      usb?: {
        removeEventListener?: (type: string, listener: (ev: { device?: UsbDeviceLike }) => void) => void;
      };
    };
    if (this.boundUsbDisconnect) {
      nav.usb?.removeEventListener?.('disconnect', this.boundUsbDisconnect);
      this.boundUsbDisconnect = null;
    }
    if (this.device) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
      } catch {
        // ignore
      }
      try {
        await this.device.close();
      } catch {
        // ignore
      }
      this.device = null;
    }
    this.lastHeader = '';
  }
}

export const webUsbDriver = new WebUsbDirectDriver();
