import { useEffect, useState } from 'react';
import { LaunchPanel }   from './components/LaunchPanel';
import { WalletPanel }   from './components/WalletPanel';
import { GuidePanel }    from './components/GuidePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SetupScreen }   from './components/SetupScreen';

export interface AppStatus {
  devWallet:    string;
  payerWallet:  string;
  devBalance:   number;
  payerBalance: number;
  walletCount:  number;
  lutAddress:   string | null;
  hasMintPk:    boolean;
  isRunning:    boolean;
}

type Tab      = 'launch' | 'wallets' | 'guide' | 'settings';
type AppState = 'checking' | 'setup' | 'ready' | 'serverError';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

export default function App() {
  const [appState, setAppState] = useState<AppState>('checking');
  const [tab,      setTab]      = useState<Tab>('launch');
  const [status,   setStatus]   = useState<AppStatus | null>(null);

  // ── Determine whether to show setup screen (Electron only) ──────────────────
  useEffect(() => {
    if (!isElectron) { setAppState('ready'); return; }
    window.electronAPI!.getConfig()
      .then(cfg => setAppState(cfg.isConfigured ? 'ready' : 'setup'))
      .catch(() => setAppState('ready'));
  }, []);

  // ── Fetch server status once app is ready ────────────────────────────────────
  useEffect(() => {
    if (appState !== 'ready') return;

    // If we're on file:// the server failed to start — stay on a safe screen
    if (window.location.protocol === 'file:') {
      setAppState('serverError');
      return;
    }

    fetch('/api/status')
      .then(r => r.ok ? r.json() : null)
      .then((d: AppStatus | null) => { if (d?.devWallet) setStatus(d); })
      .catch(console.error);
  }, [appState]);

  const refreshStatus = () => {
    fetch('/api/status')
      .then(r => r.ok ? r.json() : null)
      .then((d: AppStatus | null) => { if (d?.devWallet) setStatus(d); })
      .catch(console.error);
  };

  // ── Loading splash ───────────────────────────────────────────────────────────
  if (appState === 'checking') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: 12,
      }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Starting…</span>
      </div>
    );
  }

  // ── Setup screen (first-run, Electron only) ──────────────────────────────────
  if (appState === 'setup') {
    return <SetupScreen onComplete={() => setAppState('ready')} />;
  }

  // ── Server failed to start ───────────────────────────────────────────────────
  if (appState === 'serverError') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: 'var(--bg)',
        gap: 16, padding: 32, textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, color: 'var(--orange)' }}>◈</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
          Server failed to start
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
          Check the terminal for the exact error. Common causes:
        </div>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '14px 20px', textAlign: 'left',
          fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)',
          maxWidth: 440, lineHeight: 1.8,
        }}>
          Port already in use → <span style={{ color: 'var(--orange)' }}>lsof -ti:3000 | xargs kill -9</span>{'\n\n'}
          Invalid private key → re-run setup{'\n\n'}
          Missing .env → copy .env.example to .env
        </div>
        <button
          style={{
            marginTop: 8, padding: '9px 20px', background: 'var(--orange)',
            color: '#000', border: 'none', borderRadius: 6,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Main app ─────────────────────────────────────────────────────────────────
  const lut  = status?.lutAddress;
  const wCnt = status?.walletCount ?? 0;

  return (
    <div className="app">
      {/* ── Top nav ── */}
      <nav className="nav">
        <div className="nav-logo">
          <span className="nav-logo-icon">◈</span>
          <span>Hive Bundler</span>
          <span className="nav-logo-version">v2.0</span>
        </div>

        <div className="nav-tabs">
          {(['launch', 'wallets', 'guide', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              className={`nav-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="nav-spacer" />

        <div className="nav-status">
          <div className="status-pill">
            <span className={`status-dot ${lut ? 'green' : 'red'}`} />
            LUT {lut ? lut.slice(0, 6) + '…' : 'not set'}
          </div>
          <div className="status-pill">
            <span className={`status-dot ${wCnt > 0 ? 'green' : 'red'}`} />
            {wCnt} wallet{wCnt !== 1 ? 's' : ''}
          </div>
          {status && (
            <div className="status-pill">
              <span className="status-dot green" />
              {status.devWallet.slice(0, 6)}…
            </div>
          )}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="content">
        {tab === 'launch'   && <LaunchPanel   status={status} onStatusRefresh={refreshStatus} />}
        {tab === 'wallets'  && <WalletPanel   status={status} />}
        {tab === 'guide'    && <GuidePanel    status={status} />}
        {tab === 'settings' && <SettingsPanel status={status} />}
      </div>
    </div>
  );
}
