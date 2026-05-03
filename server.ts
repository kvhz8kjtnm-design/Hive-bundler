// ─── IMPORTANT ───────────────────────────────────────────────────────────────
// Zero Solana/bundler imports at module load time.
// All @solana/web3.js, jito-ts, @coral-xyz/anchor etc. are lazy-imported
// inside request handlers. This prevents "Class extends value undefined"
// in Electron's main process where those packages fail to initialise.
// ─────────────────────────────────────────────────────────────────────────────

import express, { Response } from 'express';
import { createServer }      from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors  from 'cors';
import path  from 'path';
import fs    from 'fs';
import { setLogSubscriber, setServerMode, LogLevel, logger } from './src/logger';

type BundleLaunchOptions = import('./src/commands/bundleLaunch').BundleLaunchOptions;

// ─── Setup ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.UI_PORT ?? '3000', 10);

// When running as a child process from Electron, HIVEGUARD_APP_ROOT and
// HIVEGUARD_DATA_DIR are set by electron/main.ts. Fall back to __dirname
// for standalone `ts-node server.ts` usage.
const APP_ROOT   = process.env.HIVEGUARD_APP_ROOT ?? path.join(__dirname, '..');
const DATA_DIR   = process.env.HIVEGUARD_DATA_DIR ?? APP_ROOT;
const CLIENT_DIR = path.join(APP_ROOT, 'client', 'dist');
const KEY_INFO   = path.join(DATA_DIR, 'src', 'keyInfo.json');

const app        = express();
const httpServer = createServer(app);
const wss        = new WebSocketServer({ server: httpServer, path: '/ws' });

app.use(cors());
app.use(express.json());

if (fs.existsSync(CLIENT_DIR)) app.use(express.static(CLIENT_DIR));

// ─── WebSocket ────────────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();
let isRunning = false;

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'status', state: isRunning ? 'running' : 'idle' }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  }
}

setServerMode(true);
setLogSubscriber((level: LogLevel, text: string) =>
  broadcast({ type: 'log', level, text }),
);

// ─── Lazy loader helpers ──────────────────────────────────────────────────────

// Cached lazy imports so we don't re-import on every request
let _config:     typeof import('./config')           | null = null;
let _keys:       typeof import('./src/createKeys')   | null = null;
let _scraper:    typeof import('./src/utils/webscraper') | null = null;

const cfg    = () => _config  ??= require('./config');
const keys   = () => _keys    ??= require('./src/createKeys');
const scraper = () => _scraper ??= require('./src/utils/webscraper');

function runAsync(fn: () => Promise<void>, res: Response) {
  broadcast({ type: 'status', state: 'running' });
  res.json({ ok: true });
  fn()
    .then(() => broadcast({ type: 'status', state: 'done' }))
    .catch((e: Error) => {
      broadcast({ type: 'log', level: 'error', text: e.message });
      broadcast({ type: 'status', state: 'error', message: e.message });
    });
}

// ─── API: status ──────────────────────────────────────────────────────────────

app.get('/api/status', async (_req, res) => {
  try {
    const { wallet, payer, connection } = cfg();
    const { loadKeypairs } = keys();
    const keyInfo = fs.existsSync(KEY_INFO)
      ? JSON.parse(fs.readFileSync(KEY_INFO, 'utf-8'))
      : {};

    const [devBal, payerBal] = await Promise.all([
      connection.getBalance(wallet.publicKey).catch(() => 0),
      connection.getBalance(payer.publicKey).catch(() => 0),
    ]);

    res.json({
      devWallet:    wallet.publicKey.toString(),
      payerWallet:  payer.publicKey.toString(),
      devBalance:   devBal   / 1e9,
      payerBalance: payerBal / 1e9,
      walletCount:  loadKeypairs().length,
      lutAddress:   keyInfo.addressLUT ?? null,
      hasMintPk:    !!keyInfo.mintPk,
      isRunning,
    });
  } catch (e: any) {
    console.error('[/api/status] ERROR:', e.message);
    console.error(e.stack);
    res.status(500).json({ error: e.message });
  }
});

// ─── API: wallets ─────────────────────────────────────────────────────────────

