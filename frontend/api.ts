//import { Err } from '../fadroma/library/Err.ts';
import Http from '../fadroma/library/Http.ts';
import { Esplora } from '../fadroma/platform/Bitcoin/Bitcoin.ts';
import type { Arg } from '../fadroma/platform/SimplicityHL/SimplicityHL.ts';

const ESPLORA = 'https://blockstream.info/liquidtestnet/api';
export const esplora = Esplora({ url: ESPLORA });

// FIXME filter by asset
export const fetchAddressBalance = (address: string): Promise<number> =>
  esplora.getAddressUtxos(address).then(utxos=>{
    return utxos.reduce((s: number, u: { value: number }) => s + u.value, 0)
  });

export const fetchVaultTxs = (p2tr: string): Promise<Esplora.Transaction[]> =>
  esplora.getAddressTxs(p2tr);

export const broadcastRawTx = (hex: string): Promise<string> =>
  esplora.postTx(hex) as Promise<string>;

export type StatusResponse = Awaited<ReturnType<typeof fetchStatus>>;

export const fetchStatus = (): Promise<{ status: { tip: { height: number; hash: string }; }; }> =>
  Http.fetchJson('/api/');

export type AttestationResponse  = Awaited<ReturnType<typeof fetchAttestation>>;

export const fetchAttestation = (): Promise<{
  timestamp: string;
  asset:     string;
  price:     number;
  pubkey:    string;
  witness:   VaultWitness;
}> =>
  Http.fetchJson('/api/attest');

export type VaultResponse = Awaited<ReturnType<typeof fetchVault>>;

export const fetchVault = (): Promise<{ vault: Vault; }> =>
  Http.fetchJson('/api/vault');

export type FaucetResponse = Awaited<ReturnType<typeof requestFaucet>>;

export const requestFaucet = async (address: string): Promise<{
  txid?:         string;
  result?:       string;
  balance?:      number;
  balance_amp?:  number;
  balance_test?: number;
}> => {
  const res = await fetch('/api/faucet', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ address }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Faucet request failed: ${res.status}`);
  }
  return res.json();
}

export type BuildTxResponse = Awaited<ReturnType<typeof buildVaultTx>>;

export const buildVaultTx = async (to: string, witness: VaultWitness, fee_sats?: number): Promise<{
  signedHex: string;
  amount:    number;
  fee:       number;
  to:        string;
}> => {
  const res = await fetch('/api/vault/tx', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to, witness, ...(fee_sats !== undefined ? { fee_sats } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Build tx failed: ${res.status}`);
  }
  return res.json();
};

export type VaultWitnessResponse = Awaited<ReturnType<typeof fetchVaultWitness>>;

export const fetchVaultWitness = async (sighash: string): Promise<{
  price: number; witness: VaultWitness;
}> => {
  const res = await fetch('/api/vault', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sighash }),
  });
  if (!res.ok) throw new Error(`POST /vault failed: ${res.status}`);
  return res.json();
}

export type VaultWitness = {
  SIG:   Arg;
  PRICE: Arg;
};

export type Vault = {
  cmr:          string;
  p2tr:         string;
  authority:    string;
  balance_sats: number;
  source:       string;
}

export const computeVaultSighash = async (to: string, fee_sats?: number): Promise<{
  sighash: string
}> => {
  const res = await fetch('/api/vault/sighash', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to, ...(fee_sats !== undefined ? { fee_sats } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Sighash computation failed: ${res.status}`);
  }
  return res.json();
}
