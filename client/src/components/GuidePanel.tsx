import { useEffect, useRef, useState } from 'react';
import { AppStatus } from '../App';
import { useSocket, LogEntry } from '../hooks/useSocket';

// ─── Mini log panel ───────────────────────────────────────────────────────────

const LOG_ICON: Record<string, string> = {
  step: '›', success: '✓', warn: '!', error: '✗', info: '·', detail: '·', divider: '─', banner: '◈',
};

function MiniLog({ logs, runState }: { logs: LogEntry[]; runState: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div style={{
      background: '#000', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '8px 12px', marginTop: 10, maxHeight: 160, overflowY: 'auto',
      fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7,
    }}>
      {logs.map(e => (
        <div key={e.id} className={`log-line ${e.level}`} style={{ fontSize: 11 }}>
          <span className="log-icon" style={{ width: 12 }}>{LOG_ICON[e.level] ?? '·'}</span>
          <span className="log-text">{e.text}</span>
        </div>
      ))}
      {runState === 'running' && (
        <div style={{ color: 'var(--orange)', marginTop: 2 }}>
          <span style={{ animation: 'spin .7s linear infinite', display: 'inline-block' }}>⟳</span>
          {' '}Running…
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

// ─── Action button + inline form ──────────────────────────────────────────────

interface ActionField {
  key:         string;
  label:       string;
  type:        'number' | 'text';
  default:     string;
  placeholder: string;
  hint?:       string;
}

function ActionForm({
  fields, submitLabel, endpoint, onDone, disabled,
}: {
  fields:      ActionField[];
  submitLabel: string;
  endpoint:    string;
  onDone:      () => void;
  disabled:    boolean;
}) {
  const [values, setValues]   = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, f.default])),
  );
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState('');
  const { logs, runState, clearLogs } = useSocket();

  const stepsLogs = logs.slice(-40); // last 40 lines

  useEffect(() => {
    if (runState === 'done') { setRunning(false); onDone(); }
    if (runState === 'error') { setRunning(false); }
  }, [runState]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    clearLogs();
    const body: Record<string, string> = {};
    fields.forEach(f => { body[f.key] = values[f.key]; });
    try {
      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        setError(err.error ?? 'Request failed');
        setRunning(false);
      }
      // success — wait for WS 'done' status
    } catch (e: any) {
      setError(e.message);
      setRunning(false);
    }
  };

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map(f => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>
            {f.label}
          </label>
          <input
            type={f.type}
            value={values[f.key]}
            placeholder={f.placeholder}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            disabled={running || disabled}
            style={{ flex: 1, padding: '5px 8px', fontSize: 12 }}
          />
          {f.hint && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{f.hint}</span>}
        </div>
      ))}

      {error && <p style={{ fontSize: 11, color: 'var(--red)' }}>✗ {error}</p>}

      <button
        className="btn btn-primary"
        onClick={handleRun}
        disabled={running || disabled}
        style={{ alignSelf: 'flex-start', minWidth: 120, fontSize: 12 }}
      >
        {running ? '⟳  Running…' : submitLabel}
      </button>

      <MiniLog logs={stepsLogs} runState={runState} />
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepDef {
  num:         number;
  title:       string;
  what:        string;
  tip?:        string;
  done:        boolean;
  action?:     {
    label:     string;
    endpoint:  string;
    fields:    ActionField[];
  };
}

