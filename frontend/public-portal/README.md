# Blockchain Supply Chain Public Portal

A decentralized public portal for agricultural supply chain verification and tracking built with React, TypeScript, and ethers.js v6.15.0.

## Overview

This portal allows consumers and partners to verify agricultural products, track shipments, and validate the authenticity of items through Ethereum blockchain integration. The portal connects to smart contracts deployed on either localhost, Mumbai testnet, or Polygon mainnet.

## Features

- **Dynamic Wallet Connection**: Connect to MetaMask or any other Ethereum wallet
- **Network Detection**: Automatically detects and displays current connected network
- **Product Verification**: Verify authenticity of agricultural products using blockchain records
- **Shipment Tracking**: Track the status and location of shipments in the supply chain
- **Detailed Traceability**: View complete history of products including origin, processing steps, and certifications

## Technology Stack

- React 18+
- TypeScript
- ethers.js v6.15.0 (for Ethereum blockchain interaction)
- React Router v6

## Smart Contract Integration

The application connects to Ethereum smart contracts via ethers.js v6. Contract ABIs and address configuration can be found in `src/utils/contractHelpers.ts`. The portal supports multiple networks including:

- Localhost development network (chain ID: 1337)
- Mumbai Testnet (chain ID: 80001)
- Polygon Mainnet (chain ID: 137)

## Prerequisites

- Node.js v16 or higher
- npm or yarn
- MetaMask or compatible Ethereum wallet browser extension

## Getting Started

### Installation

1. Clone the repository or navigate to the public portal directory:
   ```bash
   cd /path/to/Food_agriculture_supply_chain/frontend/public-portal
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   or
   ```bash
   yarn
   ```

### Configuration

1. Update contract addresses in `src/utils/contractHelpers.ts` if necessary
2. Configure network settings for your environment

### Running the Application

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
