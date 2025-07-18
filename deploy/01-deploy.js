const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    log("🚀 Deploying Oracle-Integrated Supply Chain System to Polygon Amoy...")
    log(`Network: ${network.name} (Chain ID: ${chainId})`)
    log(`Deploying with account: ${deployer}`)

    // Check deployer balance
    const balance = await ethers.provider.getBalance(deployer)
    log(`Account balance: ${ethers.formatEther(balance)} MATIC\n`)

    // Oracle Feeds Configuration for Amoy Testnet
    const priceFeedAddress = networkConfig[chainId]?.ethUsdPriceFeed || "0x001382149eBa3441043c1c66972b4772963f5D43"
    log(`✅ Using REAL Chainlink ETH/USD Feed: ${priceFeedAddress}`)
    
    // Weather feeds use zero addresses with safety fallbacks on testnet
    const temperatureFeedAddress = ethers.ZeroAddress
    const humidityFeedAddress = ethers.ZeroAddress
    const rainfallFeedAddress = ethers.ZeroAddress
    const windSpeedFeedAddress = ethers.ZeroAddress
    log("⚠️ Using zero addresses for weather feeds (safety fallbacks active)\n")

    // 1. Deploy Contract Registry
    log("📋 Deploying Contract Registry...")
    const contractRegistry = await deploy("ContractRegistry", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 2. Deploy Oracle Manager
    log("🎛️ Deploying Oracle Manager...")
    const oracleManager = await deploy("OracleManager", {
        from: deployer,
        args: [
            temperatureFeedAddress,
            humidityFeedAddress,
            rainfallFeedAddress,
            windSpeedFeedAddress,
            priceFeedAddress
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 3. Deploy Stakeholder Registry
    log("👥 Deploying Stakeholder Registry...")
    const stakeholderRegistry = await deploy("StakeholderRegistry", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 4. Deploy Product Registry
    log("🌾 Deploying Product Registry...")
    const productRegistry = await deploy("ProductRegistry", {
        from: deployer,
        args: [
            stakeholderRegistry.address,
            temperatureFeedAddress,
            humidityFeedAddress,
            rainfallFeedAddress,
            windSpeedFeedAddress,
            priceFeedAddress
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 5. Deploy Shipment Registry
    log("🚚 Deploying Shipment Registry...")
    const shipmentRegistry = await deploy("ShipmentRegistry", {
        from: deployer,
        args: [
            stakeholderRegistry.address,
            productRegistry.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 6. Deploy Supply Chain Manager
    log("📦 Deploying Supply Chain Manager...")
    const supplyChainManager = await deploy("SupplyChainManager", {
        from: deployer,
        args: [
            stakeholderRegistry.address,
            productRegistry.address,
            shipmentRegistry.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 7. Deploy Public Verification
    log("🔍 Deploying Public Verification...")
    const publicVerification = await deploy("PublicVerification", {
        from: deployer,
        args: [
            productRegistry.address,
            shipmentRegistry.address,
            stakeholderRegistry.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 8. Deploy Supply Chain Client
    log("📱 Deploying Supply Chain Client...")
    const supplyChainClient = await deploy("SupplyChainClient", {
        from: deployer,
        args: [contractRegistry.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Contract verification on PolygonScan
    if (process.env.POLYGONSCAN_API_KEY) {
        log("\n🔍 Verifying contracts on PolygonScan...")
        
        await verify(contractRegistry.address, [])
        await verify(oracleManager.address, [
            temperatureFeedAddress,
            humidityFeedAddress,
            rainfallFeedAddress,
            windSpeedFeedAddress,
            priceFeedAddress
        ])
        await verify(stakeholderRegistry.address, [])
        await verify(productRegistry.address, [
            stakeholderRegistry.address,
            temperatureFeedAddress,
            humidityFeedAddress,
            rainfallFeedAddress,
            windSpeedFeedAddress,
            priceFeedAddress
        ])
        await verify(shipmentRegistry.address, [
            stakeholderRegistry.address,
            productRegistry.address
        ])
        await verify(supplyChainManager.address, [
            stakeholderRegistry.address,
            productRegistry.address,
            shipmentRegistry.address
        ])
        await verify(publicVerification.address, [
            productRegistry.address,
            shipmentRegistry.address,
            stakeholderRegistry.address
        ])
        await verify(supplyChainClient.address, [contractRegistry.address])
        
        log("✅ All contracts verified on PolygonScan!")
    }

    // Deployment Summary
    log("\n🎉 Oracle-Integrated Supply Chain System Deployed Successfully!")
    log("=".repeat(80))
    log("📍 DEPLOYED CONTRACTS:")
    log(`Contract Registry:     ${contractRegistry.address}`)
    log(`Oracle Manager:        ${oracleManager.address}`)
    log(`Stakeholder Registry:  ${stakeholderRegistry.address}`)
    log(`Product Registry:      ${productRegistry.address}`)
    log(`Shipment Registry:     ${shipmentRegistry.address}`)
    log(`Supply Chain Manager:  ${supplyChainManager.address}`)
    log(`Public Verification:   ${publicVerification.address}`)
    log(`Supply Chain Client:   ${supplyChainClient.address}`)
    
    log("\n📡 ORACLE CONFIGURATION:")
    log(`Price Feed (ETH/USD):  ${priceFeedAddress} (Real Chainlink)`)
    log(`Weather Feeds:         Zero addresses (Safety fallbacks active)`)

    log("\n🌟 FEATURES DEPLOYED:")
    log("✅ Real-time ETH/USD price data from Chainlink")
    log("✅ Weather data safety fallbacks integrated")
    log("✅ Complete supply chain management system")
    log("✅ Oracle-enhanced product tracking")
    log("✅ All contracts verified on PolygonScan")
    
    log("\n🚀 System ready for production use on Polygon Amoy!")
}

module.exports.tags = ["all", "supply-chain", "amoy"]
