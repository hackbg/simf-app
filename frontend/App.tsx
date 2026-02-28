//import { Err } from '../fadroma/library/Err.ts';
import Http from '../fadroma/library/Http.ts';
import { Esplora } from '../fadroma/platform/Bitcoin/Bitcoin.ts';
import type { Arg } from '../fadroma/platform/SimplicityHL/SimplicityHL.ts';
import { p2wpkh } from '@scure/btc-signer';
import { pubECDSA, randomPrivateKeyBytes } from '@scure/btc-signer/utils.js';
import React, { useEffect, useState, useCallback } from 'react';

const MAX_ENTRIES    = 50;
const PAGE_SIZE      = 10;
const FEED_POLL_MS   = 10000;
const STATUS_POLL_MS = 10000;
const STORAGE_KEY    = 'simf_wallet_privkey';
const LIQUID_TESTNET = { bech32: 'tex', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };
const ESPLORA        = 'https://blockstream.info/liquidtestnet';
const esplora        = Esplora({ url: ESPLORA });

export default function App () {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  return <div className="app">
    <nav className="nav">
      <div className="nav-logo">S</div>
      <span className="nav-title">SimplicityHL Oracle</span>
      <div className="nav-spacer" />
      <span className="nav-badge">liquidtestnet</span>
    </nav>
    <div className="content">
      <StatusPanel onWalletAddress={setWalletAddress} />
      <div className="two-col">
        <VaultPanel walletAddress={walletAddress} />
        <AttestationFeed />
      </div>
    </div>
  </div>;
}

