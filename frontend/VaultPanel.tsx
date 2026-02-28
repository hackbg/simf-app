import { useCallback, useEffect, useState } from 'react';
import {
  fetchVault,
  fetchVaultTxs,
  fetchVaultWitness,
  requestFaucet,
  computeVaultSighash,
  buildVaultTx,
  broadcastRawTx,
  type EsploraTransaction,
  type VaultResponse,
  type VaultWitnessResponse,
} from './api';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button className="copy-btn" onClick={copy} title="Copy to clipboard">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function StepCard({
  n,
  actor,
  title,
  desc,
  children,
}: {
  n: number;
  actor: 'client' | 'oracle';
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="step-card">
      <div className="step-header">
        <span className="step-number">{n}</span>
        <span className="step-title">{title}</span>
        <span className={`step-actor step-actor-${actor}`}>{actor}</span>
      </div>
      <p className="step-desc">{desc}</p>
      <div className="step-body">{children}</div>
    </div>
  );
}

function IO({
  label,
  value,
  live,
  placeholder,
}: {
  label: 'input' | 'output';
  value?: string;
  live?: boolean;
  placeholder: string;
}) {
  return (
    <div className="step-io">
      <span className="step-io-label">{label}</span>
      {value ? (
        <span className={`step-io-value${live ? ' step-io-live' : ''}`}>
          {value}
        </span>
      ) : (
        <span className="step-io-value step-io-placeholder">{placeholder}</span>
      )}
    </div>
  );
}


function formatSats(sats: number) {
  if (sats === 0) return '0 L-BTC';
  return `${(sats / 1e8).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 })} L-BTC`;
}

function formatTime(ts?: number) {
  if (!ts) return 'Unconfirmed';
  return new Date(ts * 1000).toLocaleString();
}

// Sum the value of outputs that land on the vault address.
function received(tx: EsploraTransaction, p2tr: string) {
  return tx.vout
    .filter((o) => o.scriptpubkey_address === p2tr)
    .reduce((s, o) => s + o.value, 0);
}

