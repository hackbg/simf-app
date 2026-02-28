import { parseArgs } from "jsr:@std/cli/parse-args";
import { Fn, Log } from "fadroma";

export const DEFAULTS = {
  chain:   'liquidtestnet',
  apiurl:  'http://127.0.0.1:8940',
  esplora: 'https://blockstream.info/liquidtestnet/api',
  rpcurl:  null,//'http://127.0.0.1:8941',
};

export const FLAGS = defineFlags(
  { string: ["rpcurl", "apiurl", "esplora"] }, DEFAULTS
);

/** Add custom command-line flags to set of default ones. */
function defineFlags <T extends object> (custom?: {
  boolean?:   string[],
  string?:    string[],
  negatable?: string[],
}, defaults?: T) {
  return {
    boolean:   ["help", "version", "color", ...custom?.boolean||[]],
    string:    [...custom?.string||[]],
    negatable: ["color", ...custom?.negatable||[]],
    default:   defaults||{} as Partial<T>,
  }
}

export interface Service {
  shutdown: () => Promise<void>,
  command: (...args: (string|number)[]) => Promise<unknown>,
  apiurl: string|URL
  rpcurl: string|URL
}

/** Define CLI entrypoint. */
export function Service <T extends Service> (
  meta: Fn.Main.Meta, main: Fn<[Partial<T>], Fn.Async<T>>, flags: Parameters<typeof parseArgs>[1]
): typeof main {
  // If called from entypoint, invoke main function in default context.
  Fn.Main(meta, runMain);
  // Either way just return the main function.
  return main;
  // Run the main function in default context:
  async function runMain ({ args, exit }) {
    // Parse common command-line arguments:
    const { _, help, version, ...config } = parseArgs(args, flags);
    if (help)    { console.log(flags);  exit(1); }
    if (version) { console.log('beta'); exit(0); }
    // Run the main function and report the result:
    let code = 0;
    let service = null;
    try {
      service = await main(Log({ args, exit, ...config }));
      return await service.command(..._);
    } catch (e) {
      console.error(e);
      code = 1;
    } finally {
      if (typeof service?.shutdown === 'function') await service.shutdown();
      exit(code);
    }
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
