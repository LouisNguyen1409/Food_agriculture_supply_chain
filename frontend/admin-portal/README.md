# Agricultural Supply Chain - Admin Portal

## Overview
The Admin Portal provides administrative tools for managing and monitoring the agricultural supply chain on the Ethereum blockchain. This application automatically detects stakeholder roles from smart contracts and provides role-appropriate interfaces for administrators, farmers, processors, distributors, and retailers.

## Key Features

- **Automatic Role Detection**: Connects to the StakeholderManager contract to identify your registered role
- **Visual Role Indicators**: Shows role status with color coding (active/inactive)
- **Business Information Display**: Shows registered business details for authenticated users
- **Product Management**: Create, view, and track products in the supply chain
- **Shipment Management**: Create and monitor shipments between stakeholders
- **Verification Tools**: Verify the authenticity of products and shipments

## Getting Started

### Setting Up the Blockchain Environment

1. **Start the Local Ethereum Node**
   ```bash
   # Terminal 1
   npx hardhat node
   ```

2. **Deploy Smart Contracts**
   ```bash
   # Terminal 2
   npx hardhat deploy --tags clean
   ```

3. **Start the Admin Portal**
   ```bash
   # In the admin-portal directory
   npm start
   ```

### Admin Workflow

#### Registering Stakeholders

1. **Register a Farmer**
   ```bash
   node scripts/register-farmer.js
   ```
   
2. **Register a Processor**
   ```bash
   node scripts/register-processor-update-product-state.js
   ```

3. **Connect your wallet** to the admin portal to automatically see your assigned role

#### Product Lifecycle Management

1. **Create a Product**
   - Connect with a wallet registered as a FARMER
   - Navigate to "Create Product" in the admin portal
   - Fill in product details and submit
   
2. **Update Product State**
   - Use the processor script to update product state:
   ```bash
   node scripts/register-processor-update-product-state.js
   ```
   - Provide the product address from the previous step

#### Shipment Management

1. **Create a Shipment**
   - Connect with a wallet that has appropriate permissions (e.g., DISTRIBUTOR)
   - Navigate to "Create Shipment" in the admin portal
   - Select the product to ship and enter shipping details

2. **Track Shipments**
   - Use the tracking interface to monitor shipment status
   - Verify shipment authenticity

## Smart Contract Integration

The admin portal interacts with these core smart contracts:

- **StakeholderManager**: Manages stakeholder roles and permissions
- **Registry**: Central registry for products and shipments
- **PublicVerification**: Provides verification methods for the supply chain
- **ShipmentFactory**: Creates and manages shipment contracts
- **ProductFactory**: Creates and manages product contracts

## Troubleshooting

- If you encounter issues with contract interactions, ensure your MetaMask is connected to the correct network (Hardhat local network)
- For role-specific functionality issues, verify your wallet is correctly registered with the appropriate role
- Check console logs for detailed error messages from contract interactions


