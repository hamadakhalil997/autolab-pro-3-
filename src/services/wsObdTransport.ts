// Direct WebSocket / DoIP / Wi-Fi OBD Gateway Transport (Zero Bridge Required)

export class WsObdTransport {
  private socket: WebSocket | null = null;
  private cmdQueue: Promise<unknown> = Promise.resolve();
  private pendingResolve: ((val: string) => void) | null = null;
  private rxBuffer = '';
  private lastHeader = '';
  private disconnectHandlers = new Set<() => void>();

  get isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
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

  connect(url: string, timeoutMs = 4500): Promise<{ endpoint: string; banner: string }> {
    return new Promise((resolve, reject) => {
      const cleanUrl = url.trim();
      if (!/^wss?:\/\//i.test(cleanUrl)) {
        reject(new Error('WebSocket endpoint must start with ws:// or wss://'));
        return;
      }

      this.disconnect();

      let settled = false;
      const ws = new WebSocket(cleanUrl);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error(`Timed out connecting to ${cleanUrl}`));
        }
      }, timeoutMs);

      ws.onopen = () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        this.socket = ws;
        this.lastHeader = '';
        resolve({ endpoint: cleanUrl, banner: 'Direct DoIP/WebSocket Socket Open' });
      };

      ws.onmessage = (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : '';
        this.rxBuffer += text;
        if (this.pendingResolve && (this.rxBuffer.includes('>') || this.rxBuffer.includes('\n'))) {
          const fn = this.pendingResolve;
          this.pendingResolve = null;
          const out = this.rxBuffer.replace(/>/g, '').trim();
          this.rxBuffer = '';
          fn(out);
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to open WebSocket to ${cleanUrl}`));
        }
      };

      ws.onclose = () => {
        this.socket = null;
        this.pendingResolve = null;
        this.rxBuffer = '';
        this.lastHeader = '';
        if (settled) {
          this.disconnectHandlers.forEach((cb) => cb());
        }
      };
    });
  }

  sendCommand(cmd: string, timeoutMs = 1500): Promise<string> {
    return this.enqueue(
      () =>
        new Promise((resolve, reject) => {
          if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket OBD gateway is not connected.'));
            return;
          }
          this.rxBuffer = '';
          const timer = setTimeout(() => {
            this.pendingResolve = null;
            const out = this.rxBuffer.replace(/>/g, '').trim();
            this.rxBuffer = '';
            resolve(out || 'NO DATA');
          }, timeoutMs);

          this.pendingResolve = (val: string) => {
            clearTimeout(timer);
            resolve(val);
          };

          this.socket.send(`${cmd.trim()}\r`);
        })
    );
  }

  async sendTargetedCommand(txId: string, payloadHex: string, timeoutMs = 1500): Promise<string> {
    const cleanHeader = txId.replace(/^0x/i, '').trim().toUpperCase();
    if (cleanHeader && cleanHeader !== this.lastHeader && /^[0-9A-F]{3,8}$/.test(cleanHeader)) {
      await this.sendCommand(`ATSH ${cleanHeader}`, 500);
      this.lastHeader = cleanHeader;
    }
    return this.sendCommand(payloadHex.replace(/\s+/g, ''), timeoutMs);
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.pendingResolve = null;
    this.rxBuffer = '';
    this.lastHeader = '';
  }
}

export const wsObdDriver = new WsObdTransport();
