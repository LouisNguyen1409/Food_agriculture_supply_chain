import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="container">
      <div className="hero-section">
        <h1>Blockchain-Powered Agricultural Supply Chain</h1>
        <p>
          Verify product authenticity and track shipments using our decentralized
          blockchain platform for complete transparency and trust.
        </p>
      </div>
      
      <div className="feature-cards">
        <div className="card">
          <h2>Create Product</h2>
          <p>Register new agricultural products on the blockchain with complete traceability.</p>
          <Link to="/create-product" className="btn-primary">Create Product</Link>
        </div>
        
        <div className="card">
          <h2>Create Shipment</h2>
          <p>Set up new shipments with tracking for your agricultural products.</p>
          <Link to="/create-shipment" className="btn-primary">Create Shipment</Link>
        </div>
        
        <div className="card">
          <h2>Verify Products</h2>
          <p>Verify the authenticity of products using their blockchain address.</p>
          <Link to="/verify" className="btn-primary">Verify Product</Link>
        </div>
        
        <div className="card">
          <h2>Track Shipments</h2>
          <p>Track the location and status of shipments in real-time.</p>
          <Link to="/track" className="btn-primary">Track Shipment</Link>
        </div>
      </div>
      
      <div className="info-section">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <p>Products and shipments are registered on the blockchain</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <p>Each transaction is verified and stored immutably</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <p>Public portal allows anyone to verify authenticity</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
