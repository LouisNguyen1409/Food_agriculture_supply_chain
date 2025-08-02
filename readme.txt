# Food Agriculture Supply Chain - Blockchain PoC System

### Project Overview
This is a blockchain-based Proof of Concept (PoC) software system that implements a complete agricultural supply chain management solution with trading, logistics, and analytics capabilities.

### System Architecture
- **Blockchain Platform**: Polygon with Hardhat framework
- **Smart Contracts**: 16 contracts with comprehensive business logic
- **Frontend**: React applications (admin-portal and public-portal)
- **Oracles**: Chainlink integration for price and weather data
- **Testing**: Comprehensive unit tests and integration tests

### Prerequisites
Before running this project, ensure you have the following installed:

#### Required Software
1. **Node.js** (v16 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **Yarn** (v1.22 or higher)
   - Install via npm: `npm install -g yarn`
   - Verify installation: `yarn --version`

3. **Git** (v2.30 or higher)
   - Download from: https://git-scm.com/
   - Verify installation: `git --version`

#### Optional (for advanced features)
4. **MetaMask** browser extension
   - Download from: https://metamask.io/
   - Required for frontend interaction with blockchain

### Installation Instructions

#### Step 1: Clone and Setup
```bash
# Clone the repository
git clone <repository-url>
cd Food_agriculture_supply_chain

# Install root dependencies
yarn install
```

#### Step 2: Environment Configuration
Create a `.env` file in the root directory with the following variables:
```env
# Blockchain Networks
POLYGON_RPC_URL=your_polygon_rpc_url
PRIVATE_KEY=your_private_key

# API Keys
POLYGONSCAN_API_KEY=your_polygonscan_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# Optional
REPORT_GAS=true
```

#### Step 3: Frontend Setup
```bash
# Setup admin portal
cd frontend/admin-portal
yarn install

# Setup public portal
cd ../public-portal
yarn install
```

### Running the Application

#### Option 1: Local Development (Recommended for Testing)

1. **Start Local Blockchain**
```bash
# In root directory
npx hardhat node
```

2. **Deploy Smart Contracts**
```bash
# In a new terminal, root directory
yarn hardhat deploy
```

3. **Run Frontend Applications**
```bash
# Admin Portal (Terminal 1)
cd frontend/admin-portal
yarn start

# Public Portal (Terminal 2)
cd frontend/public-portal
yarn start
```

#### Option 2: Test Network Deployment

1. **Deploy to Polygon Amoy Testnet**
```bash
yarn hardhat deploy --network polygon
```

### Testing the System

#### Run All Tests
```bash
# Unit tests
yarn hardhat test

# Integration tests
node scripts/test-core-system.js
node scripts/test-access-system.js
node scripts/test-verification-system.js
```

#### Test Individual Components
```bash
# Access control tests
yarn hardhat test test/access/

# Core system tests
yarn hardhat test test/core/
```

### Smart Contract Addresses
After deployment, contract addresses will be saved to `smart_contract_addresses.txt` in the root directory.

### Key Features Demonstrated

#### 1. Smart Contracts with Business Logic
- **ProductBatch.sol**: Product lifecycle management with oracle integration
- **OfferManager.sol**: Marketplace trading system with multiple offer types
- **ShipmentTracker.sol**: End-to-end logistics tracking
- **Registry.sol**: Analytics and marketplace data management
- **AccessControl.sol**: Role-based access control system
- **StakeholderManager.sol**: Stakeholder registration and management

#### 2. Oracle Integration
- **Price Oracle**: Real-time ETH/USD price feeds via Chainlink
- **Weather Oracle**: Temperature, humidity, rainfall, and wind speed data
- **Weather-dependent Trading**: Automatic trading based on weather conditions

#### 3. Off-chain Components
- **Admin Portal**: Complete stakeholder management interface
- **Public Portal**: Public-facing supply chain tracking
- **Backend Scripts**: Comprehensive testing and interaction scripts

#### 4. Blockchain Interaction
- Multi-network support (Hardhat local, Polygon Amoy)
- Real-time contract interaction
- Event-driven updates
- Gas optimization

### File Structure
```
Food_agriculture_supply_chain/
├── src/SmartContracts/     # Smart contract source code
├── frontend/               # React applications
├── test/                   # Unit tests
├── scripts/                # Integration tests and utilities
├── deploy/                 # Deployment scripts
├── docs/                   # Documentation
└── smart_contract_addresses.txt  # Deployed contract addresses
```

### Libraries and Dependencies

#### Core Dependencies
- **Hardhat**: Ethereum development environment
- **ethers.js**: Ethereum library for frontend
- **React**: Frontend framework
- **TypeScript**: Type-safe JavaScript
- **Chainlink**: Oracle integration

This project demonstrates a complete blockchain-based supply chain management system with all required components including smart contracts with business logic, oracle integration, off-chain computation, and comprehensive testing.