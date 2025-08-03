# Food Agriculture Supply Chain - Blockchain PoC System

### Project Overview
This is a blockchain-based Proof of Concept (PoC) software system that implements a complete agricultural supply chain management solution with trading, logistics, and analytics capabilities.

### System Architecture
- **Blockchain Platform**: Polygon with Hardhat framework
- **Smart Contracts**: 16 contracts with comprehensive business logic
- **Frontend**: React applications (admin-portal and public-portal)
- **Oracles**: Chainlink-compatible price feeds and real weather API integration
- **Weather Data**: OpenWeatherMap API with updatable on-chain feeds
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

# Weather API Configuration
# Get your free API key from: https://openweathermap.org/api
OPENWEATHER_API_KEY=your_openweather_api_key

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
npx hardhat deploy --network localhost
```

3. **Update Weather Data (Optional)**
```bash
# Update weather feeds with real API data
npm run weather:update

# Or start continuous weather monitoring
npm run weather:monitor
```

4. **Run Frontend Applications**
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
npm run deploy:polygon
```

2. **Update Weather Data on Polygon**
```bash
# Update weather feeds with real API data
npm run weather:update:polygon

# Or start continuous weather monitoring
npm run weather:monitor:polygon
```

### Testing the System

#### Run All Tests
```bash
# Unit tests
npm test

# Integration tests
node scripts/test-core-system.js
node scripts/test-access-system.js
node scripts/test-verification-system.js

# Weather integration tests
npm run weather:test
node scripts/test-weather-api.js
```

#### Test Individual Components
```bash
# Access control tests
npx hardhat test test/access/

# Core system tests
npx hardhat test test/core/

# Weather API service test
node scripts/test-weather-api.js
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
- **Weather Oracle**: Real-time weather data from OpenWeatherMap API
  - Temperature, humidity, rainfall, and wind speed feeds
  - Updatable smart contracts with Chainlink-compatible interface
  - Automated weather monitoring and feed updates
- **Weather-dependent Trading**: Automatic trading based on real weather conditions

#### 3. Off-chain Components
- **Admin Portal**: Complete stakeholder management interface
- **Public Portal**: Public-facing supply chain tracking
- **Weather API Service**: Real-time weather data integration
- **Weather Monitoring**: Automated weather feed updates
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
│   ├── core/              # Core business logic contracts
│   ├── access/            # Access control contracts
│   ├── Oracles/           # Price and weather oracle libraries
│   ├── test/              # Mock contracts and updatable feeds
│   └── verification/      # Verification and provenance contracts
├── frontend/               # React applications
│   ├── admin-portal/      # Admin interface
│   └── public-portal/     # Public tracking interface
├── services/               # API services
│   └── weatherAPI.js      # Weather data integration
├── test/                   # Unit tests
├── scripts/                # Integration tests and utilities
│   ├── update-weather-feeds.js    # Weather data updates
│   ├── weather-monitor.js          # Continuous monitoring
│   └── test-weather-*.js          # Weather integration tests
├── deploy/                 # Deployment scripts
├── docs/                   # Documentation
│   └── weather-api-integration.md # Weather integration guide
└── smart_contract_addresses.txt   # Deployed contract addresses
```

### Libraries and Dependencies

#### Core Dependencies
- **Hardhat**: Ethereum development environment
- **ethers.js**: Ethereum library for frontend
- **React**: Frontend framework
- **TypeScript**: Type-safe JavaScript
- **Chainlink**: Oracle integration
- **axios**: HTTP client for weather API calls
- **OpenWeatherMap API**: Real-time weather data source

### Weather Integration Features

#### Real-Time Weather Data
- **OpenWeatherMap Integration**: Live weather data from global weather stations
- **Multiple Locations**: Support for weather data from any city/region
- **Four Data Types**: Temperature (°C), Humidity (%), Rainfall (mm), Wind Speed (km/h)
- **Automatic Updates**: Configurable monitoring intervals for continuous data feeds

#### Smart Contract Compatibility
- **Chainlink Interface**: Full AggregatorV3Interface compatibility
- **Existing Code**: Works with your current Weather.sol library unchanged
- **Data Scaling**: Proper integer scaling for Solidity compatibility
- **Gas Optimized**: Efficient contract updates and data retrieval

#### Available Commands
```bash
# Weather data management
npm run weather:update          # One-time weather data update (local)
npm run weather:update:polygon   # One-time weather data update (Polygon)
npm run weather:monitor          # Continuous weather monitoring (local)
npm run weather:monitor:polygon  # Continuous weather monitoring (Polygon)
npm run weather:test            # Test weather integration

# Weather API testing
node scripts/test-weather-api.js        # Test API connectivity
node scripts/final-weather-test.js      # Full integration test
```

#### Weather Feed Addresses (Local Development)
- **Temperature Feed**: `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`
- **Humidity Feed**: `0x0165878A594ca255338adfa4d48449f69242Eb8F`
- **Rainfall Feed**: `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`
- **Wind Speed Feed**: `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`

#### Production Deployment
For production networks, weather feeds are automatically deployed and configured during the main deployment process. See `docs/weather-api-integration.md` for detailed instructions.

This project demonstrates a complete blockchain-based supply chain management system with all required components including smart contracts with business logic, real-time weather oracle integration, off-chain computation, and comprehensive testing.