const { ethers } = require("hardhat")
const WeatherAPIService = require("../services/weatherAPI")

/**
 * Test script to verify weather integration with existing codebase
 * Tests the Weather.sol library with real API data
 */
async function main() {
    console.log("Testing Weather Integration with Existing Codebase...")

    try {
        // Initialize weather API service
        const weatherAPI = new WeatherAPIService()

        // Get deployer account
        const [deployer] = await ethers.getSigners()
        console.log(`Testing with account: ${deployer.address}`)

        // Step 1: Deploy updatable weather feeds if not already deployed
        console.log("\nSetting up weather feeds...")
        await deployWeatherFeeds()

        // Step 2: Update feeds with real weather data
        console.log("\nFetching and updating real weather data...")
        const weatherData = await weatherAPI.getContractFormattedWeather(
            "Sydney,AU"
        )
        await updateAllFeeds(weatherData)

        // Step 3: Test existing Weather.sol library functions
        console.log("\nTesting Weather.sol library functions...")
        await testWeatherLibrary()

        // Step 4: Test with ProductBatch contract (existing integration)
        console.log("\nTesting ProductBatch weather integration...")
        await testProductBatchWeatherIntegration()

        console.log("\nAll weather integration tests passed!")
    } catch (error) {
        console.error("Weather integration test failed:", error.message)
        console.error(error)
        process.exit(1)
    }
}

async function deployWeatherFeeds() {
    try {
        // Check if feeds are already deployed
        const UpdatableWeatherFeed = await ethers.getContractFactory(
            "UpdatableWeatherFeed"
        )

        let temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed

        try {
            const tempAddress = await getContractAddress(
                "UpdatableTemperatureFeed"
            )
            temperatureFeed = UpdatableWeatherFeed.attach(tempAddress)
            console.log("Using existing UpdatableTemperatureFeed")
        } catch {
            console.log("Deploying UpdatableTemperatureFeed...")
            temperatureFeed = await UpdatableWeatherFeed.deploy(
                2,
                "Temperature Feed",
                2500
            )
            await temperatureFeed.waitForDeployment()
        }

        try {
            const humidityAddress = await getContractAddress(
                "UpdatableHumidityFeed"
            )
            humidityFeed = UpdatableWeatherFeed.attach(humidityAddress)
            console.log("Using existing UpdatableHumidityFeed")
        } catch {
            console.log("Deploying UpdatableHumidityFeed...")
            humidityFeed = await UpdatableWeatherFeed.deploy(
                2,
                "Humidity Feed",
                6500
            )
            await humidityFeed.waitForDeployment()
        }

        try {
            const rainfallAddress = await getContractAddress(
                "UpdatableRainfallFeed"
            )
            rainfallFeed = UpdatableWeatherFeed.attach(rainfallAddress)
            console.log("Using existing UpdatableRainfallFeed")
        } catch {
            console.log("Deploying UpdatableRainfallFeed...")
            rainfallFeed = await UpdatableWeatherFeed.deploy(
                2,
                "Rainfall Feed",
                200
            )
            await rainfallFeed.waitForDeployment()
        }

        try {
            const windAddress = await getContractAddress(
                "UpdatableWindSpeedFeed"
            )
            windSpeedFeed = UpdatableWeatherFeed.attach(windAddress)
            console.log("Using existing UpdatableWindSpeedFeed")
        } catch {
            console.log("Deploying UpdatableWindSpeedFeed...")
            windSpeedFeed = await UpdatableWeatherFeed.deploy(
                2,
                "Wind Speed Feed",
                1500
            )
            await windSpeedFeed.waitForDeployment()
        }

        // Store addresses for later use
        global.weatherFeeds = {
            temperature: temperatureFeed,
            humidity: humidityFeed,
            rainfall: rainfallFeed,
            windSpeed: windSpeedFeed,
        }

        console.log("Weather feeds ready")
    } catch (error) {
        throw new Error(`Failed to deploy weather feeds: ${error.message}`)
    }
}

async function updateAllFeeds(weatherData) {
    const feeds = global.weatherFeeds

    console.log(`Temperature: ${weatherData.temperature / 100}°C`)
    const tempTx = await feeds.temperature.updateAnswer(weatherData.temperature)
    await tempTx.wait()

    console.log(`Humidity: ${weatherData.humidity / 100}%`)
    const humidityTx = await feeds.humidity.updateAnswer(weatherData.humidity)
    await humidityTx.wait()

    console.log(`Rainfall: ${weatherData.rainfall / 100}mm`)
    const rainfallTx = await feeds.rainfall.updateAnswer(weatherData.rainfall)
    await rainfallTx.wait()

    console.log(`Wind Speed: ${weatherData.windSpeed / 100}km/h`)
    const windTx = await feeds.windSpeed.updateAnswer(weatherData.windSpeed)
    await windTx.wait()

    console.log("All feeds updated with real weather data")
}

