import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '.autolab_data');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspace.json');

interface PersistedSettings {
  vciAdapter: string;
  baudRate: number;
  protocolCode: string;
  wsEndpoint: string;
  autoConnectSavedUsb: boolean;
  targetIdle: number;
  tcuSportMode: boolean;
  coding: {
    region: string;
    trans: string;
    light: string;
  };
}

interface PersistedWorkspace {
  customVehicles: Record<string, unknown>[];
  customParts: Record<string, unknown>[];
  customKeys: Record<string, unknown>[];
  codingHistory: string[];
  logs: { time: string; source: string; msg: string; level: string }[];
  vaultSnapshots: { label: string; timestamp: string; cvn: string; size: number; crc32: string }[];
  traces: { id: string; vehicle: string; ecu: string; createdAt: string; sampleCount: number }[];
  settings: PersistedSettings;
  updatedAt: string;
}

const DEFAULT_WORKSPACE: PersistedWorkspace = {
  customVehicles: [],
  customParts: [],
  customKeys: [],
  codingHistory: [
    '[Initial] Region=ECE (Europe) | Trans=8HP Automatic | Light=Adaptive Matrix LED',
  ],
  logs: [],
  vaultSnapshots: [],
  traces: [],
  settings: {
    vciAdapter: 'WebSerial USB OBD-II / ELM327 / STN (Direct COM)',
    baudRate: 38400,
    protocolCode: '0',
    wsEndpoint: 'ws://192.168.0.10:35000',
    autoConnectSavedUsb: false,
    targetIdle: 735,
    tcuSportMode: false,
    coding: {
      region: 'ECE (Europe)',
      trans: '8HP Automatic',
      light: 'Adaptive Matrix LED',
    },
  },
  updatedAt: new Date().toISOString(),
};

let fileMutex: Promise<unknown> = Promise.resolve();

function withWorkspaceLock<T>(task: () => Promise<T>): Promise<T> {
  const run = fileMutex.then(task, task);
  fileMutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readWorkspace(): Promise<PersistedWorkspace> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(WORKSPACE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    return {
      ...DEFAULT_WORKSPACE,
      ...parsed,
      settings: {
        ...DEFAULT_WORKSPACE.settings,
        ...(parsed.settings ?? {}),
        coding: {
          ...DEFAULT_WORKSPACE.settings.coding,
          ...(parsed.settings?.coding ?? {}),
        },
      },
      customVehicles: Array.isArray(parsed.customVehicles) ? parsed.customVehicles : [],
      customParts: Array.isArray(parsed.customParts) ? parsed.customParts : [],
      customKeys: Array.isArray(parsed.customKeys) ? parsed.customKeys : [],
      codingHistory: Array.isArray(parsed.codingHistory)
        ? parsed.codingHistory
        : DEFAULT_WORKSPACE.codingHistory,
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      vaultSnapshots: Array.isArray(parsed.vaultSnapshots) ? parsed.vaultSnapshots : [],
      traces: Array.isArray(parsed.traces) ? parsed.traces : [],
    };
  } catch {
    return structuredClone(DEFAULT_WORKSPACE);
  }
}

