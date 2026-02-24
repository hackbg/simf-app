import { useEffect, useState, useCallback } from 'react';
import { fetchAttestation, type AttestationResponse } from './api';

const MAX_ENTRIES = 50;
const PAGE_SIZE   = 10;
const POLL_MS     = 3000;

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

function DetailDrawer({ entry, onClose }: { entry: AttestationResponse; onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sig = String(entry.witness.witness.value);

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
    const id = setInterval(poll, POLL_MS);
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
          {pubkey && (
            <span className="section-meta mono">
              oracle {pubkey}
            </span>
          )}
        </div>

        {error && <div className="error-bar">{error}</div>}

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
                      const sig       = String(e.witness.witness.value);
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