function StepCard({ step, isNext, onDone }: { step: StepDef; isNext: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background:   'var(--card)',
      border:       `1px solid ${step.done ? 'rgba(34,197,94,.3)' : isNext ? 'rgba(249,115,22,.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding:      '14px 16px',
      opacity:      (!step.done && !isNext) ? .55 : 1,
      transition:   'opacity .2s, border-color .2s',
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* Step circle */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: step.done ? 15 : 12, fontWeight: 600,
          background: step.done ? 'rgba(34,197,94,.15)' : isNext ? 'rgba(249,115,22,.15)' : 'var(--border)',
          color: step.done ? 'var(--green)' : isNext ? 'var(--orange)' : 'var(--text-dim)',
          border: `1px solid ${step.done ? 'rgba(34,197,94,.3)' : isNext ? 'rgba(249,115,22,.3)' : 'transparent'}`,
        }}>
          {step.done ? '✓' : step.num}
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: step.done ? 'var(--green)' : 'var(--text)' }}>
              {step.title}
            </span>
            {step.done && <Badge color="green">Done</Badge>}
            {isNext && !step.done && <Badge color="orange">Up next</Badge>}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: step.action ? 8 : 0 }}>
            {step.what}
          </p>

          {step.tip && (
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--border)', lineHeight: 1.5 }}>
              💡 {step.tip}
            </p>
          )}

          {/* Action button / form */}
          {step.action && !step.done && (
            <div style={{ marginTop: 8 }}>
              {!open ? (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={() => setOpen(true)}
                  disabled={!isNext && !step.done}
                >
                  {step.action.label} →
                </button>
              ) : (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border-bright)',
                  borderRadius: 'var(--radius)', padding: '12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {step.action.label}
                    </span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => setOpen(false)}>✕</button>
                  </div>
                  <ActionForm
                    fields={step.action.fields}
                    submitLabel={step.action.label}
                    endpoint={step.action.endpoint}
                    onDone={() => { setOpen(false); onDone(); }}
                    disabled={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: 'green' | 'orange'; children: React.ReactNode }) {
  const c = color === 'green'
    ? { bg: 'rgba(34,197,94,.12)',  text: 'var(--green)'  }
    : { bg: 'rgba(249,115,22,.12)', text: 'var(--orange)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
      background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: '.05em' }}>
      {children}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const TIP_FIELDS: ActionField[] = [
  { key: 'jitoTip', label: 'Jito tip (SOL)', type: 'number', default: '0.001', placeholder: '0.001', hint: 'SOL' },
];

export function GuidePanel({ status }: { status: AppStatus | null }) {
  const [tick, setTick] = useState(0); // force re-render after actions
  const refresh = () => setTick(t => t + 1);

  const hasWallets = (status?.walletCount ?? 0) > 0;
  const hasLUT     = !!status?.lutAddress;
  const hasMint    = !!status?.hasMintPk;

  const steps: StepDef[] = [
    {
      num:   1,
      title: 'Create Sub-Wallets',
      what:  'Generate up to 24 trading wallets. Each one will buy your token at launch, making it look like genuine organic activity.',
      tip:   'Wallet files are saved in src/keypairs/. Keep this folder safe — they hold real SOL.',
      done:  hasWallets,
      action: {
        label:    'Generate Wallets',
        endpoint: '/api/setup/keypairs',
        fields: [
          { key: 'count', label: 'Wallet count', type: 'number', default: '24', placeholder: '24', hint: 'max 24' },
        ],
      },
    },
    {
      num:   2,
      title: 'Create Lookup Table (LUT)',
      what:  'Creates an on-chain address lookup table. This lets you bundle many wallet transactions into one Jito submission without hitting size limits.',
      done:  hasLUT,
      action: { label: 'Create LUT', endpoint: '/api/setup/lut', fields: TIP_FIELDS },
    },
    {
      num:   3,
      title: 'Extend LUT Bundle',
      what:  'Adds all wallet addresses and token accounts to the lookup table. Also generates your token\'s mint keypair.',
      tip:   'The mint address shown in the output will be your token\'s permanent Solana address.',
      done:  hasMint,
      action: {
        label:    'Extend LUT',
        endpoint: '/api/setup/extend-lut',
        fields: [
          ...TIP_FIELDS,
          { key: 'vanityPK', label: 'Vanity key (optional)', type: 'text', default: '', placeholder: 'Leave blank for random mint' },
        ],
      },
    },
    {
      num:   4,
      title: 'Set Buy Amounts',
      what:  'Configure how much SOL each wallet will spend when your token launches. Sets the same amount for all sub-wallets — you can tweak individually via the terminal if needed.',
      tip:   'Start small. 0.01–0.05 SOL per wallet is typical. The dev wallet buys slightly more.',
      done:  hasMint && hasLUT && hasWallets,
      action: {
        label:    'Set Amounts',
        endpoint: '/api/setup/buy-amounts',
        fields: [
          { key: 'devSol',    label: 'Dev wallet (SOL)',  type: 'number', default: '0.05', placeholder: '0.05', hint: 'SOL' },
          { key: 'walletSol', label: 'Each wallet (SOL)', type: 'number', default: '0.01', placeholder: '0.01', hint: 'SOL' },
        ],
      },
    },
    {
      num:   5,
      title: 'Fund Sub-Wallets',
      what:  'Sends SOL from your funder wallet to all sub-wallets so they have enough to buy. Make sure your funder wallet has enough SOL first.',
      tip:   'Each wallet gets slightly more than the buy amount to cover slippage and fees.',
      done:  false,
      action: { label: 'Fund Wallets', endpoint: '/api/setup/fund', fields: TIP_FIELDS },
    },
    {
      num:   6,
      title: 'Launch Your Token',
      what:  'Fill in your token details in the Launch tab — name, ticker, image, socials — then click Launch Token. Your token will be created on Pump.fun and all wallets buy in the same block.',
      tip:   'Always tick Dry Run first to simulate without spending real SOL.',
      done:  false,
    },
  ];

  const completed = steps.filter(s => s.done).length;
  const nextIndex = steps.findIndex(s => !s.done);
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      <div className="panel-header">
        <div style={{ flex: 1 }}>
          <div className="panel-title">How to Launch a Token</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {completed} of {steps.length} steps complete
          </div>
        </div>
        <div style={{ width: 120 }}>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: pct === 100 ? 'var(--green)' : 'var(--orange)',
              borderRadius: 99, transition: 'width .4s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{pct}%</div>
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div style={{
            background: 'rgba(249,115,22,.06)', border: '1px solid rgba(249,115,22,.15)',
            borderRadius: 'var(--radius-lg)', padding: '10px 14px',
          }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Complete these steps once before your first launch. After that, come back to{' '}
              <span style={{ color: 'var(--orange)' }}>Launch</span> to create tokens anytime.
              Steps 3–4 need to be repeated for each new token.
            </p>
          </div>

          {steps.map((step, i) => (
            <StepCard
              key={step.num}
              step={step}
              isNext={i === nextIndex}
              onDone={() => { refresh(); setTimeout(refresh, 2000); }}
            />
          ))}

          {completed >= 4 && (
            <div style={{
              background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)',
              borderRadius: 'var(--radius-lg)', padding: '12px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>🎉</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>
                Almost ready
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Fund your wallets then head to the Launch tab.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