app.get('/api/wallets', async (_req, res) => {
  try {
    const { connection } = cfg();
    const { loadKeypairs } = keys();
    const keypairs = loadKeypairs();
    if (keypairs.length === 0) return res.json([]);

    const accounts = await connection
      .getMultipleAccountsInfo(keypairs.map((k: any) => k.publicKey))
      .catch(() => keypairs.map(() => null));

    res.json(keypairs.map((kp: any, i: number) => ({
      index:      i + 1,
      pubkey:     kp.publicKey.toString(),
      solBalance: ((accounts as any[])[i]?.lamports ?? 0) / 1e9,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: scrape ──────────────────────────────────────────────────────────────

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url?.trim()) return res.status(400).json({ error: 'url is required' });
  try {
    const { scrapeWebsiteMeta } = scraper();
    res.json(await scrapeWebsiteMeta(url.trim()));
  } catch (e: any) {
    res.status(500).json({ error: `Scrape failed: ${e.message}` });
  }
});

// ─── API: launch ──────────────────────────────────────────────────────────────

app.post('/api/launch', (req, res) => {
  if (isRunning) return res.status(409).json({ error: 'A launch is already in progress.' });

  const opts = req.body as BundleLaunchOptions;
  if (!opts.name?.trim())   return res.status(400).json({ error: 'name is required' });
  if (!opts.ticker?.trim()) return res.status(400).json({ error: 'ticker is required' });

  isRunning = true;
  broadcast({ type: 'status', state: 'running' });
  res.json({ ok: true });

  import('./src/commands/bundleLaunch').then(({ bundleLaunch }) =>
    bundleLaunch(opts)
      .then(() => { isRunning = false; broadcast({ type: 'status', state: 'done' }); })
      .catch((err: Error) => { isRunning = false; broadcast({ type: 'status', state: 'error', message: err.message }); })
  );
});

// ─── API: setup actions ───────────────────────────────────────────────────────

app.post('/api/setup/keypairs', (req, res) => {
  const count = Math.min(parseInt((req.body as any).count ?? '24', 10), 24);
  runAsync(async () => {
    const { generateKeypairsUI } = keys();
    logger.step(`Generating ${count} sub-wallets`);
    await generateKeypairsUI(count);
    logger.success(`${count} keypairs saved to src/keypairs/`);
  }, res);
});

app.post('/api/setup/lut', (req, res) => {
  const tip = parseFloat((req.body as any).jitoTip ?? '0.001');
  runAsync(async () => {
    const { createLUTWithTip } = await import('./src/createLUT');
    logger.step('Creating Lookup Table');
    await createLUTWithTip(tip);
    logger.success('LUT created successfully');
  }, res);
});

app.post('/api/setup/extend-lut', (req, res) => {
  const { jitoTip, vanityPK } = req.body as { jitoTip?: string; vanityPK?: string };
  runAsync(async () => {
    const { extendLUTWithParams } = await import('./src/createLUT');
    logger.step('Extending LUT with wallet addresses');
    await extendLUTWithParams(parseFloat(jitoTip ?? '0.001'), vanityPK?.trim() || undefined);
    logger.success('LUT extended — mint keypair generated');
  }, res);
});

app.post('/api/setup/buy-amounts', async (req, res) => {
  const dev     = parseFloat((req.body as any).devSol    ?? '0.05');
  const wallet_ = parseFloat((req.body as any).walletSol ?? '0.01');
  try {
    const { saveBuyAmountsUI } = await import('./src/senderUI');
    logger.step('Calculating and saving buy amounts');
    const result = saveBuyAmountsUI(dev, wallet_);
    logger.success(`Saved — ${result.walletCount} wallets · ${result.totalSol.toFixed(3)} SOL total · ${result.totalPct.toFixed(2)}% supply`);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/setup/fund', (req, res) => {
  const tip = parseFloat((req.body as any).jitoTip ?? '0.005');
  runAsync(async () => {
    const { fundWalletsWithTip } = await import('./src/senderUI');
    logger.step('Funding sub-wallets from payer');
    await fundWalletsWithTip(tip);
    logger.success('Sub-wallets funded');
  }, res);
});

// ─── API: config ──────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const envPath = process.env.HIVEGUARD_ENV_PATH ?? path.join(APP_ROOT, '.env');
  if (!fs.existsSync(envPath)) return res.status(404).json({ error: '.env not found' });
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env = Object.fromEntries(raw.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()];
  }));
  const be = (env.BLOCK_ENGINE_URLS ?? '').replace(/^\["|"\]$/g, '').split(',')[0].trim();
  res.json({ rpcUrl: env.RPC_URL ?? '', blockEngine: be });
});

app.post('/api/config', (req, res) => {
  const { rpcUrl, blockEngine } = req.body as { rpcUrl?: string; blockEngine?: string };
  if (!rpcUrl?.trim()) return res.status(400).json({ error: 'rpcUrl is required' });
  const envPath = process.env.HIVEGUARD_ENV_PATH ?? path.join(APP_ROOT, '.env');
  if (!fs.existsSync(envPath)) return res.status(404).json({ error: '.env not found' });
  const updated = fs.readFileSync(envPath, 'utf-8').split('\n').map(l => {
    if (l.startsWith('RPC_URL='))           return `RPC_URL=${rpcUrl.trim()}`;
    if (l.startsWith('BLOCK_ENGINE_URLS=') && blockEngine) return `BLOCK_ENGINE_URLS=["${blockEngine.trim()}"]`;
    return l;
  }).join('\n');
  fs.writeFileSync(envPath, updated);
  res.json({ ok: true });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

if (fs.existsSync(CLIENT_DIR)) {
  app.get('/*path', (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));
}

// ─── Start ────────────────────────────────────────────────────────────────────

// Resolves when the server is actually accepting connections.
// electron/main.ts awaits this before loading the window URL.
export const ready = new Promise<void>((resolve, reject) => {
  httpServer.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      reject(new Error(`Port ${PORT} is already in use. Run: lsof -ti:${PORT} | xargs kill -9`));
    } else {
      reject(err);
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`\n  ◈ Hive Bundler  →  http://localhost:${PORT}\n`);
    resolve();
  });
});