export function VaultPanel({ walletAddress }: { walletAddress?: string | null }) {
  // Vault info + balance
  const [vault, setVault] = useState<VaultResponse['vault'] | null>(null);
  const [vaultErr, setVaultErr] = useState<string | null>(null);
  const [vaultLoad, setVaultLoad] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setVaultLoad(true);
    fetchVault()
      .then((d) => {
        if (!cancelled) {
          setVault(d.vault);
          setVaultErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setVaultErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setVaultLoad(false);
      });
    const id = setInterval(() => {
      fetchVault()
        .then((d) => {
          if (!cancelled) {
            setVault(d.vault);
            setVaultErr(null);
          }
        })
        .catch(() => {});
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  // Tabs
  const [tab, setTab] = useState<'overview' | 'transactions' | 'program'>('overview');

  // Transactions
  const [txs, setTxs] = useState<EsploraTransaction[]>([]);
  const [txsLoad, setTxsLoad] = useState(false);
  const [txsErr, setTxsErr] = useState<string | null>(null);

  useEffect(() => {
    if (!vault || tab !== 'transactions') return;
    let cancelled = false;
    setTxsLoad(true);
    fetchVaultTxs(vault.p2tr)
      .then((list) => {
        if (!cancelled) {
          setTxs(list);
          setTxsErr(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setTxsErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setTxsLoad(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vault, tab, refreshKey]);

  // Faucet
  const [funding, setFunding] = useState(false);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);

  async function handleFaucet(address: string) {
    setFunding(true);
    setFaucetErr(null);
    try {
      await requestFaucet(address);
      refresh();
      setTab('transactions');
    } catch (e) {
      setFaucetErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFunding(false);
    }
  }

  // Spend flow — three discrete steps
  const [sighash,    setSighash]    = useState<string | null>(null);
  const [computing,  setComputing]  = useState(false);
  const [computeErr, setComputeErr] = useState<string | null>(null);
  const [attesting,  setAttesting]  = useState(false);
  const [attestErr,  setAttestErr]  = useState<string | null>(null);
  const [witnessRes, setWitnessRes] = useState<VaultWitnessResponse | null>(null);
  const [witCopied,  setWitCopied]  = useState(false);

  // Step 1 (client) — compute real sighash via POST /vault/sighash.
  async function handleComputeSighash() {
    if (!walletAddress) return;
    setComputing(true);
    setComputeErr(null);
    setSighash(null);
    setWitnessRes(null);
    setAttestErr(null);
    setBroadcastRes(null);
    setBroadcastErr(null);
    try {
      const { sighash: s } = await computeVaultSighash(walletAddress);
      setSighash(s);
    } catch (e) {
      setComputeErr(e instanceof Error ? e.message : String(e));
    } finally {
      setComputing(false);
    }
  }

  // Step 2 (oracle) — send sighash to oracle for signing.
  async function handleRequestSignature() {
    if (!sighash) return;
    setAttesting(true);
    setAttestErr(null);
    setWitnessRes(null);
    try {
      setWitnessRes(await fetchVaultWitness(sighash));
    } catch (e) {
      setAttestErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAttesting(false);
    }
  }

  function handleCopyWitness() {
    if (!witnessRes) return;
    navigator.clipboard
      .writeText(JSON.stringify(witnessRes.witness, null, 2))
      .then(() => {
        setWitCopied(true);
        setTimeout(() => setWitCopied(false), 1500);
      });
  }

  // Step 3 (client) — build tx with oracle witness, then broadcast.
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastErr, setBroadcastErr] = useState<string | null>(null);
  const [broadcastRes, setBroadcastRes] = useState<{ txid: string } | null>(null);

  async function handleBroadcast() {
    if (!walletAddress || !witnessRes) return;
    setBroadcasting(true);
    setBroadcastErr(null);
    setBroadcastRes(null);
    try {
      const { signedHex } = await buildVaultTx(walletAddress, witnessRes.witness);
      const txid = await broadcastRawTx(signedHex);
      setBroadcastRes({ txid });
      refresh();
      setTab('transactions');
    } catch (e) {
      setBroadcastErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBroadcasting(false);
    }
  }

  const step1Input  = walletAddress ? `{ to: "${walletAddress}" }` : undefined;
  const step2Input  = sighash ? `{ sighash: "${sighash}" }` : undefined;
  const step2Output = witnessRes
    ? `{ SIG: { type: "Signature", value: "${String(witnessRes.witness.SIG.value).slice(0, 16)}…" },\n  PRICE: { type: "u32", value: ${witnessRes.witness.PRICE.value} } }`
    : undefined;
  const step3Input  = witnessRes
    ? `{ to: "${walletAddress ?? 'tex1…'}", witness: { SIG, PRICE } }`
    : undefined;

  return (
    <div className="section">
      {/* Header - always visible */}
      <div className="section-header">
        <span className="section-title">Vault Program</span>
        {vault && (
          <span
            className={`stat-card-value vault-balance-inline${vault.balance_sats > 0 ? ' vault-balance-funded' : ''}`}
          >
            {formatSats(vault.balance_sats)}
          </span>
        )}
      </div>

      {vaultLoad && <div className="empty">Compiling vault…</div>}
      {vaultErr && <div className="error-bar">{vaultErr}</div>}

      {vault && (
        <>
          {/* Tab bar */}
          <div className="tab-bar">
            <button
              className={`tab-btn${tab === 'overview' ? ' tab-active' : ''}`}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              className={`tab-btn${tab === 'transactions' ? ' tab-active' : ''}`}
              onClick={() => setTab('transactions')}
            >
              Transactions{' '}
              {txs.length > 0 && (
                <span className="tab-count">{txs.length}</span>
              )}
            </button>
            <button
              className={`tab-btn${tab === 'program' ? ' tab-active' : ''}`}
              onClick={() => setTab('program')}
            >
              Program
            </button>
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="vault-body">
              {/* P2TR */}
              <div className="field">
                <span className="field-label">P2TR Address</span>
                <div className="field-label-row" style={{ marginTop: 4 }}>
                  <span className="field-value mono" style={{ flex: 1 }}>
                    {vault.p2tr}
                  </span>
                  <CopyButton value={vault.p2tr} />
                </div>
                <div className="faucet-row">
                  <button
                    className="page-btn"
                    onClick={() => handleFaucet(vault.p2tr)}
                    disabled={funding}
                  >
                    {funding ? 'Requesting…' : 'Request from faucet'}
                  </button>
                </div>
                {faucetErr && (
                  <div className="error-bar" style={{ marginTop: 6 }}>
                    {faucetErr}
                  </div>
                )}
              </div>

              {/* CMR */}
              <div className="field">
                <span className="field-label">
                  CMR (Commitment Merkle Root)
                </span>
                <span className="field-value mono">{vault.cmr}</span>
              </div>

              {/* Spend flow */}
              <div className="field">
                <span className="field-label">Spend flow</span>
                <p className="step-flow-intro">
                  The client drives the entire flow; the oracle's only role is
                  to sign the sighash and attest to the current BTC/USD price
                  (step 2). Steps 1 and 3 never touch the oracle key.
                </p>
              </div>

              <StepCard
                n={1}
                actor="client"
                title="POST /vault/sighash"
                desc="Fetch the vault's largest UTXO and compute the 32-byte spend sighash via spendSighash(). This is the exact value the oracle must sign to authorise this withdrawal. Nothing is broadcast."
              >
                <IO
                  label="input"
                  value={step1Input}
                  placeholder='{ to: "tex1…" }'
                  live={!!walletAddress}
                />
                <IO
                  label="output"
                  placeholder='"a1b2c3…" — 32-byte spend sighash'
                  value={sighash ? `"${sighash}"` : undefined}
                  live={!!sighash}
                />
                {computeErr && <div className="error-bar">{computeErr}</div>}
                <button
                  className="page-btn"
                  style={{ alignSelf: 'flex-start', marginTop: 2 }}
                  onClick={handleComputeSighash}
                  disabled={!walletAddress || computing}
                >
                  {computing ? 'Computing…' : sighash ? 'Recompute →' : 'Compute sighash →'}
                </button>
              </StepCard>

              <StepCard
                n={2}
                actor="oracle"
                title="POST /vault"
                desc="Send the sighash to the oracle. The oracle checks the live BTC/USD price, signs the sighash with its Schnorr key (authorising this spend at this price), and returns the witness args {SIG, PRICE}."
              >
                <IO
                  label="input"
                  value={step2Input}
                  placeholder='{ sighash: "a1b2c3…" }'
                  live={!!sighash}
                />
                <IO
                  label="output"
                  value={step2Output}
                  placeholder="{ SIG: { … }, PRICE: { … } }"
                  live={!!witnessRes}
                />
                {attestErr && <div className="error-bar">{attestErr}</div>}
                <button
                  className="page-btn"
                  style={{ alignSelf: 'flex-start', marginTop: 2 }}
                  onClick={handleRequestSignature}
                  disabled={!sighash || attesting}
                >
                  {attesting ? 'Signing…' : 'Request signature →'}
                </button>
              </StepCard>

              <StepCard
                n={3}
                actor="client"
                title="POST /vault/tx → Esplora POST /tx"
                desc="Submit the oracle witness to assemble the fully-signed transaction via spendTx(), then broadcast it directly to Liquid via Esplora. The oracle key is not involved."
              >
                <IO
                  label="input"
                  value={step3Input}
                  placeholder='{ to: "tex1…", witness: { SIG, PRICE } }'
                  live={!!witnessRes}
                />
                <IO
                  label="output"
                  value={broadcastRes ? `txid: "${broadcastRes.txid}"` : undefined}
                  placeholder="txid — transaction confirmed on Liquid"
                  live={!!broadcastRes}
                />
                <div className="broadcast-row">
                  <span className="field-label">Recipient</span>
                  {walletAddress
                    ? <span className="broadcast-to mono">{walletAddress}</span>
                    : <span className="broadcast-to-missing">Generate a wallet first</span>}
                </div>
                {broadcastErr && <div className="error-bar">{broadcastErr}</div>}
                <div className="step-btns">
                  <button
                    className="page-btn"
                    onClick={handleCopyWitness}
                    disabled={!witnessRes}
                  >
                    {witCopied ? '✓ Copied' : 'Copy witness args'}
                  </button>
                  <button
                    className="page-btn page-btn-primary"
                    onClick={handleBroadcast}
                    disabled={!witnessRes || !walletAddress || broadcasting}
                  >
                    {broadcasting ? 'Broadcasting…' : 'Broadcast tx →'}
                  </button>
                </div>
              </StepCard>
            </div>
          )}

          {/* ── Transactions ── */}
          {tab === 'transactions' && (
            <div>
              {txsLoad && <div className="empty">Loading transactions…</div>}
              {txsErr && <div className="error-bar">{txsErr}</div>}
              {!txsLoad && !txsErr && txs.length === 0 && (
                <div className="empty">
                  No transactions yet - fund this vault to get started.
                </div>
              )}
              {txs.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Received</th>
                        <th>Status</th>
                        <th>TxID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.map((tx) => {
                        const rec = received(tx, vault.p2tr);
                        return (
                          <tr key={tx.txid}>
                            <td className="mono">
                              {formatTime(tx.status.block_time)}
                            </td>
                            <td
                              className={rec > 0 ? 'price price-up' : 'price'}
                            >
                              {rec > 0 ? `+${formatSats(rec)}` : '—'}
                            </td>
                            <td>
                              <span
                                className={
                                  tx.status.confirmed
                                    ? 'badge-confirmed'
                                    : 'badge-pending'
                                }
                              >
                                {tx.status.confirmed ? 'Confirmed' : 'Pending'}
                              </span>
                            </td>
                            <td className="mono">
                              <a
                                href={`https://blockstream.info/liquidtestnet/tx/${tx.txid}`}
                                target="_blank"
                                rel="noreferrer"
                                className="tx-link"
                              >
                                {tx.txid.slice(0, 10)}…{tx.txid.slice(-6)} ↗
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {/* ── Program ── */}
          {tab === 'program' && (
            <div className="vault-body">
              <div className="field">
                <span className="field-label">SimplicityHL source</span>
                <pre className="program-source">{vault.source}</pre>
              </div>
              <div className="field">
                <span className="field-label">CMR (Commitment Merkle Root)</span>
                <span className="field-value mono">{vault.cmr}</span>
              </div>
              <div className="field">
                <span className="field-label">Authority (oracle pubkey)</span>
                <span className="field-value mono">{vault.authority}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
