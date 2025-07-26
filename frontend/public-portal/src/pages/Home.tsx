import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingIndicator from '../components/LoadingIndicator';

const Home: React.FC = () => {
  return (
    <div className="home-container">
      <h2>Agricultural Supply Chain Verification</h2>
      <p className="intro-text">
        Welcome to the public verification portal for our agricultural supply chain.
        This platform uses blockchain technology to provide transparent, immutable records
        of agricultural products from farm to table.
      </p>

      <div className="features-container">
        <div className="feature-card">
          <h3>Product Verification</h3>
          <p>Verify product authenticity and view complete traceability reports.</p>
          <Link to="/verify" className="feature-button">Verify Product</Link>
        </div>

        <div className="feature-card">
          <h3>Track Shipments</h3>
          <p>Track the current location and status of product shipments.</p>
          <Link to="/track" className="feature-button">Track Shipment</Link>
        </div>
        
        <div className="feature-card">
          <h3>QR Code Scanner</h3>
          <p>Scan product QR codes to quickly access information.</p>
          <Link to="/scan" className="feature-button">Scan QR Code</Link>
        </div>
      </div>

      <div className="blockchain-info">
        <h3>Blockchain-Powered Verification</h3>
        <p>
          Our portal is powered by Ethereum blockchain technology, ensuring that all 
          product data is immutable, transparent, and verifiable. Connect your wallet 
          to interact with our smart contracts and verify product information directly 
          from the blockchain.
        </p>
      </div>
    </div>
  );
};

export default Home;
