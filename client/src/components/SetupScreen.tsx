import { useState } from 'react';

const BLOCK_ENGINES = [
  { label: 'Frankfurt (Europe)',       value: 'frankfurt.mainnet.block-engine.jito.wtf' },
  { label: 'Amsterdam (Europe)',       value: 'amsterdam.mainnet.block-engine.jito.wtf' },
  { label: 'New York (North America)', value: 'ny.mainnet.block-engine.jito.wtf' },
  { label: 'Salt Lake City (NA)',      value: 'slc.mainnet.block-engine.jito.wtf' },
  { label: 'Tokyo (Asia)',             value: 'tokyo.mainnet.block-engine.jito.wtf' },
];

interface SetupForm {
  signerKey:    string;
  funderKey:    string;
  sameWallet:   boolean;
  rpcUrl:       string;
  blockEngine:  string;
}

export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState<SetupForm>({
    signerKey:   '',
    funderKey:   '',
    sameWallet:  true,
    rpcUrl:      '',
    blockEngine: BLOCK_ENGINES[0].value,
  });

  const [status, setStatus]     = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  const set = <K extends keyof SetupForm>(k: K, v: SetupForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const canSubmit =
    form.signerKey.trim() &&
    (form.sameWallet || form.funderKey.trim()) &&
    form.rpcUrl.trim();

  const handleSubmit = async () => {
    if (!canSubmit || status === 'saving') return;
    setStatus('saving');
    setErrorMsg('');

    const cfg = {
      signerKey:   form.signerKey.trim(),
      funderKey:   form.sameWallet ? form.signerKey.trim() : form.funderKey.trim(),
      rpcUrl:      form.rpcUrl.trim(),
      blockEngine: form.blockEngine,
    };

    try {
      const api = (window as any).electronAPI;
      const result = await api.saveConfig(cfg);
      if (result.ok) {
        // Stay on spinner — main process navigates window to localhost:3000,
        // which triggers a full page reload into the configured app.
      } else {
        setErrorMsg(result.error ?? 'Failed to start — check your private keys and RPC URL.');
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Unexpected error.');
      setStatus('error');
    }
  };

  if (status === 'saving') {
    return (
      <div className="setup-overlay">
        <div className="setup-card">
          <div className="setup-spinner-wrap">
            <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p className="setup-loading-text">Starting Hive Bundler…</p>
            <p className="setup-loading-sub">Connecting to Solana and verifying keys</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-overlay">
      <div className="setup-card">

        {/* Logo */}
        <div className="setup-logo">
          <span className="setup-logo-icon">◈</span>
          <span className="setup-logo-name">Hive Bundler</span>
        </div>

        <h1 className="setup-title">Connect your wallets</h1>
        <p className="setup-subtitle">
          Your keys are stored locally on this machine and never sent anywhere.
        </p>

        {/* Form */}
        <div className="setup-form">

          {/* Signer key */}
          <div className="setup-field">
            <label className="setup-label">
              Dev / Signer Wallet <span className="setup-required">*</span>
              <span className="setup-hint">Creates the token and does the dev buy</span>
            </label>
            <div className="setup-input-wrap">
              <input
                type={showKeys ? 'text' : 'password'}
                className="setup-input"
                placeholder="Base58 private key (export from Phantom / Solflare)"
                value={form.signerKey}
                onChange={e => set('signerKey', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Same wallet toggle */}
          <label className="setup-same-wallet">
            <input
              type="checkbox"
              checked={form.sameWallet}
              onChange={e => set('sameWallet', e.target.checked)}
            />
            <span>Use same wallet as funder / fee-payer</span>
          </label>

          {/* Funder key */}
          {!form.sameWallet && (
            <div className="setup-field">
              <label className="setup-label">
                Funder / Fee-Payer Wallet <span className="setup-required">*</span>
                <span className="setup-hint">Funds sub-wallets and pays transaction fees</span>
              </label>
              <input
                type={showKeys ? 'text' : 'password'}
                className="setup-input"
                placeholder="Base58 private key"
                value={form.funderKey}
                onChange={e => set('funderKey', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {/* Show/hide keys */}
          <button
            className="setup-show-keys"
            type="button"
            onClick={() => setShowKeys(s => !s)}
          >
            {showKeys ? '🙈  Hide keys' : '👁  Show keys'}
          </button>

          <div className="setup-divider" />

          {/* RPC URL */}
          <div className="setup-field">
            <label className="setup-label">
              Solana RPC URL <span className="setup-required">*</span>
              <span className="setup-hint">Helius, QuickNode, Triton, etc. — private RPCs work best</span>
            </label>
            <input
              type="url"
              className="setup-input"
              placeholder="https://mainnet.helius-rpc.com/?api-key=…"
              value={form.rpcUrl}
              onChange={e => set('rpcUrl', e.target.value)}
            />
          </div>

          {/* Block engine */}
          <div className="setup-field">
            <label className="setup-label">
              Jito Block Engine
              <span className="setup-hint">Choose the region closest to you</span>
            </label>
            <select
              className="setup-input"
              value={form.blockEngine}
              onChange={e => set('blockEngine', e.target.value)}
            >
              {BLOCK_ENGINES.map(be => (
                <option key={be.value} value={be.value}>{be.label}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {status === 'error' && (
            <div className="setup-error">
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            className="setup-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Launch Hive Bundler →
          </button>

        </div>

        <p className="setup-footer">
          Keys are saved to your local app data. You can update them from Settings later.
        </p>
      </div>
    </div>
  );
}
