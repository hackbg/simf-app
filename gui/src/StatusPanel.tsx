import { useCallback } from 'react';
import { fetchStatus, type StatusResponse } from './api';
import { usePolling } from './usePolling';

const POLL_MS = 10000;

export function StatusPanel() {
  const fn                       = useCallback(fetchStatus, []);
  const { data, error, loading } = usePolling<StatusResponse>(fn, POLL_MS);

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

      <div className="stat-card">
        <div className="stat-card-label">Open orders</div>
        <div className="stat-card-value">
          {data ? data.status.orders.length : '—'}
        </div>
      </div>
    </div>
  );
}
