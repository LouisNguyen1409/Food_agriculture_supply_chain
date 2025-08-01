const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // Setup provider
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  // Get the first account for signing transactions
  const accounts = await provider.listAccounts();
  const signerAddress = accounts[0].address;
  const signer = await provider.getSigner(signerAddress);
  
  console.log(`Using account: ${signerAddress}`);

  // Read Registry ABI
  const registryAbi = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/src/SmartContracts/Registry.sol/Registry.json")
    )
  ).abi;

  // Using the contract address from the frontend code
  const publicVerificationAddress = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
  const registryAddress = publicVerificationAddress; // We'll try this address first
  
  console.log(`Registry contract address: ${registryAddress}`);
  
  // Connect to Registry contract
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  
  // Check for shipments
  const allShipments = await registry.getAllShipments();
  console.log(`\nTotal registered shipments: ${allShipments.length}`);
  
  if (allShipments.length === 0) {
    console.log("No shipments found in the registry.");
    return;
  }

  console.log("\n===== Shipment Addresses =====");
  for (let i = 0; i < allShipments.length; i++) {
    console.log(`${i + 1}: ${allShipments[i]}`);
  }

  // Get PublicVerification contract to check tracking numbers
  const publicVerificationAbi = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/src/SmartContracts/PublicVerification.sol/PublicVerification.json")
    )
  ).abi;
  
  console.log(`\nPublicVerification contract address: ${publicVerificationAddress}`);
  
  try {
    const publicVerification = new ethers.Contract(
      publicVerificationAddress, 
      publicVerificationAbi, 
      signer
    );
    
    // Verify if this is indeed the PublicVerification contract by calling a method
    try {
      const stakeholderRegistry = await publicVerification.stakeholderRegistry();
      console.log(`PublicVerification.stakeholderRegistry: ${stakeholderRegistry}`);
    } catch (err) {
      console.log(`Error verifying PublicVerification contract: ${err.message}`);
      console.log("This might not be the PublicVerification contract address.");
    }
  } catch (err) {
    console.log(`Error connecting to PublicVerification: ${err.message}`);
  }

  // Check shipment details from each address
  console.log("\n===== Shipment Details =====");
  for (let i = 0; i < allShipments.length; i++) {
    const shipmentAddress = allShipments[i];
    
    // Connect to Shipment contract
    const shipmentAbi = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../artifacts/src/SmartContracts/Shipment.sol/Shipment.json")
      )
    ).abi;
    
    const shipment = new ethers.Contract(
      shipmentAddress,
      shipmentAbi,
      provider
    );

    try {
      // Get shipment info
      const trackingNumber = await shipment.trackingNumber();
      const sender = await shipment.sender();
      const receiver = await shipment.receiver();
      const productAddress = await shipment.productAddress();
      const status = await shipment.status();
      const transportMode = await shipment.transportMode();
      
      console.log(`\nShipment #${i + 1}:`);
      console.log(`  Address: ${shipmentAddress}`);
      console.log(`  Tracking Number: ${trackingNumber}`);
      console.log(`  Product Address: ${productAddress}`);
      console.log(`  Sender: ${sender}`);
      console.log(`  Receiver: ${receiver}`);
      console.log(`  Status: ${status}`);
      console.log(`  Transport Mode: ${transportMode}`);
      
      // Check if sender is registered as DISTRIBUTOR
      const senderRole = await registry.getStakeholderRole(sender);
      console.log(`  Sender Role: ${senderRole} (3=DISTRIBUTOR)`);
      
      // Check if receiver is a registered stakeholder
      const isReceiverRegistered = await registry.isRegisteredStakeholder(receiver);
      console.log(`  Receiver Registered: ${isReceiverRegistered}`);
      
      if (isReceiverRegistered) {
        const receiverRole = await registry.getStakeholderRole(receiver);
        console.log(`  Receiver Role: ${receiverRole}`);
      } else {
        console.log("  WARNING: Receiver is not a registered stakeholder!");
      }
    } catch (err) {
      console.log(`\nError getting details for shipment ${shipmentAddress}: ${err.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
