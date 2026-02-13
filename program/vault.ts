#!/usr/bin/env -S deno run -P
import { SimplicityHL } from "fadroma";
const wasm = await SimplicityHL.Wasm();

export default Vault;

/** Compile the P2TR address of a vault program.
  * Withdrawals from the vault happen at a price
  * signed by the vault's authority. */
function Vault (options: Vault.Options) {
  return wasm.compile(Vault.Program(options));
}

/** Vault innards. */
namespace Vault {

  /** Parameters of vault program. */
  export type Options = { authority?: string };

  /** Generate SimplicityHL source code for vault of given authority. */
  export function Program ({
    authority = missing('authority')
  }: Options = {}) {
    return `fn main () {
      // Assert that witness is signed by authority:
      assert!(jet::bip_0340_verify(("${authority}", jet::sig_all_hash()), witness));
      // Assert that output equals input * attested price
      assert!(jet::eq_32(
        jet::input_amount(0),
        jet::mul_u32(jet::output_amount(0), witness::PRICE),
      ));
    }`
  }

  /** Required option helper. */
  const missing = (name: unknown) => { throw new Error(`Vault: provide ${name}`) }
}
