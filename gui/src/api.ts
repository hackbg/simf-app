export async function fetchAddressBalance(address: string): Promise<number> {
  const res = await fetch(
    `https://blockstream.info/liquidtestnet/api/address/${encodeURIComponent(address)}/utxo`
  );
  if (!res.ok) throw new Error(`Esplora balance failed: ${res.status}`);
  const utxos: { value: number }[] = await res.json();
  return utxos.reduce((s, u) => s + u.value, 0);
}

export interface StatusResponse {
  status: {
    tip: { height: number; hash: string };
  };
}

export interface SimplicityArg {
  type:  string;
  value: string | number;
}

export interface AttestationResponse {
  timestamp: string;
  asset:     string;
  price:     number;
  pubkey:    string;
  witness: {
    PRICE: SimplicityArg;
    SIG:   SimplicityArg;
  };
}

export interface VaultResponse {
  vault: {
    cmr:          string;
    p2tr:         string;
    authority:    string;
    balance_sats: number;
    source:       string;
  };
}

export interface FaucetResponse {
  txid?:         string;
  result?:       string;
  balance?:      number;
  balance_amp?:  number;
  balance_test?: number;
}

export interface VaultWitnessResponse {
  price:   number;
  witness: {
    SIG:   SimplicityArg;
    PRICE: SimplicityArg;
  };
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/');
  if (!res.ok) throw new Error(`GET / failed: ${res.status}`);
  return res.json();
}

export async function fetchAttestation(): Promise<AttestationResponse> {
  const res = await fetch('/api/attest');
  if (!res.ok) throw new Error(`GET /attest failed: ${res.status}`);
  return res.json();
}

export async function fetchVault(): Promise<VaultResponse> {
  const res = await fetch('/api/vault');
  if (!res.ok) throw new Error(`GET /vault failed: ${res.status}`);
  return res.json();
}

export async function requestFaucet(address: string): Promise<FaucetResponse> {
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

export interface EsploraTransaction {
  txid:   string;
  fee:    number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vout:   { value: number; scriptpubkey_address?: string }[];
}

export async function fetchVaultTxs(p2tr: string): Promise<EsploraTransaction[]> {
  const res = await fetch(
    `https://blockstream.info/liquidtestnet/api/address/${encodeURIComponent(p2tr)}/txs`
  );
  if (!res.ok) throw new Error(`Esplora txs failed: ${res.status}`);
  return res.json();
}

export interface SignResponse {
  signedHex: string;
  amount:    number;
  fee:       number;
  to:        string;
  price:     number;
}

export async function signVaultSpend(to: string, fee_sats?: number): Promise<SignResponse> {
  const res = await fetch('/api/vault/sign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to, ...(fee_sats !== undefined ? { fee_sats } : {}) }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Sign failed: ${res.status}`);
  }
  return res.json();
}

const ESPLORA = 'https://blockstream.info/liquidtestnet/api';

export async function broadcastRawTx(hex: string): Promise<string> {
  const res = await fetch(`${ESPLORA}/tx`, { method: 'POST', body: hex });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Broadcast failed: ${res.status}`);
  }
  return (await res.text()).trim();
}

export async function fetchVaultWitness(sighash: string): Promise<VaultWitnessResponse> {
  const res = await fetch('/api/vault', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sighash }),
  });
  if (!res.ok) throw new Error(`POST /vault failed: ${res.status}`);
  return res.json();
}
