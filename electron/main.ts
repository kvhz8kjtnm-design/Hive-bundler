import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// ─── Paths ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.UI_PORT ?? '3000', 10);

// In a packaged app, userData is writable; resourcesPath holds bundled read-only assets.
// In development, APP_ROOT is the project root.
let APP_ROOT       = path.join(__dirname, '..');  // dev default: project root
let DATA_DIR       = APP_ROOT;                    // where keypairs/keyInfo live
let ENV_PATH       = path.join(APP_ROOT, '.env'); // fallback until app ready
let CLIENT_DIR     = path.join(APP_ROOT, 'client', 'dist');
let RESOURCES_ROOT = APP_ROOT;                    // extraResources root (img/, src/)

// ─── Load saved config ────────────────────────────────────────────────────────

function loadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH, override: true });
  }
}

loadEnv();

const isConfigured = () =>
  !!(process.env.SIGNER_PRIVATE_KEY &&
     process.env.FUNDER_PRIVATE_KEY  &&
     process.env.RPC_URL);

// ─── Server lifecycle (child process) ─────────────────────────────────────────
// Spawns server.ts/server.js as a child process using the Electron binary with
// ELECTRON_RUN_AS_NODE=1. This is self-contained (no system Node required) and
// works on both Mac and Windows.

let serverStarted = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serverProcess: any = null;