function DetailDrawer({ entry, onClose }: { entry: AttestationResponse; onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sig = String(entry.witness.SIG.value);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>

        <div className="drawer-header">
          <span className="drawer-title">Attestation Details</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">

          <div className="field">
            <span className="field-label">Price</span>
            <span className="field-value price-large">
              {entry.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          </div>

          <div className="field">
            <span className="field-label">Asset</span>
            <span className="field-value">{entry.asset}</span>
          </div>

          <div className="field">
            <span className="field-label">Timestamp</span>
            <span className="field-value">{entry.timestamp}</span>
          </div>

          <div className="divider" />
          <span className="drawer-section-title">Witness</span>

          <div className="field">
            <span className="field-label">PRICE (u32 · cents)</span>
            <span className="field-value">{entry.witness.PRICE.value.toLocaleString()}</span>
          </div>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label">Signature (BIP-340 Schnorr)</span>
              <CopyButton value={sig} />
            </div>
            <span className="field-value mono">{sig}</span>
          </div>

          <div className="divider" />
          <span className="drawer-section-title">Oracle</span>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label">Public key</span>
              <CopyButton value={entry.pubkey} />
            </div>
            <span className="field-value mono">{entry.pubkey}</span>
          </div>

        </div>
      </div>
    </div>
  );
}

export function AttestationFeed() {
  const [entries,  setEntries]  = useState<AttestationResponse[]>([]);
  const [pubkey,   setPubkey]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<AttestationResponse | null>(null);
  const [page,     setPage]     = useState(0);

  const poll = useCallback(async () => {
    try {
      const a = await fetchAttestation();
      setPubkey(a.pubkey);
      setEntries(prev => [a, ...prev].slice(0, MAX_ENTRIES));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, FEED_POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const start      = safePage * PAGE_SIZE;
  const pageRows   = entries.slice(start, start + PAGE_SIZE);
  const from       = entries.length === 0 ? 0 : start + 1;
  const to         = Math.min(start + PAGE_SIZE, entries.length);

  return (
    <>
      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="dot" />
            Price Attestations
          </span>
        </div>

        {error && <div className="error-bar">{error}</div>}

        {pubkey && (
          <div className="field" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <span className="field-label">Oracle public key</span>
            <span className="field-value mono">{pubkey}</span>
          </div>
        )}

        {entries.length === 0 && !error
          ? <div className="empty">Waiting for attestations…</div>
          : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Asset</th>
                      <th>Price</th>
                      <th>Signature</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((e, localIdx) => {
                      const globalIdx = start + localIdx;
                      const prev      = entries[globalIdx + 1]?.price ?? e.price;
                      const delta     = e.price - prev;
                      const dir       = delta !== 0 ? (delta > 0 ? 'up' : 'down') : null;
                      const sig       = String(e.witness.SIG.value);
                      return (
                        <tr key={e.timestamp + globalIdx} className="clickable" onClick={() => setSelected(e)}>
                          <td className="mono">{new Date(e.timestamp).toLocaleTimeString()}</td>
                          <td>{e.asset}</td>
                          <td>
                            <span className={`price${dir === 'up' ? ' price-up' : dir === 'down' ? ' price-down' : ''}`}>
                              {e.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                            </span>
                            {dir && (
                              <span className={`delta delta-${dir}`}>
                                {dir === 'up' ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="mono trunc">{sig}</td>
                          <td className="row-arrow">›</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span className="pagination-info">{from}–{to} of {entries.length}</span>
                <div className="pagination-controls">
                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                  >← Prev</button>
                  <span className="page-indicator">{safePage + 1} / {totalPages}</span>
                  <button
                    className="page-btn"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                  >Next →</button>
                </div>
              </div>
            </>
          )}
      </div>

      {selected && <DetailDrawer entry={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export function StatusPanel({ onWalletAddress }: { onWalletAddress: (addr: string | null) => void }) {
  const fn                       = useCallback(fetchStatus, []);
  const { data, error, loading } = usePolling<StatusResponse>(fn, STATUS_POLL_MS);

  return (
    <div className="stat-grid">
      <div className="stat-card">
        <div className="stat-card-label">Block height</div>
        {loading && <div className="stat-card-value" style={{color:'var(--text-4)'}}>—</div>}
        {error   && <div className="stat-card-value" style={{color:'var(--danger)', fontSize:13}}>{error}</div>}
        {data    && <>
          <div className="stat-card-value">{data.status.tip.height.toLocaleString()}</div>
          <div className="stat-card-sub">{data.status.tip.hash}</div>
        </>}
      </div>
      <WalletCard onAddressChange={onWalletAddress} />
    </div>
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


function formatTime(ts?: number) {
  if (!ts) return 'Unconfirmed';
  return new Date(ts * 1000).toLocaleString();
}

// Sum the value of outputs that land on the vault address.
function received(tx: Esplora.Transaction, p2tr: string) {
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
  const [txs, setTxs] = useState<Esplora.Transaction[]>([]);
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

export function WalletCard({ onAddressChange }: { onAddressChange?: (addr: string | null) => void }) {
  const [address,    setAddress]    = useState<string | null>(null);
  const [balance,    setBalance]    = useState<number | null>(null);
  const [balanceErr, setBalanceErr] = useState<string | null>(null);
  const [funding,    setFunding]    = useState(false);
  const [faucetErr,  setFaucetErr]  = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const updateAddress = useCallback((addr: string | null) => {
    setAddress(addr);
    onAddressChange?.(addr);
  }, [onAddressChange]);

  // Load existing wallet from localStorage on mount.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) updateAddress(deriveAddress(stored));
  }, [updateAddress]);

  // Fetch balance whenever address or refreshKey changes.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setBalanceErr(null);
    fetchAddressBalance(address)
      .then(b  => { if (!cancelled) setBalance(b); })
      .catch(e => { if (!cancelled) setBalanceErr(e instanceof Error ? e.message : String(e)); });
    const id = setInterval(() => {
      fetchAddressBalance(address)
        .then(b => { if (!cancelled) setBalance(b); })
        .catch(() => {});
    }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address, refreshKey]);

  function handleGenerate() {
    const privkeyHex = hex(randomPrivateKeyBytes());
    localStorage.setItem(STORAGE_KEY, privkeyHex);
    setBalance(null);
    setBalanceErr(null);
    setFaucetErr(null);
    updateAddress(deriveAddress(privkeyHex));
  }

  async function handleFaucet() {
    if (!address) return;
    setFunding(true);
    setFaucetErr(null);
    try {
      await requestFaucet(address);
      refresh();
    } catch (e) {
      setFaucetErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="stat-card wallet-card">
      <div className="stat-card-label">Wallet</div>

      {!address ? (
        <button className="wallet-generate-btn" onClick={handleGenerate}>
          Generate wallet
        </button>
      ) : (
        <>
          <div className="wallet-balance">
            {balance === null ? '—' : formatSats(balance)}
          </div>
          {balanceErr && <div className="wallet-error">{balanceErr}</div>}
          <div className="wallet-address mono">{address}</div>
          <div className="wallet-actions">
            <button className="page-btn" onClick={handleFaucet} disabled={funding}>
              {funding ? 'Requesting…' : 'Fund via faucet'}
            </button>
            <a
              className="page-btn"
              href={`${ESPLORA}/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              Explorer ↗
            </a>
            <button className="page-btn" onClick={handleGenerate} title="Generate a new wallet (replaces existing)">
              New wallet
            </button>
          </div>
          {faucetErr && <div className="wallet-error">{faucetErr}</div>}
        </>
      )}
    </div>
  );
}

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
) {
  const [data,    setData]    = useState<T | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const result = await fn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [poll, intervalMs]);

  return { data, error, loading };
}

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

function hex (b: Uint8Array) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function formatSats (sats: number) {
  if (sats === 0) return '0 L-BTC';
  return `${(sats / 1e8).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 })} L-BTC`;
}

function deriveAddress (privkeyHex: string): string {
  const privkey = Uint8Array.from(privkeyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const { address } = p2wpkh(pubECDSA(privkey), LIQUID_TESTNET);
  return address!;
}

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
