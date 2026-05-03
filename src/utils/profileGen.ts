import { Keypair } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

// ─── Word banks ───────────────────────────────────────────────────────────────

const ADJECTIVES = [
  'Alpha', 'Blazing', 'Cosmic', 'Dark', 'Diamond', 'Drifting', 'Frozen',
  'Golden', 'Hyper', 'Lunar', 'Neon', 'Quantum', 'Rogue', 'Savage', 'Sigma',
  'Silent', 'Solar', 'Storm', 'Swift', 'Turbo', 'Ultra', 'Velocity', 'Wild',
];

const NOUNS = [
  'Ape', 'Bear', 'Bull', 'Chad', 'Duke', 'Eagle', 'Fox', 'Ghost',
  'Hawk', 'Monk', 'Panda', 'Raven', 'Sage', 'Shark', 'Titan',
  'Trader', 'Viper', 'Whale', 'Wolf', 'Degen',
];

const BIOS = [
  'Trading since 2020. Here for the vibes.',
  'DeFi native. On-chain every day.',
  'Solana maxi. Long on everything.',
  'Just a humble degen looking for gems.',
  'Full-time alpha hunter. Never selling.',
  "I don't trade, I invest. In memes.",
  'Market maker by day, ape by night.',
  'SOL or nothing. Probably nothing.',
  'Running hot since the last bull. Still here.',
  'Chasing asymmetric bets one block at a time.',
  'Not financial advice. Not a financial advisor.',
  'Buying the dip since the last ATH.',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomUsername() {
  const suffix = Math.floor(Math.random() * 9_999).toString().padStart(4, '0');
  return `${rand(ADJECTIVES)}${rand(NOUNS)}${suffix}`;
}

// Signs the standard pump.fun auth message and returns a base58 signature.
function signPumpFun(keypair: Keypair): string {
  const msg = new TextEncoder().encode('sign in to pump.fun');
  const sig = nacl.sign.detached(msg, keypair.secretKey);
  return bs58.encode(sig);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletProfile {
  pubkey:   string;
  username: string;
  bio:      string;
  applied:  boolean;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates randomised trader profiles for each keypair and attempts to
 * publish them to pump.fun.  Failures are non-fatal — the launch proceeds
 * regardless.
 *
 * @param keypairs  Sub-wallets to profile
 * @param onResult  Optional per-wallet progress callback
 */
export async function generateProfiles(
  keypairs: Keypair[],
  onResult?: (profile: WalletProfile, index: number, total: number) => void,
): Promise<WalletProfile[]> {
  const profiles: WalletProfile[] = [];

  for (let i = 0; i < keypairs.length; i++) {
    const kp       = keypairs[i];
    const username = randomUsername();
    const bio      = rand(BIOS);
    let   applied  = false;

    try {
      // pump.fun profile endpoint — auth via signed message
      // Update this URL if pump.fun migrates their API.
      const sig = signPumpFun(kp);

      await axios.post(
        'https://pump.fun/api/users',
        { username, bio },
        {
          headers: {
            Authorization: `Bearer ${kp.publicKey.toBase58()}:${sig}`,
            'Content-Type': 'application/json',
          },
          timeout: 6_000,
        },
      );

      applied = true;
    } catch {
      // Non-fatal: API may have changed or wallet is already known.
    }

    const profile: WalletProfile = {
      pubkey: kp.publicKey.toBase58(),
      username,
      bio,
      applied,
    };
    profiles.push(profile);
    onResult?.(profile, i, keypairs.length);
  }

  return profiles;
}
