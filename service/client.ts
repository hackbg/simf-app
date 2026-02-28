#!/usr/bin/env -S deno run -P
import { Service, FLAGS, DEFAULTS } from './common.ts';

export default Service(import.meta, Client, FLAGS);

/** Client state. */
interface Client extends Service {
  /** Server handle. */
  server?: Service,
}

/** Invoke the CLI. */
async function Client ({
  color  = true,
  log    = console.log,
  debug  = console.debug,
  rpcurl = DEFAULTS.rpcurl,
  apiurl = DEFAULTS.apiurl,
} = {}): Promise<Client> {

  debug('Starting Simplicity Oracle Client');

  // Automatically spawn localnet if requested
  let server = null;
  if (apiurl === 'spawn') {
    const { default: Server } = await import('./server.ts');
    server = await Server({ color, log, debug, rpcurl });
    apiurl = server.listen;
  }

  return {
    apiurl,
    rpcurl,
    server,
    async command (..._: (string|number)[]) {
      const [command = null, ...args] = _;
      switch (command) {
        case null: {
          log('Fadroma v3-alpha SimplicityHL CLI');
          log('');
          log(`RPC: ${rpcurl}`);
          log(`API: ${apiurl}`);
          log('');
          log('Commands:');
          log('  p2pk    program: pay to public key');
          log('  p2pkh   program: pay to public key hash');
          log('  escrow  program: escrow');
          log('  vault   program: oracle vault');
          log('  attest  generate oracle attestation');
          log('');
          throw new Error(`specify a command`)
        }
        case 'p2pk':
        case 'p2pkh':
        case 'escrow':
        case 'vault': {
          const [subcommand = null, ...subargs] = args;
          switch (subcommand) {
            case null: {
              log('Fadroma v3-alpha SimplicityHL CLI');
              log('');
              log(`RPC: ${rpcurl}`),
              log(`API: ${apiurl}`),
              log(`Program: ${command}`);
              log('');
              log('Commands:');
              log(`  list    discover ${command} instances`);
              log(`  show    inspect ${command} program`);
              log(`  fund    deposit ${command} funds`);
              log(`  spend   withdraw ${command} funds`);
              log('');
              throw new Error(`specify a subcommand`)
            }
            default: {
              throw new Error(`not implemented: ${command} ${subcommand}`)
            }
          }
        }
        default: {
          throw new Error(`not implemented: ${command}`)
        }
      }
    },
    async shutdown () {
      if (server) {
        debug('Stopping local oracle');
        await server?.shutdown();
        debug('Stopped local oracle');
      }
    },
  }

  async function getJson () {
    return await (await fetch(new URL(apiurl))).json();
  }
  async function postJson (body: unknown) {
    return await (await fetch(new URL(apiurl), {
      method: 'post', body: JSON.stringify(body)
    })).json();
  }
}
