#!/usr/bin/env -S deno run --allow-read=.,../fadroma --allow-import=cdn.skypack.dev:443,deno.land:443 --allow-env=FADROMA_SIMF_WASM,FADROMA_SIMF_WRAP,TERM_PROGRAM
import { Fn } from "fadroma";
export default Escrow;

Fn.Main(async function escrowCli (...args) {
  console.log(args);
  /* TODO: implement escrow CLI here */
});

/* TODO: non-exported CLI entrypoint. */
interface Escrow {
  /* TODO: define escrow API here */
}

function Escrow (): Escrow {
  /* TODO: implement escrow API here */
  return {}
}

namespace Escrow {

  /* https://github.com/BlockstreamResearch/SimplicityHL/blob/master/examples/escrow_with_delay.simf
   * https://docs.ivylang.org/bitcoin/language/ExampleContracts.html#escrowwithdelay */
  export function Program ({
    sender    = '0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    recipient = '0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
    escrow    = '0xf9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
    timeout   = '1000',
  } = {}) {

    return `fn main () {
      // Depending on provided witness:
      match witness::TRANSFER_OR_TIMEOUT {
        // Transfer to receiver:
        Left(maybe_sigs: [Option<Signature>; 3]) => {
          let threshold: u8 = 2;
          let [sig1, sig2, sig3]: [Option<Signature>; 3] = maybe_sigs;
          let counter1: u8 = checksig_add(0,        ${sender},    sig1);
          let counter2: u8 = checksig_add(counter1, ${recipient}, sig2);
          let counter3: u8 = checksig_add(counter2, ${escrow},    sig3);
          assert!(jet::eq_8(counter3, threshold));
        },
        // or return to sender:
        Right(sender_sig: Signature) => {
          checksig(${sender}, sender_sig);
          jet::check_lock_distance(${timeout});
        },
      }
    }
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
    }
    fn not (bit: bool) -> bool {
      <u1>::into(jet::complement_1(<bool>::into(bit)))
    }
    fn checksig (pk: Pubkey, sig: Signature) {
      jet::bip_0340_verify((pk, jet::sig_all_hash()), sig);
    }`

  }

  export function Witness (
    value = "Right(0xedb6865094260f8558728233aae017dd0969a2afe5f08c282e1ab659bf2462684c99a64a2a57246358a0d632671778d016e6df7381293dd5bb9f0999d38640d4)",
  ) {
    return `{
      "TRANSFER_OR_TIMEOUT": { "type": "Either<[Option<Signature>; 3], Signature>", "value": "${value}" }
    }`
  }

}
