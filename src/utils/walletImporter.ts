import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

// ─── HiveGuard wallet export format ──────────────────────────────────────────
//
// Supported shapes:
//   1. Plain array of base58 strings:
//        ["4abc...", "5xyz..."]
//
//   2. Array of wallet objects:
//        [{ "privateKey": "4abc...", "label": "Wallet 1" }, ...]
//
//   3. HiveGuard export envelope:
//        { "version": "1.0", "exported": "2026-...", "wallets": [...] }
//
// ─────────────────────────────────────────────────────────────────────────────

type WalletEntry = string | { privateKey: string; label?: string; pubkey?: string };

export interface HiveGuardWalletFile {
  version?: string;
  exported?: string;
  wallets: WalletEntry[];
}

function parseEntry(entry: WalletEntry, index: number): Keypair {
  const raw = typeof entry === 'string' ? entry : entry.privateKey;
  if (!raw?.trim()) throw new Error(`Empty private key at index ${index}`);

  try {
    return Keypair.fromSecretKey(bs58.decode(raw.trim()));
  } catch {
    throw new Error(`Invalid base58 private key at index ${index}`);
  }
}

export function importWalletsFromFile(filePath: string, max = 24): Keypair[] {
  if (!fs.existsSync(filePath))
    throw new Error(`Wallet file not found: ${filePath}`);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    throw new Error(`Failed to parse wallet file as JSON: ${filePath}`);
  }

  let entries: WalletEntry[];

  if (Array.isArray(raw)) {
    entries = raw as WalletEntry[];
  } else if (
    raw !== null &&
    typeof raw === 'object' &&
    Array.isArray((raw as HiveGuardWalletFile).wallets)
  ) {
    entries = (raw as HiveGuardWalletFile).wallets;
  } else {
    throw new Error(
      'Unrecognised wallet file format.\n' +
      '  Expected: array of base58 strings, array of { privateKey } objects,\n' +
      '  or a HiveGuard envelope { "wallets": [...] }',
    );
  }

  if (entries.length === 0) throw new Error('Wallet file contains no entries.');

  return entries.slice(0, max).map(parseEntry);
}
