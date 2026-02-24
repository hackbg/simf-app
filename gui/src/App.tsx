import { AttestationFeed } from './AttestationFeed';
import { StatusPanel }     from './StatusPanel';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-logo">S</div>
        <span className="nav-title">SimplicityHL Oracle</span>
        <div className="nav-spacer" />
        <span className="nav-badge">liquidtestnet</span>
      </nav>
      <div className="content">
        <StatusPanel />
        <AttestationFeed />
      </div>
    </div>
  );
}
