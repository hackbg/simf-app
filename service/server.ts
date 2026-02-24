#!/usr/bin/env -S deno run -P
import type { Fn, Bitcoin, Log } from 'fadroma';
import { Http } from 'fadroma';
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
  routes = Server.ROUTES,
  router = Http.Listen(apiurl, routes),
}: Partial<Server.Options> = {}): Promise<Server> {
  debug('Starting Simplicity Oracle Server');

  debug('Initializing KV store...');
  const kv: Deno.Kv = await store;

  // For testing, the server can boot a localnet in `elementsregtest` mode.
  // This requires a compatible `elementsd` to be present on the system `PATH`.
  let localnet: Bitcoin;
  if (rpcurl === 'spawn') {
    localnet = await Server.regtestSetup({ debug });
  } else {
    debug(`Using chain ${rpcurl}`);
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

  /** Routes: should we do
   * - REST style (endpoint per method)
   * - RPC style (method name is another parameter)? */
  export const ROUTES: Http.Handler<Context> = Http(
    // RPC style (HTTP abstracted away):
    Get('/', getQuery),
    Post('/', postCommand),
    // REST style (HTTP factored in):
    Get('/vault', getDeployVaultPSET),
    Get('/attest', getAttestationWitness),
  );

  /** Context available to route handlers. */
  export interface Context extends Http.Context {
    chain: Bitcoin;
    kv: Deno.Kv;
  }

  /** Respont to status GET.
   *
   * If going with RPC style routes, parameterize here to serve other things. */
  export async function getQuery({ req, kv, chain }: Context) {
    await chain.rpc.rescanblockchain();
    const { balance } = await chain.rpc.getwalletinfo();
    const orders = (await kv.list({ prefix: ['orders'] })).value || [];
    return { status: { balance, orders } };
  }

  /** Respond to POST.
   *
   * TODO: Replace example command dispatch with POST API matching the [Client]. */
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

  export interface Options extends Log {
    routes: Http.Handler;
    router: Fn<[unknown], Fn.Async<Http.Server>>;
    store: Fn.Async<Deno.Kv>;
    rpcurl: string;
    apiurl: string;
  }

  /** TODO: REST method serves TX for deploying the vault.
   * TODO: or should it be POST and broadcast on its own? */
  export async function getDeployVaultPSET({ req, kv, chain }: Context) {
    // TODO: this deploys the vault
  }

  /** TODO: Most of the unknowns are here. */
  export async function getAttestationWitness({ req, kv, chain }: Context) {
    // TODO: this provides the price attestation
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
}
