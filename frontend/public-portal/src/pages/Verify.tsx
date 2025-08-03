import React, { useState } from 'react';
import { useContracts } from '../hooks/useContracts';
import { ethers } from 'ethers';
import '../styles/Verify.css';

interface VerificationResult {
  isValid: boolean;
  productName: string;
  origin: string;
  batchId: number;
  currentOwner: string;
  farmer: string;
  productionDate: Date;
  lastLocation: string;
  provenanceRecords: number;
}

interface SupplyChainStep {
  stakeholder: string;
  stakeholderRole: string;
  action: string;
  location: string;
  timestamp: Date;
  price: string;
}

const Verify: React.FC = () => {
  const { contracts, loading, error, isConnected, connectContracts } = useContracts();
  const [qrCode, setQrCode] = useState<string>('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [supplyChainSteps, setSupplyChainSteps] = useState<SupplyChainStep[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [showSupplyChain, setShowSupplyChain] = useState(false);

  const verifyProduct = async () => {
    if (!contracts?.publicVerification || !qrCode.trim()) {
      alert('Please enter a QR code and ensure contracts are connected');
      return;
    }

    setVerifying(true);
    try {
      console.log('🔍 Verifying QR code:', qrCode);

      // Verify the product
      const result = await contracts.publicVerification.verifyProduct(qrCode);
      const [productInfo, isValid] = result;

      if (isValid) {
        const verificationData: VerificationResult = {
          isValid: true,
          productName: productInfo.productName,
          origin: productInfo.origin,
          batchId: Number(productInfo.batchId || 0),
          currentOwner: productInfo.currentLocation || 'Unknown',
          farmer: productInfo.farmerInfo || 'Unknown',
          productionDate: new Date(Number(productInfo.productionDate || 0) * 1000),
          lastLocation: productInfo.currentLocation || productInfo.origin,
          provenanceRecords: Number(productInfo.supplyChainSteps || 0)
        };

        setVerificationResult(verificationData);

        // Load supply chain history if batchId is available
        if (verificationData.batchId > 0) {
          await loadSupplyChainHistory(verificationData.batchId);
        }

        console.log('✅ Product verified successfully');
      } else {
        setVerificationResult({
          isValid: false,
          productName: 'Unknown',
          origin: 'Unknown',
          batchId: 0,
          currentOwner: 'Unknown',
          farmer: 'Unknown',
          productionDate: new Date(),
          lastLocation: 'Unknown',
          provenanceRecords: 0
        });
        setSupplyChainSteps([]);
      }

    } catch (err: any) {
      console.error('❌ Verification error:', err);
      alert('Verification failed: ' + (err.message || 'Unknown error'));
      setVerificationResult(null);
      setSupplyChainSteps([]);
    }
    setVerifying(false);
  };

  const loadSupplyChainHistory = async (batchId: number) => {
    if (!contracts?.transactionRegistry) {
      console.log('⚠️ Transaction registry not available - supply chain history disabled');
      return;
    }

    try {
      console.log('📋 Loading supply chain history for batch:', batchId);

      const steps = await contracts.transactionRegistry.getSupplyChainHistory(batchId);

      const processedSteps: SupplyChainStep[] = steps.map((step: any) => ({
        stakeholder: step.stakeholder,
        stakeholderRole: step.stakeholderRole,
        action: step.action,
        location: step.location || 'Location not specified',
        timestamp: new Date(Number(step.timestamp) * 1000),
        price: ethers.formatEther(step.price)
      }));

      setSupplyChainSteps(processedSteps);
      console.log('✅ Supply chain history loaded:', processedSteps.length, 'steps');

    } catch (err: any) {
      console.error('❌ Error loading supply chain history:', err);
      setSupplyChainSteps([]);
    }
  };

  const getActionIcon = (action: string): string => {
    if (action.includes('SPOT')) return '🌱';
    if (action.includes('PROCESSOR_SALE')) return '🏭';
    if (action.includes('DISTRIBUTOR_SALE')) return '🚛';
    if (action.includes('RETAILER_SALE')) return '🏪';
    if (action.includes('CONSUMER_PURCHASE')) return '🛒';
    return '📦';
  };

  if (!isConnected) {
    return (
      <div className="page-container">
        <div className="connection-required">
          <h3>🦊 Wallet Connection Required</h3>
          <p>Please connect your wallet to verify products.</p>
          <button onClick={connectContracts} className="btn-primary">
            🔗 Connect Contracts
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loader"></div>
          <p>Connecting to blockchain...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="error-container">
          <h3>⚠️ Connection Error</h3>
          <p>{error}</p>
          <button onClick={connectContracts} className="btn-primary">
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="verify-container">
        <div className="verify-header">
          <h2>🔍 Verify Product Authenticity</h2>
          <p>Scan or enter the QR code to verify your product</p>
        </div>

        <div className="verification-form">
          <div className="input-group">
            <label htmlFor="qrCode">QR Code:</label>
            <input
              id="qrCode"
              type="text"
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="Enter QR code (e.g., QR-abc123...)"
              className="qr-input"
            />
          </div>

          <button
            onClick={verifyProduct}
            disabled={verifying || !qrCode.trim()}
            className="verify-btn"
          >
            {verifying ? '🔍 Verifying...' : '✅ Verify Product'}
          </button>
        </div>

        {verificationResult && (
          <div className={`verification-result ${verificationResult.isValid ? 'valid' : 'invalid'}`}>
            {verificationResult.isValid ? (
              <div className="result-content">
                <div className="result-header">
                  <h3>✅ Product Verified!</h3>
                  <span className="verified-badge">AUTHENTIC</span>
                </div>

                <div className="product-details">
                  <div className="detail-row">
                    <span className="label">📦 Product:</span>
                    <span className="value">{verificationResult.productName}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">🌍 Origin:</span>
                    <span className="value">{verificationResult.origin}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">👨‍🌾 Farmer:</span>
                    <span className="value">
                      {verificationResult.farmer.length > 10
                        ? `${verificationResult.farmer.slice(0,6)}...${verificationResult.farmer.slice(-4)}`
                        : verificationResult.farmer
                      }
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">📅 Production Date:</span>
                    <span className="value">{verificationResult.productionDate.toLocaleDateString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">📍 Current Location:</span>
                    <span className="value">{verificationResult.lastLocation}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">🆔 Batch ID:</span>
                    <span className="value">#{verificationResult.batchId}</span>
                  </div>
                </div>

                {/* Supply Chain Section */}
                {supplyChainSteps.length > 0 && (
                  <div className="supply-chain-section">
                    <div className="section-header">
                      <h4>📋 Supply Chain Journey</h4>
                      <button
                        onClick={() => setShowSupplyChain(!showSupplyChain)}
                        className="toggle-btn"
                      >
                        {showSupplyChain ? '🔼 Hide' : '🔽 Show'} ({supplyChainSteps.length} steps)
                      </button>
                    </div>

                    {showSupplyChain && (
                      <div className="supply-chain-steps">
                        {supplyChainSteps.map((step, index) => (
                          <div key={index} className="chain-step">
                            <div className="step-icon">
                              {getActionIcon(step.action)}
                            </div>
                            <div className="step-content">
                              <div className="step-header">
                                <h5>{step.stakeholderRole}</h5>
                                <span className="step-time">
                                  {step.timestamp.toLocaleDateString()}
                                </span>
                              </div>
                              <div className="step-details">
                                <p className="action">{step.action}</p>
                                <div className="step-info">
                                  <span className="location">📍 {step.location}</span>
                                  <span className="price">💰 {step.price} ETH</span>
                                  <span className="address">
                                    👤 {step.stakeholder.slice(0,6)}...{step.stakeholder.slice(-4)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div className="result-content">
                <div className="result-header">
                  <h3>❌ Product Not Verified</h3>
                  <span className="invalid-badge">INVALID</span>
                </div>
                <p>This QR code is not valid or the product cannot be verified.</p>
                <p>Please check the QR code and try again.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Verify;