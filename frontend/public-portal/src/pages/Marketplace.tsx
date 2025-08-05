import React from 'react';
import ProductMarketplace from '../components/ProductMarketplace';

const Marketplace: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Product Marketplace</h1>
        <p>Purchase verified products with immediate ownership transfer</p>
      </div>

      <ProductMarketplace />
    </div>
  );
};

export default Marketplace;