#!/usr/bin/env ts-node
import { Command } from 'commander';
import { bundleLaunch, BundleLaunchOptions } from './src/commands/bundleLaunch';

const program = new Command();

program
  .name('hiveguard')
  .description('HiveGuard.pro — Solana token launch suite')
  .version('2.0.0');

// ─── bundle-launch ────────────────────────────────────────────────────────────

program
  .command('bundle-launch')
  .description('Launch a token on Pump.Fun with organic, staggered sub-wallet buys')

  // ── Token metadata ──────────────────────────────────────────────────────────
  .option('--name <name>',              'Token name (auto-filled from --website-url if omitted)')
  .option('--ticker <ticker>',          'Token ticker / symbol')
  .option('--description <text>',       'Token description (max 30 chars on-chain)')
  .option('--image-url <url>',          'Image URL — falls back to ./img/ then --website-url og:image')
  .option('--twitter <url>',            'Twitter / X URL')
  .option('--telegram <url>',           'Telegram URL')
  .option('--website <url>',            'Project website URL (shown in token metadata)')

  // ── HiveGuard features ──────────────────────────────────────────────────────
  .option(
    '--website-url <url>',
    'Scrape og:image, og:title, og:description and social links from this URL',
  )
  .option(
    '--import-wallets <file>',
    'Load sub-wallets from a HiveGuard-format JSON file instead of src/keypairs/',
  )
  .option(
    '--utility-mode',
    'Tag metadata as a HiveGuard utility token and default website to hiveguard.pro',
  )

  // ── Wallet / tip ────────────────────────────────────────────────────────────
  .option(
    '--wallets <n>',
    'Number of sub-wallets to use, 1–24 (default: all available)',
    (v: string) => parseInt(v, 10),
  )
  .option(
    '--jito-tip <sol>',
    'Jito tip in SOL for the launch transaction (default: 0.005)',
    (v: string) => parseFloat(v),
  )

  // ── Send mode ───────────────────────────────────────────────────────────────
  .option(
    '--bundle',
    'Force single Jito bundle (disables default stagger mode)',
  )
  .option(
    '--stagger-delay <ms>',
    'Milliseconds between staggered sub-wallet chunks (default: 2000)',
    (v: string) => parseInt(v, 10),
  )

  // ── Feature toggles ─────────────────────────────────────────────────────────
  .option(
    '--no-profile-gen',
    'Skip automatic wallet profile generation (profile gen is on by default)',
  )
  .option(
    '--dry-run',
    'Simulate all transactions without sending anything on-chain',
  )

  .action((opts: BundleLaunchOptions) => {
    bundleLaunch(opts).catch(err => {
      console.error('\n  [HiveGuard] Unhandled error:', err?.message ?? err);
      process.exit(1);
    });
  });

program.parse(process.argv);
