import React, { useState } from 'react';
import { ethers } from 'ethers';

const Track: React.FC = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipmentInfo, setShipmentInfo] = useState<{
    status: string;
    currentLocation: string;
    lastUpdated: Date;
    carrier: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async () => {
    if (!trackingNumber) {
      setError('Please enter a tracking number');
      return;
    }
    
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install it to use this feature.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      
      // Get provider from MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Get the ShipmentFactory contract - using ethers.js v6 syntax
      const shipmentFactoryAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788'; // Replace with your deployed contract address
      const shipmentFactoryABI = [
        "function trackShipment(string memory trackingNumber) view returns (string memory status, string memory currentLocation, uint256 lastUpdated, string memory carrier)"
      ];

      const shipmentFactory = new ethers.Contract(
        shipmentFactoryAddress,
        shipmentFactoryABI,
        provider
      );
      
      // Call the trackShipment function
      const result = await shipmentFactory.trackShipment(trackingNumber);
      
      setShipmentInfo({
        status: result[0],
        currentLocation: result[1],
        lastUpdated: new Date(Number(result[2]) * 1000),
        carrier: result[3]
      });
      
    } catch (err) {
      console.error("Error tracking shipment:", err);
      setError(`Error tracking shipment: ${err instanceof Error ? err.message : String(err)}`);
      setShipmentInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Track Shipment</h1>
        <p>Enter a tracking number to get real-time information about your shipment.</p>
      </div>
      
      <div className="track-form">
        <div className="form-group">
          <label htmlFor="trackingNumber">Tracking Number</label>
          <input
            type="text"
            id="trackingNumber"
            name="trackingNumber"
            placeholder="e.g., APPLE123456"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="form-control"
          />
        </div>
        
        <button
          onClick={handleTrack}
          disabled={isLoading || !trackingNumber}
          className="btn-primary"
        >
          {isLoading ? 'Tracking...' : 'Track Shipment'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {shipmentInfo && (
        <div className="tracking-result">
          <h2>Shipment Information</h2>
          
          <div className="shipment-status">
            <div className="status-badge">
              {shipmentInfo.status}
            </div>
          </div>
          
          <div className="shipment-details">
            <div className="detail-item">
              <span className="detail-label">Current Location:</span>
              <span className="detail-value">{shipmentInfo.currentLocation}</span>
            </div>
            
            <div className="detail-item">
              <span className="detail-label">Carrier:</span>
              <span className="detail-value">{shipmentInfo.carrier}</span>
            </div>
            
            <div className="detail-item">
              <span className="detail-label">Last Updated:</span>
              <span className="detail-value">{shipmentInfo.lastUpdated.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Track;
