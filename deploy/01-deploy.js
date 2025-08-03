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

    // Ensure deployer has admin role
    const StakeholderManager = await ethers.getContractFactory("StakeholderManager")
    const stakeholderManagerContract = StakeholderManager.attach(stakeholderManager.address)

    // Explicitly grant admin role to whoever deployed the contract (Role.ADMIN = 6)
    log("Ensuring deployer has admin role...")
    const tx = await stakeholderManagerContract.grantRole(deployer, 6)
    await tx.wait()
    log(`Admin role explicitly granted to deployer: ${deployer}`)

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
    log("Deploying Verification System...")

    // 7. Deploy ProvenanceTracker (depends on ProductBatch and StakeholderManager)
    log("Deploying ProvenanceTracker...")
    const provenanceTracker = await deploy("ProvenanceTracker", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`ProvenanceTracker deployed at ${provenanceTracker.address}`)

    // 8. Deploy QRCodeVerifier (depends on ProductBatch and ProvenanceTracker)
    log("Deploying QRCodeVerifier...")
    const qrCodeVerifier = await deploy("QRCodeVerifier", {
        from: deployer,
        args: [productBatch.address, provenanceTracker.address, registry.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`QRCodeVerifier deployed at ${qrCodeVerifier.address}`)

    // 9. Deploy PublicVerification (depends on ProductBatch, ProvenanceTracker, and QRCodeVerifier)
    log("Deploying PublicVerification...")
    const publicVerification = await deploy("PublicVerification", {
        from: deployer,
        args: [productBatch.address, provenanceTracker.address, qrCodeVerifier.address],
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`PublicVerification deployed at ${publicVerification.address}`)

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
    log("Setting up verification system integrations...")

    const Registry = await ethers.getContractFactory("Registry")
    const registryContract = Registry.attach(registry.address)

    await registryContract.setVerificationContracts(
        provenanceTracker.address,
        qrCodeVerifier.address,
        publicVerification.address
    )
    log("Verification contracts set in Registry")

    log("----------------------------------------------------")
    log("All contracts deployed successfully!")
    log(`StakeholderManager: ${stakeholderManager.address}`)
    log(`ProductBatch: ${productBatch.address}`)
    log(`OfferManager: ${offerManager.address}`)
    log(`Registry: ${registry.address}`)
    log(`ShipmentTracker: ${shipmentTracker.address}`)
    log(`StakeholderRegistry: ${stakeholderRegistry.address}`)
    log(`ProvenanceTracker: ${provenanceTracker.address}`)
    log(`QRCodeVerifier: ${qrCodeVerifier.address}`)
    log(`PublicVerification: ${publicVerification.address}`)
    log("----------------------------------------------------")

    // Save deployment addresses to a file for frontend use
    const fs = require("fs")
    const contractAddresses = {
        StakeholderManager: stakeholderManager.address,
        ProductBatch: productBatch.address,
        OfferManager: offerManager.address,
        Registry: registry.address,
        ShipmentTracker: shipmentTracker.address,
        StakeholderRegistry: stakeholderRegistry.address,
        ProvenanceTracker: provenanceTracker.address,
        QRCodeVerifier: qrCodeVerifier.address,
        PublicVerification: publicVerification.address,
        chainId: chainId,
        network: network.name
    }

    // Write to frontend directories
    const frontendPaths = [
        "./frontend/public-portal/src/constants/",
        "./frontend/admin-portal/src/constants/"
    ]

    for (const frontendPath of frontendPaths) {
        if (!fs.existsSync(frontendPath)) {
            fs.mkdirSync(frontendPath, { recursive: true })
        }
        fs.writeFileSync(
            `${frontendPath}contractAddresses.json`,
            JSON.stringify(contractAddresses, null, 2)
        )
        log(`Contract addresses saved to ${frontendPath}contractAddresses.json`)
    }

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
        await verify(provenanceTracker.address, [productBatch.address, stakeholderManager.address])
        await verify(qrCodeVerifier.address, [productBatch.address, provenanceTracker.address])
        await verify(publicVerification.address, [productBatch.address, provenanceTracker.address, qrCodeVerifier.address])
        log("All contracts verified!")
    }
}

module.exports.tags = ["all", "main"]
module.exports.dependencies = ["mocks"]