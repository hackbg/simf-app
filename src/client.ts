#!/usr/bin/env -S deno run
import { Service, Flags } from './common.ts';
const FLAGS = Flags({ string: ["chain", "oracle"] }, {
  oracle: 'http://127.0.0.1:8940',
  chain:  'http://127.0.0.1:8941',
});
export default Service(import.meta, Client, FLAGS);
interface Client extends Service { server?: Service }
async function Client ({
  color  = true,
  log    = console.log,
  debug  = console.debug,
  chain  = FLAGS.default!.chain!,
  oracle = FLAGS.default!.oracle!,
}): Promise<Client> {
  debug('Starting Simplicity Oracle Client');
  let server = null;
  if (oracle === 'spawn') {
    const { default: Server } = await import('./server.ts');
    server = await Server({ color, log, debug, chain });
    oracle = server.listen;
  }
  const getJson  = async () =>
    await (await fetch(new URL(oracle))).json();
  const postJson = async (body) =>
    await (await fetch(new URL(oracle), { method: 'post', body })).json();
  return {
    async command (..._: (string|number)[]) {
      const [command = 'stat', ...args] = _;
      switch (command) {
        case 'stat': return console.log(await getJson());
        case 'make': return console.log(await postJson({ make: {} }));
        case 'take': return console.log(await postJson({ take: {} }));
        default: {
          throw new Error(`unknown command ${command}`)
        }
      }
    },
    async teardown () {
      if (server) {
        debug('Stopping local oracle');
        await server?.teardown();
        debug('Stopped local oracle');
      }
    }
  }
}
