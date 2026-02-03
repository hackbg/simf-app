#!/usr/bin/env -S deno run
import { Http } from "fadroma";
import { Service, Flags } from './common.ts';
export const FLAGS = Flags({ string: ["chain", "listen"] }, {
  listen: 'http://127.0.0.1:8940',
  chain:  'http://127.0.0.1:8941',
});
export const ROUTES = Http(
  Http.Get('/', showStatus),
  Http.Post('/', openPosition),
);
console.log(ROUTES);
export default Service(import.meta, Server, FLAGS);
interface Server extends Service { localnet?: { kill (): Promise<void> } }
async function Server ({
  color  = true,
  log    = console.log,
  debug  = console.debug,
  warn   = console.warn,
  chain  = FLAGS.default.chain,
  listen = FLAGS.default.listen,
  routes = ROUTES,
} = {}): Promise<Server> {
  debug('Starting Simplicity Oracle Server');
  let localnet;
  if (chain === 'spawn') {
    debug('Starting Elements localnet for the duration of this call')
    const { Btc } = await import('fadroma');
    localnet = await Btc();
    debug('Started Elements localnet');
  } else {
    debug(`Using chain ${chain}`);
  }
  debug('Starting listener on', listen);
  const router = Http.Listen(listen, routes);
  const listener = await router();
  debug('Started listener');
  return {
    listen,
    async command (...args: (string|number)[]) {
      log('Listening until process exit.')
      if (args.length > 0) warn('Commands ignored:', ...args);
      await new Promise(()=>{});
    },
    async teardown () {
      if (listener) {
        debug('Stopping listener');
        await listener.close();
        debug('Stopped listener');
      }
      if (localnet) {
        debug('Stopping localnet');
        await localnet.kill();
        debug('Stopped localnet');
      }
    }
  }
}
async function showStatus (_: Http.Request) {
  console.log('show status')
  return 1;
}
async function openPosition (_: Http.Request) {
  console.log('open position')
  return 2;
}
