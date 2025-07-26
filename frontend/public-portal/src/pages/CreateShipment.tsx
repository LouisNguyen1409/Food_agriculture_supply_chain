import React, { useState } from 'react';
import { ethers } from 'ethers';

const CreateShipment: React.FC = () => {
  const [formData, setFormData] = useState({
    trackingNumber: '',
    location: '',
    carrier: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [createdTrackingNumber, setCreatedTrackingNumber] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install it to use this feature.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setSuccessMessage('');
      
      // Get provider and signer - using ethers.js v6 syntax
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Get the ShipmentFactory contract
      const shipmentFactoryAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
      const shipmentFactoryABI = [
        "function createShipment(string memory trackingNumber, string memory location, string memory carrier) returns (bool)"
      ];

      // Connect to the contract with signer - using ethers.js v6 syntax
      const shipmentFactory = new ethers.Contract(
        shipmentFactoryAddress,
        shipmentFactoryABI,
        signer
      );
      
      // Call the createShipment function
      const tx = await shipmentFactory.createShipment(
        formData.trackingNumber,
        formData.location,
        formData.carrier
      );
      
      // Wait for transaction to be mined - using ethers.js v6 syntax
      setSuccessMessage('Transaction submitted! Waiting for confirmation...');
      const receipt = await tx.wait();
      
      setCreatedTrackingNumber(formData.trackingNumber);
      setSuccessMessage('Shipment created successfully!');
      
      // Reset form
      setFormData({
        trackingNumber: '',
        location: '',
        carrier: ''
      });
      
    } catch (err) {
      console.error("Error creating shipment:", err);
      setError(`Error creating shipment: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate a random tracking number
  const generateTrackingNumber = () => {
    const prefix = 'SHIP';
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const newTrackingNumber = `${prefix}${randomNum}`;
    
    setFormData(prev => ({
      ...prev,
      trackingNumber: newTrackingNumber
    }));
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Create Shipment</h1>
        <p>Register a new shipment on the blockchain for tracking.</p>
      </div>
      
      <div className="create-shipment-form">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="trackingNumber">Tracking Number</label>
            <div className="input-with-button">
              <input
                type="text"
                id="trackingNumber"
                name="trackingNumber"
                value={formData.trackingNumber}
                onChange={handleChange}
                required
                className="form-control"
                placeholder="e.g., SHIP123456"
              />
              <button 
                type="button" 
                onClick={generateTrackingNumber}
                className="btn-secondary"
              >
                Generate
              </button>
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="location">Initial Location</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              required
              className="form-control"
              placeholder="e.g., Sydney Warehouse"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="carrier">Carrier</label>
            <input
              type="text"
              id="carrier"
              name="carrier"
              value={formData.carrier}
              onChange={handleChange}
              required
              className="form-control"
              placeholder="e.g., Global Express"
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? 'Creating...' : 'Create Shipment'}
          </button>
        </form>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="success-message">
          <p>{successMessage}</p>
          {createdTrackingNumber && (
            <div className="created-shipment-info">
              <p><strong>Tracking Number:</strong></p>
              <div className="tracking-container">
                <code>{createdTrackingNumber}</code>
                <button 
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(createdTrackingNumber);
                    alert('Tracking number copied to clipboard!');
                  }}
                >
                  Copy
                </button>
              </div>
              <p className="tip-text">Save this tracking number to monitor your shipment later.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateShipment;
