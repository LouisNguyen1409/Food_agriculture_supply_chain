const { ethers } = require("hardhat");

async function main() {
    console.log("🔐 Registration & Approval Demo with License Keys Starting...\n");

    // Get signers
    const [deployer, admin, farmer1, farmer2, processor1] = await ethers.getSigners();

    console.log("👥 Participants:");
    console.log(`   Admin:      ${admin.address}`);
    console.log(`   Farmer 1:   ${farmer1.address}`);
    console.log(`   Farmer 2:   ${farmer2.address}`);
    console.log(`   Processor:  ${processor1.address}`);
    console.log();

    // Deploy minimal system for demo
    console.log("🚀 Deploying contracts for demo...");

    const AccessControl = await ethers.getContractFactory("AccessControl");
    const accessControl = await AccessControl.deploy();
    await accessControl.waitForDeployment();

    const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
    const stakeholderManager = await StakeholderManager.deploy();
    await stakeholderManager.waitForDeployment();

    console.log(`✅ AccessControl: ${await accessControl.getAddress()}`);
    console.log(`✅ StakeholderManager: ${await stakeholderManager.getAddress()}`);
    console.log();

    // Connect contracts with different signers
    const adminManager = stakeholderManager.connect(admin);
    const farmer1Manager = stakeholderManager.connect(farmer1);
    const farmer2Manager = stakeholderManager.connect(farmer2);
    const processor1Manager = stakeholderManager.connect(processor1);

    try {
        // ===================================================================
        // STEP 1: User Self-Registration Requests
        // ===================================================================
        console.log("📝 STEP 1: Users Submit Registration Requests\n");

        // Farmer 1 submits registration request
        console.log("🌱 Farmer 1 submitting registration request...");
        const farmer1RequestTx = await farmer1Manager.submitRegistrationRequest(
            1, // Role.FARMER
            "Green Valley Farm",
            "FARM-001",
            "California, USA",
            "Organic Certification",
            "We specialize in organic tomatoes and vegetables",
            "contact@greenvalley.com"
        );
        const farmer1Receipt = await farmer1RequestTx.wait();
        const farmer1RequestId = farmer1Receipt.logs[0].args[0];
        console.log(`✅ Request submitted with ID: ${farmer1RequestId}`);

        // Farmer 2 submits registration request
        console.log("\n🌱 Farmer 2 submitting registration request...");
        const farmer2RequestTx = await farmer2Manager.submitRegistrationRequest(
            1, // Role.FARMER
            "Sunrise Agriculture",
            "FARM-002",
            "Oregon, USA",
            "Organic Certification",
            "We grow organic fruits and grains",
            "info@sunriseag.com"
        );
        const farmer2Receipt = await farmer2RequestTx.wait();
        const farmer2RequestId = farmer2Receipt.logs[0].args[0];
        console.log(`✅ Request submitted with ID: ${farmer2RequestId}`);

        // Processor submits registration request
        console.log("\n🏭 Processor submitting registration request...");
        const processor1RequestTx = await processor1Manager.submitRegistrationRequest(
            2, // Role.PROCESSOR
            "Fresh Processing Co",
            "PROC-001",
            "Nevada, USA",
            "FDA Certified",
            "We process organic produce for distribution",
            "admin@freshprocessing.com"
        );
        const processor1Receipt = await processor1RequestTx.wait();
        const processor1RequestId = processor1Receipt.logs[0].args[0];
        console.log(`✅ Request submitted with ID: ${processor1RequestId}`);

        // ===================================================================
        // STEP 2: Admin Reviews Pending Requests
        // ===================================================================
        console.log("\n👀 STEP 2: Admin Reviews Pending Requests\n");

        // Get all pending requests
        console.log("📋 Getting pending requests...");
        const pendingRequests = await adminManager.getPendingRequests();
        console.log(`📊 Found ${pendingRequests.length} pending requests: [${pendingRequests.join(', ')}]`);

        // Review each request
        for (let i = 0; i < pendingRequests.length; i++) {
            const requestId = pendingRequests[i];
            console.log(`\n🔍 Reviewing request ${requestId}...`);

            const requestDetails = await adminManager.getRegistrationRequest(requestId);
            console.log(`   Applicant: ${requestDetails[0]}`);
            console.log(`   Role: ${requestDetails[1]} (${_getRoleName(requestDetails[1])})`);
            console.log(`   Name: ${requestDetails[2]}`);
            console.log(`   License: ${requestDetails[3]}`);
            console.log(`   Location: ${requestDetails[4]}`);
            console.log(`   Business: ${requestDetails[6]}`);
            console.log(`   Email: ${requestDetails[7]}`);
        }

        // ===================================================================
        // STEP 3: Admin Approves/Rejects Requests & License Keys Generated
        // ===================================================================
        console.log("\n✅ STEP 3: Admin Makes Approval Decisions & License Keys Generated\n");

        // Approve Farmer 1
        console.log(`🟢 Approving Farmer 1 (Request ${farmer1RequestId})...`);
        const farmer1ApprovalTx = await adminManager.approveRegistrationRequest(
            farmer1RequestId,
            "Application approved. All documentation verified."
        );
        const farmer1ApprovalReceipt = await farmer1ApprovalTx.wait();

        // Extract license key from events
        const farmer1LicenseKeyEvent = farmer1ApprovalReceipt.logs.find(
            log => log.fragment && log.fragment.name === "LicenseKeyGenerated"
        );
        const farmer1LicenseKey = farmer1LicenseKeyEvent ? farmer1LicenseKeyEvent.args[1] : "Not found";

        console.log("✅ Farmer 1 approved and registered!");
        console.log(`🔑 License Key Generated: ${farmer1LicenseKey}`);

        // Approve Processor
        console.log(`\n🟢 Approving Processor (Request ${processor1RequestId})...`);
        const processor1ApprovalTx = await adminManager.approveRegistrationRequest(
            processor1RequestId,
            "FDA certification verified. Approved for processing operations."
        );
        const processor1ApprovalReceipt = await processor1ApprovalTx.wait();

        // Extract license key from events
        const processor1LicenseKeyEvent = processor1ApprovalReceipt.logs.find(
            log => log.fragment && log.fragment.name === "LicenseKeyGenerated"
        );
        const processor1LicenseKey = processor1LicenseKeyEvent ? processor1LicenseKeyEvent.args[1] : "Not found";

        console.log("✅ Processor approved and registered!");
        console.log(`🔑 License Key Generated: ${processor1LicenseKey}`);

        // Reject Farmer 2 (for demo purposes)
        console.log(`\n🔴 Rejecting Farmer 2 (Request ${farmer2RequestId})...`);
        await adminManager.rejectRegistrationRequest(
            farmer2RequestId,
            "Incomplete documentation. Please resubmit with organic certification details."
        );
        console.log("❌ Farmer 2 request rejected.");

        // ===================================================================
        // STEP 4: Users Retrieve Their License Keys
        // ===================================================================
        console.log("\n🔑 STEP 4: Users Retrieve Their License Keys\n");

        // Farmer 1 gets their license key
        console.log("🌱 Farmer 1 retrieving license key...");
        const farmer1RetrievedKey = await farmer1Manager.getMyLicenseKey();
        console.log(`✅ Farmer 1 License Key: ${farmer1RetrievedKey}`);

        // Processor gets their license key
        console.log("\n🏭 Processor retrieving license key...");
        const processor1RetrievedKey = await processor1Manager.getMyLicenseKey();
        console.log(`✅ Processor License Key: ${processor1RetrievedKey}`);

        // Farmer 2 tries to get license key (should fail)
        console.log("\n🌱 Farmer 2 trying to retrieve license key...");
        try {
            await farmer2Manager.getMyLicenseKey();
            console.log("❌ This should not happen!");
        } catch (error) {
            console.log("❌ Expected error: Not a registered stakeholder");
        }

        // ===================================================================
        // STEP 5: License Key Verification (Public Function)
        // ===================================================================
        console.log("\n🔍 STEP 5: License Key Verification\n");

        // Verify Farmer 1's license key
        console.log(`🔍 Verifying Farmer 1's license key: ${farmer1RetrievedKey}`);
        const farmer1Verification = await stakeholderManager.verifyLicenseKey(farmer1RetrievedKey);
        console.log(`   Valid: ${farmer1Verification[0]}`);
        console.log(`   Address: ${farmer1Verification[1]}`);
        console.log(`   Role: ${_getRoleName(farmer1Verification[2])}`);
        console.log(`   Name: ${farmer1Verification[3]}`);
        console.log(`   Registered: ${new Date(Number(farmer1Verification[4]) * 1000).toLocaleString()}`);

        // Verify Processor's license key
        console.log(`\n🔍 Verifying Processor's license key: ${processor1RetrievedKey}`);
        const processor1Verification = await stakeholderManager.verifyLicenseKey(processor1RetrievedKey);
        console.log(`   Valid: ${processor1Verification[0]}`);
        console.log(`   Address: ${processor1Verification[1]}`);
        console.log(`   Role: ${_getRoleName(processor1Verification[2])}`);
        console.log(`   Name: ${processor1Verification[3]}`);
        console.log(`   Registered: ${new Date(Number(processor1Verification[4]) * 1000).toLocaleString()}`);

        // Try to verify a fake license key
        console.log(`\n🔍 Verifying fake license key: SC-1234-5678-9999`);
        const fakeVerification = await stakeholderManager.verifyLicenseKey("SC-1234-5678-9999");
        console.log(`   Valid: ${fakeVerification[0]}`);
        console.log(`   Address: ${fakeVerification[1]}`);

        // ===================================================================
        // STEP 6: Get Complete Stakeholder Information
        // ===================================================================
        console.log("\n📋 STEP 6: Complete Stakeholder Information\n");

        // Farmer 1 gets complete info
        console.log("🌱 Farmer 1 complete information:");
        const farmer1CompleteInfo = await farmer1Manager.getCompleteStakeholderInfo(farmer1.address);
        console.log(`   Name: ${farmer1CompleteInfo[1]}`);
        console.log(`   Role: ${_getRoleName(farmer1CompleteInfo[0])}`);
        console.log(`   Location: ${farmer1CompleteInfo[3]}`);
        console.log(`   License Key: ${farmer1CompleteInfo[7]}`);
        console.log(`   Key Generated: ${new Date(Number(farmer1CompleteInfo[8]) * 1000).toLocaleString()}`);

        // Admin gets processor's complete info
        console.log("\n🏭 Admin accessing processor's complete information:");
        const processor1CompleteInfo = await adminManager.getCompleteStakeholderInfo(processor1.address);
        console.log(`   Name: ${processor1CompleteInfo[1]}`);
        console.log(`   Role: ${_getRoleName(processor1CompleteInfo[0])}`);
        console.log(`   Location: ${processor1CompleteInfo[3]}`);
        console.log(`   License Key: ${processor1CompleteInfo[7]}`);
        console.log(`   Key Generated: ${new Date(Number(processor1CompleteInfo[8]) * 1000).toLocaleString()}`);

        // ===================================================================
        // STEP 7: Farmer 2 Resubmits and Gets License Key
        // ===================================================================
        console.log("\n🔄 STEP 7: Farmer 2 Resubmits and Gets License Key\n");

        console.log("🌱 Farmer 2 submitting improved application...");
        const farmer2NewRequestTx = await farmer2Manager.submitRegistrationRequest(
            1, // Role.FARMER
            "Sunrise Agriculture",
            "FARM-002-UPDATED",
            "Oregon, USA",
            "USDA Organic Certification #OR-12345",
            "We grow certified organic fruits and grains with full USDA documentation",
            "info@sunriseag.com"
        );
        const farmer2NewReceipt = await farmer2NewRequestTx.wait();
        const farmer2NewRequestId = farmer2NewReceipt.logs[0].args[0];
        console.log(`✅ New request submitted with ID: ${farmer2NewRequestId}`);

        // Admin approves the new request
        console.log(`\n🟢 Admin reviewing and approving new request ${farmer2NewRequestId}...`);
        const farmer2NewApprovalTx = await adminManager.approveRegistrationRequest(
            farmer2NewRequestId,
            "Updated documentation approved. USDA certification verified."
        );
        const farmer2NewApprovalReceipt = await farmer2NewApprovalTx.wait();

        // Extract license key from events
        const farmer2LicenseKeyEvent = farmer2NewApprovalReceipt.logs.find(
            log => log.fragment && log.fragment.name === "LicenseKeyGenerated"
        );
        const farmer2LicenseKey = farmer2LicenseKeyEvent ? farmer2LicenseKeyEvent.args[1] : "Not found";

        console.log("✅ Farmer 2 approved and registered!");
        console.log(`🔑 License Key Generated: ${farmer2LicenseKey}`);

        // Farmer 2 retrieves their license key
        console.log("\n🌱 Farmer 2 retrieving their new license key...");
        const farmer2RetrievedKey = await farmer2Manager.getMyLicenseKey();
        console.log(`✅ Farmer 2 License Key: ${farmer2RetrievedKey}`);

        // ===================================================================
        // STEP 8: License Key Management Demo
        // ===================================================================
        console.log("\n🔧 STEP 8: License Key Management Demo\n");

        // Admin regenerates license key for Farmer 1
        console.log("🔄 Admin regenerating license key for Farmer 1...");
        const newFarmer1Key = await adminManager.regenerateLicenseKey(farmer1.address);
        console.log(`✅ New License Key Generated: ${newFarmer1Key}`);

        // Verify old key is no longer valid
        console.log(`\n🔍 Verifying old license key: ${farmer1RetrievedKey}`);
        const oldKeyVerification = await stakeholderManager.verifyLicenseKey(farmer1RetrievedKey);
        console.log(`   Valid: ${oldKeyVerification[0]} (should be false)`);

        // Verify new key is valid
        console.log(`\n🔍 Verifying new license key: ${newFarmer1Key}`);
        const newKeyVerification = await stakeholderManager.verifyLicenseKey(newFarmer1Key);
        console.log(`   Valid: ${newKeyVerification[0]} (should be true)`);
        console.log(`   Address: ${newKeyVerification[1]}`);
        console.log(`   Name: ${newKeyVerification[3]}`);

        // ===================================================================
        // STEP 9: Final System Status with License Keys
        // ===================================================================
        console.log("\n🎯 STEP 9: Final System Status with License Keys\n");

        const finalStats = await adminManager.getRegistrationStats();
        console.log("📊 Final Registration Statistics:");
        console.log(`   Total Requests: ${finalStats[0]}`);
        console.log(`   Pending: ${finalStats[1]}`);
        console.log(`   Approved: ${finalStats[2]}`);
        console.log(`   Rejected: ${finalStats[3]}`);
        console.log(`   Cancelled: ${finalStats[4]}`);

        console.log("\n🔑 All Registered Stakeholders with License Keys:");
        const allStakeholders = await adminManager.getAllStakeholders();
        for (const addr of allStakeholders) {
            const info = await adminManager.getStakeholderInfo(addr);
            const licenseKey = await adminManager.getLicenseKey(addr);
            console.log(`   ${addr}:`);
            console.log(`     Name: ${info[1]}`);
            console.log(`     Role: ${_getRoleName(info[0])}`);
            console.log(`     License Key: ${licenseKey}`);
            console.log(`     Registered: ${new Date(Number(info[6]) * 1000).toLocaleString()}`);
            console.log();
        }

        console.log("🎉 Registration with License Keys Demo Completed Successfully! 🎉");

        // ===================================================================
        // STEP 10: Usage Examples for External Integration
        // ===================================================================
        console.log("\n💡 STEP 10: Usage Examples for External Integration\n");

        console.log("📝 Example Usage Scenarios:");
        console.log("1. API Authentication: Users can use license keys to authenticate with external APIs");
        console.log("2. QR Code Generation: License keys can be embedded in QR codes for quick verification");
        console.log("3. Mobile App Integration: License keys serve as credentials for mobile applications");
        console.log("4. Third-party Verification: External systems can verify stakeholder status using license keys");
        console.log("5. Compliance Reporting: License keys provide auditable proof of registration");
        console.log("\n✨ License Key Format: SC-XXXX-XXXX-XXXX (Supply Chain + Unique Identifier)");

    } catch (error) {
        console.error("\n❌ Demo failed:", error.message);
        throw error;
    }
}

// Helper functions
function _getRoleName(roleNumber) {
    const roles = ["NONE", "FARMER", "PROCESSOR", "DISTRIBUTOR", "SHIPPER", "RETAILER", "ADMIN"];
    return roles[roleNumber] || "UNKNOWN";
}

function _getStatusName(statusNumber) {
    const statuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
    return statuses[statusNumber] || "UNKNOWN";
}

// Execute the demo
if (require.main === module) {
    main()
        .then(() => {
            console.log("\n✨ Registration with License Keys demo completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Registration demo failed:", error);
            process.exit(1);
        });
}

module.exports = main;