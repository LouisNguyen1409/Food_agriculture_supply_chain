import React, { useState } from 'react';
import { verifyProduct, getProductTraceability, TraceabilityReport } from '../utils/contractHelpers';
import LoadingIndicator from '../components/LoadingIndicator';

const Verify: React.FC = () => {
  const [productAddress, setProductAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationResult, setVerificationResult] = useState<{isAuthentic: boolean, details: string} | null>(null);
  const [traceabilityData, setTraceabilityData] = useState<TraceabilityReport | null>(null);
  
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productAddress) {
      setError('Please enter a product address');
      return;
    }
    
    setLoading(true);
    setError('');
    setVerificationResult(null);
    setTraceabilityData(null);
    
    try {
      // Verify product authenticity
      const result = await verifyProduct(productAddress);
      setVerificationResult(result);
      
      // If authentic, get full traceability report
      if (result.isAuthentic) {
        const traceability = await getProductTraceability(productAddress);
        setTraceabilityData(traceability);
      }
    } catch (error) {
      console.error('Error verifying product:', error);
      setError('Failed to verify product. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="page-container">
      <h2>Product Verification</h2>
      <p>Enter a product address to verify its authenticity and view its journey.</p>
      
      <form onSubmit={handleVerify} className="verification-form">
        <div className="input-group">
          <label htmlFor="productAddress">Product Address (Ethereum address):</label>
          <input
            type="text"
            id="productAddress"
            value={productAddress}
            onChange={(e) => setProductAddress(e.target.value)}
            placeholder="0x..."
            required
          />
        </div>
        
        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? 'Verifying...' : 'Verify Product'}
        </button>
      </form>
      
      {loading && <LoadingIndicator message="Retrieving blockchain data..." />}
      
      {error && <div className="error-message">{error}</div>}
      
      {verificationResult && (
        <div className={`verification-result ${verificationResult.isAuthentic ? 'authentic' : 'not-authentic'}`}>
          <h3>{verificationResult.isAuthentic ? '✓ Product Verified' : '✗ Product Not Verified'}</h3>
          <p>{verificationResult.details}</p>
        </div>
      )}
      
      {traceabilityData && (
        <div className="traceability-report">
          <h3>Product Traceability Report</h3>
          
          <div className="report-section">
            <h4>Product Information</h4>
            <div className="detail-item">
              <span className="label">Name:</span>
              <span>{traceabilityData.productName}</span>
            </div>
            <div className="detail-item">
              <span className="label">Origin Farm:</span>
              <span>{traceabilityData.originFarm}</span>
            </div>
            <div className="detail-item">
              <span className="label">Harvest Date:</span>
              <span>{traceabilityData.harvestDate.toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="report-section">
            <h4>Processing Steps</h4>
            {traceabilityData.processingSteps.length > 0 ? (
              <ul className="steps-list">
                {traceabilityData.processingSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            ) : (
              <p>No processing steps recorded</p>
            )}
          </div>
          
          <div className="report-section">
            <h4>Certifications</h4>
            {traceabilityData.certifications.length > 0 ? (
              <div className="certifications-list">
                {traceabilityData.certifications.map((cert, index) => (
                  <span key={index} className="certification-badge">{cert}</span>
                ))}
              </div>
            ) : (
              <p>No certifications recorded</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Verify;
