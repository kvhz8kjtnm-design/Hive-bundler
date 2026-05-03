# HiveGuard Bundler

**Professional token launch infrastructure for Pump.Fun — by [HiveGuard.pro](https://hiveguard.pro)**

[![Version](https://img.shields.io/badge/version-2.0-orange)](https://hiveguard.pro)
[![Network](https://img.shields.io/badge/network-Solana-purple)](https://solana.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## What it does

HiveGuard Bundler launches tokens on Pump.Fun with up to 24 coordinated sub-wallet buys, making your launch look organic from block 0. It handles the full flow:

- Generates and profiles sub-wallets so they look like real traders
- Bundles or staggers buys across all wallets with a single CLI command
- Pulls token image and social links straight from your project website
- Submits via Jito for MEV protection on the launch transaction

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/yourusername/hiveguard-bundler
cd hiveguard-bundler
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

```env
SIGNER_PRIVATE_KEY=<base58 private key of your dev/deployer wallet>
FUNDER_PRIVATE_KEY=<base58 private key of your fee-payer/funder wallet>
RPC_URL=https://your-private-rpc.com
BLOCK_ENGINE_URLS=["frankfurt.mainnet.block-engine.jito.wtf"]
```

> **Tip:** Use a private RPC (Helius, QuickNode, Triton) for reliable performance.

### 3. One-time setup

Run the interactive setup to create wallets, fund them, and build the LUT:

```bash
npm start
```

Follow the menu:
1. **Create Keypairs** — generates 24 sub-wallets in `src/keypairs/`
2. **Pre Launch Checklist** → Create LUT → Extend LUT Bundle → Simulate Buys

### 4. Launch

```bash
# Minimal launch (stagger mode + profile gen by default)
npm run bundle-launch -- --ticker MYTOKEN

# Pull everything from your website automatically
npm run bundle-launch -- \
  --ticker MYTOKEN \
  --website-url https://myproject.com \
  --jito-tip 0.01

# Test first without sending anything
npm run bundle-launch -- --ticker MYTOKEN --dry-run
```

---

## CLI reference

```
Usage: hiveguard bundle-launch [options]
```

### Token metadata

| Flag | Description |
|---|---|
| `--name <name>` | Token name. Auto-filled from `--website-url` og:title if omitted. |
| `--ticker <ticker>` | Token ticker / symbol |
| `--description <text>` | Description (max 30 chars on-chain) |
| `--image-url <url>` | Token image URL. Falls back to `./img/` then scraped og:image. |
| `--twitter <url>` | Twitter / X URL |
| `--telegram <url>` | Telegram URL |
| `--website <url>` | Project website (shown in token metadata) |

### HiveGuard features

| Flag | Description |
|---|---|
| `--website-url <url>` | Scrape og:image, og:title, og:description, and social links from your project URL. Flags override scraped values. |
| `--import-wallets <file>` | Load sub-wallets from a HiveGuard-format JSON file instead of `src/keypairs/`. |
| `--utility-mode` | Tags IPFS metadata as a HiveGuard utility token. Defaults website to hiveguard.pro. |

### Wallet and tip

| Flag | Description |
|---|---|
| `--wallets <n>` | Number of sub-wallets to use, 1–24. Default: all available. |
| `--jito-tip <sol>` | Jito tip in SOL for the launch transaction. Default: 0.005. |

### Send mode

| Flag | Description |
|---|---|
| *(default)* | **Stagger mode** — launch txn via Jito, sub-wallet buys via RPC with delay. Organic-looking. |
| `--bundle` | Force a single Jito bundle for all wallets. Maximum MEV protection. |
| `--stagger-delay <ms>` | Milliseconds between staggered chunks. Default: 2000. |

### Feature toggles

| Flag | Description |
|---|---|
| `--no-profile-gen` | Skip wallet profile generation. Profile gen is on by default. |
| `--dry-run` | Simulate every transaction and print CU usage. Nothing is sent on-chain. |

---

## Wallet import format

`--import-wallets` accepts any of these shapes:

```json
["4abc...", "5xyz..."]
```

```json
[
  { "privateKey": "4abc...", "label": "Sniper 1" },
  { "privateKey": "5xyz...", "label": "Sniper 2" }
]
```

```json
{
  "version": "1.0",
  "exported": "2026-05-01",
  "wallets": [
    { "privateKey": "4abc...", "label": "Wallet 1" }
  ]
}
```

---

## Launch modes explained

### Stagger (default)

Best for organic-looking launches. The dev wallet creates the token and buys at block 0 via a Jito bundle. Sub-wallet buys follow as individual RPC transactions with a configurable delay between each chunk of 6 wallets.

```bash
npm run bundle-launch -- --ticker MYTOKEN --stagger-delay 3000
```

### Bundle

All wallets buy in the same Jito bundle as the token creation. Maximum anti-sniper protection but leaves a bundle footprint.

```bash
npm run bundle-launch -- --ticker MYTOKEN --bundle
```

### Dry-run

Simulates every transaction locally and reports compute units. Nothing touches the chain.

```bash
npm run bundle-launch -- --ticker MYTOKEN --dry-run
```

---

## Block engine URLs

Choose the closest region:

| Region | URL |
|---|---|
| Europe | `amsterdam.mainnet.block-engine.jito.wtf` |
| Europe | `frankfurt.mainnet.block-engine.jito.wtf` |
| North America | `ny.mainnet.block-engine.jito.wtf` |
| North America | `slc.mainnet.block-engine.jito.wtf` |
| Asia | `tokyo.mainnet.block-engine.jito.wtf` |

Set in `.env`:
```env
BLOCK_ENGINE_URLS=["ny.mainnet.block-engine.jito.wtf"]
```

---

## Project structure

```
hiveguard-bundler/
├── cli.ts                     # hiveguard CLI entry point
├── main.ts                    # interactive menu (original)
├── config.ts                  # env-based configuration
├── .env.example               # copy to .env and fill in
├── pumpfun-IDL.json           # Pump.Fun program IDL
├── blockengine.json           # Jito auth keypair
├── img/                       # place token image here
└── src/
    ├── commands/
    │   └── bundleLaunch.ts    # bundle-launch command
    ├── utils/
    │   ├── webscraper.ts      # og:image + social link scraper
    │   ├── walletImporter.ts  # HiveGuard wallet JSON format
    │   └── profileGen.ts      # random profiles + pump.fun API
    ├── clients/
    │   ├── jito.ts            # Jito searcher client
    │   ├── config.ts          # convict + tip accounts
    │   └── ...
    ├── createKeys.ts          # keypair generation
    ├── createLUT.ts           # LUT create + extend
    ├── jitoPool.ts            # bundle build + send
    ├── sellFunc.ts            # Pump.Fun sell
    ├── sellRay.ts             # Raydium sell
    ├── senderUI.ts            # interactive pre-launch UI
    └── logger.ts              # HiveGuard branded output
```

---

## Troubleshooting

**`FATAL  Missing required env variable: SIGNER_PRIVATE_KEY`**
Copy `.env.example` to `.env` and fill in your keys.

**`No LUT address in keyInfo.json`**
Run `npm start` → option 2 (Pre Launch Checklist) → option 1 (Create LUT).

**`Bundle Dropped, no connected leader up soon`**
Your Jito block engine region may not have an active leader. Try a different `BLOCK_ENGINE_URLS` region.

**`BigInt failed to load bindings`**
This is harmless and can be ignored.

**Stagger txns failing**
Try increasing `--stagger-delay` to 4000–6000ms and ensure all sub-wallets have enough SOL.

---

## Support

- Discord: [discord.gg/solana-scripts](https://discord.gg/solana-scripts)
- Website: [hiveguard.pro](https://hiveguard.pro)
- Telegram: [@benorizz0](https://t.me/benorizz0)

---

*This tool is provided for educational and legitimate trading purposes. Always operate within the rules of the platforms you interact with.*
