const { ethers } = require("ethers");

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
    console.log(`Verifying shipment with tracking number: ${trackingNumber}`);
    
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
      console.error("❌ Shipment not found with this tracking number");
      process.exit(1);
    }
    
    console.log(`Found shipment at address: ${shipmentAddress}`);
    
    // Connect to shipment contract
    const shipmentABI = [
      "function status() view returns (uint8)",
      "function getStatusDescription() view returns (string)",
      "function productAddress() view returns (address)",
      "function sender() view returns (address)",
      "function receiver() view returns (address)",
      "function transportMode() view returns (string)",
      "function trackingNumber() view returns (string)"
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
    
    const statuses = [
      'Not Shipped',
      'Preparing',
      'Shipped',
      'In Transit',
      'Delivered',
      'Cancelled',
      'Undeliverable',
      'Verified'
    ];
    
    console.log(`\nSHIPMENT DETAILS:`);
    console.log(`Tracking Number: ${await shipment.trackingNumber()}`);
    console.log(`Status: ${statuses[shipmentStatus]} (${statusDescription})`);
    console.log(`Transport Mode: ${await shipment.transportMode()}`);
    console.log(`Shipment Valid: ${isShipmentValid ? '✅ Yes' : '❌ No'}`);
    
    // Get product details
    const productAddress = await shipment.productAddress();
    console.log(`\nPRODUCT DETAILS:`);
    console.log(`Product Address: ${productAddress}`);
    
    const productABI = [
      "function name() view returns (string)",
      "function description() view returns (string)",
      "function currentStage() view returns (uint8)",
      "function verifyProduct() view returns (bool)"
    ];
    
    const product = new ethers.Contract(
      productAddress,
      productABI,
      provider
    );
    
    const productName = await product.name();
    const productDescription = await product.description();
    const productStage = await product.currentStage();
    const isProductValid = await product.verifyProduct();
    
    const stages = ['Farm', 'Processing', 'Distribution', 'Retail', 'Consumed'];
    
    console.log(`Name: ${productName}`);
    console.log(`Description: ${productDescription}`);
    console.log(`Stage: ${stages[productStage] || 'Unknown'} (${productStage})`);
    console.log(`Product Valid: ${isProductValid ? '✅ Yes' : '❌ No'}`);
    
    // Verify stakeholder registration
    const sender = await shipment.sender();
    const receiver = await shipment.receiver();
    
    console.log(`\nSTAKEHOLDER INFORMATION:`);
    console.log(`Sender: ${sender}`);
    console.log(`Receiver: ${receiver}`);
    
    // Check if they're registered
    const stakeholderCheckABI = [
      "function isRegisteredStakeholder(address _stakeholderAddress) view returns (bool)",
      "function getStakeholderRole(address _stakeholderAddress) view returns (uint8)"
    ];
    
    const stakeholderChecker = new ethers.Contract(
      registryAddress,  // Registry also has stakeholder checking functions
      stakeholderCheckABI,
      provider
    );
    
    try {
      const isSenderRegistered = await stakeholderChecker.isRegisteredStakeholder(sender);
      console.log(`Sender Registered: ${isSenderRegistered ? '✅ Yes' : '❌ No'}`);
      
      if (isSenderRegistered) {
        const senderRole = await stakeholderChecker.getStakeholderRole(sender);
        const roles = ['None', 'Farmer', 'Processor', 'Retailer', 'Distributor'];
        console.log(`Sender Role: ${roles[senderRole]} (${senderRole})`);
      }
      
      const isReceiverRegistered = await stakeholderChecker.isRegisteredStakeholder(receiver);
      console.log(`Receiver Registered: ${isReceiverRegistered ? '✅ Yes' : '❌ No'}`);
      
      if (isReceiverRegistered) {
        const receiverRole = await stakeholderChecker.getStakeholderRole(receiver);
        const roles = ['None', 'Farmer', 'Processor', 'Retailer', 'Distributor'];
        console.log(`Receiver Role: ${roles[receiverRole]} (${receiverRole})`);
      }
      
      // Check if receiver not being registered could be causing tracking issues
      if (!isReceiverRegistered) {
        console.log("\n⚠️  POTENTIAL ISSUE DETECTED: Receiver is not a registered stakeholder!");
        console.log("This may cause tracking problems. Register the receiver as a stakeholder to fix.");
      }
    } catch (err) {
      console.log(`Could not check stakeholder registration: ${err.message}`);
    }
    
    // Overall verification status
    const isFullyVerified = isShipmentValid && isProductValid;
    console.log(`\nOVERALL VERIFICATION STATUS: ${isFullyVerified ? '✅ VERIFIED' : '❌ NOT VERIFIED'}`);
    
    if (!isFullyVerified) {
      console.log("\nVERIFICATION ISSUES:");
      if (!isProductValid) console.log("- Product validation failed");
      if (!isShipmentValid) console.log("- Shipment status is invalid (cancelled or undeliverable)");
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
