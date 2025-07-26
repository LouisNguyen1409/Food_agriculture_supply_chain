import React, { useState } from 'react';
import { ethers } from 'ethers';

// We need to create contractHelpers.ts again since it was deleted
const Verify: React.FC = () => {
  const [productAddress, setProductAddress] = useState('');
  const [verificationResult, setVerificationResult] = useState<{
    isAuthentic?: boolean;
    details?: string;
    name?: string;
    producer?: string;
    timestamp?: Date;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async () => {
    if (!productAddress) {
      setError('Please enter a product address');
      return;
    }
    
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install it to use this feature.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      
      // Get provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Get the Product Factory contract
      const productFactoryAddress = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318'; // Replace with your deployed contract address
      const productFactoryABI = [
        "function verifyProduct(address productAddress) view returns (bool isAuthentic, string memory details)",
        "function getProductDetails(address productAddress) view returns (string memory name, string memory producer, uint256 timestamp)"
      ];

      const productFactory = new ethers.Contract(
        productFactoryAddress,
        productFactoryABI,
        provider
      );
      
      // Call the verifyProduct function
      const [isAuthentic, details] = await productFactory.verifyProduct(productAddress);
      
      // Get additional product details
      try {
        const [name, producer, timestamp] = await productFactory.getProductDetails(productAddress);
        
        setVerificationResult({
          isAuthentic,
          details,
          name,
          producer,
          timestamp: new Date(Number(timestamp) * 1000)
        });
      } catch (detailsError) {
        // If getting details fails, still show the verification result
        setVerificationResult({
          isAuthentic,
          details
        });
        console.error("Error getting product details:", detailsError);
      }
      
    } catch (err) {
      console.error("Error verifying product:", err);
      setError(`Error verifying product: ${err instanceof Error ? err.message : String(err)}`);
      setVerificationResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Verify Product Authenticity</h1>
        <p>Enter a product address to verify its authenticity on the blockchain.</p>
      </div>
      
      <div className="verify-form">
        <div className="form-group">
          <label htmlFor="productAddress">Product Address</label>
          <input
            type="text"
            id="productAddress"
            name="productAddress"
            placeholder="0x..."
            value={productAddress}
            onChange={(e) => setProductAddress(e.target.value)}
            className="form-control"
          />
        </div>
        
        <button
          onClick={handleVerify}
          disabled={isLoading || !productAddress}
          className="btn-primary"
        >
          {isLoading ? 'Verifying...' : 'Verify Product'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {verificationResult && (
        <div className={`verification-result ${verificationResult.isAuthentic ? 'authentic' : 'not-authentic'}`}>
          <h2>Verification Result</h2>
          <p className="verification-status">
            Status: {verificationResult.isAuthentic ? 'Authentic ✅' : 'Not Verified ❌'}
          </p>
          
          {verificationResult.name && (
            <div className="product-details">
              <h3>Product Details</h3>
              <p><strong>Name:</strong> {verificationResult.name}</p>
              <p><strong>Producer:</strong> {verificationResult.producer}</p>
              <p><strong>Registered:</strong> {verificationResult.timestamp?.toLocaleString()}</p>
            </div>
          )}
          
          <div className="details-box">
            <h3>Additional Information</h3>
            <p>{verificationResult.details}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Verify;
