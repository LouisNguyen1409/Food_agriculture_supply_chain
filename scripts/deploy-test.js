const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Deploying Supply Chain System with Contract Registry...\n");

    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

    // 1. Deploy Mock Oracle Feeds for Development
    console.log("📊 Deploying Mock Oracle Feeds...");
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    
    const temperatureFeed = await MockV3Aggregator.deploy(8, 2000); // 20.00°C
    await temperatureFeed.waitForDeployment();
    console.log(`✅ Temperature Feed deployed: ${await temperatureFeed.getAddress()}`);

    const humidityFeed = await MockV3Aggregator.deploy(8, 5000); // 50.00% humidity
    await humidityFeed.waitForDeployment();
    console.log(`✅ Humidity Feed deployed: ${await humidityFeed.getAddress()}`);

    const rainfallFeed = await MockV3Aggregator.deploy(8, 0); // 0.00mm rainfall
    await rainfallFeed.waitForDeployment();
    console.log(`✅ Rainfall Feed deployed: ${await rainfallFeed.getAddress()}`);

    const windSpeedFeed = await MockV3Aggregator.deploy(8, 1000); // 10.00 m/s wind
    await windSpeedFeed.waitForDeployment();
    console.log(`✅ Wind Speed Feed deployed: ${await windSpeedFeed.getAddress()}`);

    const priceFeed = await MockV3Aggregator.deploy(8, 500000); // $5000.00 commodity price
    await priceFeed.waitForDeployment();
    console.log(`✅ Price Feed deployed: ${await priceFeed.getAddress()}\n`);

    // 2. Deploy Contract Registry (Foundation)
    console.log("📋 Deploying ContractRegistry...");
    const ContractRegistry = await ethers.getContractFactory("ContractRegistry");
    const contractRegistry = await ContractRegistry.deploy();
    await contractRegistry.waitForDeployment();
    console.log(`✅ ContractRegistry deployed to: ${await contractRegistry.getAddress()}\n`);

    // 3. Deploy Supply Chain Factory with Oracle Feeds
    console.log("🏭 Deploying SupplyChainFactory with Oracle Integration...");
    const SupplyChainFactory = await ethers.getContractFactory("SupplyChainFactory");
    const supplyChainFactory = await SupplyChainFactory.deploy(
        await contractRegistry.getAddress(),
        await temperatureFeed.getAddress(),
        await humidityFeed.getAddress(),
        await rainfallFeed.getAddress(),
        await windSpeedFeed.getAddress(),
        await priceFeed.getAddress()
    );
    await supplyChainFactory.waitForDeployment();
    console.log(`✅ SupplyChainFactory deployed to: ${await supplyChainFactory.getAddress()}\n`);

    // 4. Authorize factory in registry
    console.log("🔐 Authorizing factory in registry...");
    await contractRegistry.addAuthorizedDeployer(await supplyChainFactory.getAddress());
    console.log("✅ Factory authorized\n");

    // 5. Deploy Factory Registry Helper
    console.log("🛠️ Deploying FactoryRegistry...");
    const FactoryRegistry = await ethers.getContractFactory("FactoryRegistry");
    const factoryRegistry = await FactoryRegistry.deploy(await contractRegistry.getAddress());
    await factoryRegistry.waitForDeployment();
    console.log(`✅ FactoryRegistry deployed to: ${await factoryRegistry.getAddress()}\n`);

    // 6. Authorize FactoryRegistry as deployer
    console.log("🔐 Authorizing FactoryRegistry in ContractRegistry...");
    await contractRegistry.addAuthorizedDeployer(await factoryRegistry.getAddress());
    console.log("✅ FactoryRegistry authorized\n");

    // 7. Register factories
    console.log("📝 Registering factories...");
    await factoryRegistry.registerFactory(
        await supplyChainFactory.getAddress(),
        "SupplyChainFactory",
        "Main supply chain system factory"
    );
    console.log("✅ Factories registered\n");

    // 7. Deploy Supply Chain Client
    console.log("📱 Deploying SupplyChainClient...");
    const SupplyChainClient = await ethers.getContractFactory("SupplyChainClient");
    const supplyChainClient = await SupplyChainClient.deploy(await contractRegistry.getAddress());
    await supplyChainClient.waitForDeployment();
    console.log(`✅ SupplyChainClient deployed to: ${await supplyChainClient.getAddress()}\n`);

    // 8. Create a test supply chain system
    console.log("🌾 Creating test supply chain system...");
    const tx = await supplyChainFactory.createSupplyChainSystem("Test Organic Farm System");
    const receipt = await tx.wait();
    
    // Extract system ID from events
    const event = receipt.logs.find(log => {
        try {
            const parsed = supplyChainFactory.interface.parseLog(log);
            return parsed && parsed.name === 'SystemCreated';
        } catch {
            return false;
        }
    });
    
    const systemId = supplyChainFactory.interface.parseLog(event).args.systemId;
    console.log(`✅ Supply chain system created with ID: ${systemId}\n`);

    // 9. Display system contract addresses
    console.log("📊 System Contract Addresses:");
    const stakeholderRegistry = await contractRegistry.getSystemContract(systemId, "StakeholderRegistry");
    const productRegistry = await contractRegistry.getSystemContract(systemId, "ProductRegistry");
    const shipmentRegistry = await contractRegistry.getSystemContract(systemId, "ShipmentRegistry");
    const supplyChainManager = await contractRegistry.getSystemContract(systemId, "SupplyChainManager");
    const publicVerification = await contractRegistry.getSystemContract(systemId, "PublicVerification");

    console.log(`  StakeholderRegistry: ${stakeholderRegistry}`);
    console.log(`  ProductRegistry:     ${productRegistry}`);
    console.log(`  ShipmentRegistry:    ${shipmentRegistry}`);
    console.log(`  SupplyChainManager:  ${supplyChainManager}`);
    console.log(`  PublicVerification:  ${publicVerification}\n`);

    // 10. Test client integration
    console.log("🔍 Testing client integration...");
    const supportsVerification = await supplyChainClient.systemSupportsVerification(systemId);
    console.log(`✅ System supports verification: ${supportsVerification}\n`);

    // 11. Display summary
    console.log("🎉 Deployment Complete! Summary:");
    console.log("=====================================");
    console.log(`ContractRegistry:    ${await contractRegistry.getAddress()}`);
    console.log(`SupplyChainFactory:  ${await supplyChainFactory.getAddress()}`);
    console.log(`FactoryRegistry:     ${await factoryRegistry.getAddress()}`);
    console.log(`SupplyChainClient:   ${await supplyChainClient.getAddress()}`);
    console.log(`Test System ID:      ${systemId}`);
    console.log("=====================================\n");

    console.log("🔧 Next Steps:");
    console.log("1. Register stakeholders in StakeholderRegistry");
    console.log("2. Create products in ProductRegistry");
    console.log("3. Create shipments in ShipmentRegistry");
    console.log("4. Use SupplyChainClient for verification");
    console.log("\n✨ Your supply chain system is ready for use!");

    return {
        contractRegistry: await contractRegistry.getAddress(),
        supplyChainFactory: await supplyChainFactory.getAddress(),
        factoryRegistry: await factoryRegistry.getAddress(),
        supplyChainClient: await supplyChainClient.getAddress(),
        systemId: systemId,
        systemContracts: {
            stakeholderRegistry,
            productRegistry,
            shipmentRegistry,
            supplyChainManager,
            publicVerification
        }
    };
}

// Run deployment
main()
    .then((result) => {
        console.log("\n🎯 Deployment Result:", result);
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }); 