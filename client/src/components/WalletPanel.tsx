import { useEffect, useState } from 'react';
import { AppStatus } from '../App';

interface Wallet {
  index:      number;
  pubkey:     string;
  solBalance: number;
}

export function WalletPanel({ status }: { status: AppStatus | null }) {
  const [wallets,  setWallets]  = useState<Wallet[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [reclaiming, setReclaiming] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/wallets');
      if (!r.ok) throw new Error((await r.json()).error);
      setWallets(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalSol  = wallets.reduce((s, w) => s + w.solBalance, 0);
  const funded    = wallets.filter(w => w.solBalance > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">
          Sub-wallets
          {wallets.length > 0 && (
            <span className="text-muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              {funded}/{wallets.length} funded · {totalSol.toFixed(4)} SOL total
            </span>
          )}
        </span>
        <button className="btn btn-secondary" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Loading…' : '↻  Refresh'}
        </button>
      </div>

      {/* Dev / payer quick-stats */}
      {status && (
        <div style={{
          display: 'flex', gap: 12, padding: '10px 16px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <StatCard label="Dev wallet" pubkey={status.devWallet} balance={status.devBalance} />
          <StatCard label="Payer wallet" pubkey={status.payerWallet} balance={status.payerBalance} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {status.lutAddress
              ? <Pill color="green">LUT active</Pill>
              : <Pill color="red">No LUT</Pill>
            }
            {status.hasMintPk
              ? <Pill color="orange">Mint set</Pill>
              : <Pill color="dim">No mint</Pill>
            }
          </div>
        </div>
      )}

      {/* Wallet grid */}
      <div className="scroll-area">
        {error && (
          <div className="state-center">
            <span className="text-red">{error}</span>
            <button className="btn btn-secondary" onClick={load}>Retry</button>
          </div>
        )}

        {!error && loading && wallets.length === 0 && (
          <div className="state-center">
            <div className="spinner" />
            <span>Fetching balances…</span>
          </div>
        )}

        {!error && !loading && wallets.length === 0 && (
          <div className="state-center">
            <span>No keypairs found in <code style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>src/keypairs/</code></span>
            <span className="text-muted">Run <code style={{ fontFamily: 'var(--mono)' }}>npm start → 1. Create Keypairs</code></span>
          </div>
        )}

        {wallets.length > 0 && (
          <div className="wallet-grid">
            {wallets.map(w => (
              <WalletCard key={w.pubkey} wallet={w} />
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {wallets.length > 0 && (
        <div className="info-bar" style={{ justifyContent: 'flex-end' }}>
          <span className="text-muted" style={{ flex: 1 }}>
            {funded} of {wallets.length} wallets have SOL
          </span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
            disabled={reclaiming}
            onClick={async () => {
              if (!confirm('Reclaim all SOL from sub-wallets back to payer?')) return;
              setReclaiming(true);
              // Reclaim is triggered via the interactive menu for now
              alert('Use npm start → 2. Pre Launch Checklist → 5. Reclaim Buyers Sol');
              setReclaiming(false);
            }}
          >
            Reclaim SOL
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WalletCard({ wallet }: { wallet: Wallet }) {
  const bal = wallet.solBalance;
  const cls = bal === 0 ? 'zero' : bal < 0.01 ? 'low' : '';

  return (
    <div className="wallet-card">
      <div className="wallet-index">Wallet {wallet.index}</div>
      <div className="wallet-pubkey" title={wallet.pubkey}>
        {wallet.pubkey.slice(0, 14)}…{wallet.pubkey.slice(-6)}
      </div>
      <div className={`wallet-balance ${cls}`}>
        {bal.toFixed(4)}<span>SOL</span>
      </div>
    </div>
  );
}

function StatCard({ label, pubkey, balance }: { label: string; pubkey: string; balance: number }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 3, minWidth: 180,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
        {pubkey.slice(0, 14)}…{pubkey.slice(-6)}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--orange)' }}>
        {balance.toFixed(4)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>SOL</span>
      </span>
    </div>
  );
}

function Pill({ color, children }: { color: 'green'|'orange'|'red'|'dim'; children: React.ReactNode }) {
  const colors = {
    green:  { bg: 'rgba(34,197,94,.12)',  text: '#22c55e' },
    orange: { bg: 'rgba(249,115,22,.12)', text: '#f97316' },
    red:    { bg: 'rgba(239,68,68,.12)',  text: '#ef4444' },
    dim:    { bg: 'var(--border)',        text: 'var(--text-muted)' },
  };
  const c = colors[color];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: c.bg, color: c.text, letterSpacing: '.04em', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}
