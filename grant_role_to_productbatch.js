const { ethers } = require("hardhat");

async function grantRoleToProductBatch() {
  console.log("Granting FARMER role to ProductBatch contract...");
  
  // Get the signer
  const [signer] = await ethers.getSigners();
  console.log("Admin account:", signer.address);
  
  // Get the ProductBatch contract
  const ProductBatch = await ethers.getContractFactory("ProductBatch");
  const productBatch = ProductBatch.attach("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853");
  
  // Your MetaMask address
  const metamaskAccount = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
  
  try {
    console.log("Checking current role in ProductBatch...");
    
    // Check current role
    const role = await productBatch.getRole(metamaskAccount);
    console.log("Current role in ProductBatch:", role);
    
    const isActive = await productBatch.isActive(metamaskAccount);
    console.log("Is active in ProductBatch:", isActive);
    
    const hasFarmer = await productBatch.hasRole(metamaskAccount, 1);
    console.log("Has farmer role in ProductBatch:", hasFarmer);
    
    if (!hasFarmer || !isActive) {
      console.log("Granting FARMER role to ProductBatch...");
      
      // Try to grant the role
      const tx = await productBatch.grantRole(metamaskAccount, 1);
      await tx.wait();
      console.log("✅ FARMER role granted to ProductBatch!");
      
      // Verify the role was granted
      const newRole = await productBatch.getRole(metamaskAccount);
      const newIsActive = await productBatch.isActive(metamaskAccount);
      const newHasFarmer = await productBatch.hasRole(metamaskAccount, 1);
      
      console.log("\n--- Verification ---");
      console.log("Role:", newRole);
      console.log("Is active:", newIsActive);
      console.log("Has farmer role:", newHasFarmer);
      
      if (newHasFarmer && newIsActive) {
        console.log("✅ Role verification successful!");
        console.log("You can now create batches!");
      } else {
        console.log("❌ Role verification failed!");
      }
      
    } else {
      console.log("✅ Already has FARMER role in ProductBatch!");
    }
    
  } catch (error) {
    console.error("❌ Failed to grant role:", error.message);
  }
}

grantRoleToProductBatch()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 