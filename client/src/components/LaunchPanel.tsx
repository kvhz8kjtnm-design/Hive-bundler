import { useEffect, useRef, useState } from 'react';
import { AppStatus } from '../App';
import { useSocket, LogEntry, RunState } from '../hooks/useSocket';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Form {
  name:         string;
  ticker:       string;
  description:  string;
  websiteUrl:   string;
  imageUrl:     string;
  twitter:      string;
  telegram:     string;
  website:      string;
  wallets:      number;
  jitoTip:      number;
  mode:         'stagger' | 'bundle';
  staggerDelay: number;
  profileGen:   boolean;
  utilityMode:  boolean;
  dryRun:       boolean;
}

const DEFAULT: Form = {
  name: '', ticker: '', description: '',
  websiteUrl: '', imageUrl: '',
  twitter: '', telegram: '', website: '',
  wallets: 24, jitoTip: 0.005,
  mode: 'stagger', staggerDelay: 2000,
  profileGen: true, utilityMode: false, dryRun: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOG_ICON: Record<string, string> = {
  step:    '›',
  success: '✓',
  warn:    '!',
  error:   '✗',
  info:    '·',
  detail:  '·',
  divider: '─',
  banner:  '◈',
};

function LogLine({ entry }: { entry: LogEntry }) {
  if (entry.level === 'divider')
    return <div className="log-line divider"><span className="log-text">{'─'.repeat(48)}</span></div>;

  return (
    <div className={`log-line ${entry.level}`}>
      <span className="log-icon">{LOG_ICON[entry.level] ?? '·'}</span>
      <span className="log-text">{entry.text}</span>
    </div>
  );
}

function RunBadge({ state }: { state: RunState }) {
  const labels: Record<RunState, string> = {
    idle:    'Idle',
    running: 'Running',
    done:    'Done',
    error:   'Error',
  };
  return <span className={`run-badge ${state}`}>{labels[state]}</span>;
}

function Toggle({
  label, desc, checked, onChange, disabled,
}: {
  label: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-info">
        <span className="toggle-label">{label}</span>
        <span className="toggle-desc">{desc}</span>
      </div>
      <label className="toggle" style={{ opacity: disabled ? .4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-track" />
        <span className="toggle-thumb" />
      </label>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LaunchPanel({
  status,
  onStatusRefresh,
}: {
  status: AppStatus | null;
  onStatusRefresh: () => void;
}) {
  const [form, setForm]         = useState<Form>({ ...DEFAULT, wallets: status?.walletCount ?? 24 });
  const [scraping, setScraping] = useState(false);
  const [scrapeErr, setScrapeErr] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const { logs, runState, connected, clearLogs } = useSocket();

  // Keep wallets in sync with discovered count
  useEffect(() => {
    if (status?.walletCount) setForm(f => ({ ...f, wallets: status.walletCount }));
  }, [status?.walletCount]);

  // Auto-scroll log panel
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const isRunning = runState === 'running';
  const maxWallets = status?.walletCount ?? 24;

  // ── Scrape ─────────────────────────────────────────────────────────────────

  const handleScrape = async () => {
    if (!form.websiteUrl.trim()) return;
    setScraping(true);
    setScrapeErr('');
    try {
      const r = await fetch('/api/scrape', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: form.websiteUrl }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setForm(f => ({
        ...f,
        name:        data.name        || f.name,
        description: data.description || f.description,
        imageUrl:    data.imageUrl    || f.imageUrl,
        twitter:     data.twitter     || f.twitter,
        telegram:    data.telegram    || f.telegram,
        website:     data.website     || f.website,
      }));
    } catch (e: any) {
      setScrapeErr(e.message);
    } finally {
      setScraping(false);
    }
  };

  // ── Launch ─────────────────────────────────────────────────────────────────

  const handleLaunch = async () => {
    if (isRunning) return;
    clearLogs();

    const payload = {
      name:         form.name.trim()        || undefined,
      ticker:       form.ticker.trim()      || undefined,
      description:  form.description.trim() || undefined,
      imageUrl:     form.imageUrl.trim()    || undefined,
      twitter:      form.twitter.trim()     || undefined,
      telegram:     form.telegram.trim()    || undefined,
      website:      form.website.trim()     || undefined,
      wallets:      form.wallets,
      jitoTip:      form.jitoTip,
      bundle:       form.mode === 'bundle',
      staggerDelay: form.staggerDelay,
      profileGen:   form.profileGen,
      utilityMode:  form.utilityMode,
      dryRun:       form.dryRun,
    };

    const r = await fetch('/api/launch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!r.ok) {
      const err = await r.json();
      alert(`Launch failed: ${err.error}`);
    }
  };

  const canLaunch = form.name.trim() && form.ticker.trim() && !isRunning && connected;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

      {/* ── Left: form ── */}
      <div className="scroll-area" style={{ width: 400, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Website scraper */}
          <div className="section">
            <div className="section-header">🌐  Load from Website</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex-gap">
                <input
                  type="url"
                  placeholder="https://yourproject.com"
                  value={form.websiteUrl}
                  onChange={e => set('websiteUrl', e.target.value)}
                  disabled={isRunning}
                  onKeyDown={e => e.key === 'Enter' && handleScrape()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleScrape}
                  disabled={isRunning || scraping || !form.websiteUrl.trim()}
                  style={{ flexShrink: 0 }}
                >
                  {scraping ? '…' : 'Fetch'}
                </button>
              </div>
              {scrapeErr && <p style={{ fontSize: 11, color: 'var(--red)' }}>{scrapeErr}</p>}
              <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Auto-fills name, image and social links from og: meta tags.
              </p>
            </div>
          </div>

          {/* Token identity */}
          <div className="section">
            <div className="section-header">◈  Token Identity</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">Name <span>*</span></label>
                  <input type="text" placeholder="My Token" value={form.name}
                    onChange={e => set('name', e.target.value)} disabled={isRunning} />
                </div>
                <div className="field-group">
                  <label className="field-label">Ticker <span>*</span></label>
                  <input type="text" placeholder="MTK" value={form.ticker}
                    onChange={e => set('ticker', e.target.value.toUpperCase())} disabled={isRunning} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Description <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>({form.description.length}/30)</span></label>
                <input type="text" placeholder="Short description…" maxLength={60}
                  value={form.description}
                  onChange={e => set('description', e.target.value)} disabled={isRunning} />
              </div>
              <div className="field-group">
                <label className="field-label">Image URL</label>
                <input type="url" placeholder="https://… (or use ./img/)" value={form.imageUrl}
                  onChange={e => set('imageUrl', e.target.value)} disabled={isRunning} />
              </div>
            </div>
          </div>

          {/* Social links */}
          <div className="section">
            <div className="section-header">🔗  Social Links</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field-group">
                <label className="field-label">Twitter / X</label>
                <input type="url" placeholder="https://x.com/project" value={form.twitter}
                  onChange={e => set('twitter', e.target.value)} disabled={isRunning} />
              </div>
              <div className="field-group">
                <label className="field-label">Telegram</label>
                <input type="url" placeholder="https://t.me/project" value={form.telegram}
                  onChange={e => set('telegram', e.target.value)} disabled={isRunning} />
              </div>
              <div className="field-group">
                <label className="field-label">Website</label>
                <input type="url" placeholder="https://yourproject.com" value={form.website}
                  onChange={e => set('website', e.target.value)} disabled={isRunning} />
              </div>
            </div>
          </div>

          {/* Config */}
          <div className="section">
            <div className="section-header">⚙  Launch Config</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div className="field-group">
                <label className="field-label">
                  Sub-wallets &nbsp;
                  <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{form.wallets}</strong>
                  &nbsp;/ {maxWallets}
                </label>
                <input type="range" min={1} max={maxWallets || 24} value={form.wallets}
                  onChange={e => set('wallets', +e.target.value)} disabled={isRunning} />
              </div>

              <div className="field-group">
                <label className="field-label">Jito Tip (SOL)</label>
                <input type="number" min={0.001} max={1} step={0.001}
                  value={form.jitoTip}
                  onChange={e => set('jitoTip', +e.target.value)} disabled={isRunning} />
              </div>

              <div className="field-group">
                <label className="field-label">Send Mode</label>
                <div className="mode-selector">
                  <div className={`mode-option${form.mode === 'stagger' ? ' selected' : ''}`}
                    onClick={() => !isRunning && set('mode', 'stagger')}>
                    <span className="mode-title">Stagger</span>
                    <span className="mode-desc">Organic-looking buys via RPC</span>
                  </div>
                  <div className={`mode-option${form.mode === 'bundle' ? ' selected' : ''}`}
                    onClick={() => !isRunning && set('mode', 'bundle')}>
                    <span className="mode-title">Bundle</span>
                    <span className="mode-desc">Single Jito bundle, max MEV protection</span>
                  </div>
                </div>
              </div>

              {form.mode === 'stagger' && (
                <div className="field-group">
                  <label className="field-label">Stagger Delay (ms)</label>
                  <input type="number" min={500} max={10000} step={500}
                    value={form.staggerDelay}
                    onChange={e => set('staggerDelay', +e.target.value)} disabled={isRunning} />
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="section">
            <div className="section-header">✦  Options</div>
            <div className="section-body">
              <Toggle label="Profile Generation" disabled={isRunning}
                desc="Assign random trader profiles to each wallet"
                checked={form.profileGen} onChange={v => set('profileGen', v)} />
              <Toggle label="Utility Mode" disabled={isRunning}
                desc="Tag metadata as a HiveGuard utility token"
                checked={form.utilityMode} onChange={v => set('utilityMode', v)} />
              <Toggle label="Dry Run" disabled={isRunning}
                desc="Simulate transactions without sending anything"
                checked={form.dryRun} onChange={v => set('dryRun', v)} />
            </div>
          </div>

          {/* Launch button */}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleLaunch}
            disabled={!canLaunch}
          >
            {isRunning
              ? '⟳  Running…'
              : form.dryRun
              ? '▷  Simulate Launch'
              : '▶  Launch Token'}
          </button>

          {!connected && (
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--red)' }}>
              WebSocket disconnected — reload to reconnect
            </p>
          )}

        </div>
      </div>

      {/* ── Right: log panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0 }}>
        <div className="log-panel">
          <div className="log-header">
            <span className="log-title">Output</span>
            <RunBadge state={runState} />
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={clearLogs} disabled={isRunning}>
              Clear
            </button>
          </div>
          <div className="log-body">
            {logs.length === 0
              ? <div className="log-empty">Output will appear here when you launch</div>
              : logs.map(e => <LogLine key={e.id} entry={e} />)
            }
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Dev/payer info footer */}
        {status && (
          <div className="info-bar">
            <span>Dev &nbsp;<strong className="monospace">{status.devWallet.slice(0, 16)}…</strong></span>
            <span><strong className="monospace text-orange">{status.devBalance.toFixed(3)} SOL</strong></span>
            <span style={{ marginLeft: 16 }}>Payer &nbsp;<strong className="monospace">{status.payerWallet.slice(0, 16)}…</strong></span>
            <span><strong className="monospace text-orange">{status.payerBalance.toFixed(3)} SOL</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
