# Shipment Verification Guide

This guide explains how to verify shipments in the Ethereum-based supply chain application.

## Understanding Shipment Verification

A shipment is considered verified when it meets the following conditions:

1. The product being shipped is valid (verified through the `Product.verifyProduct()` method)
2. The shipment status is not CANCELLED or UNABLE_TO_DELIVERED
3. Both the sender and receiver are registered stakeholders in the system
4. The product is in an appropriate stage for shipment (PROCESSING, DISTRIBUTION, or RETAIL)

## Methods for Verifying Shipments

There are several ways to verify a shipment in the system:

### 1. Using the Frontend (Track Page)

1. Navigate to the Track page in the application
2. Enter the shipment tracking number
3. Click "Track Shipment"
4. The system will display the verification status under "Verification Status"

### 2. Using Smart Contract Methods Directly (ethers.js v6)

You can use the PublicVerification contract to verify a shipment directly:

```javascript
// Using ethers.js v6.15.0
const { ethers } = require("ethers");

// Connect to provider
const provider = new ethers.JsonRpcProvider("http://localhost:8545");

// Connect to the PublicVerification contract
const publicVerificationAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
const publicVerificationABI = [
  "function trackShipmentByTrackingNumber(string memory _trackingNumber) view returns (address shipmentAddress, address productAddress, uint8 productStage, uint8 shipmentStatus, string memory productName, string memory statusDescription, bool isProductValid, bool isShipmentValid)"
];

const publicVerification = new ethers.Contract(
  publicVerificationAddress,
  publicVerificationABI,
  provider
);

// Track shipment by tracking number
async function verifyShipment(trackingNumber) {
  try {
    const result = await publicVerification.trackShipmentByTrackingNumber(trackingNumber);
    
    // Check if the shipment is valid
    const isShipmentValid = result[7]; // isShipmentValid
    const isProductValid = result[6];  // isProductValid
    
    if (isShipmentValid && isProductValid) {
      console.log("[VERIFIED] Shipment is fully verified!");
    } else {
      console.log("[FAILED] Shipment verification failed");
      if (!isProductValid) console.log("  - Product validation failed");
      if (!isShipmentValid) console.log("  - Shipment status is invalid (cancelled or undeliverable)");
    }
    
    return {
      shipmentAddress: result[0],
      productAddress: result[1], 
      productStage: Number(result[2]),
      shipmentStatus: Number(result[3]),
      productName: result[4],
      statusDescription: result[5],
      isProductValid: result[6],
      isShipmentValid: result[7]
    };
  } catch (error) {
    console.error("Error verifying shipment:", error);
    throw new Error("Could not verify shipment with this tracking number");
  }
}
```

### 3. Checking Verification Manually (Script Version)

Create a script like `verify-shipment.js`:

```javascript
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Get tracking number from command line args
  const args = process.argv.slice(2);
  const trackingNumber = args[0];
  
  if (!trackingNumber) {
    console.error("Please provide a tracking number as an argument");
    process.exit(1);
  }

  // Setup provider
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  try {
    // First, get the registry contract to find the shipment
    const registryAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788'; 
    const registryABI = [
      "function findShipmentByTrackingNumber(string memory _trackingNumber) view returns (address)"
    ];

    const registry = new ethers.Contract(
      registryAddress,
      registryABI,
      provider
    );
    
    // Find the shipment address
    const shipmentAddress = await registry.findShipmentByTrackingNumber(trackingNumber);
    
    if (shipmentAddress === '0x0000000000000000000000000000000000000000') {
      console.error("Shipment not found with this tracking number");
      process.exit(1);
    }
    
    console.log(`Found shipment at address: ${shipmentAddress}`);
    
    // Connect to shipment contract
    const shipmentABI = [
      "function status() view returns (uint8)",
      "function getStatusDescription() view returns (string)",
      "function productAddress() view returns (address)",
      "function sender() view returns (address)",
      "function receiver() view returns (address)"
    ];
    
    const shipment = new ethers.Contract(
      shipmentAddress,
      shipmentABI,
      provider
    );
    
    // Get shipment status
    const shipmentStatus = await shipment.status();
    const statusDescription = await shipment.getStatusDescription();
    const isShipmentValid = !(shipmentStatus === 5 || shipmentStatus === 6); // Not CANCELLED or UNABLE_TO_DELIVERED
    
    console.log(`Shipment Status: ${shipmentStatus} (${statusDescription})`);
    console.log(`Shipment Valid: ${isShipmentValid ? '[VALID] Yes' : '[INVALID] No'}`);
    
    // Get product details
    const productAddress = await shipment.productAddress();
    console.log(`Product Address: ${productAddress}`);
    
    const productABI = [
      "function name() view returns (string)",
      "function currentStage() view returns (uint8)",
      "function verifyProduct() view returns (bool)"
    ];
    
    const product = new ethers.Contract(
      productAddress,
      productABI,
      provider
    );
    
    const productName = await product.name();
    const productStage = await product.currentStage();
    const isProductValid = await product.verifyProduct();
    
    const stages = ['Farm', 'Processing', 'Distribution', 'Retail', 'Consumed'];
    
    console.log(`Product Name: ${productName}`);
    console.log(`Product Stage: ${stages[productStage] || 'Unknown'} (${productStage})`);
    console.log(`Product Valid: ${isProductValid ? '[VALID] Yes' : '[INVALID] No'}`);
    
    // Verify stakeholder registration
    const sender = await shipment.sender();
    const receiver = await shipment.receiver();
    
    console.log(`\nStakeholder Information:`);
    console.log(`Sender: ${sender}`);
    console.log(`Receiver: ${receiver}`);
    
    // Overall verification status
    const isFullyVerified = isShipmentValid && isProductValid;
    console.log(`\nOverall Verification Status: ${isFullyVerified ? '[SUCCESS] VERIFIED' : '[FAILED] NOT VERIFIED'}`);
    
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
```

