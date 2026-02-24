export interface StatusResponse {
  status: {
    tip:    { height: number; hash: string };
    orders: unknown[];
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
    PRICE:   SimplicityArg;
    witness: SimplicityArg;
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
