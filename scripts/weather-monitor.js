const { ethers } = require("hardhat")
const WeatherAPIService = require("../services/weatherAPI")

/**
 * Weather monitoring script that continuously updates feeds
 * Usage: npx hardhat run scripts/weather-monitor.js --network localhost
 */
class WeatherMonitor {
    constructor() {
        this.weatherAPI = new WeatherAPIService()
        this.updateInterval = 5 * 60 * 1000 // 5 minutes
        this.isRunning = false
        this.contracts = {}
    }

    async initialize() {
        console.log("Initializing Weather Monitor...")

        // Get deployer account
        const [deployer] = await ethers.getSigners()
        this.deployer = deployer
        console.log(`Monitor running with account: ${deployer.address}`)

        // Connect to contracts
        await this.connectToContracts()

        console.log("Weather Monitor initialized successfully!")
    }

    async connectToContracts() {
        try {
            const UpdatableWeatherFeed = await ethers.getContractFactory(
                "UpdatableWeatherFeed"
            )

            // Get contract addresses
            const addresses = {
                temperature: await this.getContractAddress(
                    "UpdatableTemperatureFeed"
                ),
                humidity: await this.getContractAddress(
                    "UpdatableHumidityFeed"
                ),
                rainfall: await this.getContractAddress(
                    "UpdatableRainfallFeed"
                ),
                windSpeed: await this.getContractAddress(
                    "UpdatableWindSpeedFeed"
                ),
            }

            // Connect to contracts
            this.contracts = {
                temperature: UpdatableWeatherFeed.attach(addresses.temperature),
                humidity: UpdatableWeatherFeed.attach(addresses.humidity),
                rainfall: UpdatableWeatherFeed.attach(addresses.rainfall),
                windSpeed: UpdatableWeatherFeed.attach(addresses.windSpeed),
            }

            console.log("Connected to weather feed contracts:")
            Object.entries(addresses).forEach(([type, address]) => {
                console.log(`  ${type}: ${address}`)
            })
        } catch (error) {
            throw new Error(`Failed to connect to contracts: ${error.message}`)
        }
    }

    async startMonitoring(location = "Sydney,AU") {
        console.log(`\nStarting weather monitoring for ${location}`)
        console.log(
            `Update interval: ${this.updateInterval / 1000 / 60} minutes`
        )

        this.isRunning = true
        this.location = location

        // Initial update
        await this.updateWeatherData()

        // Set up periodic updates
        this.intervalId = setInterval(async () => {
            if (this.isRunning) {
                await this.updateWeatherData()
            }
        }, this.updateInterval)

        console.log("Weather monitoring started. Press Ctrl+C to stop.")

        // Handle graceful shutdown
        process.on("SIGINT", () => {
            this.stopMonitoring()
        })
    }

    async updateWeatherData() {
        try {
            console.log(
                `\nUpdating weather data... (${new Date().toISOString()})`
            )

            // Fetch current weather
            const weatherData =
                await this.weatherAPI.getContractFormattedWeather(this.location)

            console.log(`Current weather for ${this.location}:`)
            console.log(`  Temperature: ${weatherData.temperature / 100}°C`)
            console.log(`  Humidity: ${weatherData.humidity / 100}%`)
            console.log(`  Rainfall: ${weatherData.rainfall / 100}mm`)
            console.log(`  Wind Speed: ${weatherData.windSpeed / 100}km/h`)

            // Update contracts in parallel for better performance
            const updatePromises = [
                this.updateContract("temperature", weatherData.temperature),
                this.updateContract("humidity", weatherData.humidity),
                this.updateContract("rainfall", weatherData.rainfall),
                this.updateContract("windSpeed", weatherData.windSpeed),
            ]

            await Promise.all(updatePromises)
            console.log("All weather feeds updated successfully!")
        } catch (error) {
            console.error("Error updating weather data:", error.message)
        }
    }

    async updateContract(type, value) {
        try {
            const tx = await this.contracts[type].updateAnswer(value)
            await tx.wait()
            console.log(
                `  ${type} feed updated (tx: ${tx.hash.substring(0, 10)}...)`
            )
        } catch (error) {
            console.error(`  Failed to update ${type} feed:`, error.message)
        }
    }

    stopMonitoring() {
        console.log("\nStopping weather monitor...")
        this.isRunning = false

        if (this.intervalId) {
            clearInterval(this.intervalId)
        }

        console.log("Weather monitor stopped.")
        process.exit(0)
    }

    async getCurrentFeedValues() {
        console.log("\nCurrent feed values:")

        try {
            const values = await Promise.all([
                this.contracts.temperature.latestRoundData(),
                this.contracts.humidity.latestRoundData(),
                this.contracts.rainfall.latestRoundData(),
                this.contracts.windSpeed.latestRoundData(),
            ])

            const [tempData, humidityData, rainfallData, windData] = values

            console.log(
                `  Temperature: ${tempData.answer / 100}°C (Round ${
                    tempData.roundId
                })`
            )
            console.log(
                `  Humidity: ${humidityData.answer / 100}% (Round ${
                    humidityData.roundId
                })`
            )
            console.log(
                `  Rainfall: ${rainfallData.answer / 100}mm (Round ${
                    rainfallData.roundId
                })`
            )
            console.log(
                `  Wind Speed: ${windData.answer / 100}km/h (Round ${
                    windData.roundId
                })`
            )
        } catch (error) {
            console.error("Error fetching feed values:", error.message)
        }
    }

    async getContractAddress(contractName) {
        try {
            const deployment = await deployments.get(contractName)
            return deployment.address
        } catch (error) {
            throw new Error(
                `Contract ${contractName} not found. Please deploy contracts first.`
            )
        }
    }
}

async function main() {
    const monitor = new WeatherMonitor()

    try {
        await monitor.initialize()

        // Get location from command line args or use default
        const args = process.argv.slice(2)
        const location = args.length > 0 ? args.join(" ") : "Sydney,AU"

        // Display current values first
        await monitor.getCurrentFeedValues()

        // Start monitoring
        await monitor.startMonitoring(location)
    } catch (error) {
        console.error("Failed to start weather monitor:", error.message)
        process.exit(1)
    }
}

// Run if called directly
if (require.main === module) {
    main()
}

module.exports = WeatherMonitor
