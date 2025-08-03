const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    // Deploy updatable weather feeds on production networks
    if (!developmentChains.includes(network.name)) {
        log("----------------------------------------------------")
        log("Deploying Updatable Weather Feeds for production...")

        // Deploy updatable temperature feed
        const temperatureFeed = await deploy("UpdatableTemperatureFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (25.50°C = 2550)
                "Temperature Feed - Production",
                2500, // Initial value: 25.00°C
            ],
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        })

        // Deploy updatable humidity feed
        const humidityFeed = await deploy("UpdatableHumidityFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (65.50% = 6550)
                "Humidity Feed - Production",
                6500, // Initial value: 65.00%
            ],
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        })

        // Deploy updatable rainfall feed
        const rainfallFeed = await deploy("UpdatableRainfallFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (5.50mm = 550)
                "Rainfall Feed - Production",
                200, // Initial value: 2.00mm
            ],
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        })

        // Deploy updatable wind speed feed
        const windSpeedFeed = await deploy("UpdatableWindSpeedFeed", {
            contract: "UpdatableWeatherFeed",
            from: deployer,
            args: [
                2, // 2 decimals (15.50 km/h = 1550)
                "Wind Speed Feed - Production",
                1500, // Initial value: 15.00 km/h
            ],
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        })

        log(`UpdatableTemperatureFeed deployed at ${temperatureFeed.address}`)
        log(`UpdatableHumidityFeed deployed at ${humidityFeed.address}`)
        log(`UpdatableRainfallFeed deployed at ${rainfallFeed.address}`)
        log(`UpdatableWindSpeedFeed deployed at ${windSpeedFeed.address}`)
        log("----------------------------------------------------")

        // Save addresses to a file for easy reference
        const fs = require("fs")
        const addresses = {
            network: network.name,
            chainId: network.config.chainId,
            temperatureFeed: temperatureFeed.address,
            humidityFeed: humidityFeed.address,
            rainfallFeed: rainfallFeed.address,
            windSpeedFeed: windSpeedFeed.address,
            deployedAt: new Date().toISOString(),
        }

        fs.writeFileSync(
            `weather-feeds-${network.name}.json`,
            JSON.stringify(addresses, null, 2)
        )

        log(
            `Weather feed addresses saved to weather-feeds-${network.name}.json`
        )
    }
}

module.exports.tags = ["weather", "production"]
