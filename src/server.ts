#!/usr/bin/env -S deno run
import { Http, Port } from "fadroma";
import type { Btc } from "fadroma";
import { Service, Flags } from './common.ts';
export default Service(import.meta, Server, Server.FLAGS);
interface Server extends Service {
  /** Listen URL. */
  listen: string,
  /** Localnet handle. */
  localnet?: Btc,
}
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
  let localnet: Btc;
  if (chain === 'spawn') {
    debug('Starting Elements localnet')
    const { Btc } = await import('fadroma');
    localnet = await Btc(Server.LOCALNET);
    debug('Started Elements localnet');
  } else {
    debug(`Using chain ${chain}`);
  }
  const listener = await router({ warn, log, debug, kv, chain: localnet });
  return {
    listen,
    localnet,
    async command (...args: (string|number)[]) {
      log('Listening until process exit on', listen)
      if (args.length > 0) warn('Commands ignored:', ...args);
      await new Promise(()=>{});
    },
    async teardown () {
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
}
namespace Server {
  export interface Context extends Http.Context {
    kv: Deno.Kv;
    chain: Btc;
  }
  export const DEFAULTS = {
    listen: 'http://127.0.0.1:8940',
    chain:  'http://127.0.0.1:8941',
  };
  export const FLAGS = Flags({ string: ["chain", "listen"] }, DEFAULTS);
  export const ROUTES = Http(
    Http.Get('/',  showStatus),
    Http.Post('/', openPosition));
  export async function showStatus ({ req, kv, chain }: Context) {
    const name = `fadroma-${+new Date()}`;
    await chain.rpc.createwallet(name);
    const addr = await chain.rpc.getnewaddress(name, "bech32");
    await chain.rpc.generatetoaddress(100, addr);
    await chain.rpc.rescanblockchain();
    const { balance } = await chain.rpc.getwalletinfo();
    const positions = (await kv.get(["positions"])).value || [];
    return { status: { balance, positions } };
  }
  export function openPosition ({ req, kv }: Context) {
    return { opened: {} };
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
}
