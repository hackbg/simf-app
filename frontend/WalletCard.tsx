import { useCallback, useEffect, useState } from 'react';
import { p2wpkh } from '@scure/btc-signer';
import { pubECDSA, randomPrivateKeyBytes } from '@scure/btc-signer/utils.js';
import { fetchAddressBalance, requestFaucet } from './api';

const STORAGE_KEY    = 'simf_wallet_privkey';
const LIQUID_TESTNET = { bech32: 'tex', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };
const ESPLORA        = 'https://blockstream.info/liquidtestnet';

function hex(b: Uint8Array) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function formatSats(sats: number) {
  if (sats === 0) return '0 L-BTC';
  return `${(sats / 1e8).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 })} L-BTC`;
}

function deriveAddress(privkeyHex: string): string {
  const privkey = Uint8Array.from(privkeyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const { address } = p2wpkh(pubECDSA(privkey), LIQUID_TESTNET);
  return address!;
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
