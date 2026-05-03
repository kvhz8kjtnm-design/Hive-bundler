import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import bs58 from 'bs58';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import promptSync from 'prompt-sync';

import {
  connection,
  eventAuthority,
  feeRecipient,
  global,
  mintAuthority,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  payer,
  PUMP_PROGRAM,
  rpc,
  wallet,
} from '../../config';
import { loadKeypairs } from '../createKeys';
import { sendBundle } from '../jitoPool';
import { getRandomTipAccount } from '../clients/config';
import { logger } from '../logger';
import { scrapeWebsiteMeta } from '../utils/webscraper';
import { importWalletsFromFile } from '../utils/walletImporter';
import { generateProfiles } from '../utils/profileGen';

const prompt = promptSync();
const keyInfoPath = process.env.HIVEGUARD_DATA_DIR
  ? path.join(process.env.HIVEGUARD_DATA_DIR, 'src', 'keyInfo.json')
  : path.join(__dirname, '..', 'keyInfo.json');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BundleLaunchOptions {
  // Token metadata (all optional — falls back to --website-url scrape then prompt)
  name?: string;
  ticker?: string;
  description?: string;
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;

  // HiveGuard extras
  websiteUrl?: string;      // scrape og:image + socials from this URL
  importWallets?: string;   // path to HiveGuard-format wallet JSON
  utilityMode?: boolean;    // append HiveGuard utility tag to IPFS metadata

  // Wallet / tip config
  wallets?: number;
  jitoTip?: number;

  // Send mode — stagger is default; pass --bundle to force single Jito bundle
  bundle?: boolean;
  staggerDelay?: number;

  // Feature toggles
  profileGen?: boolean;     // Commander --no-profile-gen sets this to false
  dryRun?: boolean;
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function ask(flag: string, label: string, value?: string): string {
  if (value?.trim()) return value.trim();
  const input = prompt(`    ${label}: `);
  if (!input?.trim()) logger.fatal(`--${flag} is required (or provide via --website-url)`);
  return input.trim();
}

function askOptional(label: string, value?: string): string {
  if (value !== undefined) return value;
  const input = prompt(`    ${label} (Enter to skip): `);
  return input?.trim() ?? '';
}

// ─── Image ────────────────────────────────────────────────────────────────────

async function resolveImage(
  imageUrl?: string,
): Promise<{ data: Buffer; mime: string }> {
  if (imageUrl) {
    logger.info('Fetching image from URL…');
    const resp = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15_000,
    });
    const mime =
      (resp.headers['content-type'] as string)?.split(';')[0] ?? 'image/jpeg';
    return { data: Buffer.from(resp.data), mime };
  }

  const imgDir = path.join(process.env.HIVEGUARD_RESOURCES_ROOT ?? process.env.HIVEGUARD_APP_ROOT ?? process.cwd(), 'img');
  if (!fs.existsSync(imgDir))
    logger.fatal('No ./img/ directory. Use --image-url or add an image to ./img/');

  const files = fs.readdirSync(imgDir).filter(f => !f.startsWith('.'));
  if (files.length === 0)
    logger.fatal('./img/ is empty. Add one image or use --image-url.');
  if (files.length > 1)
    logger.fatal('Multiple files in ./img/ — keep exactly one, or use --image-url.');

  const ext  = path.extname(files[0]).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  return { data: fs.readFileSync(path.join(imgDir, files[0])), mime };
}

// ─── IPFS metadata upload ─────────────────────────────────────────────────────

