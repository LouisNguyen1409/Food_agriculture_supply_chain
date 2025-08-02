# Farmer Dashboard

The Farmer Dashboard is a comprehensive interface for farmers to manage their agricultural products, offers, shipments, and transactions in the agricultural supply chain system.

## Features

### 1. Batch Management
- **Create Batch**: Register new product batches with detailed information
  - Product name and description
  - Quantity and base price
  - Origin location and metadata
  - Trading mode (Spot Market, Contract Farming, Cooperative, Weather Dependent)
  - Weather verification requirements

- **List for Sale**: Make batches available for purchase
  - Set asking price
  - Choose trading mode
  - Weather verification (if required)

- **Transfer Ownership**: Transfer batch ownership to another address
  - Specify batch ID and new owner address

### 2. Offer Management
- **View Available Offers**: See all offers available to the farmer
  - Offer details (creator, price, quantity, type)
  - Offer status and expiration
  - Accept offers with one click

### 3. Shipment Management
- **Create Shipment**: Create shipments for sold batches
  - Link to batch and offer IDs
  - Specify receiver and optional shipper
  - Add tracking ID and locations
  - Include metadata hash

### 4. Transaction Recording
- **Record Transactions**: Record completed transactions in the registry
  - Automatically records transaction details
  - Updates batch status and ownership

## Smart Contract Integration

The Farmer Dashboard integrates with the following smart contracts:

### ProductBatch Contract
- `createBatch()` - Create new product batches
- `listForSale()` - List batches for sale
- `transferOwnership()` - Transfer batch ownership
- `getBatchInfo()` - Retrieve batch information

### OfferManager Contract
- `acceptOffer()` - Accept offers from buyers
- `getAvailableOffers()` - Get offers available to farmer
- `getOfferInfo()` - Get detailed offer information

### Registry Contract
- `recordTransaction()` - Record completed transactions
- `recordTransactionWithOracle()` - Record transactions with oracle data

### ShipmentTracker Contract
- `createShipment()` - Create new shipments
- `getUserShipmentsByStatus()` - Get user's shipments by status

## Usage

### Prerequisites
1. Connect your MetaMask wallet
2. Ensure you have the FARMER role in the system
3. Have sufficient ETH for gas fees

### Creating a Batch
1. Navigate to the "My Batches" tab
2. Fill in the batch creation form:
   - **Batch Name**: Descriptive name for your product
   - **Description**: Detailed description of the product
   - **Quantity**: Amount available (in units)
   - **Base Price**: Price in ETH
   - **Origin Location**: Where the product was produced
   - **Metadata Hash**: Optional IPFS hash for additional data
   - **Trading Mode**: Choose from available trading modes
   - **Weather Verification**: Enable if weather conditions matter
3. Click "Create Batch"

### Listing for Sale
1. In the "My Batches" tab, use the "List Batch for Sale" form
2. Enter the batch ID you want to list
3. Set the asking price in ETH
4. Choose the trading mode
5. Click "List for Sale"

### Accepting Offers
1. Navigate to the "Offers" tab
2. View all available offers
3. Click "Accept" on offers you want to accept
4. Confirm the transaction in MetaMask

### Creating Shipments
1. Navigate to the "Shipments" tab
2. Fill in the shipment creation form:
   - **Batch ID**: The batch being shipped
   - **Offer ID**: The accepted offer
   - **Receiver Address**: Buyer's address
   - **Shipper Address**: Optional third-party shipper
   - **Tracking ID**: Unique tracking identifier
   - **From/To Location**: Shipment locations
   - **Metadata Hash**: Optional additional data
3. Click "Create Shipment"

### Transferring Ownership
1. In the "My Batches" tab, use the "Transfer Ownership" form
2. Enter the batch ID
3. Enter the new owner's address
4. Click "Transfer Ownership"

## Contract Addresses

The dashboard uses the following contract addresses (configurable via environment variables):

- `REACT_APP_PRODUCT_BATCH_ADDRESS`: ProductBatch contract
- `REACT_APP_OFFER_MANAGER_ADDRESS`: OfferManager contract
- `REACT_APP_REGISTRY_ADDRESS`: Registry contract
- `REACT_APP_SHIPMENT_TRACKER_ADDRESS`: ShipmentTracker contract

## Error Handling

The dashboard includes comprehensive error handling:
- Wallet connection validation
- Transaction confirmation
- Success/error message display
- Loading states during transactions

## Security Features

- Role-based access control (FARMER role required)
- Transaction validation
- Input sanitization
- MetaMask integration for secure transactions

## Responsive Design

The dashboard is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile devices

## Future Enhancements

- Batch analytics and reporting
- Weather data integration
- Advanced filtering and search
- Bulk operations
- Export functionality
- Real-time notifications 