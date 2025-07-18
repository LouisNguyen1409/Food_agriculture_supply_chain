const { ethers } = require("hardhat");

/**
 * Oracle-Enhanced Supply Chain Examples
 * This script demonstrates real-world use cases of oracle integration
 */

async function main() {
    console.log("🌤️ Oracle-Enhanced Supply Chain Examples\n");
    console.log("This script demonstrates how oracle data enhances supply chain operations:\n");

    // Deploy the oracle system first
    const deployOracleSystem = require("./deploy-oracle-system");
    const contracts = await deployOracleSystem();
    
    const {
        oracleManager,
        oracleProductRegistry,
        temperatureFeed,
        humidityFeed,
        rainfallFeed,
        priceFeed,
        accounts
    } = contracts;

    const { farmer, processor, distributor, retailer } = accounts;

    console.log("✅ Oracle system deployed successfully!\n");
    console.log("=" * 60);

    // EXAMPLE 1: Weather-Based Farming Decisions
    await example1WeatherBasedFarming(oracleManager, oracleProductRegistry, farmer, temperatureFeed, humidityFeed, rainfallFeed);
    
    // EXAMPLE 2: Price-Based Harvest Timing
    await example2PriceBasedHarvesting(oracleManager, oracleProductRegistry, farmer, priceFeed);
    
    // EXAMPLE 3: Weather-Triggered Supply Chain Adjustments
    await example3WeatherTriggeredAdjustments(oracleManager, oracleProductRegistry, farmer, processor, temperatureFeed, rainfallFeed);
    
    // EXAMPLE 4: Dynamic Pricing Based on Market Conditions
    await example4DynamicPricing(oracleManager, oracleProductRegistry, farmer, retailer, priceFeed);
    
    // EXAMPLE 5: Quality Prediction Based on Environmental Data
    await example5QualityPrediction(oracleManager, oracleProductRegistry, farmer, temperatureFeed, humidityFeed);

    console.log("\n🎉 All examples completed successfully!");
    console.log("The oracle integration provides real-time insights for:");
    console.log("- Weather-based farming decisions");
    console.log("- Optimal harvest timing");
    console.log("- Supply chain risk management");
    console.log("- Dynamic pricing strategies");
    console.log("- Quality prediction and control");
}

async function example1WeatherBasedFarming(oracleManager, oracleProductRegistry, farmer, temperatureFeed, humidityFeed, rainfallFeed) {
    console.log("\n🌱 EXAMPLE 1: Weather-Based Farming Decisions");
    console.log("-".repeat(50));
    
    // Scenario: Farmer wants to decide if it's a good time to plant
    console.log("Scenario: Farmer checking if conditions are suitable for planting...\n");

    // Check current conditions
    const currentConditions = await oracleManager.getMarketConditions("Iowa_USA");
    console.log(`Current Weather:
    🌡️  Temperature: ${Number(currentConditions.weather.temperature) / 100}°C
    💧 Humidity: ${Number(currentConditions.weather.humidity) / 100}%
    🌧️  Rainfall: ${Number(currentConditions.weather.rainfall) / 100}mm
    Status: ${currentConditions.weatherStatus}`);

    // Check if suitable for farming
    const isSuitable = await oracleManager.isFarmingConditionsSuitable(
        "Iowa_USA",
        1500, // 15°C min
        2500, // 25°C max  
        4000, // 40% min humidity
        6000, // 60% max humidity
        5000  // 50mm max rainfall
    );

    if (isSuitable) {
        console.log("✅ CONDITIONS OPTIMAL: Proceed with planting!");
        
        // Create product with good conditions
        const tx = await oracleProductRegistry.connect(farmer).registerProduct(
            "Spring Wheat Crop",
            "SPRING-WHEAT-001",
            "Planted under optimal weather conditions",
            "Iowa_USA"
        );
        await tx.wait();
        console.log("🌾 Product registered with favorable weather data");
    } else {
        console.log("⚠️  CONDITIONS SUBOPTIMAL: Consider delaying planting");
        
        // Simulate weather improvement
        console.log("\n🔄 Simulating weather improvement...");
        await temperatureFeed.updateAnswer(2000); // 20°C - optimal
        await humidityFeed.updateAnswer(5000); // 50% - optimal
        await rainfallFeed.updateAnswer(2000); // 20mm - light rain
        
        const improvedConditions = await oracleManager.getMarketConditions("Iowa_USA");
        console.log(`Improved Weather:
        🌡️  Temperature: ${Number(improvedConditions.weather.temperature) / 100}°C
        💧 Humidity: ${Number(improvedConditions.weather.humidity) / 100}%
        🌧️  Rainfall: ${Number(improvedConditions.weather.rainfall) / 100}mm
        Status: ${improvedConditions.weatherStatus}`);
        
        const nowSuitable = await oracleManager.isFarmingConditionsSuitable(
            "Iowa_USA", 1500, 2500, 4000, 6000, 5000
        );
        
        if (nowSuitable) {
            console.log("✅ Conditions now optimal! Planting can proceed.");
        }
    }
}