async function uploadMetadata(
  name: string,
  symbol: string,
  description: string,
  twitter: string,
  telegram: string,
  website: string,
  image: { data: Buffer; mime: string },
  utilityMode: boolean,
): Promise<string> {
  const fullDescription = utilityMode
    ? `${description} | Built on HiveGuard.pro`.trim().replace(/^\|/, '').trim()
    : description;

  const form = new FormData();
  form.append('file', new Blob([image.data], { type: image.mime }));
  form.append('name', name);
  form.append('symbol', symbol);
  form.append('description', fullDescription);
  form.append('twitter',  twitter);
  form.append('telegram', telegram);
  form.append('website',  utilityMode && !website ? 'https://hiveguard.pro' : website);
  form.append('showName', 'true');

  const resp = await axios.post('https://pump.fun/api/ipfs', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return resp.data.metadataUri as string;
}

// ─── Transaction builders ─────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

async function buildSubWalletTxns(
  blockhash: string,
  keypairs: Keypair[],
  lutAccount: anchor.web3.AddressLookupTableAccount,
  bondingCurve: PublicKey,
  associatedBondingCurve: PublicKey,
  mint: PublicKey,
  program: anchor.Program,
  keyInfo: Record<string, any>,
): Promise<VersionedTransaction[]> {
  const txns: VersionedTransaction[] = [];

  for (const chunk of chunkArray(keypairs, 6)) {
    const ixs: TransactionInstruction[] = [];

    for (const kp of chunk) {
      const info = keyInfo[kp.publicKey.toString()];
      if (!info) {
        logger.warn(`No buy info for ${kp.publicKey.toString().slice(0, 8)}… skipping`);
        continue;
      }

      const associatedUser = await spl.getAssociatedTokenAddress(mint, kp.publicKey);

      ixs.push(
        spl.createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey, associatedUser, kp.publicKey, mint,
        ),
        await program.methods
          .buy(
            new BN(info.tokenAmount),
            new BN(Math.floor(Number(info.solAmount) * 1.01 * LAMPORTS_PER_SOL)),
          )
          .accounts({
            global, feeRecipient, mint, bondingCurve, associatedBondingCurve,
            associatedUser, user: kp.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram:  spl.TOKEN_PROGRAM_ID,
            rent:          SYSVAR_RENT_PUBKEY,
            eventAuthority, program: PUMP_PROGRAM,
          })
          .instruction(),
      );
    }

    if (ixs.length === 0) continue;

    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey:        payer.publicKey,
        recentBlockhash: blockhash,
        instructions:    ixs,
      }).compileToV0Message([lutAccount]),
    );

    const size = tx.serialize().length;
    if (size > 1232) logger.warn(`Chunk txn is ${size} bytes — may exceed 1232 byte limit`);

    tx.sign([payer]);
    for (const kp of chunk) {
      if (kp.publicKey.toString() in keyInfo) tx.sign([kp]);
    }
    txns.push(tx);
  }

  return txns;
}

// ─── Send strategies ──────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function dryRunSimulate(txns: VersionedTransaction[]) {
  logger.step('Simulating transactions (dry-run — nothing sent)');
  let allOk = true;

  for (let i = 0; i < txns.length; i++) {
    const label = i === 0 ? 'Launch txn  ' : `Sub chunk ${String(i).padStart(2, '0')}`;
    try {
      const { value: sim } = await connection.simulateTransaction(txns[i], {
        commitment: 'processed',
      });
      if (sim.err) {
        logger.error(`${label}: FAIL — ${JSON.stringify(sim.err)}`);
        allOk = false;
      } else {
        logger.success(`${label}: OK   (${(sim.unitsConsumed ?? 0).toLocaleString()} CU)`);
      }
    } catch (e: any) {
      logger.error(`${label}: threw — ${e.message}`);
      allOk = false;
    }
  }

  logger.divider();
  allOk
    ? logger.success('All transactions simulate successfully. Remove --dry-run to launch.')
    : logger.warn('Some transactions failed simulation — review errors above.');
}

