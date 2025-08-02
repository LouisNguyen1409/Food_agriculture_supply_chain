const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Starting Complete Supply Chain System Deployment...\n");

    // Get deployment account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

    // Store contract addresses for reference
    const deployedContracts = {};

    try {
        // =====================================================
        // Phase 1: Deploy Oracle Contracts (if needed)
        // =====================================================
        console.log("📡 Phase 1: Deploying Oracle Contracts...");

        console.log("Deploying Weather Oracle...");
        const Weather = await ethers.getContractFactory("Weather");
        const weatherOracle = await Weather.deploy();
        await weatherOracle.waitForDeployment();
        deployedContracts.Weather = await weatherOracle.getAddress();
        console.log("✅ Weather Oracle deployed to:", deployedContracts.Weather);

        console.log("Deploying Price Oracle...");
        const Price = await ethers.getContractFactory("Price");
        const priceOracle = await Price.deploy();
        await priceOracle.waitForDeployment();
        deployedContracts.Price = await priceOracle.getAddress();
        console.log("✅ Price Oracle deployed to:", deployedContracts.Price);

        // =====================================================
        // Phase 2: Deploy Access Control & Stakeholder Management
        // =====================================================
        console.log("\n🔐 Phase 2: Deploying Access Control & Stakeholder Management...");

        console.log("Deploying AccessControl...");
        const AccessControl = await ethers.getContractFactory("AccessControl");
        const accessControl = await AccessControl.deploy();
        await accessControl.waitForDeployment();
        deployedContracts.AccessControl = await accessControl.getAddress();
        console.log("✅ AccessControl deployed to:", deployedContracts.AccessControl);

        console.log("Deploying StakeholderManager...");
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        const stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();
        deployedContracts.StakeholderManager = await stakeholderManager.getAddress();
        console.log("✅ StakeholderManager deployed to:", deployedContracts.StakeholderManager);

        console.log("Deploying StakeholderRegistry...");
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        const stakeholderRegistry = await StakeholderRegistry.deploy(deployedContracts.StakeholderManager);
        await stakeholderRegistry.waitForDeployment();
        deployedContracts.StakeholderRegistry = await stakeholderRegistry.getAddress();
        console.log("✅ StakeholderRegistry deployed to:", deployedContracts.StakeholderRegistry);

        // =====================================================
        // Phase 3: Deploy Core Business Logic Contracts
        // =====================================================
        console.log("\n📦 Phase 3: Deploying Core Business Logic Contracts...");

        console.log("Deploying ProductBatch...");
        const ProductBatch = await ethers.getContractFactory("ProductBatch");
        const productBatch = await ProductBatch.deploy(
            deployedContracts.Weather,
            deployedContracts.Price
        );
        await productBatch.waitForDeployment();
        deployedContracts.ProductBatch = await productBatch.getAddress();
        console.log("✅ ProductBatch deployed to:", deployedContracts.ProductBatch);

        console.log("Deploying OfferManager...");
        const OfferManager = await ethers.getContractFactory("OfferManager");
        const offerManager = await OfferManager.deploy(deployedContracts.ProductBatch);
        await offerManager.waitForDeployment();
        deployedContracts.OfferManager = await offerManager.getAddress();
        console.log("✅ OfferManager deployed to:", deployedContracts.OfferManager);

        console.log("Deploying ShipmentTracker...");
        const ShipmentTracker = await ethers.getContractFactory("ShipmentTracker");
        const shipmentTracker = await ShipmentTracker.deploy(deployedContracts.ProductBatch);
        await shipmentTracker.waitForDeployment();
        deployedContracts.ShipmentTracker = await shipmentTracker.getAddress();
        console.log("✅ ShipmentTracker deployed to:", deployedContracts.ShipmentTracker);

        console.log("Deploying Registry...");
        const Registry = await ethers.getContractFactory("Registry");
        const registry = await Registry.deploy();
        await registry.waitForDeployment();
        deployedContracts.Registry = await registry.getAddress();
        console.log("✅ Registry deployed to:", deployedContracts.Registry);

        // =====================================================
        // Phase 4: Deploy Verification & Public Interface
        // =====================================================
        console.log("\n🔍 Phase 4: Deploying Verification & Public Interface...");

        console.log("Deploying ProvenanceTracker...");
        const ProvenanceTracker = await ethers.getContractFactory("ProvenanceTracker");
        const provenanceTracker = await ProvenanceTracker.deploy();
        await provenanceTracker.waitForDeployment();
        deployedContracts.ProvenanceTracker = await provenanceTracker.getAddress();
        console.log("✅ ProvenanceTracker deployed to:", deployedContracts.ProvenanceTracker);

        console.log("Deploying PublicVerification...");
        const PublicVerification = await ethers.getContractFactory("PublicVerification");
        const publicVerification = await PublicVerification.deploy(
            deployedContracts.ProductBatch,
            deployedContracts.ProvenanceTracker,
            deployedContracts.Registry,
            deployedContracts.StakeholderRegistry
        );
        await publicVerification.waitForDeployment();
        deployedContracts.PublicVerification = await publicVerification.getAddress();
        console.log("✅ PublicVerification deployed to:", deployedContracts.PublicVerification);

        console.log("Deploying QRCodeVerifier...");
        const QRCodeVerifier = await ethers.getContractFactory("QRCodeVerifier");
        const qrCodeVerifier = await QRCodeVerifier.deploy(deployedContracts.PublicVerification);
        await qrCodeVerifier.waitForDeployment();
        deployedContracts.QRCodeVerifier = await qrCodeVerifier.getAddress();
        console.log("✅ QRCodeVerifier deployed to:", deployedContracts.QRCodeVerifier);

        // =====================================================
        // Phase 5: Deploy Storage & File Management
        // =====================================================
        console.log("\n💾 Phase 5: Deploying Storage & File Management...");

        console.log("Deploying FileStorageManager...");
        const FileStorageManager = await ethers.getContractFactory("FileStorageManager");
        const fileStorageManager = await FileStorageManager.deploy();
        await fileStorageManager.waitForDeployment();
        deployedContracts.FileStorageManager = await fileStorageManager.getAddress();
        console.log("✅ FileStorageManager deployed to:", deployedContracts.FileStorageManager);

        // =====================================================
        // Phase 6: Setup Initial Configuration
        // =====================================================
        console.log("\n⚙️  Phase 6: Setting up Initial Configuration...");

        // Register some sample stakeholders
        console.log("Registering sample stakeholders...");

        // Create sample addresses (in production, these would be real addresses)
        const sampleAddresses = {
            farmer1: ethers.Wallet.createRandom().address,
            farmer2: ethers.Wallet.createRandom().address,
            processor1: ethers.Wallet.createRandom().address,
            distributor1: ethers.Wallet.createRandom().address,
            shipper1: ethers.Wallet.createRandom().address,
            retailer1: ethers.Wallet.createRandom().address
        };

        // Register farmers
        await stakeholderManager.registerStakeholder(
            sampleAddresses.farmer1,
            1, // Role.FARMER
            "Green Valley Farm",
            "FARM-001",
            "California, USA",
            "Organic Certification"
        );
        console.log("✅ Registered farmer: Green Valley Farm");

        await stakeholderManager.registerStakeholder(
            sampleAddresses.farmer2,
            1, // Role.FARMER
            "Sunrise Agriculture",
            "FARM-002",
            "Oregon, USA",
            "Organic Certification"
        );
        console.log("✅ Registered farmer: Sunrise Agriculture");

        // Register processor
        await stakeholderManager.registerStakeholder(
            sampleAddresses.processor1,
            2, // Role.PROCESSOR
            "Fresh Processing Co",
            "PROC-001",
            "Nevada, USA",
            "FDA Certified"
        );
        console.log("✅ Registered processor: Fresh Processing Co");

        // Register distributor
        await stakeholderManager.registerStakeholder(
            sampleAddresses.distributor1,
            3, // Role.DISTRIBUTOR
            "National Distribution",
            "DIST-001",
            "Texas, USA",
            "ISO 9001"
        );
        console.log("✅ Registered distributor: National Distribution");

        // Register shipper
        await stakeholderManager.registerStakeholder(
            sampleAddresses.shipper1,
            4, // Role.SHIPPER
            "Swift Logistics",
            "SHIP-001",
            "Arizona, USA",
            "DOT Certified"
        );
        console.log("✅ Registered shipper: Swift Logistics");

        // Register retailer
        await stakeholderManager.registerStakeholder(
            sampleAddresses.retailer1,
            5, // Role.RETAILER
            "Fresh Market Chain",
            "RET-001",
            "California, USA",
            "Retail License"
        );
        console.log("✅ Registered retailer: Fresh Market Chain");

        // Setup file storage oracle authorization
        console.log("Setting up FileStorageManager oracle authorization...");
        await fileStorageManager.setOracleOperator(deployer.address, true);
        console.log("✅ Deployer authorized as file storage oracle");

        // =====================================================
        // Phase 7: Save Deployment Information
        // =====================================================
        console.log("\n💾 Phase 7: Saving Deployment Information...");

        const deploymentInfo = {
            network: await ethers.provider.getNetwork(),
            deployer: deployer.address,
            deployedAt: new Date().toISOString(),
            contracts: deployedContracts,
            sampleAddresses: sampleAddresses,
            gasUsed: {
                // This would be calculated from transaction receipts in production
                estimated: "~15-20M gas total"
            }
        };

        // Save to file
        const fs = require('fs');
        const path = require('path');

        const deploymentDir = path.join(__dirname, '../deployments');
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }

        const deploymentFile = path.join(deploymentDir, `supply-chain-${Date.now()}.json`);
        fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
        console.log("✅ Deployment info saved to:", deploymentFile);

        // =====================================================
        // Phase 8: Deployment Summary
        // =====================================================
        console.log("\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉\n");
        console.log("=".repeat(70));
        console.log("📋 DEPLOYMENT SUMMARY");
        console.log("=".repeat(70));

        console.log("\n🔗 CONTRACT ADDRESSES:");
        Object.entries(deployedContracts).forEach(([name, address]) => {
            console.log(`   ${name.padEnd(25)} : ${address}`);
        });

        console.log("\n👥 SAMPLE STAKEHOLDERS:");
        Object.entries(sampleAddresses).forEach(([role, address]) => {
            console.log(`   ${role.padEnd(25)} : ${address}`);
        });

        console.log("\n🚀 NEXT STEPS:");
        console.log("   1. Test the system using deploy/04-test-deployment.js");
        console.log("   2. Run demo scenario using deploy/05-demo-scenario.js");
        console.log("   3. Set up off-chain services for file storage");
        console.log("   4. Configure oracle data feeds");
        console.log("   5. Deploy to testnet for integration testing");

        console.log("\n📚 KEY FEATURES DEPLOYED:");
        console.log("   ✅ Complete role-based access control");
        console.log("   ✅ End-to-end supply chain tracking");
        console.log("   ✅ Offer/accept pattern for transactions");
        console.log("   ✅ Real-time shipment tracking");
        console.log("   ✅ Immutable provenance using Merkle trees");
        console.log("   ✅ Public verification interface");
        console.log("   ✅ QR code generation and scanning");
        console.log("   ✅ File storage management (S3/IPFS)");
        console.log("   ✅ Weather and price oracle integration");
        console.log("   ✅ Global registry and analytics");

        console.log("\n" + "=".repeat(70));

        return deploymentInfo;

    } catch (error) {
        console.error("\n❌ DEPLOYMENT FAILED!");
        console.error("Error:", error.message);
        if (error.transaction) {
            console.error("Transaction hash:", error.transaction);
        }
        throw error;
    }
}

// Helper function to wait for confirmations
async function waitForConfirmations(tx, confirmations = 1) {
    console.log(`   ⏳ Waiting for ${confirmations} confirmation(s)...`);
    await tx.wait(confirmations);
    console.log(`   ✅ Confirmed!`);
}

// Execute deployment
if (require.main === module) {
    main()
        .then((deploymentInfo) => {
            console.log("\n✨ Deployment script completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Deployment script failed:", error);
            process.exit(1);
        });
}

module.exports = main;