import type { ObdProtocolCode } from '../types/autolab';

export interface WebSerialTelemetry {
  rpm: number;
  speed: number;
  load: number;
  temp: number;
  batt: number;
  map: number;
  ign: number;
}

export interface SerialAdapterInfo {
  label: string;
  vendorId: string | null;
  productId: string | null;
  firmwareVersion: string;
  detectedProtocol: string;
  batteryVoltage: number | null;
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export class WebSerialObdDriver {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private textBuffer = '';
  private cmdQueue: Promise<unknown> = Promise.resolve();
  private lastHeader = '';
  private disconnectHandlers = new Set<() => void>();
  private boundDisconnectListener: (() => void) | null = null;

  get isOpen(): boolean {
    return this.port !== null && this.writer !== null && this.reader !== null;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
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

  async getAuthorizedPorts(): Promise<SerialPortLike[]> {
    const nav = navigator as Navigator & {
      serial?: { getPorts?: () => Promise<SerialPortLike[]> };
    };
    if (!nav.serial?.getPorts) return [];
    try {
      return await nav.serial.getPorts();
    } catch {
      return [];
    }
  }

  async connect(
    baudRate = 38400,
    protocolCode: ObdProtocolCode = '0',
    existingPort?: SerialPortLike
  ): Promise<SerialAdapterInfo> {
    const nav = navigator as Navigator & {
      serial?: { requestPort: () => Promise<SerialPortLike> };
    };
    if (!nav.serial) {
      throw new Error('WebSerial API requires Chrome or Edge over HTTPS / localhost.');
    }

    if (this.isOpen) {
      await this.disconnect();
    }

    const port = existingPort ?? (await nav.serial.requestPort());
    await port.open({ baudRate });

    if (!port.readable || !port.writable) {
      throw new Error('Opened serial port does not expose readable/writable streams.');
    }

    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.lastHeader = '';

    this.boundDisconnectListener = () => {
      void this.disconnect().then(() => {
        this.disconnectHandlers.forEach((cb) => cb());
      });
    };
    port.addEventListener?.('disconnect', this.boundDisconnectListener);

    const info = port.getInfo();
    const vendorId = info.usbVendorId !== undefined
      ? `0x${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}`
      : null;
    const productId = info.usbProductId !== undefined
      ? `0x${info.usbProductId.toString(16).toUpperCase().padStart(4, '0')}`
      : null;
    const label = `USB COM (${vendorId ?? 'STD'}:${productId ?? 'OBD'} @ ${baudRate} baud)`;

    const resetResp = await this.sendCommand('ATZ', 1600);
    await this.sendCommand('ATE0', 600);
    await this.sendCommand('ATL0', 600);
    await this.sendCommand('ATS0', 600);
    await this.sendCommand(`ATSP${protocolCode}`, 800);
    const protoResp = await this.sendCommand('ATDP', 600);
    const batt = await this.readBatteryVoltage();

    return {
      label,
      vendorId,
      productId,
      firmwareVersion: resetResp || 'ELM327 / STN Ready',
      detectedProtocol: protoResp || `ATSP${protocolCode}`,
      batteryVoltage: batt,
    };
  }

  async setProtocol(protocolCode: ObdProtocolCode): Promise<string> {
    await this.sendCommand(`ATSP${protocolCode}`, 800);
    return this.sendCommand('ATDP', 600);
  }

  async readAdapterInfo(): Promise<{ firmware: string; protocol: string; voltage: number | null }> {
    const firmware = await this.sendCommand('ATI', 600);
    const protocol = await this.sendCommand('ATDP', 600);
    const voltage = await this.readBatteryVoltage();
    return {
      firmware: firmware || 'ELM327 / OBD-II Interface',
      protocol: protocol || 'AUTO',
      voltage,
    };
  }

  async disconnect(): Promise<void> {
    if (this.port && this.boundDisconnectListener) {
      this.port.removeEventListener?.('disconnect', this.boundDisconnectListener);
      this.boundDisconnectListener = null;
    }
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
      }
    } catch {
      // ignore close race
    }
    try {
      if (this.writer) {
        this.writer.releaseLock();
      }
    } catch {
      // ignore
    }
    try {
      if (this.port) {
        await this.port.close();
      }
    } catch {
      // ignore
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.textBuffer = '';
    this.lastHeader = '';
  }

  sendCommand(cmd: string, timeoutMs = 1200): Promise<string> {
    return this.enqueue(async () => {
      if (!this.writer || !this.reader) {
        throw new Error('Serial port is not open.');
      }
      this.textBuffer = '';
      const encoded = new TextEncoder().encode(`${cmd.trim()}\r`);
      await this.writer.write(encoded);

      const decoder = new TextDecoder();
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const readPromise = this.reader.read();
        const timeoutPromise = new Promise<{ value?: Uint8Array; done: boolean }>((resolve) =>
          setTimeout(() => resolve({ done: false }), 150)
        );
        const { value, done } = await Promise.race([readPromise, timeoutPromise]);
        if (done) break;
        if (value) {
          this.textBuffer += decoder.decode(value, { stream: true });
          if (this.textBuffer.includes('>')) {
            break;
          }
        }
      }
      return this.textBuffer.replace(/>/g, '').trim();
    });
  }

  async sendTargetedCommand(txId: string, payloadHex: string, timeoutMs = 1400): Promise<string> {
    const cleanHeader = txId.replace(/^0x/i, '').trim().toUpperCase();
    if (cleanHeader && cleanHeader !== this.lastHeader && /^[0-9A-F]{3,8}$/.test(cleanHeader)) {
      await this.sendCommand(`ATSH ${cleanHeader}`, 500);
      this.lastHeader = cleanHeader;
    }
    return this.sendCommand(payloadHex.replace(/\s+/g, ''), timeoutMs);
  }

