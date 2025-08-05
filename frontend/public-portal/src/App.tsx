import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home, Verify, Marketplace } from './pages';
import AccountSwitcher from './components/AccountSwitcher';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="app-header">
          <Link to="/" className="logo">
            <h1>Food Chain Verifier</h1>
          </Link>
          <AccountSwitcher />
        </header>

        <nav className="nav-links">
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/verify">Verify</Link></li>
            <li><Link to="/marketplace">Marketplace</Link></li>
          </ul>
        </nav>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/marketplace" element={<Marketplace />} />
          </Routes>
        </main>

        <footer>
          <p>&copy; 2024 Food Supply Chain Verification System. Powered by Blockchain Technology.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;