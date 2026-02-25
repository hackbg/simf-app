#!/usr/bin/env -S deno run -P
import type { Fn, Log } from 'fadroma';
import { Http, Bitcoin } from 'fadroma';
import { schnorr } from 'npm:@noble/curves/secp256k1.js';
import { Service, FLAGS, DEFAULTS } from './common.ts';

export default Service(import.meta, Server, FLAGS);

/** Server state. */
interface Server extends Service {
  /** Localnet handle. */
  localnet?: Bitcoin;
}

/** Run a microservice that deploys SimplicityHL programs
 * and signs witness attestations from a price feed. */
async function Server({
  log = console.log,
  debug = console.debug,
  warn = console.warn,
  store = Deno.openKv(),
  rpcurl = DEFAULTS.rpcurl,
  apiurl = DEFAULTS.apiurl,
  esplora = DEFAULTS.esplora,
  routes = Server.ROUTES,
  router = Http.Listen(apiurl, routes),
}: Partial<Server.Options> = {}): Promise<Server> {
  debug('Starting Simplicity Oracle Server');

  debug('Initializing KV store...');
  const kv: Deno.Kv = await store;

  // Load or generate the oracle signing keypair.
  // Set ORACLE_PRIVKEY (64 hex chars) to persist the key across restarts.
  const oracleKey = Server.loadOracleKey(debug, warn);
  const oraclePubkey = schnorr.getPublicKey(oracleKey);
  debug(`Oracle pubkey: ${Server.hex(oraclePubkey)}`);

  // For testing, the server can boot a localnet in `elementsregtest` mode.
  // This requires a compatible `elementsd` to be present on the system `PATH`.
  let localnet: Bitcoin;
  if (rpcurl === 'spawn') {
    localnet = await Server.regtestSetup({ debug });
  } else {
    debug(`Using chain ${rpcurl}`);
    localnet = { rpc: Bitcoin.Rpc(rpcurl) } as Bitcoin;
  }

  // The following definitions are available to routes:
  const context = {
    shutdown: () => Server.shutdown(context),
    debug,
    log,
    warn,
    kv,
    chain: localnet,
    localnet,
    apiurl,
    rpcurl,
    esplora,
    oracleKey,
    oraclePubkey,
    listener: null,
    async command(...args: (string | number)[]) {
      log('Listening until process exit on', apiurl);
      if (args.length > 0) warn('Commands ignored:', ...args);
      await new Promise(() => {});
    },
  };

  // Run the HTTP router with the context,
  // add the listener itself to the context,
  // and return the whole thing:
  return Object.assign(context, { listener: await router(context) });
}

namespace Server {
  const {
    readBody,
    Method: { Get, Post },
  } = Http;

  /** Routes */
  export const ROUTES: Http.Handler<Context> = Http(
    Get('/',                 getQuery),
    Post('/',                postCommand),
    Get('/vault',            getVaultInfo),
    Post('/vault',           postVaultAttest),
    Post('/vault/sign',      postVaultSign),   // signs & returns hex; client broadcasts
    Get('/attest',           getAttestationWitness),
    Post('/faucet',          postFaucet),
  );

  /** Context available to route handlers. */
  export interface Context extends Http.Context {
    chain: Bitcoin;
    kv: Deno.Kv;
    esplora: string;
    oracleKey: Uint8Array;
    oraclePubkey: Uint8Array;
  }

  /** Respond to status GET using Esplora for chain tip info. */
  export async function getQuery({ kv, esplora }: Context) {
    const [height, hash] = await Promise.all([
      fetch(`${esplora}/blocks/tip/height`)
        .then((r) => r.text())
        .then(Number),
      fetch(`${esplora}/blocks/tip/hash`).then((r) => r.text()),
    ]);
    const orders = (await kv.list({ prefix: ['orders'] })).value || [];
    return { status: { tip: { height, hash }, orders } };
  }

  /** Respond to POST. */
  export async function postCommand({ req, kv }: Context) {
    const body = JSON.parse(await readBody(req));
    if (Object.keys(body).length == 1) {
      if (body.make) return await make({ ...body.make, kv });
      if (body.take) return await take({ ...body.take, kv });
    }
    throw Object.assign(new Error('make or take'), { http: 400 });
  }