async function writeWorkspace(data: PersistedWorkspace): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  data.updatedAt = new Date().toISOString();
  const tmpFile = `${WORKSPACE_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpFile, WORKSPACE_FILE);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'direct-hardware',
      bridgeRequired: false,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/workspace', async (_req, res) => {
    try {
      const state = await withWorkspaceLock(() => readWorkspace());
      res.json({ ok: true, workspace: state });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load workspace',
      });
    }
  });

  app.post('/api/workspace/vehicles', async (req, res) => {
    const body = req.body as { vehicle?: Record<string, unknown>; vehicles?: Record<string, unknown>[] } | undefined;
    const incoming = body?.vehicles ?? (body?.vehicle ? [body.vehicle] : []);
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ ok: false, error: 'vehicle or vehicles array is required' });
      return;
    }

    const updated = await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      const valid = incoming.filter(
        (v) => v && typeof v.make === 'string' && typeof v.model === 'string'
      );
      ws.customVehicles = [...valid, ...ws.customVehicles].slice(0, 500);
      await writeWorkspace(ws);
      return ws.customVehicles.length;
    });

    res.json({ ok: true, count: updated });
  });

  app.post('/api/workspace/parts', async (req, res) => {
    const body = req.body as { parts?: Record<string, unknown>[] } | undefined;
    if (!body || !Array.isArray(body.parts) || body.parts.length === 0) {
      res.status(400).json({ ok: false, error: 'parts array is required' });
      return;
    }

    const updated = await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      const valid = body.parts!.filter((p) => p && typeof p.name === 'string');
      ws.customParts = [...ws.customParts, ...valid].slice(0, 1000);
      await writeWorkspace(ws);
      return ws.customParts.length;
    });

    res.json({ ok: true, count: updated });
  });

  app.post('/api/workspace/keys', async (req, res) => {
    const body = req.body as { keyRecord?: Record<string, unknown>; keys?: Record<string, unknown>[] } | undefined;
    const incoming = body?.keys ?? (body?.keyRecord ? [body.keyRecord] : []);
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ ok: false, error: 'keyRecord or keys array is required' });
      return;
    }

    const updated = await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      const valid = incoming.filter(
        (k) => k && typeof k.make === 'string' && typeof k.model === 'string'
      );
      ws.customKeys = [...valid, ...ws.customKeys].slice(0, 1000);
      await writeWorkspace(ws);
      return ws.customKeys.length;
    });

    res.json({ ok: true, count: updated });
  });

  app.post('/api/workspace/settings', async (req, res) => {
    const patch = req.body as Partial<PersistedSettings> | undefined;
    if (!patch || typeof patch !== 'object') {
      res.status(400).json({ ok: false, error: 'Settings object required' });
      return;
    }

    const settings = await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.settings = {
        ...ws.settings,
        ...(typeof patch.vciAdapter === 'string' ? { vciAdapter: patch.vciAdapter } : {}),
        ...(typeof patch.baudRate === 'number' && Number.isFinite(patch.baudRate)
          ? { baudRate: patch.baudRate }
          : {}),
        ...(typeof patch.protocolCode === 'string' ? { protocolCode: patch.protocolCode } : {}),
        ...(typeof patch.wsEndpoint === 'string' ? { wsEndpoint: patch.wsEndpoint } : {}),
        ...(typeof patch.autoConnectSavedUsb === 'boolean'
          ? { autoConnectSavedUsb: patch.autoConnectSavedUsb }
          : {}),
        ...(typeof patch.targetIdle === 'number' && Number.isFinite(patch.targetIdle)
          ? { targetIdle: patch.targetIdle }
          : {}),
        ...(typeof patch.tcuSportMode === 'boolean' ? { tcuSportMode: patch.tcuSportMode } : {}),
        coding: {
          ...ws.settings.coding,
          ...(patch.coding && typeof patch.coding === 'object' ? patch.coding : {}),
        },
      };
      await writeWorkspace(ws);
      return ws.settings;
    });

    res.json({ ok: true, settings });
  });

  app.post('/api/workspace/coding', async (req, res) => {
    const body = req.body as {
      entry?: string;
      coding?: { region?: string; trans?: string; light?: string };
    } | undefined;
    if (!body || typeof body.entry !== 'string' || !body.entry.trim()) {
      res.status(400).json({ ok: false, error: 'Coding audit entry is required' });
      return;
    }

    const codingHistory = await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.codingHistory = [body.entry!.trim(), ...ws.codingHistory].slice(0, 100);
      if (body.coding) {
        ws.settings.coding = {
          ...ws.settings.coding,
          ...body.coding,
        };
      }
      await writeWorkspace(ws);
      return ws.codingHistory;
    });

    res.json({ ok: true, codingHistory });
  });

  app.post('/api/workspace/logs', async (req, res) => {
    const body = req.body as {
      time?: string;
      source?: string;
      msg?: string;
      level?: string;
    } | undefined;
    if (!body || typeof body.msg !== 'string') {
      res.status(400).json({ ok: false, error: 'Log msg is required' });
      return;
    }

    await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.logs = [
        {
          time: String(body.time ?? new Date().toLocaleTimeString()),
          source: String(body.source ?? 'System'),
          msg: String(body.msg),
          level: String(body.level ?? 'info'),
        },
        ...ws.logs,
      ].slice(0, 250);
      await writeWorkspace(ws);
    });

    res.json({ ok: true });
  });

  app.delete('/api/workspace/logs', async (_req, res) => {
    await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.logs = [];
      await writeWorkspace(ws);
    });
    res.json({ ok: true });
  });

  app.post('/api/workspace/vault', async (req, res) => {
    const body = req.body as {
      label?: string;
      timestamp?: string;
      cvn?: string;
      size?: number;
      crc32?: string;
    } | undefined;
    if (!body || typeof body.label !== 'string') {
      res.status(400).json({ ok: false, error: 'Vault snapshot label required' });
      return;
    }

    await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.vaultSnapshots = [
        {
          label: body.label!,
          timestamp: String(body.timestamp ?? new Date().toLocaleTimeString()),
          cvn: String(body.cvn ?? '00000000'),
          size: Number(body.size ?? 0),
          crc32: String(body.crc32 ?? '00000000'),
        },
        ...ws.vaultSnapshots,
      ].slice(0, 60);
      await writeWorkspace(ws);
    });

    res.json({ ok: true });
  });

  app.post('/api/workspace/traces', async (req, res) => {
    const body = req.body as {
      vehicle?: string;
      ecu?: string;
      samples?: unknown[];
    } | undefined;
    if (!body || !Array.isArray(body.samples)) {
      res.status(400).json({ ok: false, error: 'samples array required' });
      return;
    }

    const traceId = `trace_${Date.now()}`;
    await withWorkspaceLock(async () => {
      const ws = await readWorkspace();
      ws.traces = [
        {
          id: traceId,
          vehicle: String(body.vehicle ?? 'Unknown'),
          ecu: String(body.ecu ?? 'ECU'),
          createdAt: new Date().toISOString(),
          sampleCount: body.samples!.length,
        },
        ...ws.traces,
      ].slice(0, 50);
      await writeWorkspace(ws);
    });

    res.json({ ok: true, traceId });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT ?? 3000);
  const HOST = process.env.HOST ?? '127.0.0.1';
  app.listen(PORT, HOST, () => {
    console.log(`AutoLab Pro server listening on http://${HOST}:${PORT} (Local Desktop Mode)`);
  });
}

void startServer();
