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
      
      // Get provider
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Connect directly to the Product contract
      const productABI = [
        "function verifyProduct() external view returns (bool)",
        "function name() external view returns (string memory)",
        "function description() external view returns (string memory)",
        "function farmer() external view returns (address)",
        "function createdAt() external view returns (uint32)"
      ];

      const product = new ethers.Contract(
        productAddress,
        productABI,
        provider
      );
      
      try {
        // Call the verifyProduct function on the Product contract
        const isAuthentic = await product.verifyProduct();
        
        // Get basic product details
        const name = await product.name();
        const description = await product.description();
        const farmer = await product.farmer();
        const createdAt = await product.createdAt();
        
        setVerificationResult({
          isAuthentic,
          details: description,
          name,
          producer: farmer,
          timestamp: new Date(Number(createdAt) * 1000)
        });
      } catch (error) {
        console.error("Error verifying product:", error);
        setVerificationResult({
          isAuthentic: false,
          details: "Could not verify this product. Either the address is incorrect, or it's not a valid product contract."
        });
      }
    } catch (error) {
      console.error("Error verifying product:", error);
      setError('Could not connect to the product contract. Please check the address and try again.');
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
            Status: {verificationResult.isAuthentic ? 'Authentic' : 'Not Verified'}
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