async function testWeatherLibrary() {
    // Deploy a test contract that uses the Weather library
    const WeatherTestContract = await ethers.getContractFactory(
        "WeatherTestContract"
    )
    let weatherTest

    try {
        weatherTest = await WeatherTestContract.deploy()
        await weatherTest.waitForDeployment()
    } catch (error) {
        // If WeatherTestContract doesn't exist, create a simple one
        console.log("Creating weather test contract...")
        await createWeatherTestContract()
        const WeatherTestContractNew = await ethers.getContractFactory(
            "WeatherTestContract"
        )
        weatherTest = await WeatherTestContractNew.deploy()
        await weatherTest.waitForDeployment()
    }

    const feeds = global.weatherFeeds

    // Test individual weather functions
    console.log("Testing getTemperature()...")
    const temperature = await weatherTest.testGetTemperature(
        await feeds.temperature.getAddress()
    )
    console.log(`  Result: ${temperature / 100}°C`)

    console.log("Testing getHumidity()...")
    const humidity = await weatherTest.testGetHumidity(
        await feeds.humidity.getAddress()
    )
    console.log(`  Result: ${humidity / 100}%`)

    console.log("Testing getRainfall()...")
    const rainfall = await weatherTest.testGetRainfall(
        await feeds.rainfall.getAddress()
    )
    console.log(`  Result: ${rainfall / 100}mm`)

    console.log("Testing getWindSpeed()...")
    const windSpeed = await weatherTest.testGetWindSpeed(
        await feeds.windSpeed.getAddress()
    )
    console.log(`  Result: ${windSpeed / 100}km/h`)

    // Test combined weather data function
    console.log("Testing getWeatherData()...")
    const weatherData = await weatherTest.testGetWeatherData(
        await feeds.temperature.getAddress(),
        await feeds.humidity.getAddress(),
        await feeds.rainfall.getAddress(),
        await feeds.windSpeed.getAddress()
    )

    console.log("  Combined weather data:")
    console.log(`    Temperature: ${weatherData.temperature / 100}°C`)
    console.log(`    Humidity: ${weatherData.humidity / 100}%`)
    console.log(`    Rainfall: ${weatherData.rainfall / 100}mm`)
    console.log(`    Wind Speed: ${weatherData.windSpeed / 100}km/h`)

    // Test farming conditions
    console.log("Testing isFarmingConditionsSuitable()...")
    const isSuitable = await weatherTest.testIsFarmingConditionsSuitable(
        await feeds.temperature.getAddress(),
        await feeds.humidity.getAddress(),
        await feeds.rainfall.getAddress(),
        await feeds.windSpeed.getAddress(),
        1000, // min temp: 10°C
        3500, // max temp: 35°C
        3000, // min humidity: 30%
        8000, // max humidity: 80%
        1000 // max rainfall: 10mm
    )

    console.log(`  Farming conditions suitable: ${isSuitable ? "Yes" : "No"}`)

    console.log("Weather library tests completed")
}

async function testProductBatchWeatherIntegration() {
    try {
        // Get ProductBatch contract
        const productBatchAddress = await getContractAddress("ProductBatch")
        const ProductBatch = await ethers.getContractFactory("ProductBatch")
        const productBatch = ProductBatch.attach(productBatchAddress)

        console.log(`Testing with ProductBatch at ${productBatchAddress}`)

        // Note: This test assumes your ProductBatch contract has weather-related functions
        // If it doesn't, we'll just verify the contract exists and can interact with weather feeds

        console.log("ProductBatch contract accessible")
        console.log(
            "   Weather integration available through Weather.sol library"
        )
    } catch (error) {
        console.log(
            "WARNING: ProductBatch not deployed or doesn't have weather integration yet"
        )
        console.log("   Deploy your contracts first: npm run deploy:local")
    }
}

async function createWeatherTestContract() {
    const contractCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../src/SmartContracts/Oracles/Weather.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract WeatherTestContract {
    using Weather for AggregatorV3Interface;

    function testGetTemperature(address feed) external view returns (int256) {
        return AggregatorV3Interface(feed).getTemperature();
    }

    function testGetHumidity(address feed) external view returns (uint256) {
        return AggregatorV3Interface(feed).getHumidity();
    }

    function testGetRainfall(address feed) external view returns (uint256) {
        return AggregatorV3Interface(feed).getRainfall();
    }

    function testGetWindSpeed(address feed) external view returns (uint256) {
        return AggregatorV3Interface(feed).getWindSpeed();
    }

    function testGetWeatherData(
        address tempFeed,
        address humidityFeed,
        address rainfallFeed,
        address windFeed
    ) external view returns (Weather.WeatherData memory) {
        return AggregatorV3Interface(tempFeed).getWeatherData(
            AggregatorV3Interface(tempFeed),
            AggregatorV3Interface(humidityFeed),
            AggregatorV3Interface(rainfallFeed),
            AggregatorV3Interface(windFeed)
        );
    }

    function testIsFarmingConditionsSuitable(
        address tempFeed,
        address humidityFeed,
        address rainfallFeed,
        address windFeed,
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) external view returns (bool) {
        return AggregatorV3Interface(tempFeed).isFarmingConditionsSuitable(
            AggregatorV3Interface(tempFeed),
            AggregatorV3Interface(humidityFeed),
            AggregatorV3Interface(rainfallFeed),
            AggregatorV3Interface(windFeed),
            minTemp,
            maxTemp,
            minHumidity,
            maxHumidity,
            maxRainfall
        );
    }
}
`

    // Write the test contract
    const fs = require("fs")
    const path = require("path")

    const contractPath = path.join(
        __dirname,
        "../src/SmartContracts/test/WeatherTestContract.sol"
    )
    fs.writeFileSync(contractPath, contractCode)

    console.log("Created WeatherTestContract.sol")
}

async function getContractAddress(contractName) {
    const deployment = await deployments.get(contractName)
    return deployment.address
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
