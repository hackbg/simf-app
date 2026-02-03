import { Fn, Log, Async } from "fadroma";
import { parseArgs } from "jsr:@std/cli/parse-args";
export interface Service {
  teardown: () => Promise<void>,
  command:  (...args: (string|number)[]) => Promise<unknown>,
}
export function Service (
  meta: Fn.Main.Meta,
  main: Fn.Returns<Async<Service>>,
  flags: Parameters<typeof parseArgs>[1]
) {
  Fn.Main(meta, async function trampoline ({ args, exit }) {
    let self: Service = null as unknown as Service;
    let code = 0; // process exit code, 0 is success
    const { _, help, version, ...config } = parseArgs(args, flags);
    if (help)    { console.log(flags);  exit(1); }
    if (version) { console.log('beta'); exit(0); }
    try {
      self = await main(Log(config as Parameters<typeof main>[0]));
      await self.command(..._);
    } catch (e) {
      console.error(e);
      code = 1;
    } finally {
      await self?.teardown();
      exit(code);
    }
  })
  return main;
}
export function Flags <T extends object> (custom?: {
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