  private extractHexBytes(raw: string, expectedService: string, pid?: string): number[] | null {
    const cleaned = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    const prefix = pid ? `${expectedService}${pid}` : expectedService;
    const idx = cleaned.indexOf(prefix);
    if (idx === -1) return null;
    const dataHex = cleaned.slice(idx + prefix.length);
    const bytes: number[] = [];
    for (let i = 0; i + 1 < dataHex.length; i += 2) {
      bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
    }
    return bytes;
  }

  async readBatteryVoltage(): Promise<number | null> {
    const raw = await this.sendCommand('ATRV', 600);
    const match = raw.match(/(\d+(?:\.\d+)?)\s*V?/i);
    return match ? parseFloat(match[1]) : null;
  }

  async readVin(): Promise<string | null> {
    const raw = await this.sendCommand('0902', 1800);
    if (raw && !raw.includes('NO DATA') && !raw.includes('ERROR')) {
      const cleaned = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
      const idx = cleaned.indexOf('4902');
      if (idx !== -1) {
        const hex = cleaned.slice(idx + 6);
        let vin = '';
        for (let i = 0; i + 1 < hex.length; i += 2) {
          const code = parseInt(hex.slice(i, i + 2), 16);
          if (code >= 48 && code <= 90) vin += String.fromCharCode(code);
        }
        if (vin.length >= 10) return vin.slice(0, 17);
      }
    }

    // Fallback to UDS ReadDataByIdentifier VIN (0x22 F1 90)
    const udsRaw = await this.sendTargetedCommand('7E0', '22F190', 1400);
    const udsBytes = this.extractHexBytes(udsRaw, '62', 'F190');
    if (udsBytes && udsBytes.length >= 10) {
      const vin = udsBytes
        .map((c) => (c >= 48 && c <= 90 ? String.fromCharCode(c) : ''))
        .join('');
      if (vin.length >= 10) return vin.slice(0, 17);
    }

    return null;
  }

  async pollTelemetry(): Promise<Partial<WebSerialTelemetry>> {
    const result: Partial<WebSerialTelemetry> = {};

    const batt = await this.readBatteryVoltage();
    if (batt !== null) result.batt = batt;

    const rpmRaw = await this.sendCommand('010C', 650);
    const rpmBytes = this.extractHexBytes(rpmRaw, '41', '0C');
    if (rpmBytes && rpmBytes.length >= 2) {
      result.rpm = Math.round(((rpmBytes[0] * 256) + rpmBytes[1]) / 4);
    }

    const spdRaw = await this.sendCommand('010D', 650);
    const spdBytes = this.extractHexBytes(spdRaw, '41', '0D');
    if (spdBytes && spdBytes.length >= 1) {
      result.speed = spdBytes[0];
    }

    const loadRaw = await this.sendCommand('0104', 650);
    const loadBytes = this.extractHexBytes(loadRaw, '41', '04');
    if (loadBytes && loadBytes.length >= 1) {
      result.load = +((loadBytes[0] * 100) / 255).toFixed(1);
    }

    const tempRaw = await this.sendCommand('0105', 650);
    const tempBytes = this.extractHexBytes(tempRaw, '41', '05');
    if (tempBytes && tempBytes.length >= 1) {
      result.temp = tempBytes[0] - 40;
    }

    const mapRaw = await this.sendCommand('010B', 650);
    const mapBytes = this.extractHexBytes(mapRaw, '41', '0B');
    if (mapBytes && mapBytes.length >= 1) {
      result.map = mapBytes[0];
    }

    const ignRaw = await this.sendCommand('010E', 650);
    const ignBytes = this.extractHexBytes(ignRaw, '41', '0E');
    if (ignBytes && ignBytes.length >= 1) {
      result.ign = +(ignBytes[0] / 2 - 64).toFixed(1);
    }

    return result;
  }

  private parseDtcResponse(raw: string, responseSid: string): string[] {
    const cleaned = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    const idx = cleaned.indexOf(responseSid);
    if (idx === -1) return [];
    const hex = cleaned.slice(idx + responseSid.length);
    const codes: string[] = [];
    const prefixes = ['P', 'C', 'B', 'U'];
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const b1 = parseInt(hex.slice(i, i + 2), 16);
      const b2 = parseInt(hex.slice(i + 2, i + 4), 16);
      if (b1 === 0 && b2 === 0) continue;
      const typeChar = prefixes[(b1 >> 6) & 0x03];
      const d1 = (b1 >> 4) & 0x03;
      const d2 = b1 & 0x0f;
      const d3 = (b2 >> 4) & 0x0f;
      const d4 = b2 & 0x0f;
      codes.push(
        `${typeChar}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4
          .toString(16)
          .toUpperCase()}`
      );
    }
    return codes;
  }

  async readDtcs(): Promise<string[]> {
    const confirmedRaw = await this.sendCommand('03', 1400);
    const pendingRaw = await this.sendCommand('07', 1200);
    const combined = [
      ...this.parseDtcResponse(confirmedRaw, '43'),
      ...this.parseDtcResponse(pendingRaw, '47'),
    ];
    return [...new Set(combined)];
  }

  async clearDtcs(): Promise<boolean> {
    const raw = await this.sendCommand('04', 1200);
    if (raw.toUpperCase().replace(/\s+/g, '').includes('44')) {
      return true;
    }
    const udsRaw = await this.sendTargetedCommand('7E0', '14FFFFFF', 1200);
    return udsRaw.toUpperCase().replace(/\s+/g, '').includes('54');
  }
}

export const webSerialDriver = new WebSerialObdDriver();