Run it with:
```bash
node verify-shipment.js YOUR_TRACKING_NUMBER
```

## Ensuring Successful Shipment Verification

To ensure your shipments can be verified:

1. **Register all stakeholders**: Both sender and receiver must be registered in the StakeholderRegistry
2. **Ensure proper product stage**: The product must be in PROCESSING, DISTRIBUTION, or RETAIL stage
3. **Use proper permissions**: Only DISTRIBUTORS can create shipments
4. **Maintain active status**: Avoid cancelling shipments unless necessary

## Resolving Verification Issues

If a shipment fails verification, check:

### 1. Stakeholder Registration

Register missing stakeholders (especially the receiver) with a script:

```javascript
// register-stakeholder.js
const { ethers } = require("ethers");

async function main() {
  // Setup provider and signer (admin account)
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  const accounts = await provider.listAccounts();
  const admin = await provider.getSigner(accounts[0].address);
  
  // Parse arguments
  const args = process.argv.slice(2);
  let stakeholderAddress = "";
  let role = "";
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address" && i + 1 < args.length) {
      stakeholderAddress = args[i + 1];
      i++;
    } else if (args[i] === "--role" && i + 1 < args.length) {
      role = args[i + 1];
      i++;
    }
  }
  
  if (!stakeholderAddress || !role) {
    console.error("Usage: node register-stakeholder.js --address 0x... --role RETAILER");
    process.exit(1);
  }
  
  // Map role string to enum value
  const roleMap = {
    "NONE": 0,
    "FARMER": 1,
    "PROCESSOR": 2,
    "RETAILER": 3,
    "DISTRIBUTOR": 4
  };
  
  if (!roleMap[role]) {
    console.error("Invalid role. Use: FARMER, PROCESSOR, RETAILER, or DISTRIBUTOR");
    process.exit(1);
  }
  
  // Get StakeholderManager contract
  const stakeholderManagerAddress = "YOUR_STAKEHOLDER_MANAGER_ADDRESS";
  const stakeholderManagerABI = [
    "function registerStakeholder(address _stakeholderAddress, uint8 _role, string memory _businessName, string memory _businessLicense, string memory _location, string memory _certifications) external returns (bool)"
  ];
  
  const stakeholderManager = new ethers.Contract(
    stakeholderManagerAddress,
    stakeholderManagerABI,
    admin
  );
  
  try {
    console.log(`Registering ${stakeholderAddress} as ${role}...`);
    
    // Business details
    const businessName = `${role} Business`;
    const businessLicense = `LICENSE-${stakeholderAddress.substr(2, 8)}`;
    const location = "Global";
    const certifications = "Standard";
    
    // Register the stakeholder
    const tx = await stakeholderManager.registerStakeholder(
      stakeholderAddress,
      roleMap[role],
      businessName,
      businessLicense,
      location,
      certifications
    );
    
    await tx.wait();
    console.log(`[SUCCESS] Successfully registered ${stakeholderAddress} as ${role}`);
    console.log(`Transaction hash: ${tx.hash}`);
    
  } catch (error) {
    console.error(`Error registering stakeholder: ${error.message}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
```

Usage:
```bash
node register-stakeholder.js --address 0xYourReceiverAddress --role RETAILER
```

### 2. Update Product Stage

If the product is still in the FARM stage:

```bash
node scripts/update-product-to-processing.js --product 0xYourProductAddress
```

## For Developers

When implementing shipment verification logic:

1. Always check both product validity and shipment status
2. Ensure you're using the correct contract addresses
3. Use proper error handling for non-existent shipments
4. Remember that ethers.js v6 has different syntax than v5:
   - Use `new ethers.JsonRpcProvider()` instead of `new ethers.providers.JsonRpcProvider()`
   - Handle BigNumber conversions with `Number()` instead of `.toNumber()`
   - Use proper await patterns with contract interactions

For more details, refer to the smart contract code in `src/SmartContracts/`.