async function example2PriceBasedHarvesting(oracleManager, oracleProductRegistry, farmer, priceFeed) {
    console.log("\n💰 EXAMPLE 2: Price-Based Harvest Timing");
    console.log("-".repeat(50));
    
    console.log("Scenario: Farmer deciding optimal harvest time based on market prices...\n");

    // Get current price
    const currentPrice = await oracleManager.getCurrentPrice("Iowa_USA");
    console.log(`Current Market Price: $${Number(currentPrice) / 100000000} per unit`);

    // Simulate price tracking over time
    const priceHistory = [];
    const prices = [180000000000, 190000000000, 200000000000, 220000000000, 210000000000]; // Simulated price changes
    
    console.log("\n📊 Tracking price changes over time:");
    for (let i = 0; i < prices.length; i++) {
        await priceFeed.updateAnswer(prices[i]);
        const conditions = await oracleManager.getMarketConditions("Iowa_USA");
        priceHistory.push({
            day: i + 1,
            price: Number(conditions.currentPrice) / 100000000,
            status: conditions.priceStatus
        });
        
        console.log(`Day ${i + 1}: $${priceHistory[i].price} (${priceHistory[i].status})`);
    }

    // Decision logic
    const peakPrice = Math.max(...priceHistory.map(p => p.price));
    const currentDayPrice = priceHistory[priceHistory.length - 1].price;
    
    console.log(`\n📈 Analysis:
    Peak Price: $${peakPrice}
    Current Price: $${currentDayPrice}
    Recommendation: ${currentDayPrice >= peakPrice * 0.95 ? "HARVEST NOW" : "WAIT FOR BETTER PRICES"}`);

    if (currentDayPrice >= peakPrice * 0.95) {
        console.log("✅ Optimal price reached! Harvesting...");
        
        const tx = await oracleProductRegistry.connect(farmer).registerProduct(
            "Premium Harvest Corn",
            "HARVEST-PEAK-001",
            `Harvested at peak market price of $${currentDayPrice}`,
            "Iowa_USA"
        );
        await tx.wait();
        console.log("🌽 Product harvested and registered at optimal price point");
    }
}

async function example3WeatherTriggeredAdjustments(oracleManager, oracleProductRegistry, farmer, processor, temperatureFeed, rainfallFeed) {
    console.log("\n⛈️  EXAMPLE 3: Weather-Triggered Supply Chain Adjustments");
    console.log("-".repeat(50));
    
    console.log("Scenario: Severe weather triggers emergency supply chain protocols...\n");

    // Create a product first
    const tx1 = await oracleProductRegistry.connect(farmer).registerProduct(
        "Emergency Response Crop",
        "EMERGENCY-001",
        "Crop ready for emergency processing",
        "Iowa_USA"
    );
    await tx1.wait();
    console.log("🌾 Product created for emergency scenario");

    // Simulate severe weather event
    console.log("\n🌪️  SIMULATING SEVERE WEATHER EVENT:");
    await temperatureFeed.updateAnswer(500); // 5°C - very cold
    await rainfallFeed.updateAnswer(15000); // 150mm - heavy rain/storm
    
    const emergencyConditions = await oracleManager.getMarketConditions("Iowa_USA");
    console.log(`Emergency Weather Alert:
    🌡️  Temperature: ${Number(emergencyConditions.weather.temperature) / 100}°C (CRITICALLY LOW)
    🌧️  Rainfall: ${Number(emergencyConditions.weather.rainfall) / 100}mm (HEAVY STORM)
    Status: ${emergencyConditions.weatherStatus}`);

    if (emergencyConditions.weatherStatus === "CRITICAL") {
        console.log("\n🚨 CRITICAL WEATHER ALERT TRIGGERED!");
        console.log("Implementing emergency protocols:");
        console.log("1. Expedited processing to prevent crop loss");
        console.log("2. Alternative transportation routes");
        console.log("3. Emergency storage activation");
        
        // Emergency processing
        const tx2 = await oracleProductRegistry.connect(processor).updateProcessingStage(
            0, // Product ID
            "EMERGENCY PROCESSING: Expedited due to severe weather conditions. Standard protocols bypassed for crop preservation."
        );
        await tx2.wait();
        console.log("⚡ Emergency processing completed");
        
        // Get product with weather data
        const productData = await oracleProductRegistry.getProductWithOracleData(0);
        console.log(`\n📋 Product processed under emergency conditions:
        Product: ${productData.productInfo.productName}
        Processing Weather: ${Number(productData.currentStageData.weatherAtStage.temperature) / 100}°C
        Emergency Status: COMPLETED`);
    }
}

