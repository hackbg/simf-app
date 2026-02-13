#!/usr/bin/env -S deno run -P
import { Fn, SimplicityHL } from "fadroma";
const wasm = await SimplicityHL.Wasm();

export default Escrow;

interface Escrow {
  deploy  (_: Escrow.Deploy):  Promise<unknown>
  consume (_: Escrow.Consume): Promise<unknown>
}

function Escrow (): Escrow {
  return {
    async deploy  ({ price, amount, timeout }) {
      console.log({deploy:{price, amount, timeout}});
      const program = Escrow.Program({ sender, recipient, condition, timeout });
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

  /* https://github.com/BlockstreamResearch/SimplicityHL/blob/master/examples/condition_with_delay.simf
   * https://docs.ivylang.org/bitcoin/language/ExampleContracts.html#conditionwithdelay */
  export function Program ({
    sender    = null,
    recipient = null,
    condition = null,
    timeout   = '1000',
  } = {}) {
    if (!sender)    throw new Error('provide sender')
    if (!recipient) throw new Error('provide recipient')
    if (!condition) throw new Error('provide condition')
    if (!timeout)   throw new Error('provide timeout')
    return `fn main () {
      // Depending on provided witness:
      match witness::TRANSFER_OR_TIMEOUT {
        // Transfer to receiver:
        Left(maybe_sigs: [Option<Signature>; 3]) => {
          let threshold: u8 = 2;
          let [sig1, sig2, sig3]: [Option<Signature>; 3] = maybe_sigs;
          let counter1: u8 = checksig_add(0,        ${sender},    sig1);
          let counter2: u8 = checksig_add(counter1, ${recipient}, sig2);
          let counter3: u8 = checksig_add(counter2, ${condition}, sig3);
          assert!(jet::eq_8(counter3, threshold));
        },
        // or return to sender:
        Right(sender_sig: Signature) => {
          checksig(${sender}, sender_sig);
          jet::check_lock_distance(${timeout});
        },
      }
    }
    fn not (bit: bool) -> bool { <u1>::into(jet::complement_1(<bool>::into(bit))) }
    fn checksig (pk: Pubkey, sig: Signature) { jet::bip_0340_verify((pk, jet::sig_all_hash()), sig); }
    fn checksig_add (counter: u8, pk: Pubkey, maybe_sig: Option<Signature>) -> u8 {
      match maybe_sig {
        Some(sig: Signature) => {
          checksig(pk, sig);
          let (carry, new_counter): (bool, u8) = jet::increment_8(counter);
          assert!(not(carry));
          new_counter
        }
        None => counter,
      }
    }`
  }

  export function Witness (
    value = "Right(0xedb6865094260f8558728233aae017dd0969a2afe5f08c282e1ab659bf2462684c99a64a2a57246358a0d632671778d016e6df7381293dd5bb9f0999d38640d4)",
  ) {
    return `{ "TRANSFER_OR_TIMEOUT": { "type": "Either<[Option<Signature>; 3], Signature>", "value": "${value}" } }`
  }

  export function Cli ({ args, exit }) {
    switch (args[0]) {
      case 'deploy':  return Escrow().deploy({ price: args[1], amount: args[2] })
      case 'consume': return Escrow().consume({ price: args[1], amount: args[2] })
      default: console.error('Invalid invocation.'); exit(1)
    }
  }

}

Fn.Main(import.meta, Escrow.Cli);
