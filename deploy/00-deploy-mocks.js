const { network } = require("hardhat")
const {
    developmentChains,
    DECIMALS,
    INITIAL_PRICE,
} = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    if (developmentChains.includes(network.name)) {
        log("Deploying Mocks...")

        // Deploy ETH/USD Price Feed Mock
        await deploy("MockV3Aggregator", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [DECIMALS, INITIAL_PRICE],
        })

        // Deploy Temperature Feed Mock (in Celsius * 100, e.g., 2500 = 25.00°C)
        await deploy("MockTemperatureFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [2, 2500], // 2 decimals, 25.00°C
        })

        // Deploy Humidity Feed Mock (percentage, e.g., 65 = 65%)
        await deploy("MockHumidityFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [0, 65], // 0 decimals, 65%
        })

        // Deploy Rainfall Feed Mock (in mm, e.g., 10 = 10mm)
        await deploy("MockRainfallFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [0, 10], // 0 decimals, 10mm
        })

        // Deploy Wind Speed Feed Mock (in km/h, e.g., 15 = 15 km/h)
        await deploy("MockWindSpeedFeed", {
            contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [0, 15], // 0 decimals, 15 km/h
        })

        log(`All Mocks deployed`)
        log("----------------------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]
