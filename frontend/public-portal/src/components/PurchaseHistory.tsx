import React, { useState, useEffect } from 'react';
import { useContracts } from '../hooks/useContracts';
import { ethers } from 'ethers';

interface Purchase {
  purchaseId: string;
  batchId: string;
  retailer: string;
  price: string;
  quantity: string;
  purchaseTime: Date;
  isPickedUp: boolean;
  ownershipClaimed: boolean;
  deliveryAddress: string;
}

const PurchaseHistory: React.FC = () => {
  const { contracts, signer } = useContracts();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contracts && signer) {
      loadPurchaseHistory();
    }
  }, [contracts, signer]);

  const loadPurchaseHistory = async () => {
    if (!contracts?.productBatch || !signer) return;

    setLoading(true);
    try {
      const userAddress = await signer.getAddress();
      const purchaseIds = await contracts.productBatch.getConsumerHistory(userAddress);

      const purchaseDetails: Purchase[] = [];
      for (let id of purchaseIds) {
        try {
          const details = await contracts.productBatch.getConsumerPurchase(id);
          purchaseDetails.push({
            purchaseId: id.toString(),
            batchId: details[0].toString(),
            retailer: details[2],
            price: details[3].toString(),
            quantity: details[4].toString(),
            purchaseTime: new Date(Number(details[5]) * 1000),
            isPickedUp: details[6],
            ownershipClaimed: details[7],
            deliveryAddress: details[8]
          });
        } catch (err) {
          console.error(`Error loading purchase ${id}:`, err);
        }
      }

      setPurchases(purchaseDetails);
    } catch (err) {
      console.error('Error loading purchase history:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading your purchase history...</p>
      </div>
    );
  }

  return (
    <div className="purchase-history-container">
      <div className="history-header">
        <h3>📋 Your Purchase History</h3>
        <button onClick={loadPurchaseHistory} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {purchases.length === 0 ? (
        <div className="no-purchases">
          <p>No purchases found. Make your first purchase!</p>
        </div>
      ) : (
        <div className="purchases-list">
          {purchases.map((purchase) => (
            <div key={purchase.purchaseId} className="purchase-item">
              <div className="purchase-header">
                <h4>Purchase #{purchase.purchaseId}</h4>
                <span className="ownership-badge">
                  ✅ You Own This Product
                </span>
              </div>

              <div className="purchase-details">
                <div className="detail-row">
                  <span className="label">Product ID:</span>
                  <span className="value">{purchase.batchId}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Quantity:</span>
                  <span className="value">{purchase.quantity} units</span>
                </div>
                <div className="detail-row">
                  <span className="label">Price Paid:</span>
                  <span className="value">{ethers.formatEther(purchase.price)} ETH</span>
                </div>
                <div className="detail-row">
                  <span className="label">Purchase Date:</span>
                  <span className="value">{purchase.purchaseTime.toLocaleDateString()}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Delivery Address:</span>
                  <span className="value">{purchase.deliveryAddress}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PurchaseHistory;