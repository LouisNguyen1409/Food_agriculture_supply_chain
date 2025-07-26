const { network, ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    log("\n🚀 Local Deployment: Food & Agriculture Supply Chain System (New Architecture)");
    log(`Deployer: ${deployer}\n`);

    // 1. Deploy StakeholderManager (Core stakeholder management)
    const stakeholderManager = await deploy("StakeholderManager", {
        from: deployer,
        args: [],
        log: true,
    });

    // 2. Deploy Registry (Updated to work with StakeholderManager)
    const registry = await deploy("Registry", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
    });

    // 3. Deploy StakeholderRegistry (Updated to work with StakeholderManager)
    const stakeholderRegistry = await deploy("StakeholderRegistry", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
    });

    // 4. Deploy StakeholderFactory (Updated to work with StakeholderManager)
    const stakeholderFactory = await deploy("StakeholderFactory", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
    });

    // 5. Deploy ProductFactory (with dummy oracle feed addresses for local)
    const zero = ethers.ZeroAddress;
    const productFactory = await deploy("ProductFactory", {
        from: deployer,
        args: [
            stakeholderRegistry.address,
            registry.address,
            zero, zero, zero, zero, zero // oracle feeds
        ],
        log: true,
    });

    // 6. Deploy ShipmentFactory
    const shipmentFactory = await deploy("ShipmentFactory", {
        from: deployer,
        args: [registry.address, stakeholderRegistry.address],
        log: true,
    });

    // 7. Deploy FileStorageManager (use deployer as oracle operator for local)
    const fileStorageManager = await deploy("FileStorageManager", {
        from: deployer,
        args: [stakeholderRegistry.address, deployer],
        log: true,
    });

    // 8. Register some example stakeholders for testing
    log("\n📝 Registering example stakeholders...");
    
    const StakeholderRole = {
        NONE: 0,
        FARMER: 1,
        PROCESSOR: 2,
        RETAILER: 3,
        DISTRIBUTOR: 4
    };

    // Get the deployed StakeholderManager contract
    const stakeholderManagerContract = await ethers.getContractAt("StakeholderManager", stakeholderManager.address);

    // Register example stakeholders
    const exampleStakeholders = [
        {
            address: "0x1234567890123456789012345678901234567890",
            role: StakeholderRole.FARMER,
            name: "Green Valley Farm",
            license: "FARM-001-2024",
            location: "California, USA",
            certifications: "Organic, Fair Trade"
        },
        {
            address: "0x2345678901234567890123456789012345678901", 
            role: StakeholderRole.PROCESSOR,
            name: "Fresh Process Co",
            license: "PROC-001-2024",
            location: "Texas, USA",
            certifications: "HACCP, FDA Approved"
        },
        {
            address: "0x3456789012345678901234567890123456789012",
            role: StakeholderRole.DISTRIBUTOR,
            name: "Global Logistics Ltd",
            license: "DIST-001-2024", 
            location: "New York, USA",
            certifications: "ISO 9001, Cold Chain Certified"
        }
    ];

    for (const stakeholder of exampleStakeholders) {
        try {
            await stakeholderManagerContract.registerStakeholder(
                stakeholder.address,
                stakeholder.role,
                stakeholder.name,
                stakeholder.license,
                stakeholder.location,
                stakeholder.certifications
            );
            log(`✅ Registered: ${stakeholder.name} (${stakeholder.address})`);
        } catch (error) {
            log(`❌ Failed to register ${stakeholder.name}: ${error.message}`);
        }
    }

    log("\n🎉 Deployment Completed Successfully!");
    log("=".repeat(70));
    log("📍 DEPLOYED CONTRACTS (New Architecture):");
    log(`StakeholderManager:   ${stakeholderManager.address}`);
    log(`Registry:             ${registry.address}`);
    log(`StakeholderRegistry:  ${stakeholderRegistry.address}`);
    log(`StakeholderFactory:   ${stakeholderFactory.address}`);
    log(`ProductFactory:       ${productFactory.address}`);
    log(`ShipmentFactory:      ${shipmentFactory.address}`);
    log(`FileStorageManager:   ${fileStorageManager.address}`);
    log("=".repeat(70));
    log("\n🔗 Contract Dependencies:");
    log(`Registry → StakeholderManager: ${stakeholderManager.address}`);
    log(`StakeholderRegistry → StakeholderManager: ${stakeholderManager.address}`);
    log(`StakeholderFactory → StakeholderManager: ${stakeholderManager.address}`);
    log("=".repeat(70));
};

module.exports.tags = ["local", "clean", "new-architecture"];
