import React, { useState } from 'react';
import { useContracts } from '../hooks/useContracts';

interface VerificationResult {
  isAuthentic: boolean;
  productInfo?: {
    productName: string;
    origin: string;
    productionDate: Date;
    currentLocation: string;
    farmerInfo: string;
    supplyChainSteps: number;
    qualityGrade: string;
    isOrganic: boolean;
  };
  consumerSummary?: {
    isAuthentic: boolean;
    productName: string;
    farmOrigin: string;
    harvestDate: Date;
    currentStatus: string;
    daysFromHarvest: number;
    totalSteps: number;
    qualityIndicator: string;
  };
  error?: string;
}

const Verify: React.FC = () => {
  const { contracts, loading, error } = useContracts();
  const [qrCode, setQrCode] = useState('');
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyProduct = async () => {
    if (!qrCode.trim()) {
      alert('Please enter a QR code');
      return;
    }

    if (!contracts || !contracts.publicVerification) {
      alert('Verification system not connected. Please check your connection.');
      return;
    }

    setIsVerifying(true);
    try {
      console.log('Verifying QR Code:', qrCode);

      // Step 1: Quick verify to check if QR code is valid
      const quickResult = await contracts.publicVerification.quickVerify(qrCode);
      const [isQuickValid, productName, origin] = quickResult;

      if (!isQuickValid) {
        setVerificationResult({
          isAuthentic: false,
          error: 'Invalid QR code or product not found in our system'
        });
        setIsVerifying(false);
        return;
      }

      // Step 2: Get detailed verification if quick verify passed
      const detailedResult = await contracts.publicVerification.verifyProduct.staticCall(qrCode);
      const [productInfo, isValid] = detailedResult;

      if (isValid) {
        // Step 3: Get consumer-friendly summary
        const consumerSummary = await contracts.publicVerification.getConsumerSummary(qrCode);

        setVerificationResult({
          isAuthentic: true,
          productInfo: {
            productName: productInfo.productName,
            origin: productInfo.origin,
            productionDate: new Date(Number(productInfo.productionDate) * 1000),
            currentLocation: productInfo.currentLocation,
            farmerInfo: productInfo.farmerInfo,
            supplyChainSteps: Number(productInfo.supplyChainSteps),
            qualityGrade: productInfo.qualityGrade,
            isOrganic: productInfo.isOrganic
          },
          consumerSummary: {
            isAuthentic: consumerSummary.isAuthentic,
            productName: consumerSummary.productName,
            farmOrigin: consumerSummary.farmOrigin,
            harvestDate: new Date(Number(consumerSummary.harvestDate) * 1000),
            currentStatus: consumerSummary.currentStatus,
            daysFromHarvest: Number(consumerSummary.daysFromHarvest),
            totalSteps: Number(consumerSummary.totalSteps),
            qualityIndicator: consumerSummary.qualityIndicator
          }
        });

        // Step 4: Record the verification (actual transaction)
        await contracts.publicVerification.verifyProduct(qrCode);

      } else {
        setVerificationResult({
          isAuthentic: false,
          error: 'Product verification failed - this product may not be authentic'
        });
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setVerificationResult({
        isAuthentic: false,
        error: err.message || 'Verification failed. Please try again.'
      });
    }
    setIsVerifying(false);
  };

  const resetVerification = () => {
    setVerificationResult(null);
    setQrCode('');
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="loader"></div>
          <p>Connecting to blockchain verification system...</p>
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
          <p>Please ensure:</p>
          <ul>
            <li>MetaMask is installed and connected</li>
            <li>You're connected to the correct network</li>
            <li>Verification contracts are deployed</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>🔍 Verify Product Authenticity</h1>
        <p>Enter a QR code to verify product authenticity on the blockchain</p>
      </div>

      {!verificationResult && (
        <div className="verification-form">
          <div className="form-group">
            <label htmlFor="qr-input">QR Code:</label>
            <div className="input-with-button">
              <input
                id="qr-input"
                type="text"
                className="form-control"
                placeholder="Enter QR code (e.g., QR-abc123)"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
              />
              <button
                onClick={verifyProduct}
                className="btn-primary"
                disabled={!qrCode.trim() || isVerifying}
              >
                {isVerifying ? '🔄 Verifying...' : 'Verify Product'}
              </button>
            </div>
          </div>

          <div className="help-text">
            <p>💡 QR codes are usually found on product packaging and start with "QR-"</p>
            <p>📱 You can also scan QR codes using your phone camera</p>
          </div>
        </div>
      )}

      {isVerifying && (
        <div className="verification-status">
          <div className="loading-container">
            <div className="loader"></div>
            <p>🔄 Verifying product on blockchain...</p>
            <small>This may take a few seconds...</small>
          </div>
        </div>
      )}

      {verificationResult && (
        <div className={`verification-result ${verificationResult.isAuthentic ? 'authentic' : 'not-authentic'}`}>
          {verificationResult.isAuthentic ? (
            <div className="authentic-result">
              <div className="result-header">
                <h2>✅ Product Verified Authentic!</h2>
                <p>This product has been verified on the blockchain</p>
              </div>

              <div className="product-details">
                <h3>📦 Product Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="label">Product:</span>
                    <span className="value">{verificationResult.productInfo?.productName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Origin:</span>
                    <span className="value">{verificationResult.productInfo?.origin}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Production Date:</span>
                    <span className="value">{verificationResult.productInfo?.productionDate.toLocaleDateString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Current Location:</span>
                    <span className="value">{verificationResult.productInfo?.currentLocation}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Farmer:</span>
                    <span className="value">{verificationResult.productInfo?.farmerInfo}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Quality Grade:</span>
                    <span className="value">{verificationResult.productInfo?.qualityGrade}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Organic:</span>
                    <span className="value">{verificationResult.productInfo?.isOrganic ? 'Yes ✓' : 'No'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Supply Chain Steps:</span>
                    <span className="value">{verificationResult.productInfo?.supplyChainSteps}</span>
                  </div>
                </div>

                {verificationResult.consumerSummary && (
                  <div className="consumer-summary">
                    <h3>📊 Consumer Summary</h3>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <span className="label">Farm Origin:</span>
                        <span className="value">{verificationResult.consumerSummary.farmOrigin}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Harvest Date:</span>
                        <span className="value">{verificationResult.consumerSummary.harvestDate.toLocaleDateString()}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Current Status:</span>
                        <span className="value">{verificationResult.consumerSummary.currentStatus}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Days from Harvest:</span>
                        <span className="value">{verificationResult.consumerSummary.daysFromHarvest} days</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Quality Indicator:</span>
                        <span className="value">{verificationResult.consumerSummary.qualityIndicator}</span>
                      </div>
                      <div className="summary-item">
                        <span className="label">Total Supply Chain Steps:</span>
                        <span className="value">{verificationResult.consumerSummary.totalSteps}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="actions">
                <button onClick={resetVerification} className="btn-primary">
                  🔍 Verify Another Product
                </button>
              </div>
            </div>
          ) : (
            <div className="invalid-result">
              <div className="result-header">
                <h2>❌ Verification Failed</h2>
                <p>This product could not be verified</p>
              </div>
              <div className="error-details">
                <p><strong>Error:</strong> {verificationResult.error}</p>
                <div className="warning-info">
                  <h4>⚠️ This might mean:</h4>
                  <ul>
                    <li>The QR code is invalid or damaged</li>
                    <li>The product is not registered in our system</li>
                    <li>The QR code is from a different verification system</li>
                    <li>The product may be counterfeit</li>
                  </ul>
                </div>
              </div>
              <div className="actions">
                <button onClick={resetVerification} className="btn-primary">
                  🔄 Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Verify;