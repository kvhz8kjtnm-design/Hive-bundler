import { useEffect, useState } from 'react';
import { AppStatus } from '../App';

const BLOCK_ENGINES = [
  { label: 'Frankfurt (Europe)',       value: 'frankfurt.mainnet.block-engine.jito.wtf' },
  { label: 'Amsterdam (Europe)',       value: 'amsterdam.mainnet.block-engine.jito.wtf' },
  { label: 'New York (North America)', value: 'ny.mainnet.block-engine.jito.wtf' },
  { label: 'Salt Lake City (NA)',      value: 'slc.mainnet.block-engine.jito.wtf' },
  { label: 'Tokyo (Asia)',             value: 'tokyo.mainnet.block-engine.jito.wtf' },
];

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

export function SettingsPanel({ status }: { status: AppStatus | null }) {
  const [rpcUrl,       setRpcUrl]       = useState('');
  const [blockEngine,  setBlockEngine]  = useState(BLOCK_ENGINES[0].value);
  const [saveState,    setSaveState]    = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [loading,      setLoading]      = useState(true);

  // Load current config on mount
  useEffect(() => {
    const load = async () => {
      try {
        if (isElectron) {
          const cfg = await window.electronAPI!.getFullConfig();
          setRpcUrl(cfg.rpcUrl ?? '');
          setBlockEngine(cfg.blockEngine ?? BLOCK_ENGINES[0].value);
        } else {
          const r = await fetch('/api/config');
          const cfg = await r.json();
          setRpcUrl(cfg.rpcUrl ?? '');
          setBlockEngine(cfg.blockEngine ?? BLOCK_ENGINES[0].value);
        }
      } catch { /* use defaults */ }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!rpcUrl.trim()) return;
    setSaveState('saving');
    setErrorMsg('');
    try {
      if (isElectron) {
        await window.electronAPI!.updateConfig({ rpcUrl: rpcUrl.trim(), blockEngine });
      } else {
        await fetch('/api/config', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rpcUrl: rpcUrl.trim(), blockEngine }),
        });
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Save failed.');
      setSaveState('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <div className="panel-header">
        <span className="panel-title">Settings</span>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>

          {/* Connection */}
          <div className="section">
            <div className="section-header">🔌  Connection</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="field-group">
                <label className="field-label">Solana RPC URL</label>
                {loading
                  ? <div style={{ height: 34, background: 'var(--border)', borderRadius: 'var(--radius)', opacity: .4 }} />
                  : <input
                      type="url"
                      value={rpcUrl}
                      onChange={e => setRpcUrl(e.target.value)}
                      placeholder="https://mainnet.helius-rpc.com/?api-key=…"
                    />
                }
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Private RPCs (Helius, QuickNode, Triton) are strongly recommended for reliable launches.
                  Free keys at <span style={{ color: 'var(--orange)' }}>helius.dev</span>
                </p>
              </div>

              <div className="field-group">
                <label className="field-label">Jito Block Engine</label>
                {loading
                  ? <div style={{ height: 34, background: 'var(--border)', borderRadius: 'var(--radius)', opacity: .4 }} />
                  : <select value={blockEngine} onChange={e => setBlockEngine(e.target.value)}>
                      {BLOCK_ENGINES.map(be => (
                        <option key={be.value} value={be.value}>{be.label}</option>
                      ))}
                    </select>
                }
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Choose the region geographically closest to you for the lowest latency.
                </p>
              </div>

              {saveState === 'saved' && (
                <div style={{
                  background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)',
                  borderRadius: 'var(--radius)', padding: '10px 12px',
                  fontSize: 12, color: 'var(--green)',
                }}>
                  ✓ Saved. Restart the app to apply the new RPC connection.
                </div>
              )}
              {saveState === 'error' && (
                <div style={{
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                  borderRadius: 'var(--radius)', padding: '10px 12px',
                  fontSize: 12, color: 'var(--red)',
                }}>
                  Error: {errorMsg}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!rpcUrl.trim() || saveState === 'saving' || loading}
                style={{ alignSelf: 'flex-start', minWidth: 100 }}
              >
                {saveState === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Wallet info */}
          {status && (
            <div className="section">
              <div className="section-header">💳  Wallets</div>
              <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                <InfoRow label="Dev / Signer wallet" value={status.devWallet} mono />
                <InfoRow label="Funder / Payer wallet" value={status.payerWallet} mono />
                <InfoRow label="Sub-wallets loaded" value={String(status.walletCount)} />
                <InfoRow
                  label="LUT address"
                  value={status.lutAddress ?? 'Not created yet'}
                  mono={!!status.lutAddress}
                  dim={!status.lutAddress}
                />

                <p style={{
                  fontSize: 11, color: 'var(--text-dim)', marginTop: 4,
                  paddingTop: 10, borderTop: '1px solid var(--border)',
                }}>
                  To change wallets, close the app, delete{' '}
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                    ~/Library/Application Support/HiveGuard Bundler/hiveguard.env
                  </span>
                  , then reopen and run setup again.
                </p>
              </div>
            </div>
          )}

          {/* About */}
          <div className="section">
            <div className="section-header">ℹ  About</div>
            <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <InfoRow label="Version" value="2.0.0" />
              <InfoRow label="Network" value="Solana Mainnet" />
              <InfoRow label="Platform" value="Pump.Fun" />
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text-dim)',
              }}>
                Built by{' '}
                <span style={{ color: 'var(--orange)' }}>HiveGuard.pro</span>
                {' '}— professional Solana token launch infrastructure.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label, value, mono, dim,
}: {
  label: string; value: string; mono?: boolean; dim?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{
        fontSize: 12, color: 'var(--text-muted)', width: 160, flexShrink: 0, paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 12,
        fontFamily: mono ? 'var(--mono)' : 'var(--font)',
        color: dim ? 'var(--text-dim)' : 'var(--text)',
        wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  );
}
