import React, { useState, useEffect } from 'react';
import { useContracts } from '../hooks/useContracts';
import { ethers } from 'ethers';

interface Product {
  batchId: number;
  name: string;
  description: string;
  price: string;
  quantity: number;
  origin: string;
  retailer: string;
  available: boolean;
}

const ProductMarketplace: React.FC = () => {
  const { contracts, signer, loading, error } = useContracts();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatus, setPurchaseStatus] = useState<{[key: number]: string}>({});
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (contracts && contracts.productBatch) {
      loadAvailableProducts();
    }
  }, [contracts]);

  const loadAvailableProducts = async () => {
    setLoadingProducts(true);
    try {
      if (!contracts?.productBatch) {
        console.log('ProductBatch contract not available');
        setProducts([]);
        return;
      }

      console.log('🔍 Loading products from blockchain...');
      const availableProducts: Product[] = [];

      // Try loading batches 1-20 (adjust range as needed)
      for (let batchId = 1; batchId <= 20; batchId++) {
        try {
          const batchExists = await contracts.productBatch.batchExists(batchId);
          if (!batchExists) continue;

          const batchInfo = await contracts.productBatch.getBatchInfo(batchId);
          const [
            farmer,
            retailer,
            productName,
            origin,
            productionDate,
            quantity,
            price,
            status,
            certification,
            isActive
          ] = batchInfo;

          if (isActive && quantity > 0) {
            availableProducts.push({
              batchId,
              name: productName,
              description: `Premium quality ${productName} from ${origin}`,
              price: ethers.formatEther(price),
              quantity: Number(quantity),
              origin: origin,
              retailer: retailer === ethers.ZeroAddress ? "Direct from Farm" : `Retailer: ${retailer.slice(0,6)}...`,
              available: true
            });
          }
        } catch (error: any) {
            // Batch doesn't exist or error loading, continue
            if (error?.message?.includes("Batch does not exist")) {
              break; // No more batches
            }
        }
      }

      console.log(`✅ Loaded ${availableProducts.length} available products`);
      setProducts(availableProducts);

    } catch (err) {
      console.error('❌ Error loading products:', err);
      setProducts([]);
    }
    setLoadingProducts(false);
  };

  const purchaseProduct = async (product: Product) => {
    if (!contracts || !contracts.productBatch || !signer) {
      alert('Contracts not loaded or wallet not connected');
      return;
    }

    setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'purchasing' }));

    try {
      const deliveryAddress = prompt("Enter your delivery address:");
      if (!deliveryAddress) {
        setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'cancelled' }));
        return;
      }

      const quantity = 1;
      const priceInWei = ethers.parseEther((parseFloat(product.price) * quantity).toString());
      const retailerAddress = await signer.getAddress();

      const tx = await contracts.productBatch.purchaseWithImmediateOwnership(
        product.batchId,
        retailerAddress,
        quantity,
        deliveryAddress,
        { value: priceInWei }
      );

      await tx.wait();
      setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'success' }));

      alert(`🎉 Purchase Successful! You now own this product.`);

      setProducts(prev => prev.map(p =>
        p.batchId === product.batchId
          ? { ...p, quantity: p.quantity - quantity, available: p.quantity > quantity }
          : p
      ));

    } catch (err: any) {
      console.error('Purchase error:', err);
      setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'error' }));
      alert('Purchase failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Connecting to blockchain...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>⚠️ Connection Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="marketplace-container">
      <div className="marketplace-header">
        <h2>🛒 Available Products</h2>
        <button onClick={loadAvailableProducts} className="refresh-btn">
          🔄 Refresh
        </button>
      </div>

      {loadingProducts ? (
        <div className="loading-container">
          <p>Loading products...</p>
        </div>
      ) : (
        <div className="products-grid">
          {products.map(product => (
            <div key={product.batchId} className="product-card">
              <div className="product-header">
                <h3>{product.name}</h3>
                <span className="badge verified">✅ Verified</span>
              </div>

              <div className="product-details">
                <p className="description">{product.description}</p>
                <div className="detail-row">
                  <span className="label">🌍 Origin:</span>
                  <span className="value">{product.origin}</span>
                </div>
                <div className="detail-row">
                  <span className="label">💰 Price:</span>
                  <span className="value">{product.price} ETH</span>
                </div>
                <div className="detail-row">
                  <span className="label">📦 Available:</span>
                  <span className="value">{product.quantity} units</span>
                </div>
              </div>

              <div className="product-actions">
                {product.available && product.quantity > 0 ? (
                  <button
                    onClick={() => purchaseProduct(product)}
                    disabled={purchaseStatus[product.batchId] === 'purchasing'}
                    className="purchase-btn"
                  >
                    {purchaseStatus[product.batchId] === 'purchasing' ? (
                      'Purchasing...'
                    ) : (
                      `🛒 Buy Now - ${product.price} ETH`
                    )}
                  </button>
                ) : (
                  <button disabled className="sold-out-btn">
                    ❌ Sold Out
                  </button>
                )}

                {purchaseStatus[product.batchId] === 'success' && (
                  <div className="success-message">
                    ✅ Purchase successful!
                  </div>
                )}

                {purchaseStatus[product.batchId] === 'error' && (
                  <div className="error-message">
                    ❌ Purchase failed. Try again.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {products.length === 0 && !loadingProducts && (
        <div className="no-products">
          <h3>📦 No Products Available</h3>
          <p>Check back later for new products.</p>
        </div>
      )}
    </div>
  );
};

export default ProductMarketplace;