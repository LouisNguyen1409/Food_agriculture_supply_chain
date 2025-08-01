const { ethers } = require("ethers");

async function main() {
  try {
    // Connect to local Hardhat network
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const accounts = await provider.listAccounts();
    
    // Use account #1 as distributor to create shipment
    const distributorSigner = await provider.getSigner(1);
    const distributorAddress = await distributorSigner.getAddress();
    console.log(`Using distributor account: ${distributorAddress}`);
    
    // First, let's check if we have any products we can ship
    const registryAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
    
    // Get Registry contract interface - trying a more complete ABI
    const registryABI = [
      "function getAllProducts() view returns (address[])",
      "function isRegisteredStakeholder(address _stakeholderAddress) view returns (bool)"
    ];
    
    const registry = new ethers.Contract(registryAddress, registryABI, provider);
    
    // Check if our distributor is registered
    const isDistributorRegistered = await registry.isRegisteredStakeholder(distributorAddress);
    console.log(`Distributor registered: ${isDistributorRegistered}`);
    
    if (!isDistributorRegistered) {
      console.log("Distributor is not registered! Please register the distributor first.");
      return;
    }
    
    // Get all products
    try {
      const products = await registry.getAllProducts();
      console.log(`Found ${products.length} products`);
      
      if (products.length === 0) {
        console.log("No products found! Need to create a product first.");
        return;
      }
      
      // Choose the first product for shipment
      const productAddress = products[0];
      console.log(`Using product at address: ${productAddress}`);
      
      // Check product stage
      const productABI = [
        "function currentStage() view returns (uint8)",
        "function name() view returns (string)"
      ];
      
      const product = new ethers.Contract(productAddress, productABI, provider);
      const productStage = await product.currentStage();
      const productName = await product.name();
      
      console.log(`Product ${productName} is at stage: ${productStage}`);
      // 0: FARM, 1: PROCESSING, 2: DISTRIBUTION, 3: RETAIL, 4: CONSUMED
      
      if (productStage < 1) {
        console.log("Product is still at FARM stage. Need to progress to at least PROCESSING stage.");
        return;
      }
      
      // Get ShipmentFactory to create a shipment
      // Try to find ShipmentFactory address
      // We'll use the registry address as most contracts are deployed together
      
      console.log("Looking for ShipmentFactory...");
      const shipmentFactoryAddress = registryAddress; // Try same address as registry
      
      // Let's try to find ShipmentFactory's address from other contracts
      try {
        const productFactoryAddress = '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318';
        const productFactoryABI = [
          "function shipmentFactory() view returns (address)"
        ];
        
        const productFactory = new ethers.Contract(productFactoryAddress, productFactoryABI, provider);
        
        // Try to get ShipmentFactory address
        try {
          const fetchedShipmentFactoryAddress = await productFactory.shipmentFactory();
          console.log(`Found ShipmentFactory address: ${fetchedShipmentFactoryAddress}`);
          if (fetchedShipmentFactoryAddress && fetchedShipmentFactoryAddress !== ethers.ZeroAddress) {
            // Use this address if found
            shipmentFactoryAddress = fetchedShipmentFactoryAddress;
          }
        } catch (err) {
          console.log(`Could not get ShipmentFactory address: ${err.message}`);
        }
      } catch (err) {
        console.log(`Error finding ShipmentFactory address: ${err.message}`);
      }
      
      // Now find a receiver (retailer)
      // We'll use account #3 for this
      const receiverAddress = accounts[3].address;
      console.log(`Using receiver (retailer) account: ${receiverAddress}`);
      
      // Check if receiver is registered
      const isReceiverRegistered = await registry.isRegisteredStakeholder(receiverAddress);
      console.log(`Receiver registered: ${isReceiverRegistered}`);
      
      if (!isReceiverRegistered) {
        console.log("Receiver is not registered! Please register the receiver first.");
        return;
      }
      
      // Create shipment
      const shipmentFactoryABI = [
        "function createShipment(address productAddress, address receiver, string memory trackingNumber, string memory transportMode) returns (address)"
      ];
      
      // Connect as distributor to create shipment
      const shipmentFactory = new ethers.Contract(
        shipmentFactoryAddress,
        shipmentFactoryABI,
        distributorSigner
      );
      
      // Generate unique tracking number
      const trackingNumber = `TRACK-${Date.now().toString().slice(-6)}`;
      const transportMode = "Truck";
      
      console.log(`Creating shipment with tracking number: ${trackingNumber}`);
      
      // Try to create shipment
      try {
        const tx = await shipmentFactory.createShipment(
          productAddress,
          receiverAddress,
          trackingNumber,
          transportMode
        );
        
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("Waiting for transaction confirmation...");
        
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Try to find the shipment address from events
        console.log(`Successfully created shipment with tracking number: ${trackingNumber}`);
        console.log("Save this tracking number to use in the Track component.");
        
      } catch (err) {
        console.error(`Failed to create shipment: ${err.message}`);
      }
      
    } catch (err) {
      console.error(`Error getting products: ${err.message}`);
      console.log("The Registry contract at this address might not have getAllProducts function or it's not a Registry.");
    }
    
  } catch (err) {
    console.error(`Error in script execution: ${err.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
