#!/usr/bin/env -S deno run
import type { Bitcoin } from "fadroma";
import { Http } from "fadroma";
import { Service, Flags } from './common.ts';
export default Service(import.meta, Server, Server.FLAGS);
/** Server state. */
interface Server extends Service {
  /** Listen URL. */
  listen: string,
  /** Localnet handle. */
  localnet?: Bitcoin,
}
/** Run a microservice that deploys SimplicityHL programs
  * and signs witness attestations from a price feed. */ 
async function Server ({
  log    = console.log,
  debug  = console.debug,
  warn   = console.warn,
  store  = Deno.openKv(),
  chain  = Server.DEFAULTS.chain,
  listen = Server.DEFAULTS.listen,
  routes = Server.ROUTES,
  router = Http.Listen(listen, routes),
} = {}): Promise<Server> {
  debug('Initializing KV store...');
  const kv: Deno.Kv = await store;
  debug('Starting Simplicity Oracle Server');
  // For testing, the server can boot a localnet in `elementsregtest` mode.
  // This requires a compatible `elementsd` to be present on the system `PATH`.
  let localnet: Bitcoin;
  if (chain === 'spawn') {
    localnet = await Server.regtestSetup({ debug });
  } else {
    debug(`Using chain ${chain}`);
  }
  // Routes evaluate in this context:
  const context = {
    debug, log, warn, kv, chain: localnet, listen,
    shutdown: () => Server.shutdown(context),   
    async command (...args: (string|number)[]) {
      log('Listening until process exit on', listen)
      if (args.length > 0) warn('Commands ignored:', ...args);
      await new Promise(()=>{});
    },
  };
  // Add the listener itself to the context:
  return Object.assign(context, { listener: await router(context) });
}
namespace Server {
  const decoder = new TextDecoder();
  const { Get, Post, readBody } = Http;
  export type  Context  = Http.Context & { chain: Bitcoin; kv: Deno.Kv; };
  export const DEFAULTS = { chain: 'http://127.0.0.1:8941', listen: 'http://127.0.0.1:8940', };
  export const FLAGS    = Flags({ string: ["chain", "listen"] }, DEFAULTS);
  export const ROUTES   = Http(
    Get('/',       onGET),
    Get('/vault',  getDeployVaultPSET),
    Get('/attest', getAttestationWitness),
    Post('/',      onPOST));
  export async function getDeployVaultPSET (context: Context) {
  }
  export async function getAttestationWitness (context: Context) {
  }
  export async function onGET ({ req, kv, chain }: Context) {
    await chain.rpc.rescanblockchain();
    const { balance } = await chain.rpc.getwalletinfo();
    const orders = (await kv.list({ prefix: ["orders"] })).value || [];
    return { status: { balance, orders } };
  }
  export async function onPOST ({ req, kv }: Context) {
    const body = JSON.parse(await readBody(req));
    if (Object.keys(body).length == 1) {
      if (body.make) return await make({ ...body.make, kv });
      if (body.take) return await take({ ...body.make, kv });
    }
    throw Object.assign(new Error('make or take'), { http: 400 })
  }
  export async function regtestSetup ({ debug }) {
    debug('Starting Elements localnet')
    const { Bitcoin } = await import('fadroma');
    const chain = await Bitcoin(Server.LOCALNET) as Bitcoin;
    debug('Started Elements localnet');
    const name = `fadroma-${+new Date()}`;
    debug(`Funding test wallet ${name}`);
    await chain.rpc.createwallet(name);
    const addr = await chain.rpc.getnewaddress(name, "bech32");
    await chain.rpc.generatetoaddress(100, addr);
    debug(`Funded test wallet ${name}`);
    return chain;
  }
  export async function make ({ kv, amount = 1, price = 1 }) {
    await kv.atomic().mutate({ type: 'sum', key: ["made", price], value: amount }).commit();
    return { "made": { price, amount } }
  }
  export async function take ({ kv, amount = 1, price = 1 }) {
    await kv.atomic().mutate({ type: 'sum', key: ["took", price], value: amount }).commit();
    return { "took": {} }
  }
  export const LOCALNET = {
    chain:                       'elementsregtest',
    acceptnonstdtxn:             true,
    anyonecanspendaremine:       true,
    bech32_hrp:                  'tex',
    blech32_hrp:                 'tlq',
    blindedprefix:               23,
    blindedaddresses:            true,
    con_blocksubsidy:            0,
    con_connect_genesis_outputs: true,
    con_elementsmode:            true,
    defaultpeggedassetname:      'bitcoin',
    discover:                    false,
    dnsseed:                     false,
    evbparams:                   'simplicity:-1:::',
    //feeasset:                    'b2e15d0d7a0c94e4e2ce0fe6e8691b9e451377f6e46e8045a86f7c4b5d4f0f23',
    initialfreecoins:            1000000n * 100000000n,
    initialreissuancetokens:     1n * 100000000n,
    maxtxfee:                    100.0,
    persistmempool:              false,
    pubkeyprefix:                36,
    rest:                        true,
    rpcallowip:                  '127.0.0.1',
    rpcpassword:                 'fadroma',
    rpcport:                     8941,
    rpcuser:                     'fadroma',
    scriptprefix:                13,
    server:                      true,
    //subsidyasset:                'b2e15d0d7a0c94e4e2ce0fe6e8691b9e451377f6e46e8045a86f7c4b5d4f0f23',
    txindex:                     true,
    validatepegin:               false,
    vbparams:                    "taproot:1:1",
  };

  export async function shutdown ({ debug, kv, listener, localnet }) {
    if (typeof kv?.close === 'function') {
      debug('Stopping KV store');
      await kv.close();
      debug('Stopped KV store');
    }
    if (typeof listener?.close() === 'function') {
      debug('Stopping listener');
      await listener.close();
      debug('Stopped listener');
    }
    if (typeof localnet?.kill === 'function') {
      debug('Stopping localnet');
      await localnet.kill();
      debug('Stopped localnet');
    }
  }
}
