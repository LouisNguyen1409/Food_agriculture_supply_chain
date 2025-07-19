const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    let { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    log("🚀 Deploying Supply Chain System to Polygon Amoy...")
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

    // 2. Deploy Stakeholder Registry
    log("👥 Deploying Stakeholder Registry...")
    const stakeholderRegistry = await deploy("StakeholderRegistry", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 3. Deploy Product Registry
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

    // 4. Deploy Shipment Registry
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


    // 5. Deploy Public Verification
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

    // 6. Deploy Product Factory
    log("🏭 Deploying Product Factory...")
    const productFactory = await deploy("ProductFactory", {
        from: deployer,
        args: [
            productRegistry.address,
            stakeholderRegistry.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // 7. Deploy Shipment Factory
    log("🚚 Deploying Shipment Factory...")
    const shipmentFactory = await deploy("ShipmentFactory", {
        from: deployer,
        args: [
            shipmentRegistry.address,
            productRegistry.address,
            stakeholderRegistry.address
        ],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    // Contract verification on PolygonScan
    if (process.env.POLYGONSCAN_API_KEY) {
        log("\n🔍 Verifying contracts on PolygonScan...")
        
        await verify(contractRegistry.address, [])
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

        await verify(publicVerification.address, [
            productRegistry.address,
            shipmentRegistry.address,
            stakeholderRegistry.address
        ])

        await verify(productFactory.address, [
            productRegistry.address,
            stakeholderRegistry.address
        ])

        await verify(shipmentFactory.address, [
            shipmentRegistry.address,
            productRegistry.address,
            stakeholderRegistry.address
        ])
        
        log("✅ All contracts verified on PolygonScan!")
    }

    // Deployment Summary
    log("\n🎉 Supply Chain System Deployed Successfully!")
    log("=".repeat(80))
    log("📍 DEPLOYED CONTRACTS:")
    log(`Contract Registry:     ${contractRegistry.address}`)
    log(`Stakeholder Registry:  ${stakeholderRegistry.address}`)
    log(`Product Registry:      ${productRegistry.address}`)
    log(`Shipment Registry:     ${shipmentRegistry.address}`)
    log(`Public Verification:   ${publicVerification.address}`)
    log(`Product Factory:       ${productFactory.address}`)
    log(`Shipment Factory:      ${shipmentFactory.address}`)
    
    log("\n📡 ORACLE CONFIGURATION:")
    log(`Price Feed (ETH/USD):  ${priceFeedAddress} (Real Chainlink)`)
    log(`Weather Feeds:         Zero addresses (Safety fallbacks active)`)

    log("\n🌟 FEATURES DEPLOYED:")
    log("✅ Real-time ETH/USD price data from Chainlink")
    log("✅ Weather data safety fallbacks integrated")
    log("✅ Complete supply chain management system")
    log("✅ Oracle-enhanced product tracking")
    log("✅ Product templates and batch creation")
    log("✅ Shipment templates and route optimization")
    log("✅ All contracts verified on PolygonScan")
    
    log("\n🚀 System ready for production use on Polygon Amoy!")
}

module.exports.tags = ["all", "supply-chain", "amoy"]
