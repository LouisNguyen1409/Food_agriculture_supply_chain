import React, { useState, useEffect, useCallback } from 'react';
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
  retailerAddress: string;
  available: boolean;
}

// Add proper typing for contract response
interface RetailerProductsResponse {
  0: ethers.BigNumberish[]; // batchIds
  1: string[];              // retailers
  2: string[];              // productNames
  3: string[];              // descriptions
  4: ethers.BigNumberish[]; // prices
  5: ethers.BigNumberish[]; // quantities
  6: string[];              // origins
}

const ProductMarketplace: React.FC = () => {
  const { contracts, signer, loading, error, isConnected } = useContracts();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseStatus, setPurchaseStatus] = useState<{[key: number]: string}>({});
  const [loadingProducts, setLoadingProducts] = useState(false);

  const loadAvailableProducts = useCallback(async () => {
    if (!contracts?.productBatch) {
      console.log('ProductBatch contract not available');
      setProducts([]);
      return;
    }

    setLoadingProducts(true);
    try {
      console.log('[INFO] Loading retailer products from blockchain...');

      // Use the new getRetailerProducts function with proper typing
      const result: RetailerProductsResponse = await contracts.productBatch.getRetailerProducts();

      const batchIds = result[0];
      const retailers = result[1];
      const productNames = result[2];
      const descriptions = result[3];
      const prices = result[4];
      const quantities = result[5];
      const origins = result[6];

      console.log('[DEBUG] Raw retailer products data:', {
        batchIds: batchIds.map((id: ethers.BigNumberish) => Number(id)),
        retailers,
        productNames,
        quantities: quantities.map((q: ethers.BigNumberish) => Number(q))
      });

      const availableProducts: Product[] = [];

      for (let i = 0; i < batchIds.length; i++) {
        const quantity = Number(quantities[i]);
        if (quantity > 0) {
          availableProducts.push({
            batchId: Number(batchIds[i]),
            name: productNames[i],
            description: descriptions[i] || `Premium quality ${productNames[i]} from ${origins[i]}`,
            price: ethers.formatEther(prices[i]),
            quantity: quantity,
            origin: origins[i],
            retailer: `${retailers[i].slice(0,6)}...${retailers[i].slice(-4)}`,
            retailerAddress: retailers[i],
            available: true
          });
        }
      }

      console.log(`[SUCCESS] Loaded ${availableProducts.length} retailer products`);
      setProducts(availableProducts);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('[ERROR] Error loading retailer products:', error);

      // Check if the function exists, if not fallback to legacy method
      if (error.message?.includes('getRetailerProducts') ||
          error.message?.includes('not a function')) {
        console.log(' getRetailerProducts not available, using fallback method...');
        await loadProductsLegacy();
      } else {
        setProducts([]);
      }
    }
    setLoadingProducts(false);
  }, [contracts]);

  // Fallback method with proper typing
  const loadProductsLegacy = async () => {
    try {
      console.log(' Using legacy product loading method...');
      const availableProducts: Product[] = [];

      // Try loading batches 1-20 (adjust range as needed)
      for (let batchId = 1; batchId <= 20; batchId++) {
        try {
          const batchExists: boolean = await contracts!.productBatch!.batchExists(batchId);
          if (!batchExists) continue;

          const batchInfo: [string, string, string, string, ethers.BigNumberish, ethers.BigNumberish, string, number, ethers.BigNumberish, boolean] =
            await contracts!.productBatch!.getBatchInfo(batchId);

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

          // Only show products owned by retailers (not farmers directly)
          if (isActive && Number(quantity) > 0 && retailer !== ethers.ZeroAddress) {
            availableProducts.push({
              batchId,
              name: productName,
              description: `Premium quality ${productName} from ${origin}`,
              price: ethers.formatEther(price),
              quantity: Number(quantity),
              origin: origin,
              retailer: `${retailer.slice(0,6)}...${retailer.slice(-4)}`,
              retailerAddress: retailer,
              available: true
            });
          }
        } catch (error: unknown) {
          const err = error as Error;
          if (err.message?.includes("Batch does not exist")) {
            break; // No more batches
          }
        }
      }

      console.log(`[SUCCESS] Loaded ${availableProducts.length} products (legacy method)`);
      setProducts(availableProducts);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('[ERROR] Error in legacy product loading:', error);
      setProducts([]);
    }
  };

  useEffect(() => {
    if (isConnected && contracts?.productBatch) {
      loadAvailableProducts();
    }
  }, [isConnected, contracts, loadAvailableProducts]);

  const purchaseProduct = async (product: Product) => {
    if (!contracts?.productBatch || !signer) {
      alert('Please connect your wallet first');
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

      // Use the customer's address as the consumer
      const consumerAddress: string = await signer.getAddress();

      console.log('[INFO] Purchasing product:', {
        batchId: product.batchId,
        retailer: product.retailerAddress,
        consumer: consumerAddress,
        quantity,
        price: product.price,
        deliveryAddress
      });

      const tx: ethers.ContractTransactionResponse = await contracts.productBatch.purchaseWithImmediateOwnership(
        product.batchId,
        product.retailerAddress,
        quantity,
        deliveryAddress,
        { value: priceInWei }
      );

      console.log('[INFO] Transaction sent:', tx.hash);
      await tx.wait();

      // Step 2: Record the transaction in registry (if available)
    try {
        if (contracts.transactionRegistry) {
          console.log('[INFO] Recording transaction in registry...');

          const recordTx = await contracts.transactionRegistry.recordTransaction(
            product.batchId,           // batchId
            product.retailerAddress,   // seller (retailer)
            consumerAddress,          // buyer (consumer)
            ethers.parseEther(product.price), // unit price
            quantity,                 // quantity
            "CONSUMER_PURCHASE"       // transaction type
          );

          console.log('[INFO] Transaction registry record sent:', recordTx.hash);
          await recordTx.wait();
          console.log('[SUCCESS] Transaction recorded in registry');
        } else {
          console.log('[WARNING] Transaction registry not available');
        }
      } catch (registryError) {
        console.error('[ERROR] Failed to record transaction in registry:', registryError);
        // Don't fail the whole purchase if registry recording fails
      }
      setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'success' }));

      alert(`Purchase Successful!

Transaction Hash: ${tx.hash}
Product: ${product.name}
Retailer: ${product.retailer}
Delivery Address: ${deliveryAddress}

You now own this product!`);

      // Update product quantity locally
      setProducts(prev => prev.map(p =>
        p.batchId === product.batchId
          ? { ...p, quantity: p.quantity - quantity, available: p.quantity > quantity }
          : p
      ));

      // Refresh products after successful purchase
      setTimeout(() => {
        loadAvailableProducts();
      }, 2000);

    } catch (err: unknown) {
      const error = err as Error;
      console.error('[ERROR] Purchase error:', error);
      setPurchaseStatus(prev => ({ ...prev, [product.batchId]: 'error' }));

      let errorMessage = 'Purchase failed: ';
      if (error.message?.includes('insufficient funds')) {
        errorMessage += 'Insufficient funds in your wallet';
      } else if (error.message?.includes('user rejected')) {
        errorMessage += 'Transaction cancelled by user';
      } else if (error.message?.includes('execution reverted')) {
        errorMessage += 'Transaction failed - check if product is still available';
      } else {
        errorMessage += error.message || 'Unknown error';
      }

      alert(errorMessage);
    }
  };

  // Rest of your component remains the same...
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
        <h3>Connection Error</h3>
        <p>{error}</p>
        <button onClick={loadAvailableProducts} className="retry-btn">
           Retry
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="connection-required">
        <h3>Wallet Connection Required</h3>
        <p>Please connect your wallet to view and purchase products.</p>
      </div>
    );
  }

  return (
    <div className="marketplace-container">
      <div className="marketplace-header">
        <h2>Retailer Products</h2>
        <div className="header-actions">
          <span className="product-count">
            {products.length} products available
          </span>
          <button onClick={loadAvailableProducts} className="refresh-btn">
             Refresh
          </button>
        </div>
      </div>

      {loadingProducts ? (
        <div className="loading-container">
          <div className="loader"></div>
          <p>Loading products from retailers...</p>
        </div>
      ) : (
        <div className="products-grid">
          {products.map(product => (
            <div key={product.batchId} className="product-card">
              <div className="product-header">
                <h3>{product.name}</h3>
                <div className="badges">
                  <span className="badge verified">Verified</span>
                  <span className="badge retailer">Retailer</span>
                </div>
              </div>

              <div className="product-details">
                <p className="description">{product.description}</p>
                <div className="detail-row">
                  <span className="label">Origin:</span>
                  <span className="value">{product.origin}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Retailer:</span>
                  <span className="value">{product.retailer}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Price:</span>
                  <span className="value">{product.price} ETH</span>
                </div>
                <div className="detail-row">
                  <span className="label">Available:</span>
                  <span className="value">{product.quantity} units</span>
                </div>
                <div className="detail-row">
                  <span className="label">Batch ID:</span>
                  <span className="value">#{product.batchId}</span>
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
                      `Buy Now - ${product.price} ETH`
                    )}
                  </button>
                ) : (
                  <button disabled className="sold-out-btn">
                    Sold Out
                  </button>
                )}

                {purchaseStatus[product.batchId] === 'success' && (
                  <div className="success-message">
                    Purchase successful!
                  </div>
                )}

                {purchaseStatus[product.batchId] === 'error' && (
                  <div className="error-message">
                    Purchase failed. Try again.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {products.length === 0 && !loadingProducts && (
        <div className="no-products">
          <h3>No Retailer Products Available</h3>
          <p>No products are currently available from retailers.</p>
          <p>Products must be transferred from farmers to retailers first.</p>
          <button onClick={loadAvailableProducts} className="btn-primary">
             Refresh Products
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductMarketplace;