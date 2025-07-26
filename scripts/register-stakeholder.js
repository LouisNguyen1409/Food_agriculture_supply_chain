const { ethers } = require("ethers");

async function main() {
  // Connect to local Hardhat network
  const provider = new ethers.JsonRpcProvider("http://localhost:8545");
  
  // Use the default account from hardhat
  const signer = await provider.getSigner(0);
  const address = await signer.getAddress();
  
  console.log(`Registering address ${address} as a farmer...`);
  
  // StakeholderManager contract with actual address from deployments
  const stakeholderManagerAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
  
  // In the contract, StakeholderRole enum is defined as:
  // enum StakeholderRole { NONE(0), FARMER(1), PROCESSOR(2), RETAILER(3), DISTRIBUTOR(4) }
  const FARMER_ROLE = 1; // FARMER is 1, not 0!
  
  // ABI with the correct function signatures
  const stakeholderManagerABI = [
    "function registerStakeholder(address _stakeholderAddress, uint8 _role, string memory _businessName, string memory _businessLicense, string memory _location, string memory _certifications) returns (bool)",
    "function hasRole(address _stakeholderAddress, uint8 _role) view returns (bool)"
  ];
  
  const stakeholderManager = new ethers.Contract(
    stakeholderManagerAddress,
    stakeholderManagerABI,
    signer
  );
  
  try {
    console.log(`Checking if address ${address} is already registered as a farmer (role ${FARMER_ROLE})...`);
    
    // Check if already registered as a farmer
    const isAlreadyFarmer = await stakeholderManager.hasRole(address, FARMER_ROLE);
    if (isAlreadyFarmer) {
      console.log(`Address ${address} is already registered as a farmer.`);
      return;
    }
    
    console.log("Not registered yet, proceeding with registration...");
    
    // Register as a farmer
    const tx = await stakeholderManager.registerStakeholder(
      address,
      FARMER_ROLE,
      "Test Organic Farm", 
      "LICENSE123",
      "Sydney, Australia",
      "Organic Certified"
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    
    // Wait for transaction confirmation using ethers v6 syntax
    const receipt = await tx.wait();
    console.log(`✅ Successfully registered as a farmer! Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`You can now create products using your account: ${address}`);
    
  } catch (error) {
    console.error("Error registering as a farmer:", error);
    
    if (error.message.includes("execution reverted")) {
      console.log("\nPossible reasons for failure:");
      console.log("1. Only an admin can register stakeholders");
      console.log("2. Your Hardhat node might have restarted and lost deployment state");
      console.log("3. The business license may already be registered");
    }
  }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
