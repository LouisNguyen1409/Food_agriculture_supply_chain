import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages.css';

const Home: React.FC = () => {
  return (
    <div className="page-container">
      <div className="hero-section">
        <h1>🌱 Food Supply Chain Verifier</h1>
        <p className="hero-subtitle">
          Verify authentic products and purchase with confidence using blockchain technology
        </p>

        <div className="action-cards">
          <Link to="/verify" className="action-card">
            <div className="card-icon">🔍</div>
            <h3>Verify Products</h3>
            <p>Scan QR codes to verify product authenticity and view complete supply chain history</p>
          </Link>

          <Link to="/marketplace" className="action-card">
            <div className="card-icon">🛒</div>
            <h3>Shop Products</h3>
            <p>Purchase verified products directly from farmers and processors with immediate ownership</p>
          </Link>

          <Link to="/history" className="action-card">
            <div className="card-icon">📋</div>
            <h3>Purchase History</h3>
            <p>View your purchase history and manage owned products</p>
          </Link>
        </div>
      </div>

      <div className="features-section">
        <h2>🌟 Why Choose Our Platform?</h2>
        <div className="features-grid">
          <div className="feature-item">
            <h4>🔐 Blockchain Verified</h4>
            <p>Every product is verified on the blockchain for authentic supply chain tracking</p>
          </div>
          <div className="feature-item">
            <h4>⚡ Instant Ownership</h4>
            <p>Purchase products with immediate ownership transfer - no waiting, no pickup codes</p>
          </div>
          <div className="feature-item">
            <h4>📱 QR Code Verification</h4>
            <p>Simple QR code scanning provides complete product history and authenticity</p>
          </div>
          <div className="feature-item">
            <h4>🌍 Full Traceability</h4>
            <p>Track products from farm to your table with complete transparency</p>
          </div>
        </div>
      </div>

      <div className="how-it-works">
        <h2>🔄 How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h4>Scan QR Code</h4>
            <p>Use your phone or enter the QR code to verify any product</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h4>View History</h4>
            <p>See complete supply chain journey from farm to store</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h4>Purchase Safely</h4>
            <p>Buy verified products with instant ownership transfer</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;