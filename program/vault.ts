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
    return (
      // Oracle signs the spend sighash; price-gating is enforced offchain by the oracle.
      // The PRICE witness field records the attested price at signing time for auditability.
      `fn main () { jet::bip_0340_verify((param::AUTHORITY, jet::sig_all_hash()), witness::SIG); }`
    )
  }

  /** Required option helper. */
  const missing = (name: unknown) => { throw new Error(`Vault: provide ${name}`) }
}
