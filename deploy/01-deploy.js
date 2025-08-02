const { network } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log, get } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    // Get oracle feed addresses
    let ethUsdPriceFeedAddress,
        temperatureFeedAddress,
        humidityFeedAddress,
        rainfallFeedAddress,
        windSpeedFeedAddress

    if (developmentChains.includes(network.name)) {
        const ethUsdAggregator = await get("MockV3Aggregator")
        const temperatureAggregator = await get("MockTemperatureFeed")
        const humidityAggregator = await get("MockHumidityFeed")
        const rainfallAggregator = await get("MockRainfallFeed")
        const windSpeedAggregator = await get("MockWindSpeedFeed")

        ethUsdPriceFeedAddress = ethUsdAggregator.address
        temperatureFeedAddress = temperatureAggregator.address
        humidityFeedAddress = humidityAggregator.address
        rainfallFeedAddress = rainfallAggregator.address
        windSpeedFeedAddress = windSpeedAggregator.address
    } else {
        ethUsdPriceFeedAddress = networkConfig[chainId]["ethUsdPriceFeed"]
        temperatureFeedAddress = networkConfig[chainId]["temperatureFeed"]
        humidityFeedAddress = networkConfig[chainId]["humidityFeed"]
        rainfallFeedAddress = networkConfig[chainId]["rainfallFeed"]
        windSpeedFeedAddress = networkConfig[chainId]["windSpeedFeed"]
    }

    log("----------------------------------------------------")
    log("Deploying Smart Contracts...")

    // 1. Deploy StakeholderManager (base access control)
    log("Deploying StakeholderManager...")
    const stakeholderManager = await deploy("StakeholderManager", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`StakeholderManager deployed at ${stakeholderManager.address}`)

    // 2. Deploy ProductBatch
    log("Deploying ProductBatch...")
    const productBatch = await deploy("ProductBatch", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`ProductBatch deployed at ${productBatch.address}`)

    // 3. Deploy OfferManager (needs ProductBatch address)
    log("Deploying OfferManager...")
    const offerManager = await deploy("OfferManager", {
        from: deployer,
        args: [productBatch.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`OfferManager deployed at ${offerManager.address}`)

    // 4. Deploy Registry
    log("Deploying Registry...")
    const registry = await deploy("Registry", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`Registry deployed at ${registry.address}`)

    // 5. Deploy ShipmentTracker (needs ProductBatch address)
    log("Deploying ShipmentTracker...")
    const shipmentTracker = await deploy("ShipmentTracker", {
        from: deployer,
        args: [productBatch.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`ShipmentTracker deployed at ${shipmentTracker.address}`)

    // 6. Deploy StakeholderRegistry (needs StakeholderManager address)
    log("Deploying StakeholderRegistry...")
    const stakeholderRegistry = await deploy("StakeholderRegistry", {
        from: deployer,
        args: [stakeholderManager.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`StakeholderRegistry deployed at ${stakeholderRegistry.address}`)

    log("----------------------------------------------------")
    log("Setting up oracle feeds on ProductBatch...")

    // Get ProductBatch contract instance to set oracle feeds
    const ProductBatch = await ethers.getContractFactory("ProductBatch")
    const productBatchContract = ProductBatch.attach(productBatch.address)

    // Set price feed
    await productBatchContract.setPriceFeed(ethUsdPriceFeedAddress)
    log("Price feed set on ProductBatch")

    // Set weather feeds
    await productBatchContract.setWeatherFeeds(
        temperatureFeedAddress,
        humidityFeedAddress,
        rainfallFeedAddress,
        windSpeedFeedAddress
    )
    log("Weather feeds set on ProductBatch")

    log("----------------------------------------------------")
    log("All contracts deployed successfully!")
    log(`StakeholderManager: ${stakeholderManager.address}`)
    log(`ProductBatch: ${productBatch.address}`)
    log(`OfferManager: ${offerManager.address}`)
    log(`Registry: ${registry.address}`)
    log(`ShipmentTracker: ${shipmentTracker.address}`)
    log(`StakeholderRegistry: ${stakeholderRegistry.address}`)
    log("----------------------------------------------------")

    // Verify contracts on live networks
    if (
        !developmentChains.includes(network.name) &&
        process.env.POLYGONSCAN_API_KEY
    ) {
        log("Verifying contracts...")
        await verify(stakeholderManager.address, [])
        await verify(productBatch.address, [])
        await verify(offerManager.address, [productBatch.address])
        await verify(registry.address, [])
        await verify(shipmentTracker.address, [productBatch.address])
        await verify(stakeholderRegistry.address, [stakeholderManager.address])
        log("All contracts verified!")
    }
}

module.exports.tags = ["all", "main"]
module.exports.dependencies = ["mocks"]
