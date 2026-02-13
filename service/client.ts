#!/usr/bin/env -S deno run -P
import { Service, Flags } from './common.ts';

export default Service(import.meta, Client, Client.FLAGS);

interface Client extends Service {
  server?: Service
}

async function Client ({
  color  = true,
  log    = console.log,
  debug  = console.debug,
  chain  = Client.FLAGS.default!.chain!,
  oracle = Client.FLAGS.default!.oracle!,
} = {}): Promise<Client> {
  debug('Starting Simplicity Oracle Client');
  let server = null;
  if (oracle === 'spawn') {
    const { default: Server } = await import('./server.ts');
    server = await Server({ color, log, debug, chain });
    oracle = server.listen;
  }
  return { command, shutdown }
  async function command (..._: (string|number)[]) {
    const [command = 'stat', ...args] = _;
    switch (command) {
      case 'stat': return console.log(await getJson());
      case 'make': return console.log(await postJson({ make: { amount: args[0], price: args[1] } }));
      case 'take': return console.log(await postJson({ take: { amount: args[0] } }));
      default: {
        throw new Error(`unknown command ${command}`)
      }
    }
  }
  async function shutdown () {
    if (server) {
      debug('Stopping local oracle');
      await server?.shutdown();
      debug('Stopped local oracle');
    }
  }
  async function getJson () {
    return await (await fetch(new URL(oracle))).json();
  }
  async function postJson (body: unknown) {
    return await (await fetch(new URL(oracle), { method: 'post', body: JSON.stringify(body) })).json();
  }
}

namespace Client {
  export const FLAGS = Flags({
    string: ["chain", "oracle"]
  }, {
    oracle: 'http://127.0.0.1:8940',
    chain:  'http://127.0.0.1:8941',
  });
}
