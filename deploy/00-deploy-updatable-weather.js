const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    // Only deploy updatable weather feeds on development chains
    if (developmentChains.includes(network.name)) {
        log("----------------------------------------------------")
        log("Deploying Updatable Weather Feeds for local development...")

        // Deploy updatable temperature feed
        const temperatureFeed = await deploy("UpdatableTemperatureFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (25.50°C = 2550)
                "Temperature Feed",
                2500, // Initial value: 25.00°C
            ],
            log: true,
        })

        // Deploy updatable humidity feed
        const humidityFeed = await deploy("UpdatableHumidityFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (65.50% = 6550)
                "Humidity Feed",
                6500, // Initial value: 65.00%
            ],
            log: true,
        })

        // Deploy updatable rainfall feed
        const rainfallFeed = await deploy("UpdatableRainfallFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (5.50mm = 550)
                "Rainfall Feed",
                200, // Initial value: 2.00mm
            ],
            log: true,
        })

        // Deploy updatable wind speed feed
        const windSpeedFeed = await deploy("UpdatableWindSpeedFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (15.50 km/h = 1550)
                "Wind Speed Feed",
                1500, // Initial value: 15.00 km/h
            ],
            log: true,
        })

        log(`UpdatableTemperatureFeed deployed at ${temperatureFeed.address}`)
        log(`UpdatableHumidityFeed deployed at ${humidityFeed.address}`)
        log(`UpdatableRainfallFeed deployed at ${rainfallFeed.address}`)
        log(`UpdatableWindSpeedFeed deployed at ${windSpeedFeed.address}`)
        log("----------------------------------------------------")
    }
}

module.exports.tags = ["all", "weather", "updatable"]