async function startServer(): Promise<{ ok: boolean; error?: string }> {
  if (serverStarted) return { ok: true };

  const { spawn } = require('child_process') as typeof import('child_process');

  // Use server-entry.js in dev (ts-node); compiled dist-server/server.js in prod
  const entry = app.isPackaged
    ? path.join(APP_ROOT, 'dist-server', 'server.js')
    : path.join(APP_ROOT, 'server-entry.js');

  return new Promise((resolve) => {
    serverProcess = spawn(
      process.execPath,   // Electron binary — acts as Node when ELECTRON_RUN_AS_NODE=1
      [entry],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE:    '1',
          HIVEGUARD_APP_ROOT:      APP_ROOT,
          HIVEGUARD_DATA_DIR:      DATA_DIR,
          HIVEGUARD_ENV_PATH:      ENV_PATH,
          HIVEGUARD_RESOURCES_ROOT: RESOURCES_ROOT,
        },
        cwd:   APP_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let resolved = false;

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      if (!resolved && text.includes('Hive Bundler')) {
        resolved      = true;
        serverStarted = true;
        resolve({ ok: true });
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(data);
    });

    serverProcess.on('error', (err: Error) => {
      if (!resolved) { resolved = true; resolve({ ok: false, error: err.message }); }
    });

    serverProcess.on('exit', (code: number | null) => {
      serverStarted = false;
      serverProcess = null;
      if (!resolved) { resolved = true; resolve({ ok: false, error: `Server exited with code ${code}` }); }
    });

    setTimeout(() => {
      if (!resolved) { resolved = true; resolve({ ok: false, error: 'Server start timed out after 30s' }); }
    }, 30000);
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1280,
    height:    840,
    minWidth:  960,
    minHeight: 640,
    backgroundColor: '#080808',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload:          path.join(APP_ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools only in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.session.clearCache().then(() => loadContent());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function loadContent() {
  if (!mainWindow) return;
  if (serverStarted) {
    mainWindow.loadURL(`http://localhost:${PORT}`);
  } else {
    mainWindow.loadFile(path.join(CLIENT_DIR, 'index.html'));
  }
}

// ─── First-run: migrate userData ──────────────────────────────────────────────
// In a packaged app, keypairs and keyInfo must live in a writable location.
// On first launch, seed userData from bundled extraResources if empty.

function ensureDataDir() {
  const keypairsDir = path.join(DATA_DIR, 'src', 'keypairs');
  if (!fs.existsSync(keypairsDir)) {
    fs.mkdirSync(keypairsDir, { recursive: true });
    // Copy any pre-bundled keypairs from resourcesPath
    if (app.isPackaged) {
      const bundled = path.join(process.resourcesPath, 'src', 'keypairs');
      if (fs.existsSync(bundled)) {
        for (const f of fs.readdirSync(bundled)) {
          fs.copyFileSync(path.join(bundled, f), path.join(keypairsDir, f));
        }
      }
    }
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Resolve paths now that app is fully ready
  if (app.isPackaged) {
    // app.getAppPath() returns the path to app.asar — client/dist, pumpfun-IDL.json etc. live here
    // process.resourcesPath is the parent Resources/ folder — extraResources (img/, src/) land here
    APP_ROOT   = app.getAppPath();          // inside app.asar
    DATA_DIR   = app.getPath('userData');   // writable: keypairs, keyInfo, env
    CLIENT_DIR     = path.join(APP_ROOT, 'client', 'dist');
    RESOURCES_ROOT = process.resourcesPath; // extraResources (img/, src/) land here
  } else {
    APP_ROOT       = path.join(__dirname, '..');
    DATA_DIR       = APP_ROOT;
    CLIENT_DIR     = path.join(APP_ROOT, 'client', 'dist');
    RESOURCES_ROOT = APP_ROOT;
  }

  ENV_PATH = app.isPackaged
    ? path.join(app.getPath('userData'), 'hive-bundler.env')
    : path.join(app.getPath('userData'), 'hive-bundler.env');

  loadEnv(); // re-load from userData path if it exists

  ensureDataDir();

  // ── IPC handlers ─────────────────────────────────────────────────────────

  ipcMain.handle('get-config', () => ({
    isConfigured: isConfigured(),
    rpcPreview:   process.env.RPC_URL?.replace(/https?:\/\//, '').slice(0, 36) ?? '',
  }));

  ipcMain.handle('get-full-config', () => {
    const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
    const env = Object.fromEntries(
      raw.split('\n')
        .filter(l => l.includes('='))
        .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; }),
    );
    const rawBE = env.BLOCK_ENGINE_URLS ?? process.env.BLOCK_ENGINE_URLS ?? '';
    const blockEngine = rawBE.replace(/^\["|"\]$/g, '').replace(/","/g, ',').split(',')[0].trim();
    return {
      rpcUrl:      env.RPC_URL      ?? process.env.RPC_URL      ?? '',
      blockEngine: blockEngine      || 'frankfurt.mainnet.block-engine.jito.wtf',
    };
  });

  ipcMain.handle('update-config', (_evt: unknown, cfg: { rpcUrl: string; blockEngine: string }) => {
    if (!fs.existsSync(ENV_PATH)) return { ok: false, error: 'Config not found. Complete setup first.' };
    const raw = fs.readFileSync(ENV_PATH, 'utf-8');
    const updated = raw
      .split('\n')
      .map((l: string) => {
        if (l.startsWith('RPC_URL='))           return `RPC_URL=${cfg.rpcUrl.trim()}`;
        if (l.startsWith('BLOCK_ENGINE_URLS=')) return `BLOCK_ENGINE_URLS=["${cfg.blockEngine.trim()}"]`;
        return l;
      })
      .join('\n');
    fs.writeFileSync(ENV_PATH, updated);
    // Also write to project root .env so ts-node server picks it up in dev
    if (!app.isPackaged) {
      fs.writeFileSync(path.join(APP_ROOT, '.env'), updated);
    }
    return { ok: true };
  });

  ipcMain.handle('save-config', async (_: unknown, cfg: {
    signerKey:   string;
    funderKey:   string;
    rpcUrl:      string;
    blockEngine: string;
  }) => {
    const content = [
      `SIGNER_PRIVATE_KEY=${cfg.signerKey.trim()}`,
      `FUNDER_PRIVATE_KEY=${cfg.funderKey.trim()}`,
      `RPC_URL=${cfg.rpcUrl.trim()}`,
      `BLOCK_ENGINE_URLS=["${cfg.blockEngine.trim()}"]`,
    ].join('\n');

    fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
    fs.writeFileSync(ENV_PATH, content);
    if (!app.isPackaged) {
      fs.writeFileSync(path.join(APP_ROOT, '.env'), content);
    }

    process.env.SIGNER_PRIVATE_KEY  = cfg.signerKey.trim();
    process.env.FUNDER_PRIVATE_KEY  = cfg.funderKey.trim();
    process.env.RPC_URL             = cfg.rpcUrl.trim();
    process.env.BLOCK_ENGINE_URLS   = `["${cfg.blockEngine.trim()}"]`;

    const result = await startServer();
    if (result.ok) {
      setTimeout(() => mainWindow?.loadURL(`http://localhost:${PORT}`), 300);
    }
    return result;
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  if (isConfigured()) {
    await startServer();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
  setTimeout(() => process.exit(0), 300);
});
