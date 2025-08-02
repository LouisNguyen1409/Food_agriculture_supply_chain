import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>Agricultural Supply Chain - Admin Portal</h1>
        <p>
          Welcome to the blockchain-powered agricultural supply chain management system.
          This portal provides role-based access to manage stakeholders, track products, 
          and oversee the entire supply chain process.
        </p>
      </div>
      
      <div className="features-container">
        <div className="feature-card">
          <h3>Stakeholder Management</h3>
          <p>Register and manage stakeholders across the supply chain including farmers, processors, distributors, shippers, and retailers.</p>
          <Link to="/stakeholders" className="feature-button">Manage Stakeholders</Link>
        </div>
        
        <div className="feature-card">
          <h3>Role-Based Dashboards</h3>
          <p>Access specialized dashboards based on your role in the supply chain.</p>
          <div className="role-links">
            <Link to="/farmer" className="role-link">Farmer Dashboard</Link>
            <Link to="/processor" className="role-link">Processor Dashboard</Link>
            <Link to="/distributor" className="role-link">Distributor Dashboard</Link>
            <Link to="/shipper" className="role-link">Shipper Dashboard</Link>
          </div>
        </div>
        
        <div className="feature-card">
          <h3>Registration</h3>
          <p>Register as a new stakeholder to participate in the supply chain network.</p>
          <Link to="/registration" className="feature-button">Register Now</Link>
        </div>
      </div>
      
      <div className="blockchain-info">
        <h3>System Overview</h3>
        <div className="info-grid">
          <div className="info-item">
            <h4>Smart Contracts</h4>
            <p>Deployed on Hardhat local network for development and testing</p>
          </div>
          <div className="info-item">
            <h4>Role-Based Access</h4>
            <p>Secure access control based on stakeholder roles and permissions</p>
          </div>
          <div className="info-item">
            <h4>Supply Chain Tracking</h4>
            <p>Complete traceability from farm to consumer with blockchain verification</p>
          </div>
        </div>
      </div>
      
      <div className="getting-started">
        <h3>Getting Started</h3>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Connect Wallet</h4>
              <p>Connect your MetaMask wallet to access the portal</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Register as Stakeholder</h4>
              <p>Submit a registration request for your desired role</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Get Approved</h4>
              <p>Wait for admin approval of your registration</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Access Dashboard</h4>
              <p>Use your role-specific dashboard to manage supply chain activities</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
