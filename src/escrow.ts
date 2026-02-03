#!/usr/bin/env -S deno run --allow-read=.,../fadroma --allow-import=cdn.skypack.dev:443,deno.land:443 --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM
import { Fn } from "fadroma";
import Program, { Witness } from './escrow.simf.ts';
export default Escrow;
Fn.Main(import.meta, function escrowCli ({ args, exit }) {
  switch (args[0]) {
    case 'deploy':  return Escrow().deploy({ price: args[1], amount: args[2] })
    case 'consume': return Escrow().consume({ price: args[1], amount: args[2] })
    default: console.error('Invalid invocation.'); exit(1)
  }
});
interface Escrow {
  deploy  (_: Escrow.Deploy):  Promise<unknown>
  consume (_: Escrow.Consume): Promise<unknown>
}
function Escrow (): Escrow {
  return {
    async deploy  ({ price, amount, timeout }) {
      console.log({deploy:{price, amount, timeout}});
      const program = Program({ sender, recipient, condition, timeout });
      console.log(program);
    },
    async consume ({ price, amount }) {
      console.log({consume:{price, amount}})
    },
  }
}
// deno-lint-ignore no-namespace
namespace Escrow {
  export interface Deploy {
    price:   unknown
    amount:  unknown
    timeout: unknown
  }
  export interface Consume {
    price:  unknown
    amount: unknown
  }
}
