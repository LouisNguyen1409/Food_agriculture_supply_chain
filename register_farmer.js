const { ethers } = require("hardhat");

async function registerFarmer() {
  console.log("Registering farmer...");
  
  // Get the signer
  const [signer] = await ethers.getSigners();
  console.log("Admin account:", signer.address);
  
  // Get the StakeholderManager contract
  const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
  const stakeholderManager = StakeholderManager.attach("0x5FC8d32690cc91D4c39d9d3abcBD16989F875707");
  
  // The account to register as farmer
  const targetAccount = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"; // Your MetaMask address
  
  try {
    console.log("Registering farmer:", targetAccount);
    
    // Try to register the stakeholder as a farmer
    const tx = await stakeholderManager.registerStakeholder(
      targetAccount,           // stakeholder address
      1,                      // FARMER role
      "Test Farmer",          // name
      "LIC123",              // licenseId
      "Sydney, Australia",    // location
      "Organic Certified"     // certification
    );
    
    await tx.wait();
    console.log("✅ Farmer registered successfully!");
    
    // Verify the registration
    const role = await stakeholderManager.getRole(targetAccount);
    const isActive = await stakeholderManager.isFullyActive(targetAccount);
    const hasFarmer = await stakeholderManager.hasRole(targetAccount, 1);
    
    console.log("\n--- Verification ---");
    console.log("Role:", role);
    console.log("Is fully active:", isActive);
    console.log("Has farmer role:", hasFarmer);
    
    if (hasFarmer && isActive) {
      console.log("✅ Registration verification successful!");
      console.log("You can now access the Farmer dashboard!");
    } else {
      console.log("❌ Registration verification failed!");
    }
    
  } catch (error) {
    console.error("❌ Failed to register farmer:", error.message);
    
    // Try alternative approach - submit registration request
    console.log("\n--- Trying registration request approach ---");
    try {
      const tx = await stakeholderManager.submitRegistrationRequest(
        1,                      // FARMER role
        "Test Farmer",          // name
        "LIC123",              // licenseId
        "Sydney, Australia",    // location
        "Organic Certified",    // certification
        "Farming business",     // businessDescription
        "farmer@test.com"      // contactEmail
      );
      
      await tx.wait();
      console.log("✅ Registration request submitted!");
      console.log("You may need to wait for admin approval or use the bypass button.");
      
    } catch (error2) {
      console.error("❌ Registration request also failed:", error2.message);
    }
  }
}

registerFarmer()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 