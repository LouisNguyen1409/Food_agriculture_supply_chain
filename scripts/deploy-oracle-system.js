const { ethers, network } = require("hardhat");

async function main() {
    console.log("🌤️ Deploying Oracle-Enhanced Supply Chain System...\n");
    console.log(`Network: ${network.name} (Chain ID: ${network.config.chainId})`);

    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} MATIC\n`);

    // Determine which oracle feeds to use based on network
    const isMainnet = network.config.chainId === 137;
    const isAmoyTestnet = network.config.chainId === 80002;
    const isLocal = network.name === "hardhat" || network.name === "localhost";

    let CHAINLINK_FEEDS;
    
    if (isMainnet) {
        // Polygon Mainnet Chainlink feeds
        CHAINLINK_FEEDS = {
            ETH_USD: "0xF9680D99D6C9589e2a93a78A04A279e509205945", // ETH/USD
            MATIC_USD: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0", // MATIC/USD
            // Note: Weather data feeds need to be sourced from specialized providers
            // For production, integrate with weather APIs like WeatherAPI, OpenWeatherMap
            TEMP_MOCK: ethers.ZeroAddress, // Deploy mock for demo
            HUMIDITY_MOCK: ethers.ZeroAddress,
            RAINFALL_MOCK: ethers.ZeroAddress,
            WIND_MOCK: ethers.ZeroAddress
        };
    } else if (isAmoyTestnet) {
        // Polygon Amoy Testnet feeds (limited availability)
        CHAINLINK_FEEDS = {
            ETH_USD: "0x001382149eBa3441043c1c66972b4772963f5D43", // ETH/USD on Amoy
            MATIC_USD: ethers.ZeroAddress, // Not available on Amoy, use mock
            TEMP_MOCK: ethers.ZeroAddress, // Deploy mock feeds
            HUMIDITY_MOCK: ethers.ZeroAddress,
            RAINFALL_MOCK: ethers.ZeroAddress,
            WIND_MOCK: ethers.ZeroAddress
        };
    } else {
        // Local development - all mocks
        CHAINLINK_FEEDS = {
            ETH_USD: ethers.ZeroAddress,
            MATIC_USD: ethers.ZeroAddress,
            TEMP_MOCK: ethers.ZeroAddress,
            HUMIDITY_MOCK: ethers.ZeroAddress,
            RAINFALL_MOCK: ethers.ZeroAddress,
            WIND_MOCK: ethers.ZeroAddress
        };
    }

    console.log(`Using ${isMainnet ? 'MAINNET' : isAmoyTestnet ? 'TESTNET' : 'LOCAL'} oracle configuration\n`);

    // 1. Deploy Mock Oracle Feeds for Development
    console.log("📊 Deploying Mock Oracle Feeds...");
    
    // Deploy MockV3Aggregator for development
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    
    const temperatureFeed = await MockV3Aggregator.deploy(
        8, // 8 decimals
        2000 // 20.00°C * 100 (initial temperature)
    );
    await temperatureFeed.waitForDeployment();
    console.log(`✅ Temperature Feed deployed: ${await temperatureFeed.getAddress()}`);

    const humidityFeed = await MockV3Aggregator.deploy(
        8, // 8 decimals  
        5000 // 50.00% humidity
    );
    await humidityFeed.waitForDeployment();
    console.log(`✅ Humidity Feed deployed: ${await humidityFeed.getAddress()}`);

    const rainfallFeed = await MockV3Aggregator.deploy(
        8, // 8 decimals
        0 // 0.00mm rainfall
    );
    await rainfallFeed.waitForDeployment();
    console.log(`✅ Rainfall Feed deployed: ${await rainfallFeed.getAddress()}`);

    const windSpeedFeed = await MockV3Aggregator.deploy(
        8, // 8 decimals
        1500 // 15.00 km/h wind speed
    );
    await windSpeedFeed.waitForDeployment();
    console.log(`✅ Wind Speed Feed deployed: ${await windSpeedFeed.getAddress()}`);

    // Use real price feed if available, otherwise deploy mock
    let priceFeedAddress;
    if (CHAINLINK_FEEDS.ETH_USD !== ethers.ZeroAddress) {
        priceFeedAddress = CHAINLINK_FEEDS.ETH_USD;
        console.log(`✅ Using Chainlink ETH/USD Feed: ${priceFeedAddress}`);
    } else {
        const priceFeed = await MockV3Aggregator.deploy(
            8, // 8 decimals
            200000000000 // $2000.00 USD per ETH
        );
        await priceFeed.waitForDeployment();
        priceFeedAddress = await priceFeed.getAddress();
        console.log(`✅ Mock Price Feed deployed: ${priceFeedAddress}`);
    }
    console.log();

    // 2. Deploy Oracle Manager
    console.log("🎛️ Deploying Oracle Manager...");
    const OracleManager = await ethers.getContractFactory("OracleManager");
    const oracleManager = await OracleManager.deploy(
        await temperatureFeed.getAddress(),
        await humidityFeed.getAddress(),
        await rainfallFeed.getAddress(),
        await windSpeedFeed.getAddress(),
        priceFeedAddress
    );
    await oracleManager.waitForDeployment();
    console.log(`✅ Oracle Manager deployed: ${await oracleManager.getAddress()}\n`);

    // 3. Deploy Contract Registry
    console.log("📋 Deploying Contract Registry...");
    const ContractRegistry = await ethers.getContractFactory("ContractRegistry");
    const contractRegistry = await ContractRegistry.deploy();
    await contractRegistry.waitForDeployment();
    console.log(`✅ Contract Registry deployed: ${await contractRegistry.getAddress()}\n`);

    // 4. Deploy Stakeholder Registry
    console.log("👥 Deploying Stakeholder Registry...");
    const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
    const stakeholderRegistry = await StakeholderRegistry.deploy();
    await stakeholderRegistry.waitForDeployment();
    console.log(`✅ Stakeholder Registry deployed: ${await stakeholderRegistry.getAddress()}\n`);

    // 5. Deploy Oracle-Enhanced Product Registry
    console.log("🌾 Deploying Oracle-Enhanced Product Registry...");
    const OracleProductRegistry = await ethers.getContractFactory("OracleProductRegistry");
    const oracleProductRegistry = await OracleProductRegistry.deploy(
        await stakeholderRegistry.getAddress(),
        await temperatureFeed.getAddress(),
        await humidityFeed.getAddress(),
        await rainfallFeed.getAddress(),
        await windSpeedFeed.getAddress(),
        priceFeedAddress
    );
    await oracleProductRegistry.waitForDeployment();
    console.log(`✅ Oracle Product Registry deployed: ${await oracleProductRegistry.getAddress()}\n`);

    // 6. Deploy Supply Chain Client (with oracle support)
    console.log("📱 Deploying Supply Chain Client...");
    const SupplyChainClient = await ethers.getContractFactory("SupplyChainClient");
    const supplyChainClient = await SupplyChainClient.deploy(await contractRegistry.getAddress());
    await supplyChainClient.waitForDeployment();
    console.log(`✅ Supply Chain Client deployed: ${await supplyChainClient.getAddress()}\n`);

    // 7. Setup Oracle Authorization
    console.log("🔐 Setting up Oracle Authorization...");
    await oracleManager.authorizeContract(await oracleProductRegistry.getAddress(), true);
    await oracleManager.authorizeContract(await supplyChainClient.getAddress(), true);
    console.log("✅ Oracle contracts authorized\n");

    // 8. Setup Sample Locations
    console.log("🌍 Setting up sample locations...");
    
    // Iowa corn farm
    await oracleManager.setOracleFeeds(
        "Iowa_USA",
        await temperatureFeed.getAddress(),
        await humidityFeed.getAddress(),
        await rainfallFeed.getAddress(),
        await windSpeedFeed.getAddress(),
        priceFeedAddress,
        "Iowa Corn Belt Weather Station"
    );

    // California produce farm
    await oracleManager.setOracleFeeds(
        "California_USA",
        await temperatureFeed.getAddress(),
        await humidityFeed.getAddress(),
        await rainfallFeed.getAddress(),
        await windSpeedFeed.getAddress(),
        priceFeedAddress,
        "California Central Valley Weather Station"
    );

    console.log("✅ Sample locations configured\n");

    // 9. Register Sample Stakeholders
    console.log("👨‍🌾 Registering sample stakeholders...");
    
    // Get additional accounts
    const accounts = await ethers.getSigners();
    const farmer = accounts[1];
    const processor = accounts[2];
    const distributor = accounts[3];
    const retailer = accounts[4];

    await stakeholderRegistry.registerStakeholder(
        farmer.address,
        0, // FARMER
        "Green Valley Farms",
        "FARM-001",
        "Iowa, USA",
        "Organic Certified"
    );

    await stakeholderRegistry.registerStakeholder(
        processor.address,
        1, // PROCESSOR
        "Fresh Processing Co",
        "PROC-001",
        "California, USA",
        "FDA Approved"
    );

    await stakeholderRegistry.registerStakeholder(
        distributor.address,
        3, // DISTRIBUTOR
        "Global Distribution Inc",
        "DIST-001",
        "Texas, USA",
        "Cold Chain Certified"
    );

    await stakeholderRegistry.registerStakeholder(
        retailer.address,
        2, // RETAILER
        "SuperMart Chain",
        "RETAIL-001",
        "New York, USA",
        "Food Safety Certified"
    );

    console.log("✅ Sample stakeholders registered\n");

    // 10. Test Oracle Integration
    console.log("🧪 Testing Oracle Integration...");
    
    // Create sample product with oracle data
    const tx = await oracleProductRegistry.connect(farmer).registerProduct(
        "Premium Organic Corn",
        "BATCH-ORG-001",
        "Grown using sustainable farming practices in Iowa",
        "Iowa_USA"
    );
    await tx.wait();
    console.log("✅ Sample product created with oracle data");

    // Get current market conditions
    const conditions = await oracleManager.getMarketConditions("Iowa_USA");
    console.log(`📊 Current Market Conditions:
    Temperature: ${Number(conditions.weather.temperature) / 100}°C
    Humidity: ${Number(conditions.weather.humidity) / 100}%
    Price: $${Number(conditions.currentPrice) / 100000000}
    Weather Status: ${conditions.weatherStatus}
    Price Status: ${conditions.priceStatus}`);

    // Check farming conditions
    const isSuitable = await oracleManager.isFarmingConditionsSuitable(
        "Iowa_USA",
        1500, // 15°C min
        2500, // 25°C max
        4000, // 40% min humidity
        6000, // 60% max humidity
        5000  // 50mm max rainfall
    );
    console.log(`🌱 Farming conditions suitable: ${isSuitable}\n`);

    // 11. Simulate Weather Changes
    console.log("🌦️ Simulating weather changes...");
    
    // Update temperature (simulate hot weather)
    await temperatureFeed.updateAnswer(3000); // 30°C
    console.log("Updated temperature to 30°C");

    // Update rainfall (simulate heavy rain)
    await rainfallFeed.updateAnswer(8000); // 80mm
    console.log("Updated rainfall to 80mm");

    // Check conditions again
    const newConditions = await oracleManager.getMarketConditions("Iowa_USA");
    console.log(`📊 Updated Conditions:
    Temperature: ${Number(newConditions.weather.temperature) / 100}°C
    Rainfall: ${Number(newConditions.weather.rainfall) / 100}mm
    Weather Status: ${newConditions.weatherStatus}\n`);

    // 12. Summary
    console.log("🎉 Oracle-Enhanced Supply Chain System Deployed!");
    console.log("=".repeat(60));
    console.log("Contract Addresses:");
    console.log(`Oracle Manager:        ${await oracleManager.getAddress()}`);
    console.log(`Contract Registry:     ${await contractRegistry.getAddress()}`);
    console.log(`Stakeholder Registry:  ${await stakeholderRegistry.getAddress()}`);
    console.log(`Oracle Product Registry: ${await oracleProductRegistry.getAddress()}`);
    console.log(`Supply Chain Client:   ${await supplyChainClient.getAddress()}`);
    console.log("\nOracle Feeds:");
    console.log(`Temperature Feed:      ${await temperatureFeed.getAddress()}`);
    console.log(`Humidity Feed:         ${await humidityFeed.getAddress()}`);
    console.log(`Rainfall Feed:         ${await rainfallFeed.getAddress()}`);
    console.log(`Wind Speed Feed:       ${await windSpeedFeed.getAddress()}`);
    console.log(`Price Feed:            ${priceFeedAddress} ${CHAINLINK_FEEDS.ETH_USD !== ethers.ZeroAddress ? '(Chainlink)' : '(Mock)'}`);
    
    if (isMainnet) {
        console.log("\n🔴 MAINNET DEPLOYMENT NOTES:");
        console.log("• Using real Chainlink price feeds");
        console.log("• Weather feeds are mocks - integrate with real weather APIs for production");
        console.log("• Consider implementing timelocks and governance for upgrades");
    } else if (isAmoyTestnet) {
        console.log("\n🟡 TESTNET DEPLOYMENT NOTES:");
        console.log("• Mix of real and mock feeds - perfect for testing");
        console.log("• Get test MATIC from https://faucet.polygon.technology/");
    }
    
    console.log("\n🚀 Ready for oracle-enhanced supply chain operations!");

    // Return deployed contracts for testing
    return {
        oracleManager,
        contractRegistry,
        stakeholderRegistry,
        oracleProductRegistry,
        supplyChainClient,
        temperatureFeed,
        humidityFeed,
        rainfallFeed,
        windSpeedFeed,
        priceFeedAddress,
        network: network.name,
        chainId: network.config.chainId,
        accounts: { deployer, farmer, processor, distributor, retailer }
    };
}

// Execute if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Deployment failed:", error);
            process.exit(1);
        });
}

module.exports = main; 