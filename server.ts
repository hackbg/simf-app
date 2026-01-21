#!/usr/bin/env -S deno run
import { Http } from "fadroma";
import { Service, Flags } from './common.ts';
const FLAGS = Flags({ string: ["chain", "listen"] }, {
  listen: 'http://127.0.0.1:8940',
  chain:  'http://127.0.0.1:8941',
});
export default Service(import.meta, Server, FLAGS);
interface Server extends Service { localnet?: { kill (): Promise<void> } }
async function Server ({
  color  = true,
  log    = console.log,
  debug  = console.debug,
  chain  = FLAGS.default.chain,
  listen = FLAGS.default.listen,
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
  const router = Http(listen,
    Http.Get('/',  showStatus),
    Http.Post('/', openPosition));
  const listener = router();
  debug('Started listener', listener);
  return {
    listen,
    async command (...args: (string|number)[]) {
      log('Listening.');
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
async function showStatus () {}
async function openPosition () {}
