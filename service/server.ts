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
  rpcurl  = DEFAULTS.rpcurl,
  apiurl  = DEFAULTS.apiurl,
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
    Get('/',       getQuery),
    Post('/',      postCommand),
    Get('/vault',  getDeployVaultPSET),
    Get('/attest', getAttestationWitness),
  );

  /** Context available to route handlers. */
  export interface Context extends Http.Context {
    chain:        Bitcoin;
    kv:           Deno.Kv;
    esplora:      string;
    oracleKey:    Uint8Array;
    oraclePubkey: Uint8Array;
  }

  /** Respond to status GET using Esplora for chain tip info. */
  export async function getQuery({ kv, esplora }: Context) {
    const [height, hash] = await Promise.all([
      fetch(`${esplora}/blocks/tip/height`).then(r => r.text()).then(Number),
      fetch(`${esplora}/blocks/tip/hash`).then(r => r.text()),
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
    await kv.atomic().mutate({ type: 'sum', key: ['made', price], value: amount }).commit();
    return { made: { price, amount } };
  }

  export async function take({ kv, amount = 1, price = 1 }) {
    await kv.atomic().mutate({ type: 'sum', key: ['took', price], value: amount }).commit();
    return { took: {} };
  }

  // Price cache — shared across requests, refreshed every PRICE_TTL_MS.
  let priceCache: { price: number; fetchedAt: number } | null = null;
  const PRICE_TTL_MS = 5_000;

  export async function fetchPrice(): Promise<number> {
    if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_TTL_MS) {
      return priceCache.price;
    }
    try {
      const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      const { price } = await res.json();
      priceCache = { price: parseFloat(price), fetchedAt: Date.now() };
    } catch {
      // Fallback to CoinGecko
      const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
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
  export async function getAttestationWitness({ oracleKey, oraclePubkey }: Context) {
    const asset      = 'BTC/USD';
    const timestamp  = new Date().toISOString();
    const price      = await fetchPrice();
    const priceCents = Math.round(price * 100); // u32, cents

    // Build canonical message bytes: asset | price (u32 big-endian) | timestamp
    const enc       = new TextEncoder();
    const priceBytes = new Uint8Array(4);
    new DataView(priceBytes.buffer).setUint32(0, priceCents, false);
    const msgBytes  = concat(enc.encode(asset), priceBytes, enc.encode(timestamp));
    const msgHash   = new Uint8Array(await crypto.subtle.digest('SHA-256', msgBytes));

    // BIP-340 Schnorr sign
    const sigBytes  = schnorr.sign(msgHash, oracleKey);

    return {
      timestamp,
      asset,
      price,
      pubkey: hex(oraclePubkey),
      // Witness shaped for SimplicityHL.Args / program.spendTx()
      witness: {
        PRICE:   { type: 'u32',       value: priceCents },
        witness: { type: 'Signature', value: `0x${hex(sigBytes)}` },
      },
    };
  }

  /** TODO: REST method serves TX for deploying the vault. */
  export async function getDeployVaultPSET({ req, kv, chain }: Context) {
    // TODO: this deploys the vault
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
    warn:  (...a: unknown[]) => void,
  ): Uint8Array {
    const envKey = Deno.env.get('ORACLE_PRIVKEY');
    if (envKey) {
      debug('Loaded oracle key from ORACLE_PRIVKEY');
      return fromHex(envKey);
    }
    const key = schnorr.utils.randomSecretKey();
    warn('No ORACLE_PRIVKEY set — using ephemeral key (will change on restart)');
    return key;
  }

  export interface Options extends Log {
    routes:  Http.Handler;
    router:  Fn<[unknown], Fn.Async<Http.Server>>;
    store:   Fn.Async<Deno.Kv>;
    rpcurl:  string;
    apiurl:  string;
    esplora: string;
  }

  // Byte utilities
  export const hex     = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  export const fromHex = (s: string)     => new Uint8Array(s.replace(/^0x/, '').match(/.{2}/g)!.map(x => parseInt(x, 16)));
  export function concat(...arrays: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }
}
