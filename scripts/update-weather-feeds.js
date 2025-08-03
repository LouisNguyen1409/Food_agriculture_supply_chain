const { ethers } = require("hardhat")
const WeatherAPIService = require("../services/weatherAPI")

/**
 * Script to update weather feeds with real API data
 * Usage: npx hardhat run scripts/update-weather-feeds.js --network localhost
 */
async function main() {
    console.log("Starting weather feed update...")

    // Initialize weather API service
    const weatherAPI = new WeatherAPIService()

    // Get deployer account
    const [deployer] = await ethers.getSigners()
    console.log(`Updating feeds with account: ${deployer.address}`)

    // Define locations to fetch weather for (you can customize this)
    const locations = ["Sydney,AU", "Melbourne,AU", "Brisbane,AU"]

    try {
        // Get deployed contract addresses
        const temperatureFeedAddress = await getContractAddress(
            "UpdatableTemperatureFeed"
        )
        const humidityFeedAddress = await getContractAddress(
            "UpdatableHumidityFeed"
        )
        const rainfallFeedAddress = await getContractAddress(
            "UpdatableRainfallFeed"
        )
        const windSpeedFeedAddress = await getContractAddress(
            "UpdatableWindSpeedFeed"
        )

        // Connect to contracts
        const UpdatableWeatherFeed = await ethers.getContractFactory(
            "UpdatableWeatherFeed"
        )
        const temperatureFeed = UpdatableWeatherFeed.attach(
            temperatureFeedAddress
        )
        const humidityFeed = UpdatableWeatherFeed.attach(humidityFeedAddress)
        const rainfallFeed = UpdatableWeatherFeed.attach(rainfallFeedAddress)
        const windSpeedFeed = UpdatableWeatherFeed.attach(windSpeedFeedAddress)

        // Fetch and update weather data for each location
        for (const location of locations) {
            console.log(`\nFetching weather data for ${location}...`)

            const weatherData = await weatherAPI.getContractFormattedWeather(
                location
            )
            console.log(`Weather data:`, {
                temperature: `${weatherData.temperature / 100}°C`,
                humidity: `${weatherData.humidity / 100}%`,
                rainfall: `${weatherData.rainfall / 100}mm`,
                windSpeed: `${weatherData.windSpeed / 100}km/h`,
            })

            // Update each feed
            console.log("Updating temperature feed...")
            const tempTx = await temperatureFeed.updateAnswer(
                weatherData.temperature
            )
            await tempTx.wait()

            console.log("Updating humidity feed...")
            const humidityTx = await humidityFeed.updateAnswer(
                weatherData.humidity
            )
            await humidityTx.wait()

            console.log("Updating rainfall feed...")
            const rainfallTx = await rainfallFeed.updateAnswer(
                weatherData.rainfall
            )
            await rainfallTx.wait()

            console.log("Updating wind speed feed...")
            const windTx = await windSpeedFeed.updateAnswer(
                weatherData.windSpeed
            )
            await windTx.wait()

            console.log(`Successfully updated all feeds for ${location}`)

            // Add delay between locations to avoid rate limiting
            if (locations.indexOf(location) < locations.length - 1) {
                console.log("Waiting 2 seconds before next update...")
                await new Promise((resolve) => setTimeout(resolve, 2000))
            }
        }

        // Display current feed values
        console.log("\nCurrent feed values:")
        const tempData = await temperatureFeed.latestRoundData()
        const humidityData = await humidityFeed.latestRoundData()
        const rainfallData = await rainfallFeed.latestRoundData()
        const windData = await windSpeedFeed.latestRoundData()

        console.log(
            `Temperature: ${Number(tempData.answer) / 100}°C (Round ${
                tempData.roundId
            })`
        )
        console.log(
            `Humidity: ${Number(humidityData.answer) / 100}% (Round ${
                humidityData.roundId
            })`
        )
        console.log(
            `Rainfall: ${Number(rainfallData.answer) / 100}mm (Round ${
                rainfallData.roundId
            })`
        )
        console.log(
            `Wind Speed: ${Number(windData.answer) / 100}km/h (Round ${
                windData.roundId
            })`
        )

        console.log("\nWeather feed update completed successfully!")
    } catch (error) {
        console.error("Error updating weather feeds:", error.message)
        console.error(error)
    }
}

/**
 * Get contract address from deployments
 */
async function getContractAddress(contractName) {
    try {
        const deployment = await deployments.get(contractName)
        return deployment.address
    } catch (error) {
        throw new Error(
            `Contract ${contractName} not found. Please deploy contracts first.`
        )
    }
}

// Run the script
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error)
            process.exit(1)
        })
}

module.exports = main