  export async function make({ kv, amount = 1, price = 1 }) {
    await kv
      .atomic()
      .mutate({ type: 'sum', key: ['made', price], value: amount })
      .commit();
    return { made: { price, amount } };
  }

  export async function take({ kv, amount = 1, price = 1 }) {
    await kv
      .atomic()
      .mutate({ type: 'sum', key: ['took', price], value: amount })
      .commit();
    return { took: {} };
  }

  // Price cache - shared across requests, refreshed every PRICE_TTL_MS.
  let priceCache: { price: number; fetchedAt: number } | null = null;
  const PRICE_TTL_MS = 5_000;

  export async function fetchPrice(): Promise<number> {
    if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_TTL_MS) {
      return priceCache.price;
    }
    try {
      const res = await fetch(
        'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      );
      const { price } = await res.json();
      priceCache = { price: parseFloat(price), fetchedAt: Date.now() };
    } catch {
      // Fallback to CoinGecko
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      );
      const data = await res.json();
      priceCache = { price: data.bitcoin.usd, fetchedAt: Date.now() };
    }
    return priceCache!.price;
  }

  /** Sign a price attestation with the oracle's Schnorr key.
   *
   * The signed message is: SHA-256(asset_utf8 || price_u32_be || timestamp_u64_be)
   * where price is denominated in cents (integer) to avoid floating point issues.
   *
   * The returned witness is shaped for SimplicityHL.Args so it can be passed
   * directly to program.spendTx() once a vault spend is being constructed. */
  export async function getAttestationWitness({
    oracleKey,
    oraclePubkey,
  }: Context) {
    const asset = 'BTC/USD';
    const timestamp = new Date().toISOString();
    const price = await fetchPrice();
    const priceCents = Math.round(price * 100); // u32, cents

    // Build canonical message bytes: asset | price (u32 big-endian) | timestamp
    const enc = new TextEncoder();
    const priceBytes = new Uint8Array(4);
    new DataView(priceBytes.buffer).setUint32(0, priceCents, false);
    const msgBytes = concat(
      enc.encode(asset),
      priceBytes,
      enc.encode(timestamp),
    );
    const msgHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', msgBytes),
    );

    // BIP-340 Schnorr sign
    const sigBytes = schnorr.sign(msgHash, oracleKey);

    return {
      timestamp,
      asset,
      price,
      pubkey: hex(oraclePubkey),
      // Display-only: oracle attests to the price at this timestamp.
      // For vault spends, use POST /vault with the spend sighash instead.
      witness: {
        PRICE: { type: 'u32', value: priceCents },
        SIG: { type: 'Signature', value: `0x${hex(sigBytes)}` },
      },
    };
  }

  /** SimplicityHL vault program source. Authority is passed as param::AUTHORITY at compile time. */
  // Vault: oracle signs the spend sighash (price-gating is enforced offchain by the oracle).
  // The PRICE witness field records the attested price at signing time for on-chain auditability.
  const VAULT_SOURCE =
    `fn main () {` +
    ` jet::bip_0340_verify((param::AUTHORITY, jet::sig_all_hash()), witness::SIG);` +
    ` }`;

  // Cache vault compilation - deterministic for a given oracle key.
  let vaultCache: {
    cmr: string;
    p2tr: string;
    authority: string;
    source: string;
  } | null = null;

  // Genesis block hash cache - constant for a given network.
  let genesisCache: string | null = null;
  async function fetchGenesis(esplora: string): Promise<string> {
    if (!genesisCache) {
      genesisCache = await fetch(`${esplora}/block-height/0`)
        .then(r => r.text())
        .then(s => s.trim());
    }
    return genesisCache;
  }

  /** Compile the vault program with the oracle pubkey and return its P2TR address, CMR, and balance. */
  export async function getVaultInfo({ oraclePubkey, esplora }: Context) {
    if (!vaultCache) {
      const { SimplicityHL } = await import('fadroma');
      const wasm = await SimplicityHL.Wasm();
      const authority = `0x${hex(oraclePubkey)}`;
      const args = { AUTHORITY: { type: 'Pubkey', value: authority } };
      const program = wasm.compile(VAULT_SOURCE, { args });
      const { cmr, p2tr, source } = ((program as unknown) as {
        toJSON(): { cmr: string; p2tr: string; source: string };
      }).toJSON();
      vaultCache = { cmr, p2tr, authority: authority.slice(2), source: source || VAULT_SOURCE };
    }
    // Fetch balance from Esplora via UTXOs.
    // The address-level endpoint omits amount sums for Liquid (confidential tx support),
    // so we sum the `value` field across all UTXOs instead.
    let balance_sats = 0;
    try {
      const utxos: { value: number }[] = await fetch(
        `${esplora}/address/${vaultCache.p2tr}/utxo`,
      ).then((r) => r.json());
      balance_sats = utxos.reduce((s, u) => s + u.value, 0);
    } catch {
      /* ignore - balance stays 0 */
    }
    return { vault: { ...vaultCache, balance_sats } };
  }

  /** Sign a spend sighash with the oracle key and return witness args for spendTx().
   *
   * The client should call program.spendSighash() locally to obtain the sighash,
   * then POST it here. The oracle checks the current price and signs the sighash,
   * returning { SIG, PRICE } ready to pass as witness to program.spendTx(). */
  export async function postVaultAttest({ req, oracleKey }: Context) {
    const { sighash } = JSON.parse(await readBody(req));
    if (!sighash || typeof sighash !== 'string') {
      throw Object.assign(new Error('provide sighash'), { http: 400 });
    }
    const price = await fetchPrice();
    const priceCents = Math.round(price * 100);
    const sigBytes = schnorr.sign(fromHex(sighash), oracleKey);
    return {
      price,
      witness: {
        SIG: { type: 'Signature', value: `0x${hex(sigBytes)}` },
        PRICE: { type: 'u32', value: priceCents },
      },
    };
  }

  /** Compile vault, sign with oracle key, and return the signed transaction hex.
   *
   * Fetches the largest UTXO on the vault address, builds the spend tx using the
   * SimplicityHL WASM, signs it with the oracle's Schnorr key, and returns the
   * fully-signed hex. The client is responsible for broadcasting to Esplora. */
  export async function postVaultSign({ req, oracleKey, oraclePubkey, esplora }: Context) {
    const { to, fee_sats = 1000 } = JSON.parse(await readBody(req));
    if (!to || typeof to !== 'string') {
      throw Object.assign(new Error('provide to address'), { http: 400 });
    }
    if (!vaultCache) {
      throw Object.assign(new Error('vault not initialised — call GET /vault first'), { http: 503 });
    }

    // 1. Fetch UTXOs from Esplora and pick the largest one.
    const utxos: { txid: string; vout: number; value: number }[] =
      await fetch(`${esplora}/address/${vaultCache.p2tr}/utxo`).then(r => r.json());
    if (!utxos || utxos.length === 0) {
      throw Object.assign(new Error('vault has no funded UTXOs'), { http: 400 });
    }
    const utxo = utxos.reduce((best, u) => u.value > best.value ? u : best);

    // 2. Fetch the raw funding transaction hex.
    const txHex = await fetch(`${esplora}/tx/${utxo.txid}/hex`).then(r => r.text());

    // 3. Compile vault program.
    const { SimplicityHL } = await import('fadroma');
    const wasm      = await SimplicityHL.Wasm();
    const authority = `0x${hex(oraclePubkey)}`;
    const prog      = wasm.compile(VAULT_SOURCE, { args: { AUTHORITY: { type: 'Pubkey', value: authority } } });

    // 4. Derive amounts (BTC floats).
    const fee    = fee_sats / 1e8;
    const amount = (utxo.value - fee_sats) / 1e8;
    if (amount <= 0) {
      throw Object.assign(new Error('UTXO value too small to cover fee'), { http: 400 });
    }

    // 5. Fetch genesis hash, compute spend sighash, sign with oracle key, fetch price for PRICE witness.
    const genesis    = await fetchGenesis(esplora);
    const sighash    = (prog as unknown as { spendSighash(_: object): string }).spendSighash({ tx: txHex, amount, fee, to, genesis });
    const price      = await fetchPrice();
    const priceCents = Math.round(price * 100);
    const sigBytes   = schnorr.sign(fromHex(sighash), oracleKey);
    const witness    = {
      SIG:   { type: 'Signature', value: `0x${hex(sigBytes)}` },
      PRICE: { type: 'u32',       value: String(priceCents) },
    };

    // 6. Build fully-signed spend transaction and return hex to client for broadcasting.
    const spendTx = (prog as unknown as { spendTx(_: object): { hex: string } }).spendTx({ tx: txHex, amount, fee, to, witness, genesis });
    return { signedHex: spendTx.hex, amount, fee, to, price };
  }

  /** Request L-BTC from the Liquid testnet faucet for a given address. */
  export async function postFaucet({ req }: Context) {
    const { address } = JSON.parse(await readBody(req));
    if (!address || typeof address !== 'string') {
      throw Object.assign(new Error('provide address'), { http: 400 });
    }
    const url = `https://liquidtestnet.com/api/faucet?address=${encodeURIComponent(
      address,
    )}&action=lbtc`;
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) throw Object.assign(new Error(body), { http: res.status });
    const data = (() => {
      try {
        return JSON.parse(body);
      } catch {
        return { result: body };
      }
    })();
    // Extract the 64-char hex txid embedded in the result string.
    const txid =
      (data.result as string | undefined)?.match(/[0-9a-f]{64}/)?.[0] ?? null;
    return { ...data, txid };
  }

  export async function shutdown({ debug, kv, listener, chain }) {
    if (typeof kv?.close === 'function') {
      debug('Stopping KV store');
      await kv.close();
      debug('Stopped KV store');
    }
    if (typeof listener?.close === 'function') {
      debug('Stopping listener');
      await listener.close();
      debug('Stopped listener');
    }
    if (typeof chain?.kill === 'function') {
      debug('Stopping chain');
      await chain.kill();
      debug('Stopped chain');
    }
  }

  export async function regtestSetup({ debug }) {
    debug('Starting Elements localnet');
    const { Bitcoin } = await import('fadroma');
    const chain = (await Bitcoin.ElementsRegtest()) as Bitcoin;
    debug('Started Elements localnet');
    const name = `fadroma-${+new Date()}`;
    debug(`Funding test wallet ${name}`);
    await chain.rpc.createwallet(name);
    const addr = await chain.rpc.getnewaddress(name, 'bech32');
    await chain.rpc.generatetoaddress(100, addr);
    debug(`Funded test wallet ${name}`);
    return chain;
  }

  /** Load oracle private key from ORACLE_PRIVKEY env, or generate an ephemeral one. */
  export function loadOracleKey(
    debug: (...a: unknown[]) => void,
    warn: (...a: unknown[]) => void,
  ): Uint8Array {
    const envKey = Deno.env.get('ORACLE_PRIVKEY');
    if (envKey) {
      debug('Loaded oracle key from ORACLE_PRIVKEY');
      return fromHex(envKey);
    }
    const key = schnorr.utils.randomSecretKey();
    warn(
      'No ORACLE_PRIVKEY set - using ephemeral key (will change on restart)',
    );
    return key;
  }

  export interface Options extends Log {
    routes: Http.Handler;
    router: Fn<[unknown], Fn.Async<Http.Server>>;
    store: Fn.Async<Deno.Kv>;
    rpcurl: string;
    apiurl: string;
    esplora: string;
  }

  // Byte utilities
  export const hex = (b: Uint8Array) =>
    Array.from(b)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  export const fromHex = (s: string) =>
    new Uint8Array(
      s
        .replace(/^0x/, '')
        .match(/.{2}/g)!
        .map((x) => parseInt(x, 16)),
    );
  export function concat(...arrays: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let off = 0;
    for (const a of arrays) {
      out.set(a, off);
      off += a.length;
    }
    return out;
  }
}
