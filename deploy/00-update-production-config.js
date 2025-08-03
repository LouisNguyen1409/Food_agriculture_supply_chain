const fs = require("fs")
const path = require("path")
const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async ({ deployments }) => {
    const { get } = deployments

    // Only update config for production networks (not local development)
    if (!developmentChains.includes(network.name)) {
        console.log(
            "Updating production config with deployed weather feed addresses..."
        )

        try {
            // Get deployed weather feed addresses
            const temperatureFeed = await get("UpdatableTemperatureFeed")
            const humidityFeed = await get("UpdatableHumidityFeed")
            const rainfallFeed = await get("UpdatableRainfallFeed")
            const windSpeedFeed = await get("UpdatableWindSpeedFeed")

            const chainId = network.config.chainId

            // Read current config
            const configPath = path.join(
                __dirname,
                "../helper-hardhat-config.js"
            )
            let configContent = fs.readFileSync(configPath, "utf8")

            // Update the addresses for this network
            const addresses = {
                temperatureFeed: temperatureFeed.address,
                humidityFeed: humidityFeed.address,
                rainfallFeed: rainfallFeed.address,
                windSpeedFeed: windSpeedFeed.address,
            }

            // Replace the 0x000... addresses with real ones
            Object.entries(addresses).forEach(([feedType, address]) => {
                const regex = new RegExp(
                    `(${feedType}:\\s*)"0x0000000000000000000000000000000000000000"`,
                    "g"
                )
                configContent = configContent.replace(regex, `$1"${address}"`)
            })

            // Write updated config
            fs.writeFileSync(configPath, configContent)

            console.log("Production config updated with real addresses:")
            Object.entries(addresses).forEach(([feedType, address]) => {
                console.log(`   ${feedType}: ${address}`)
            })
        } catch (error) {
            console.warn(
                "WARNING: Could not update config - weather feeds may not be deployed yet"
            )
            console.warn("   Deploy weather feeds first, then run this script")
        }
    }
}

module.exports.tags = ["config", "production"]
module.exports.runAtTheEnd = true
