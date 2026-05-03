import chalk from 'chalk';

const ORANGE = chalk.hex('#F97316');
const DIM    = chalk.dim;
const WIDTH  = 54;

// ─── Server-mode hooks ────────────────────────────────────────────────────────

export type LogLevel =
  | 'banner' | 'step' | 'info' | 'success'
  | 'warn'   | 'error' | 'detail' | 'divider';

type LogSub = (level: LogLevel, text: string) => void;

let _sub:    LogSub | null = null;
let _server  = false;

export function setLogSubscriber(fn: LogSub | null) { _sub = fn; }
export function setServerMode(v: boolean)            { _server = v; }

function relay(level: LogLevel, text: string) {
  _sub?.(level, text);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

export const logger = {
  banner() {
    const bar = ORANGE('━'.repeat(WIDTH));
    console.log();
    console.log(`  ${bar}`);
    console.log(
      `  ${ORANGE.bold('◈  HiveGuard')}` +
      `  ${chalk.white.bold('Bundle Launch')}` +
      `  ${DIM('v2.0')}`,
    );
    console.log(`  ${bar}`);
    console.log();
    relay('banner', 'HiveGuard Bundle Launch v2.0');
  },

  step(label: string) {
    console.log(`\n  ${ORANGE('›')} ${chalk.white.bold(label)}`);
    relay('step', label);
  },

  info(msg: string) {
    console.log(`    ${DIM('·')} ${chalk.gray(msg)}`);
    relay('info', msg);
  },

  success(msg: string) {
    console.log(`    ${chalk.green('✓')} ${chalk.white(msg)}`);
    relay('success', msg);
  },

  warn(msg: string) {
    console.log(`    ${chalk.yellow('!')} ${chalk.yellow(msg)}`);
    relay('warn', msg);
  },

  error(msg: string) {
    console.error(`    ${chalk.red('✗')} ${chalk.red(msg)}`);
    relay('error', msg);
  },

  detail(label: string, value: string) {
    const PAD = 18;
    console.log(`    ${DIM(label.padEnd(PAD))}  ${chalk.white(value)}`);
    relay('detail', `${label}: ${value}`);
  },

  divider() {
    console.log(`\n  ${DIM('─'.repeat(WIDTH))}`);
    relay('divider', '');
  },

  fatal(msg: string): never {
    console.error();
    console.error(`  ${chalk.red.bold('FATAL')}  ${chalk.red(msg)}`);
    console.error();
    relay('error', `FATAL: ${msg}`);
    if (_server) throw new Error(msg);
    process.exit(1);
  },
};
