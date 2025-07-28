const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    let { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    log("🚀 Deploying Supply Chain System to Local Network...")
    log(`Network: ${network.name} (Chain ID: ${chainId})`)
    
    // Validate deployer account and provide fallback
    if (!deployer) {
        log("⚠️ No named deployer found, attempting to get deployer from signers...")
        const signers = await ethers.getSigners()
        if (signers.length === 0) {
            throw new Error("No signers available. Please ensure PRIVATE_KEY is set in .env file and accounts are properly configured in hardhat.config.js")
        }
        deployer = signers[0].address
        log(`✅ Using first signer as deployer: ${deployer}`)
    } else {
        log(`✅ Using named deployer: ${deployer}`)
    }
    
    log(`Deploying with account: ${deployer}`)

    // Check deployer balance
    const balance = await ethers.provider.getBalance(deployer)
    log(`Account balance: ${ethers.formatEther(balance)} ETH\n`)

    // Deploy Mock Oracles for Local Development
    log("🔮 Deploying Mock Oracles for Local Development...")
    
    // Deploy MockV3Aggregator for ETH/USD price feed
    log("💰 Deploying Mock ETH/USD Price Feed...")
    const mockEthUsdPriceFeed = await deploy("MockV3Aggregator", {
        from: deployer,
        args: [8, 200000000000], // 8 decimals, $2000 initial price
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Deploy Mock Oracle for temperature feed
    log("🌡️ Deploying Mock Temperature Feed...")
    const mockTemperatureFeed = await deploy("MockOracle", {
        from: deployer,
        args: [2500, 1, 1, "Mock Temperature Feed"], // 25.00°C initial temperature
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Deploy Mock Oracle for humidity feed
    log("💧 Deploying Mock Humidity Feed...")
    const mockHumidityFeed = await deploy("MockOracle", {
        from: deployer,
        args: [6500, 2, 1, "Mock Humidity Feed"], // 65.00% initial humidity
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Deploy Mock Oracle for rainfall feed
    log("🌧️ Deploying Mock Rainfall Feed...")
    const mockRainfallFeed = await deploy("MockOracle", {
        from: deployer,
        args: [500, 2, 1, "Mock Rainfall Feed"], // 5.00mm initial rainfall
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Deploy Mock Oracle for wind speed feed
    log("💨 Deploying Mock Wind Speed Feed...")
    const mockWindSpeedFeed = await deploy("MockOracle", {
        from: deployer,
        args: [1500, 2, 1, "Mock Wind Speed Feed"], // 15.00 km/h initial wind speed
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    log("✅ All Mock Oracles deployed successfully!\n")

    // 1. Deploy StakeholderManager (Core stakeholder management)
    log("👥 Deploying StakeholderManager...")
    const stakeholderManager = await deploy("StakeholderManager", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 2. Deploy Registry (Updated to work with StakeholderManager)
    log("📋 Deploying Registry...")
    const registry = await deploy("Registry", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 3. Deploy StakeholderRegistry (Updated to work with StakeholderManager)
    log("👥 Deploying StakeholderRegistry...")
    const stakeholderRegistry = await deploy("StakeholderRegistry", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })


    // 4. Deploy ProductFactory (with mock oracle feed addresses for local)
    log("🏭 Deploying ProductFactory...")
    const productFactory = await deploy("ProductFactory", {
        from: deployer,
        args: [
            stakeholderRegistry.address,
            registry.address,
            mockTemperatureFeed.address,
            mockHumidityFeed.address,
            mockRainfallFeed.address,
            mockWindSpeedFeed.address,
            mockEthUsdPriceFeed.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 5. Deploy ShipmentFactory
    log("🚚 Deploying ShipmentFactory...")
    const shipmentFactory = await deploy("ShipmentFactory", {
        from: deployer,
        args: [registry.address, stakeholderRegistry.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 6. Deploy FileStorageManager (use deployer as oracle operator for local)
    log("📁 Deploying FileStorageManager...")
    const fileStorageManager = await deploy("FileStorageManager", {
        from: deployer,
        args: [stakeholderRegistry.address, deployer],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 7. Register some example stakeholders for testing
    log("\n📝 Registering example stakeholders...")
    
    const StakeholderRole = {
        NONE: 0,
        FARMER: 1,
        PROCESSOR: 2,
        RETAILER: 3,
        DISTRIBUTOR: 4
    }

    // Get the deployed StakeholderManager contract
    const stakeholderManagerContract = await ethers.getContractAt("StakeholderManager", stakeholderManager.address)

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
    ]

    for (const stakeholder of exampleStakeholders) {
        try {
            await stakeholderManagerContract.registerStakeholder(
                stakeholder.address,
                stakeholder.role,
                stakeholder.name,
                stakeholder.license,
                stakeholder.location,
                stakeholder.certifications
            )
            log(`✅ Registered: ${stakeholder.name} (${stakeholder.address})`)
        } catch (error) {
            log(`❌ Failed to register ${stakeholder.name}: ${error.message}`)
        }
    }

    // Contract verification (skipped for local network)
    if (!developmentChains.includes(network.name)) {
        log("\n🔍 Verifying contracts on Etherscan...")
        
        await verify(stakeholderManager.address, [])
        await verify(registry.address, [stakeholderManager.address])
        await verify(stakeholderRegistry.address, [stakeholderManager.address])
        await verify(productFactory.address, [
            stakeholderRegistry.address,
            registry.address,
            mockTemperatureFeed.address,
            mockHumidityFeed.address,
            mockRainfallFeed.address,
            mockWindSpeedFeed.address,
            mockEthUsdPriceFeed.address
        ])
        await verify(shipmentFactory.address, [registry.address, stakeholderRegistry.address])
        await verify(fileStorageManager.address, [stakeholderRegistry.address, deployer])
        
        log("✅ All contracts verified on Etherscan!")
    } else {
        log("\n⏭️ Skipping contract verification for local network")
    }

    // Deployment Summary
    log("\n🎉 Supply Chain System Deployed Successfully!")
    log("=".repeat(80))
    log("📍 DEPLOYED CONTRACTS:")
    log(`StakeholderManager:   ${stakeholderManager.address}`)
    log(`Registry:             ${registry.address}`)
    log(`StakeholderRegistry:  ${stakeholderRegistry.address}`)
    log(`ProductFactory:       ${productFactory.address}`)
    log(`ShipmentFactory:      ${shipmentFactory.address}`)
    log(`FileStorageManager:   ${fileStorageManager.address}`)
    
    log("\n🔮 MOCK ORACLES DEPLOYED:")
    log(`ETH/USD Price Feed:   ${mockEthUsdPriceFeed.address} (MockV3Aggregator)`)
    log(`Temperature Feed:     ${mockTemperatureFeed.address} (MockOracle)`)
    log(`Humidity Feed:        ${mockHumidityFeed.address} (MockOracle)`)
    log(`Rainfall Feed:        ${mockRainfallFeed.address} (MockOracle)`)
    log(`Wind Speed Feed:      ${mockWindSpeedFeed.address} (MockOracle)`)
    
    log("\n📡 ORACLE CONFIGURATION:")
    log(`Price Feed (ETH/USD):  ${mockEthUsdPriceFeed.address} (Mock - $2000)`)
    log(`Temperature:           ${mockTemperatureFeed.address} (Mock - 25.00°C)`)
    log(`Humidity:              ${mockHumidityFeed.address} (Mock - 65.00%)`)
    log(`Rainfall:              ${mockRainfallFeed.address} (Mock - 5.00mm)`)
    log(`Wind Speed:            ${mockWindSpeedFeed.address} (Mock - 15.00 km/h)`)

    log("\n🌟 FEATURES DEPLOYED:")
    log("✅ Complete supply chain management system")
    log("✅ Stakeholder management and registration")
    log("✅ Product factory with mock oracle integration")
    log("✅ Shipment factory with route optimization")
    log("✅ File storage management system")
    log("✅ Mock oracles for realistic testing")
    log("✅ Example stakeholders pre-registered")
    log("✅ Local development ready")
    
    log("\n🔗 Contract Dependencies:")
    log(`Registry → StakeholderManager: ${stakeholderManager.address}`)
    log(`StakeholderRegistry → StakeholderManager: ${stakeholderManager.address}`)
    log(`ProductFactory → Mock Oracles: All deployed`)
    
    log("\n🚀 System ready for local development with mock oracles!")
}

module.exports.tags = ["all", "supply-chain", "local", "clean", "new-architecture", "mock-oracles"]
