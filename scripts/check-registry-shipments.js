const { ethers } = require("ethers");

async function main() {
  // Connect to local Hardhat network
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  // Use account #0 as admin to check registry
  const accounts = await provider.listAccounts();
  const adminAddress = accounts[0].address;
  const signer = await provider.getSigner(adminAddress);
  console.log(`Using admin account: ${adminAddress}`);
  
  // Registry contract address - this is the address being used in Track.tsx
  const registryAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
  console.log(`Checking Registry at address: ${registryAddress}`);
  
  try {
    // Define a minimal Registry ABI with the functions we need
    const registryABI = [
      "function getAllShipments() view returns (address[])",
      "function findShipmentByTrackingNumber(string memory _trackingNumber) view returns (address)"
    ];
    
    // Connect to Registry contract
    const registry = new ethers.Contract(registryAddress, registryABI, signer);
    
    // Try to get all registered shipments
    try {
      console.log("Getting all registered shipments...");
      const shipments = await registry.getAllShipments();
      
      console.log(`Total registered shipments: ${shipments.length}`);
      
      if (shipments.length === 0) {
        console.log("No shipments found! You need to create a shipment first.");
      } else {
        console.log("\nShipment addresses:");
        for (let i = 0; i < shipments.length; i++) {
          console.log(`${i + 1}. ${shipments[i]}`);
        }
        
        // If we have shipments, let's try to get information about them
        if (shipments.length > 0) {
          const shipmentABI = [
            "function trackingNumber() view returns (string)",
            "function productAddress() view returns (address)",
            "function sender() view returns (address)",
            "function receiver() view returns (address)",
            "function status() view returns (uint8)"
          ];
          
          console.log("\nShipment Details:");
          for (let i = 0; i < Math.min(shipments.length, 5); i++) { // Limit to 5 shipments to avoid too much output
            try {
              const shipment = new ethers.Contract(shipments[i], shipmentABI, provider);
              const trackingNumber = await shipment.trackingNumber();
              const productAddress = await shipment.productAddress();
              const sender = await shipment.sender();
              const receiver = await shipment.receiver();
              const status = await shipment.status();
              
              console.log(`\nShipment #${i + 1}:`);
              console.log(`  Address: ${shipments[i]}`);
              console.log(`  Tracking Number: ${trackingNumber}`);
              console.log(`  Product: ${productAddress}`);
              console.log(`  Sender: ${sender}`);
              console.log(`  Receiver: ${receiver}`);
              console.log(`  Status: ${status}`);
              
              // Test finding by tracking number
              console.log(`\nTesting lookup by tracking number: ${trackingNumber}`);
              const foundAddress = await registry.findShipmentByTrackingNumber(trackingNumber);
              
              if (foundAddress === shipments[i]) {
                console.log(`✅ Lookup successful! Found shipment at ${foundAddress}`);
              } else {
                console.log(`❌ Lookup failed! Expected ${shipments[i]} but got ${foundAddress}`);
              }
            } catch (err) {
              console.log(`Error getting details for shipment ${shipments[i]}: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error calling getAllShipments: ${err.message}`);
      console.log("The Registry contract at this address might not have this function or it's not a Registry.");
    }
  } catch (err) {
    console.error(`Error connecting to Registry: ${err.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
