import React, { useState } from 'react';
import { trackShipment, ShipmentTracking } from '../utils/contractHelpers';
import LoadingIndicator from '../components/LoadingIndicator';

const Track: React.FC = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shipmentData, setShipmentData] = useState<ShipmentTracking | null>(null);
  
  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!trackingNumber) {
      setError('Please enter a tracking number');
      return;
    }
    
    setLoading(true);
    setError('');
    setShipmentData(null);
    
    try {
      const result = await trackShipment(trackingNumber);
      setShipmentData(result);
    } catch (error) {
      console.error('Error tracking shipment:', error);
      setError('Failed to track shipment. Please check the tracking number and try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="page-container">
      <h2>Track Shipment</h2>
      <p>Enter a shipment tracking number to track its current status and location.</p>
      
      <form onSubmit={handleTrack} className="tracking-form">
        <div className="input-group">
          <label htmlFor="trackingNumber">Tracking Number:</label>
          <input
            type="text"
            id="trackingNumber"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Enter tracking number..."
            required
          />
        </div>
        
        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? 'Tracking...' : 'Track Shipment'}
        </button>
      </form>
      
      {loading && <LoadingIndicator message="Retrieving shipment data from blockchain..." />}
      
      {error && <div className="error-message">{error}</div>}
      
      {shipmentData && (
        <div className="shipment-result">
          <h3>Shipment Information</h3>
          
          <div className="status-indicator">
            <span className={`status-badge ${shipmentData.status.toLowerCase().replace(/\s+/g, '-')}`}>
              {shipmentData.status}
            </span>
          </div>
          
          <div className="detail-grid">
            <div className="detail-item">
              <span className="label">Current Location:</span>
              <span>{shipmentData.currentLocation}</span>
            </div>
            
            <div className="detail-item">
              <span className="label">Carrier:</span>
              <span>{shipmentData.carrier}</span>
            </div>
            
            <div className="detail-item">
              <span className="label">Last Updated:</span>
              <span>{shipmentData.lastUpdated.toLocaleString()}</span>
            </div>
          </div>
          
          <div className="shipment-map">
            <div className="map-placeholder">
              <p>Interactive map will be displayed here in the future.</p>
              <p>Current Location: {shipmentData.currentLocation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Track;
