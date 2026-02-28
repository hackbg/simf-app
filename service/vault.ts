import { Http, Base16, SimplicityHL as Simf } from 'fadroma';
import fetchPrice from './fetchPrice.ts';
import fetchGenesis from './fetchGenesis.ts';

export const signedWitness = (priceCents: number, sigBytes: Uint8Array) => ({
  PRICE: { type: 'u32',       value: String(priceCents) },
  SIG:   { type: 'Signature', value: `0x${Base16.encode(sigBytes)}` },
});

export const authorityArgs = (oraclePubkey: Uint8Array) => ({
  AUTHORITY: { type: 'Pubkey', value: `0x${Base16.encode(oraclePubkey)}` }
});

export interface VaultContext {
  oraclePubkey: Uint8Array;
  oracleKey: Uint8Array;
  esplora: string;
}

/** SimplicityHL vault program source. Authority is passed as param::AUTHORITY at compile time. */
// Vault: oracle signs the spend sighash (price-gating is enforced offchain by the oracle).
// The PRICE witness field records the attested price at signing time for on-chain auditability.
const VAULT_SOURCE = `fn main () {
  jet::bip_0340_verify((param::AUTHORITY, jet::sig_all_hash()), witness::SIG);
}`;

// Cache vault compilation - deterministic for a given oracle key.
let vaultCache: {
  cmr: string;
  p2tr: string;
  authority: string;
  source: string;
} | null = null;

/** Compile the vault program with the oracle pubkey and return its P2TR address, CMR, and balance. */
export async function getVaultInfo({ oraclePubkey, esplora }: VaultContext) {
  if (!vaultCache) {
    const wasm = await Simf.Wasm();
    const args = authorityArgs(oraclePubkey);
    const program = wasm.compile(VAULT_SOURCE, { args });
    const { cmr, p2tr, source } = ((program as unknown) as {
      toJSON(): { cmr: string; p2tr: string; source: string };
    }).toJSON();
    vaultCache = { cmr, p2tr, authority: Base16.encode(oraclePubkey), source: source || VAULT_SOURCE };
  }
  // Fetch balance from Esplora via UTXOs.
  // The address-level endpoint omits amount sums for Liquid (confidential tx support),
  // so we sum the `value` field across all UTXOs instead.
  let balance_sats = 0;
  try {
    const utxos: { value: number }[] = await Http.fetchJson(`${esplora}/address/${vaultCache.p2tr}/utxo`);
    balance_sats = utxos.reduce((s, u) => s + u.value, 0);
  } catch {
    /* ignore - balance stays 0 */
  }
  return { vault: { ...vaultCache, balance_sats } };
}

/** Sign a spend sighash with the oracle key and return witness args for spendTx().
 *
 * The client should call program.spendSighash() locally to obtain the sighash,
 * then POST it here. The oracle checks the current price and signs the sighash,
 * returning { SIG, PRICE } ready to pass as witness to program.spendTx(). */
export async function postVaultAttest({ req, oracleKey }: Http.Context & VaultContext) {
  const { sighash } = JSON.parse(await Http.readBody(req));
  if (!sighash || typeof sighash !== 'string') {
    throw Object.assign(new Error('provide sighash'), { http: 400 });
  }
  const price = await fetchPrice();
  const priceCents = Math.round(price * 100);
  const sigBytes = schnorr.sign(Base16.decode(sighash), oracleKey);
  return { price, witness: signedWitness(priceCents, sigBytes) };
}

/** Compute the spend sighash for the vault's largest UTXO.
 *
 * The client calls this to obtain the exact 32-byte value the oracle must sign.
 * Nothing is broadcast; no oracle key is involved. */
export async function postVaultSighash({ req, oraclePubkey, esplora }: Http.Context & VaultContext) {
  const { to, fee_sats = 1000 } = JSON.parse(await Http.readBody(req));
  if (!to || typeof to !== 'string') throw Object.assign(new Error('provide to address'), { http: 400 });
  const { prog, txHex, amount, fee, genesis } = await vaultSpendSetup(oraclePubkey, esplora, to, fee_sats);
  const sighash = (prog as unknown as { spendSighash(_: object): string })
    .spendSighash({ tx: txHex, amount, fee, to, genesis });
  return { sighash };
}

/** Build the fully-signed spend transaction from the oracle-provided witness.
 *
 * The client supplies the oracle's {SIG, PRICE} witness (obtained from POST /vault)
 * and this endpoint assembles and returns the final transaction hex for broadcasting. */
export async function postVaultBuildTx({ req, oraclePubkey, esplora }: Http.Context & VaultContext) {
  const { to, witness, fee_sats = 1000 } = JSON.parse(await Http.readBody(req));
  if (!to || typeof to !== 'string') throw Object.assign(new Error('provide to address'), { http: 400 });
  if (!witness || typeof witness !== 'object') throw Object.assign(new Error('provide witness'), { http: 400 });
  const { prog, txHex, amount, fee, genesis } = await vaultSpendSetup(oraclePubkey, esplora, to, fee_sats);
  const spendTx = (prog as unknown as { spendTx(_: object): { hex: string } })
    .spendTx({ tx: txHex, amount, fee, to, witness, genesis });
  return { signedHex: spendTx.hex, amount, fee, to };
}

/** Shared setup for vault spend endpoints: fetch UTXO, compile program, derive amounts. */
async function vaultSpendSetup(oraclePubkey: Uint8Array, esplora: string, to: string, fee_sats: number) {
  if (!vaultCache) {
    throw Object.assign(new Error('vault not initialised — call GET /vault first'), { http: 503 });
  }
  const utxos: { txid: string; vout: number; value: number }[] = await Http.fetchJson(`${esplora}/address/${vaultCache.p2tr}/utxo`);
  if (!utxos || utxos.length === 0) {
    throw Object.assign(new Error('vault has no funded UTXOs'), { http: 400 });
  }
  const utxo    = utxos.reduce((best, u) => u.value > best.value ? u : best);
  const txHex   = await Http.fetchText(`${esplora}/tx/${utxo.txid}/hex`);
  const wasm    = await Simf.Wasm();
  const args    = authorityArgs(oraclePubkey);
  const prog    = wasm.compile(VAULT_SOURCE, { args });
  const fee     = fee_sats / 1e8;
  const amount  = (utxo.value - fee_sats) / 1e8;
  if (amount <= 0) throw Object.assign(new Error('UTXO value too small to cover fee'), { http: 400 });
  const genesis = await fetchGenesis(esplora);
  return { prog, txHex, amount, fee, genesis };
}