async function staggerSend(
  launchTxn: VersionedTransaction,
  subTxns:   VersionedTransaction[],
  delayMs:   number,
) {
  logger.step('Sending launch transaction via Jito');
  await sendBundle([launchTxn]);

  if (subTxns.length === 0) return;

  logger.step(`Staggering ${subTxns.length} sub-wallet chunk(s) — ${delayMs}ms between each`);
  for (let i = 0; i < subTxns.length; i++) {
    try {
      const sig = await connection.sendRawTransaction(subTxns[i].serialize(), {
        skipPreflight: false,
        maxRetries:    3,
      });
      logger.success(`Chunk ${i + 1}/${subTxns.length}: ${sig.slice(0, 20)}…`);
    } catch (e: any) {
      logger.error(`Chunk ${i + 1} failed: ${e.message}`);
    }
    if (i < subTxns.length - 1) await sleep(delayMs);
  }
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function bundleLaunch(opts: BundleLaunchOptions) {
  logger.banner();

  // Stagger is the organic default; --bundle overrides.
  const useStagger    = !opts.bundle;
  const useProfileGen = opts.profileGen !== false; // Commander --no-profile-gen sets false
  const delay         = opts.staggerDelay ?? 2_000;
  const jitoTip       = (opts.jitoTip ?? 0.005) * LAMPORTS_PER_SOL;
  const mode          = opts.dryRun
    ? 'dry-run'
    : useStagger
    ? `stagger  ${delay}ms`
    : 'bundle';

  // ── 1. Prerequisites ────────────────────────────────────────────────────────

  logger.step('Loading configuration');

  if (!fs.existsSync(keyInfoPath))
    logger.fatal(
      'src/keyInfo.json not found.\n' +
      '  Run: npm start → 1. Create Keypairs → 2. Pre Launch Checklist',
    );

  const keyInfo: Record<string, any> = JSON.parse(
    fs.readFileSync(keyInfoPath, 'utf-8'),
  );

  if (!keyInfo.addressLUT)
    logger.fatal('No LUT address in keyInfo.json — run Pre Launch Checklist → Create LUT.');
  if (!keyInfo.mintPk)
    logger.fatal('No mint keypair — run Pre Launch Checklist → Extend LUT Bundle.');

  // Wallets: prefer --import-wallets file, else use generated keypairs
  let allKeypairs: Keypair[] = [];
  if (opts.importWallets) {
    logger.info(`Importing wallets from: ${opts.importWallets}`);
    try {
      allKeypairs = importWalletsFromFile(opts.importWallets, 24);
      logger.success(`${allKeypairs.length} wallet(s) imported`);
    } catch (e: any) {
      logger.fatal(`Wallet import failed: ${e.message}`);
    }
  } else {
    allKeypairs = loadKeypairs();
    if (allKeypairs.length === 0)
      logger.fatal('No keypairs in src/keypairs/ — run: npm start → 1. Create Keypairs');
  }

  const walletCount = Math.min(opts.wallets ?? allKeypairs.length, allKeypairs.length, 24);
  const keypairs    = allKeypairs.slice(0, walletCount);

  logger.detail('Dev wallet',   wallet.publicKey.toString().slice(0, 22) + '…');
  logger.detail('Payer wallet', payer.publicKey.toString().slice(0, 22) + '…');
  logger.detail('Sub-wallets',  String(walletCount));
  logger.detail('Jito tip',     `${opts.jitoTip ?? 0.005} SOL`);
  logger.detail('Mode',         mode);
  logger.detail('Profile gen',  useProfileGen ? 'yes' : 'no');
  logger.detail('Utility mode', opts.utilityMode ? 'yes' : 'no');
  logger.detail('LUT',          keyInfo.addressLUT.slice(0, 22) + '…');

  const lutPk      = new PublicKey(keyInfo.addressLUT);
  const lutAccount = (await connection.getAddressLookupTable(lutPk)).value;
  if (!lutAccount)
    logger.fatal('LUT not found on-chain — re-create it via Pre Launch Checklist.');

  // ── 2. Scrape website metadata (if --website-url provided) ──────────────────

  let scraped: Partial<{
    name: string; description: string; imageUrl: string;
    twitter: string; telegram: string; website: string;
  }> = {};

  if (opts.websiteUrl) {
    logger.step('Scraping website metadata');
    try {
      const meta = await scrapeWebsiteMeta(opts.websiteUrl);
      scraped = meta;
      if (meta.name)        logger.detail('og:title',       meta.name);
      if (meta.description) logger.detail('og:description', meta.description);
      if (meta.imageUrl)    logger.detail('og:image',       meta.imageUrl.slice(0, 40) + '…');
      if (meta.twitter)     logger.detail('twitter',        meta.twitter);
      if (meta.telegram)    logger.detail('telegram',       meta.telegram ?? '(not found)');
    } catch (e: any) {
      logger.warn(`Could not scrape ${opts.websiteUrl}: ${e.message}`);
    }
  }

  // ── 3. Token metadata (flags override scraped values; prompt for missing) ───

  logger.step('Token metadata');

  const name        = ask('name',    'Token name',   opts.name        ?? scraped.name);
  const ticker      = ask('ticker',  'Ticker',       opts.ticker);
  const description = askOptional('Description (max 30 chars)',
    opts.description ?? scraped.description);
  const twitter     = askOptional('Twitter URL',   opts.twitter   ?? scraped.twitter);
  const telegram    = askOptional('Telegram URL',  opts.telegram  ?? scraped.telegram);
  const website     = askOptional('Website URL',   opts.website   ?? scraped.website ?? opts.websiteUrl);

  logger.detail('Name',        name);
  logger.detail('Ticker',      ticker);
  logger.detail('Description', description || '(none)');
  if (opts.utilityMode)
    logger.detail('Utility tag', 'Built on HiveGuard.pro');

  // ── 4. Profile generation ────────────────────────────────────────────────────

  if (useProfileGen) {
    logger.step(`Generating profiles for ${walletCount} wallets`);
    const profiles = await generateProfiles(keypairs, (p, i, total) => {
      const status = p.applied ? logger.success : logger.info;
      status.call(logger,
        `[${String(i + 1).padStart(2, '0')}/${total}] ${p.username.padEnd(24)} ${
          p.applied ? '✓ applied' : '· staged'
        }`,
      );
    });
    const applied = profiles.filter(p => p.applied).length;
    logger.info(`${applied}/${profiles.length} profiles applied via pump.fun API`);
    if (applied < profiles.length)
      logger.info('Unapplied profiles are staged — pump.fun API may require re-auth.');
  }

  // ── 5. Image ──────────────────────────────────────────────────────────────────

  logger.step('Loading image');
  const resolvedImageUrl = opts.imageUrl ?? scraped.imageUrl;
  const image = await resolveImage(resolvedImageUrl);
  logger.success(`Ready  (${(image.data.length / 1024).toFixed(1)} KB, ${image.mime})`);

  // ── 6. IPFS metadata upload ───────────────────────────────────────────────────

  logger.step('Uploading metadata to IPFS');
  let metadataUri: string;
  try {
    metadataUri = await uploadMetadata(
      name, ticker, description,
      twitter, telegram, website,
      image, !!opts.utilityMode,
    );
    logger.success(`URI: ${metadataUri}`);
  } catch (e: any) {
    logger.fatal(`Metadata upload failed: ${e.message}`);
  }

  // ── 7. Build transactions ─────────────────────────────────────────────────────

  logger.step('Building transactions');

  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(rpc),
    new anchor.Wallet(wallet),
    { commitment: 'confirmed' },
  );
  const IDL = JSON.parse(
    fs.readFileSync(path.join(process.env.HIVEGUARD_RESOURCES_ROOT ?? process.env.HIVEGUARD_APP_ROOT ?? process.cwd(), 'pumpfun-IDL.json'), 'utf-8'),
  ) as anchor.Idl;
  const program = new anchor.Program(IDL, PUMP_PROGRAM, provider);
  const mintKp  = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(keyInfo.mintPk)));

  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mintKp.publicKey.toBytes()],
    program.programId,
  );
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBytes(), spl.TOKEN_PROGRAM_ID.toBytes(), mintKp.publicKey.toBytes()],
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      MPL_TOKEN_METADATA_PROGRAM_ID.toBytes(),
      mintKp.publicKey.toBytes(),
    ],
    MPL_TOKEN_METADATA_PROGRAM_ID,
  );

  logger.info(`Mint: ${mintKp.publicKey.toBase58()}`);

  const createIx = await program.methods
    .create(name, ticker, metadataUri!)
    .accounts({
      mint: mintKp.publicKey, mintAuthority, bondingCurve, associatedBondingCurve,
      global, mplTokenMetadata: MPL_TOKEN_METADATA_PROGRAM_ID, metadata,
      user: wallet.publicKey,
      systemProgram:         SystemProgram.programId,
      tokenProgram:          spl.TOKEN_PROGRAM_ID,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY, eventAuthority, program: PUMP_PROGRAM,
    })
    .instruction();

  const devInfo = keyInfo[wallet.publicKey.toString()];
  if (!devInfo)
    logger.fatal('No buy amount for dev wallet — run Pre Launch Checklist → Simulate Buys.');

  const devATA = spl.getAssociatedTokenAddressSync(mintKp.publicKey, wallet.publicKey);

  const devBuyIx = await program.methods
    .buy(
      new BN(devInfo.tokenAmount),
      new BN(Math.floor(Number(devInfo.solAmount) * 1.01 * LAMPORTS_PER_SOL)),
    )
    .accounts({
      global, feeRecipient,
      mint: mintKp.publicKey, bondingCurve, associatedBondingCurve,
      associatedUser: devATA, user: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram:  spl.TOKEN_PROGRAM_ID,
      rent:          SYSVAR_RENT_PUBKEY,
      eventAuthority, program: PUMP_PROGRAM,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash();

  // Launch txn: create + dev ATA + dev buy + Jito tip (no LUT needed)
  const launchTxn = new VersionedTransaction(
    new TransactionMessage({
      payerKey:        wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        createIx,
        spl.createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey, devATA, wallet.publicKey, mintKp.publicKey,
        ),
        devBuyIx,
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey:   getRandomTipAccount(),
          lamports:   BigInt(Math.floor(jitoTip)),
        }),
      ],
    }).compileToV0Message(),
  );
  launchTxn.sign([wallet, mintKp]);

  const subWalletTxns = await buildSubWalletTxns(
    blockhash, keypairs, lutAccount!, bondingCurve, associatedBondingCurve,
    mintKp.publicKey, program, keyInfo,
  );

  logger.success(`Launch txn built`);
  logger.success(
    `${subWalletTxns.length} sub-wallet chunk(s) built  ` +
    `(${keypairs.length} wallets, 6 per chunk)`,
  );

  // ── 8. Send or simulate ──────────────────────────────────────────────────────

  logger.divider();

  if (opts.dryRun) {
    await dryRunSimulate([launchTxn, ...subWalletTxns]);
    return;
  }

  if (useStagger) {
    await staggerSend(launchTxn, subWalletTxns, delay);
  } else {
    logger.step('Sending full Jito bundle');
    await sendBundle([launchTxn, ...subWalletTxns]);
  }

  logger.divider();
  logger.success(`Launch complete.  Mint: ${mintKp.publicKey.toBase58()}`);
  logger.info(`https://pump.fun/${mintKp.publicKey.toBase58()}`);
  console.log();
}
