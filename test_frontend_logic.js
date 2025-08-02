const { ethers } = require("hardhat");

async function testFrontendLogic() {
  console.log("Testing frontend logic...");
  
  // Get the signer
  const [signer] = await ethers.getSigners();
  console.log("Testing with account:", signer.address);
  
  // Get the StakeholderManager contract (same as frontend)
  const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
  const stakeholderManager = StakeholderManager.attach("0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
  
  // Your MetaMask address
  const metamaskAccount = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
  
  try {
    console.log("\n--- Testing Frontend Logic ---");
    console.log("Account:", metamaskAccount);
    
    // Test the exact same calls as frontend
    const role = await stakeholderManager.getRole(metamaskAccount);
    console.log("getRole result:", role);
    
    const isActive = await stakeholderManager.isFullyActive(metamaskAccount);
    console.log("isFullyActive result:", isActive);
    
    const hasFarmer = await stakeholderManager.hasRole(metamaskAccount, 1);
    console.log("hasRole(account, 1) result:", hasFarmer);
    
    // Test alternative function
    const isActiveAlt = await stakeholderManager.isActive(metamaskAccount);
    console.log("isActive result:", isActiveAlt);
    
    console.log("\n--- Frontend State Variables ---");
    console.log("userRole:", Number(role));
    console.log("isUserActive:", isActive);
    console.log("hasFarmerRole:", hasFarmer);
    
    // Simulate frontend logic
    if (hasFarmer && isActive) {
      console.log("✅ Frontend should show dashboard");
    } else {
      console.log("❌ Frontend should show role status page");
    }
    
  } catch (error) {
    console.error("Error in frontend logic test:", error);
  }
}

testFrontendLogic()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 