async function example4DynamicPricing(oracleManager, oracleProductRegistry, farmer, retailer, priceFeed) {
    console.log("\n🏷️  EXAMPLE 4: Dynamic Pricing Based on Market Conditions");
    console.log("-".repeat(50));
    
    console.log("Scenario: Retail prices adjust automatically based on oracle data...\n");

    // Create premium product
    const tx = await oracleProductRegistry.connect(farmer).registerProduct(
        "Organic Premium Tomatoes",
        "PREMIUM-TOM-001",
        "Grade A organic tomatoes for premium market",
        "California_USA"
    );
    await tx.wait();

    // Simulate market volatility
    const marketScenarios = [
        { price: 150000000000, description: "Market Crash", multiplier: 0.8 },
        { price: 200000000000, description: "Normal Market", multiplier: 1.0 },
        { price: 280000000000, description: "Bull Market", multiplier: 1.4 },
        { price: 350000000000, description: "Market Peak", multiplier: 1.8 }
    ];

    console.log("📊 Dynamic Pricing Response to Market Changes:\n");

    for (const scenario of marketScenarios) {
        await priceFeed.updateAnswer(scenario.price);
        const conditions = await oracleManager.getMarketConditions("California_USA");
        
        const basePrice = 5.00; // Base retail price
        const dynamicPrice = basePrice * scenario.multiplier;
        
        console.log(`${scenario.description}:
        📈 Market Price: $${Number(conditions.currentPrice) / 100000000}
        🏷️  Retail Price: $${dynamicPrice.toFixed(2)} (${scenario.multiplier}x base)
        📊 Price Status: ${conditions.priceStatus}
        ${scenario.multiplier > 1.2 ? "🎯 PREMIUM PRICING ACTIVE" : scenario.multiplier < 0.9 ? "💸 DISCOUNT PRICING ACTIVE" : "💰 STANDARD PRICING"}\n`);
    }

    console.log("✅ Dynamic pricing system responds to real-time market data");
}

async function example5QualityPrediction(oracleManager, oracleProductRegistry, farmer, temperatureFeed, humidityFeed) {
    console.log("\n🔬 EXAMPLE 5: Quality Prediction Based on Environmental Data");
    console.log("-".repeat(50));
    
    console.log("Scenario: Predicting product quality using historical weather data...\n");

    // Create products under different conditions
    const qualityScenarios = [
        {
            name: "Perfect Conditions Crop",
            temp: 2200, // 22°C
            humidity: 5500, // 55%
            expectedQuality: "PREMIUM"
        },
        {
            name: "Suboptimal Conditions Crop", 
            temp: 3200, // 32°C - too hot
            humidity: 3000, // 30% - too dry
            expectedQuality: "STANDARD"
        },
        {
            name: "Poor Conditions Crop",
            temp: 800, // 8°C - too cold
            humidity: 8500, // 85% - too humid
            expectedQuality: "LOWER_GRADE"
        }
    ];

    for (let i = 0; i < qualityScenarios.length; i++) {
        const scenario = qualityScenarios[i];
        
        // Set environmental conditions
        await temperatureFeed.updateAnswer(scenario.temp);
        await humidityFeed.updateAnswer(scenario.humidity);
        
        // Register product under these conditions
        const tx = await oracleProductRegistry.connect(farmer).registerProduct(
            scenario.name,
            `QUALITY-TEST-${i + 1}`,
            `Grown under ${scenario.expectedQuality.toLowerCase()} conditions`,
            "Iowa_USA"
        );
        await tx.wait();
        
        // Get product data with environmental conditions
        const productData = await oracleProductRegistry.getProductWithOracleData(i + 1);
        const weather = productData.currentStageData.weatherAtStage;
        
        // Quality prediction algorithm (simplified)
        let qualityScore = 100;
        
        // Temperature impact
        const optimalTemp = 2000; // 20°C
        const tempDeviation = Math.abs(Number(weather.temperature) - optimalTemp);
        qualityScore -= tempDeviation / 100;
        
        // Humidity impact  
        const optimalHumidity = 5000; // 50%
        const humidityDeviation = Math.abs(Number(weather.humidity) - optimalHumidity);
        qualityScore -= humidityDeviation / 200;
        
        // Determine grade
        let grade;
        if (qualityScore >= 90) grade = "PREMIUM";
        else if (qualityScore >= 70) grade = "STANDARD";
        else grade = "LOWER_GRADE";
        
        console.log(`${scenario.name}:
        🌡️  Temperature: ${Number(weather.temperature) / 100}°C
        💧 Humidity: ${Number(weather.humidity) / 100}%
        📊 Quality Score: ${Math.round(qualityScore)}/100
        🏆 Predicted Grade: ${grade}
        ✨ Matches Expected: ${grade === scenario.expectedQuality ? "YES" : "NO"}\n`);
    }

    console.log("✅ Quality prediction system uses real environmental data to predict crop grades");
}

// Execute if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Examples failed:", error);
            process.exit(1);
        });
}

module.exports = main; 