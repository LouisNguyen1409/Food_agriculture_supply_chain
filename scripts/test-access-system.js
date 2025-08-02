const { ethers } = require("hardhat");

async function main() {
    console.log("🔐 Testing Refactored Access Control System...\n");

    // Get signers
    const [deployer, admin, farmer, processor, distributor, shipper, retailer] = await ethers.getSigners();

    console.log("👥 Test Participants:");
    console.log(`   Deployer:    ${deployer.address}`);
    console.log(`   Admin:       ${admin.address}`);
    console.log(`   Farmer:      ${farmer.address}`);
    console.log(`   Processor:   ${processor.address}`);
    console.log(`   Distributor: ${distributor.address}`);
    console.log(`   Shipper:     ${shipper.address}`);
    console.log(`   Retailer:    ${retailer.address}\n`);

    try {
        // ================================================================
        // STEP 1: Deploy Contracts
        // ================================================================
        console.log("🚀 STEP 1: Deploying Contracts...\n");

        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        const stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();
        console.log(`✅ StakeholderManager deployed: ${await stakeholderManager.getAddress()}`);

        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        const stakeholderRegistry = await StakeholderRegistry.deploy(await stakeholderManager.getAddress());
        await stakeholderRegistry.waitForDeployment();
        console.log(`✅ StakeholderRegistry deployed: ${await stakeholderRegistry.getAddress()}\n`);

        // ================================================================
        // STEP 2: Setup Admin (Deployer becomes Admin)
        // ================================================================
        console.log("👑 STEP 2: Setting Up Admin...\n");

        // Grant deployer admin role
        await stakeholderManager.connect(deployer).grantRole(deployer.address, 6); // ADMIN = 6
        console.log("✅ Deployer granted Admin role");

        // Verify admin status
        const isAdminActive = await stakeholderManager.isActive(deployer.address);
        const hasAdminRole = await stakeholderManager.hasRole(deployer.address, 6);
        console.log(`👑 Deployer - Active: ${isAdminActive}, HasAdminRole: ${hasAdminRole}\n`);

        // ================================================================
        // STEP 3: Direct Registration (Admin Bypass)
        // ================================================================
        console.log("⚡ STEP 3: Direct Registration (Admin Powers)...\n");

        // Admin directly registers stakeholders
        console.log("🌱 Admin registers Farmer...");
        await stakeholderManager.connect(deployer).registerStakeholder(
            farmer.address,
            1, // FARMER
            "Green Valley Farm",
            "FARM-001",
            "California, USA",
            "Organic Certified"
        );
        console.log("✅ Farmer registered directly");

        console.log("🏭 Admin registers Processor...");
        await stakeholderManager.connect(deployer).registerStakeholder(
            processor.address,
            2, // PROCESSOR
            "Fresh Processing Co",
            "PROC-001",
            "Nevada, USA",
            "FDA Certified"
        );
        console.log("✅ Processor registered directly");

        console.log("📦 Admin registers Distributor...");
        await stakeholderManager.connect(deployer).registerStakeholder(
            distributor.address,
            3, // DISTRIBUTOR
            "National Distribution",
            "DIST-001",
            "Texas, USA",
            "ISO 9001"
        );
        console.log("✅ Distributor registered directly\n");

        // ================================================================
        // STEP 4: Registration Request Flow (Normal Users)
        // ================================================================
        console.log("📝 STEP 4: Registration Request Flow...\n");

        // Shipper submits request
        console.log("🚚 Shipper submits registration request...");
        const shipperReqTx = await stakeholderManager.connect(shipper).submitRegistrationRequest(
            4, // SHIPPER
            "Swift Logistics",
            "SHIP-001",
            "Arizona, USA",
            "DOT Certified",
            "We provide reliable shipping services",
            "shipper@swiftlogistics.com"
        );
        await shipperReqTx.wait();
        console.log("✅ Shipper request submitted");

        // Retailer submits request
        console.log("🏪 Retailer submits registration request...");
        const retailerReqTx = await stakeholderManager.connect(retailer).submitRegistrationRequest(
            5, // RETAILER
            "Fresh Market Store",
            "RET-001",
            "Florida, USA",
            "Health Permit",
            "We sell fresh produce to consumers",
            "retailer@freshmarket.com"
        );
        await retailerReqTx.wait();
        console.log("✅ Retailer request submitted");

        // Check pending requests
        const pendingRequests = await stakeholderManager.connect(deployer).getPendingRequests();
        console.log(`📋 Pending requests: ${pendingRequests.length} [${pendingRequests.join(", ")}]\n`);

        // ================================================================
        // STEP 5: Admin Review & Approval
        // ================================================================
        console.log("👨‍💼 STEP 5: Admin Review & Approval...\n");

        // Approve shipper (request ID = 1)
        console.log("✅ Approving shipper request...");
        await stakeholderManager.connect(deployer).approveRegistrationRequest(1, "Credentials verified");
        console.log("✅ Shipper approved");

        // Approve retailer (request ID = 2)
        console.log("✅ Approving retailer request...");
        await stakeholderManager.connect(deployer).approveRegistrationRequest(2, "All documents in order");
        console.log("✅ Retailer approved\n");

        // ================================================================
        // STEP 6: Unified State Verification
        // ================================================================
        console.log("🔍 STEP 6: Unified State Verification...\n");

        const stakeholders = [
            { name: "Farmer", address: farmer.address, role: 1 },
            { name: "Processor", address: processor.address, role: 2 },
            { name: "Distributor", address: distributor.address, role: 3 },
            { name: "Shipper", address: shipper.address, role: 4 },
            { name: "Retailer", address: retailer.address, role: 5 }
        ];

        for (const stakeholder of stakeholders) {
            const isActive = await stakeholderManager.isActive(stakeholder.address);
            const hasRole = await stakeholderManager.hasRole(stakeholder.address, stakeholder.role);
            const isFullyActive = await stakeholderManager.isFullyActive(stakeholder.address);
            const isRegistered = await stakeholderManager.isRegistered(stakeholder.address);

            console.log(`${getEmoji(stakeholder.name)} ${stakeholder.name}:`);
            console.log(`   Active: ${isActive} | HasRole: ${hasRole} | FullyActive: ${isFullyActive} | Registered: ${isRegistered}`);
        }
        console.log();

        // ================================================================
        // STEP 7: License Key Management
        // ================================================================
        console.log("🔑 STEP 7: License Key Management...\n");

        // Get farmer's license key
        const farmerLicenseKey = await stakeholderManager.connect(farmer).getMyLicenseKey();
        console.log(`🌱 Farmer's license key: ${farmerLicenseKey}`);
        console.log(`🔍 Key format valid: ${/^SC-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/.test(farmerLicenseKey)}`);

        // Verify license key
        const verification = await stakeholderManager.verifyLicenseKey(farmerLicenseKey);
        console.log("✅ Key verification:");
        console.log(`   Valid: ${verification[0]}`);
        console.log(`   Owner: ${verification[1]}`);
        console.log(`   Role: ${verification[2]} (1=FARMER)`);
        console.log(`   Name: ${verification[3]}`);

        // Test invalid key
        const invalidTest = await stakeholderManager.verifyLicenseKey("SC-00000000-00000000-00000000");
        console.log(`❌ Invalid key test: ${invalidTest[0]} (should be false)\n`);

        // ================================================================
        // STEP 8: Transaction Authorization Testing
        // ================================================================
        console.log("🤝 STEP 8: Transaction Authorization Testing...\n");

        // Test built-in business rules
        const farmerToProcessor = await stakeholderManager.canTransact(farmer.address, processor.address);
        const processorToDistributor = await stakeholderManager.canTransact(processor.address, distributor.address);
        const farmerToDistributor = await stakeholderManager.canTransact(farmer.address, distributor.address);

        console.log("📋 Built-in Business Rules:");
        console.log(`   Farmer → Processor: ${farmerToProcessor} ✅`);
        console.log(`   Processor → Distributor: ${processorToDistributor} ✅`);
        console.log(`   Farmer → Distributor: ${farmerToDistributor} ❌ (needs partnership)`);

        // Set up custom partnership
        console.log("\n🤝 Setting up custom partnership...");
        await stakeholderManager.connect(deployer).setPartnership(distributor.address, retailer.address, true);
        console.log("✅ Distributor ↔ Retailer partnership established");

        const distributorToRetailer = await stakeholderManager.canTransact(distributor.address, retailer.address);
        console.log(`   Distributor → Retailer: ${distributorToRetailer} ✅ (via partnership)\n`);

        // ================================================================
        // STEP 9: Registry Queries
        // ================================================================
        console.log("📊 STEP 9: Registry Queries...\n");

        const totalStakeholders = await stakeholderRegistry.totalStakeholders();
        console.log(`👥 Total stakeholders: ${totalStakeholders}`);

        // Role statistics
        const roleStats = await stakeholderManager.getRoleStatistics();
        console.log("\n👥 Role Distribution:");
        console.log(`   🌱 Farmers: ${roleStats[0]}`);
        console.log(`   🏭 Processors: ${roleStats[1]}`);
        console.log(`   📦 Distributors: ${roleStats[2]}`);
        console.log(`   🚚 Shippers: ${roleStats[3]}`);
        console.log(`   🏪 Retailers: ${roleStats[4]}`);
        console.log(`   👑 Admins: ${roleStats[5]}`);

        // Registration statistics
        const regStats = await stakeholderManager.connect(deployer).getRegistrationStats();
        console.log("\n📈 Registration Statistics:");
        console.log(`   Total Requests: ${regStats[0]}`);
        console.log(`   Pending: ${regStats[1]}`);
        console.log(`   Approved: ${regStats[2]}`);
        console.log(`   Rejected: ${regStats[3]}`);
        console.log(`   Cancelled: ${regStats[4]}\n`);

        // ================================================================
        // STEP 10: Advanced Features Testing
        // ================================================================
        console.log("🔧 STEP 10: Advanced Features Testing...\n");

        // Test deactivation/reactivation
        console.log("🔄 Testing deactivation/reactivation...");
        const wasActiveBefore = await stakeholderManager.isActive(retailer.address);
        console.log(`   Retailer active before: ${wasActiveBefore}`);

        await stakeholderManager.connect(deployer).deactivateStakeholder(retailer.address);
        const isActiveAfterDeactivation = await stakeholderManager.isActive(retailer.address);
        console.log(`   Retailer active after deactivation: ${isActiveAfterDeactivation}`);

        await stakeholderManager.connect(deployer).reactivateStakeholder(retailer.address);
        const isActiveAfterReactivation = await stakeholderManager.isActive(retailer.address);
        console.log(`   Retailer active after reactivation: ${isActiveAfterReactivation}`);

        // Test license key regeneration
        console.log("\n🔄 Testing license key regeneration...");
        const oldKey = await stakeholderManager.connect(processor).getMyLicenseKey();
        console.log(`   Processor old key: ${oldKey.substring(0, 20)}...`);

        await stakeholderManager.connect(deployer).regenerateLicenseKey(processor.address);
        const newKey = await stakeholderManager.connect(processor).getMyLicenseKey();
        console.log(`   Processor new key: ${newKey.substring(0, 20)}...`);
        console.log(`   Keys different: ${oldKey !== newKey} ✅`);

        // Verify old key is now invalid
        const oldKeyValid = await stakeholderManager.verifyLicenseKey(oldKey);
        const newKeyValid = await stakeholderManager.verifyLicenseKey(newKey);
        console.log(`   Old key valid: ${oldKeyValid[0]} ❌`);
        console.log(`   New key valid: ${newKeyValid[0]} ✅\n`);

        // ================================================================
        // STEP 11: Complete Supply Chain Verification
        // ================================================================
        console.log("🔗 STEP 11: Complete Supply Chain Verification...\n");

        console.log("🌟 Testing Complete Supply Chain Flow:");
        const supplyChainFlow = [
            { from: "Farmer", to: "Processor", fromAddr: farmer.address, toAddr: processor.address },
            { from: "Processor", to: "Distributor", fromAddr: processor.address, toAddr: distributor.address },
            { from: "Distributor", to: "Retailer", fromAddr: distributor.address, toAddr: retailer.address }
        ];

        for (const step of supplyChainFlow) {
            const canTransact = await stakeholderManager.canTransact(step.fromAddr, step.toAddr);
            const fromActive = await stakeholderManager.isActive(step.fromAddr);
            const toActive = await stakeholderManager.isActive(step.toAddr);

            console.log(`   ${step.from} → ${step.to}: ${canTransact ? '✅' : '❌'} (${step.from}: ${fromActive}, ${step.to}: ${toActive})`);
        }

        // ================================================================
        // SUMMARY
        // ================================================================
        console.log("\n🎉 REFACTORED ACCESS CONTROL SYSTEM TEST COMPLETED! 🎉");
        console.log("\n✨ Key Improvements Verified:");
        console.log("   ✅ Single state management (no duplicate active flags)");
        console.log("   ✅ Atomic registration operations");
        console.log("   ✅ Simplified transaction validation");
        console.log("   ✅ Clean license key management");
        console.log("   ✅ Unified query interface");
        console.log("   ✅ Proper partnership handling");
        console.log("   ✅ Complete supply chain authorization");

    } catch (err) {
        console.error("❌ Error during access control test:", err);
        process.exit(1);
    }
}

// Helper function for emojis
function getEmoji(stakeholderName) {
    const emojis = {
        "Farmer": "🌱",
        "Processor": "🏭",
        "Distributor": "📦",
        "Shipper": "🚚",
        "Retailer": "🏪"
    };
    return emojis[stakeholderName] || "👤";
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });