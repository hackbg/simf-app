#!/usr/bin/env -S deno run -P
import type { Fn, Log } from 'fadroma';
import { Http, Bytes, Base16, Bitcoin, SimplicityHL as Simf } from 'fadroma';
import { schnorr } from 'npm:@noble/curves/secp256k1.js';
import { Service, FLAGS, DEFAULTS, regtestSetup } from './common.ts';
import fetchPrice from './fetchPrice.ts';
import * as Vault from './vault.ts';

export default Service(import.meta, Server, FLAGS);

/** Server state. */
interface Server extends Service {
  /** Localnet handle. */
  localnet?: Bitcoin;
}

/** Run a microservice that deploys SimplicityHL programs
 * and signs witness attestations from a price feed. */
async function Server ({
  log     = console.log,
  debug   = console.debug,
  warn    = console.warn,
  store   = Deno.openKv(),
  chain   = DEFAULTS.chain,
  rpcurl  = DEFAULTS.rpcurl,
  apiurl  = DEFAULTS.apiurl,
  esplora = DEFAULTS.esplora,
  routes  = Server.ROUTES,
  router  = Http.Listen(apiurl, routes),
}: Partial<Server.Options> = {}): Promise<Server> {
  debug('Starting Simplicity Oracle Server');

  debug('Initializing KV store...');
  const kv: Deno.Kv = await store;

  // Load or generate the oracle signing keypair.
  // Set ORACLE_PRIVKEY (64 hex chars) to persist the key across restarts.
  const oracleKey = Server.loadOracleKey(debug, warn);
  const oraclePubkey = schnorr.getPublicKey(oracleKey);
  debug(`Oracle pubkey: ${Base16.encode(oraclePubkey)}`);

  if (esplora) debug(`Using Esplora:`, esplora);

  // The following definitions are available to routes:
  const context = {
    debug,
    log,
    warn,
    kv,
    chain,
    localnet: await (async () => {
      // For testing, the server can boot a localnet in `elementsregtest` mode.
      // This requires a compatible `elementsd` to be present on the system `PATH`.
      if (rpcurl === 'spawn') return await regtestSetup({ debug });
      // Values other than `spawn`
      debug(`Connecting directly to ${chain} at ${rpcurl}`);
      return { rpc: Bitcoin.Rpc(rpcurl) } as Bitcoin;
    }) (),
    apiurl,
    rpcurl,
    esplora,
    oracleKey,
    oraclePubkey,
    listener: null,
    async command (...args: (string | number)[]) {
      log('Listening until process exit on', apiurl);
      if (args.length > 0) warn('Commands ignored:', ...args);
      await new Promise(() => {});
    },
    async shutdown () {
      if (typeof context.kv?.close === 'function') {
        debug('Stopping KV store');
        await Promise.resolve(context.kv.close());
        debug('Stopped KV store');
      }
      if (typeof context.listener?.close === 'function') {
        debug('Stopping listener');
        await Promise.resolve(context.listener.close());
        debug('Stopped listener');
      }
      if (typeof context.chain?.kill === 'function') {
        debug('Stopping chain');
        await Promise.resolve(context.chain.kill());
        debug('Stopped chain');
      }
    }
  };

  // Run the HTTP router with the context,
  // add the listener itself to the context,
  // and return the whole thing:
  return Object.assign(context, { listener: await router(context) });
}

namespace Server {
  const { Method: { Get, Post }, } = Http;

  /** Routes */
  export const ROUTES: Http.Handler<Context> = Http(
    Get('/',                 getQuery),
    Post('/',                postCommand),
    Get('/vault',            Vault.getVaultInfo),
    Post('/vault',           Vault.postVaultAttest),     // oracle: sign sighash, return witness
    Post('/vault/sighash',   Vault.postVaultSighash),    // client: compute sighash from UTXO
    Post('/vault/tx',        Vault.postVaultBuildTx),    // client: build signed tx with witness
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
    const [height, hash]: [number, string] = await Promise.all([
      Http.fetchText(`${esplora}/blocks/tip/height`).then(Number),
      Http.fetchText(`${esplora}/blocks/tip/hash`),
    ]);
    // FIXME: types say this should be iterator not array - seem to work tho?
    const orders = (await kv.list({ prefix: ['orders'] })).value || [];
    return { status: { tip: { height, hash }, orders } };
  }

  /** Respond to POST. */
  export async function postCommand({ req, kv }: Context) {
    const body = JSON.parse(await Http.readBody(req));
    if (Object.keys(body).length == 1) {
      if (body.make) return await make({ ...body.make, kv });
      if (body.take) return await take({ ...body.take, kv });
    }
    throw Object.assign(new Error('make or take'), { http: 400 });
  }

  export async function make({ kv, amount = 1, price = 1 }) {
    const mutation = { type: 'sum', key: ['made', price], value: amount };
    await kv.atomic().mutate(mutation).commit();
    return { made: { price, amount } };
  }

  export async function take({ kv, amount = 1, price = 1 }) {
    const mutation = { type: 'sum', key: ['took', price], value: amount };
    await kv.atomic().mutate(mutation).commit();
    return { took: {} };
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
    const msgBytes = Bytes.concat([enc.encode(asset), priceBytes, enc.encode(timestamp)]);
    const msgHash = new Uint8Array(await crypto.subtle.digest('SHA-256', msgBytes));

    // BIP-340 Schnorr sign
    const sigBytes = schnorr.sign(msgHash, oracleKey);

    return {
      timestamp,
      asset,
      price,
      pubkey: Base16.encode(oraclePubkey),
      // Display-only: oracle attests to the price at this timestamp.
      // For vault spends, use POST /vault with the spend sighash instead.
      witness: Vault.vaultWitness(priceCents, sigBytes),
    };
  }

  /** Request L-BTC from the Liquid testnet faucet for a given address. */
  export async function postFaucet({ req }: Context) {
    const { address } = JSON.parse(await Http.readBody(req));
    if (!address || typeof address !== 'string') throw Err('provide address', { http: 400 });
    return await Bitcoin.LiquidTestnet.callFaucet(address);
  }


  /** Load oracle private key from ORACLE_PRIVKEY env, or generate an ephemeral one. */
  export function loadOracleKey(
    debug: (...a: unknown[]) => void,
    warn: (...a: unknown[]) => void,
  ): Uint8Array {
    const envKey = Deno.env.get('ORACLE_PRIVKEY');
    if (envKey) {
      debug('Loaded oracle key from ORACLE_PRIVKEY');
      return Base16.decode(envKey);
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
}
