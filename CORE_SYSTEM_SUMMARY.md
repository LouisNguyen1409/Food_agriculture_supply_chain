# Core Supply Chain Contracts Documentation

## Overview
Complete agricultural supply chain management with trading, logistics, and analytics.

## Contracts

### ProductBatch.sol
- **Purpose**: Product lifecycle management from farm to retail
- **Features**: Oracle integration, quality tracking, weather verification
- **Key Functions**:
  - `createBatch()` - Create new product batch
  - `listForSale()` - List product in marketplace
  - `processBatch()` - Transform product with quality metrics
  - `transferOwnership()` - Change batch ownership

### OfferManager.sol
- **Purpose**: Marketplace trading system with multiple offer types
- **Trading Modes**: Spot market, contract farming, cooperative
- **Key Functions**:
  - `createBuyOffer()` - Buyer places offer
  - `createSellOffer()` - Seller lists product
  - `acceptOffer()` - Complete trade agreement
  - `createContractOffer()` - Contract farming arrangements

### ShipmentTracker.sol
- **Purpose**: End-to-end logistics tracking with status updates
- **Statuses**: CREATED → PICKED_UP → IN_TRANSIT → DELIVERED → CONFIRMED
- **Key Functions**:
  - `createShipment()` - Initialize shipment
  - `pickupShipment()` - Mark as picked up
  - `updateLocation()` - Track in transit
  - `confirmDelivery()` - Complete delivery

### Registry.sol
- **Purpose**: Central analytics and marketplace data management
- **Analytics**: User dashboards, market metrics, category analysis
- **Key Functions**:
  - `registerProduct()` - Add product to marketplace
  - `recordTransaction()` - Log trade activity
  - `getMarketplaceOverview()` - Market statistics
  - `getUserDashboard()` - Stakeholder analytics

## Integration Points
- Cross-contract permissions for automated workflows
- Oracle integration for real-time pricing and weather data
- Event-driven updates for analytics tracking
- Role-based access control throughout all operations