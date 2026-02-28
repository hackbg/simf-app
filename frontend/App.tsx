import { useState } from 'react';
import { AttestationFeed } from './AttestationFeed';
import { StatusPanel }     from './StatusPanel';
import { VaultPanel }      from './VaultPanel';
import './App.css';

export default function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  return (
    <div className="app">
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
    </div>
  );
}
