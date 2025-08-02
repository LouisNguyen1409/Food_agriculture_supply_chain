const { ethers } = require("hardhat");

async function testRoleChecking() {
  console.log("Testing role checking...");
  
  // Get the signer
  const [signer] = await ethers.getSigners();
  console.log("Testing with account:", signer.address);
  
  // Get the StakeholderManager contract
  const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
  const stakeholderManager = StakeholderManager.attach("0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
  
  try {
    // Test basic role functions
    console.log("\n--- Testing Role Functions ---");
    
    const role = await stakeholderManager.getRole(signer.address);
    console.log("Role:", role);
    
    const isActive = await stakeholderManager.isFullyActive(signer.address);
    console.log("Is fully active:", isActive);
    
    const hasFarmer = await stakeholderManager.hasRole(signer.address, 1);
    console.log("Has farmer role:", hasFarmer);
    
    // Test stakeholder info
    console.log("\n--- Testing Stakeholder Info ---");
    try {
      const stakeholderInfo = await stakeholderManager.getStakeholderInfo(signer.address);
      console.log("Stakeholder info:", stakeholderInfo);
    } catch (error) {
      console.log("getStakeholderInfo failed:", error.message);
    }
    
    // Test if we can grant the role
    console.log("\n--- Testing Role Grant ---");
    try {
      const tx = await stakeholderManager.grantRole(signer.address, 1);
      await tx.wait();
      console.log("Role granted successfully!");
      
      // Check again
      const newRole = await stakeholderManager.getRole(signer.address);
      const newIsActive = await stakeholderManager.isFullyActive(signer.address);
      const newHasFarmer = await stakeholderManager.hasRole(signer.address, 1);
      
      console.log("After granting:");
      console.log("Role:", newRole);
      console.log("Is fully active:", newIsActive);
      console.log("Has farmer role:", newHasFarmer);
      
    } catch (error) {
      console.log("Failed to grant role:", error.message);
    }
    
  } catch (error) {
    console.error("Error in role checking:", error);
  }
}

testRoleChecking()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 