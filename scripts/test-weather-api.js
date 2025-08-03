const WeatherAPIService = require("../services/weatherAPI")

/**
 * Simple test to verify weather API service works
 */
async function main() {
    console.log("Testing Weather API Service...")

    const weatherAPI = new WeatherAPIService()

    try {
        // Test getCurrentWeather
        console.log("\nGetting current weather for Sydney, AU...")
        const weather = await weatherAPI.getCurrentWeather("Sydney,AU")

        console.log("Weather data received:")
        console.log(`  Location: ${weather.location}`)
        console.log(`  Description: ${weather.description}`)
        console.log(`  Temperature: ${weather.temperature / 100}°C`)
        console.log(`  Humidity: ${weather.humidity / 100}%`)
        console.log(`  Rainfall: ${weather.rainfall / 100}mm`)
        console.log(`  Wind Speed: ${weather.windSpeed / 100}km/h`)
        console.log(
            `  Timestamp: ${new Date(weather.timestamp * 1000).toISOString()}`
        )

        // Test getContractFormattedWeather
        console.log("\nGetting contract-formatted weather data...")
        const contractWeather = await weatherAPI.getContractFormattedWeather(
            "Melbourne,AU"
        )

        console.log("Contract-formatted data:")
        console.log(
            `  Temperature: ${contractWeather.temperature} (${
                contractWeather.temperature / 100
            }°C)`
        )
        console.log(
            `  Humidity: ${contractWeather.humidity} (${
                contractWeather.humidity / 100
            }%)`
        )
        console.log(
            `  Rainfall: ${contractWeather.rainfall} (${
                contractWeather.rainfall / 100
            }mm)`
        )
        console.log(
            `  Wind Speed: ${contractWeather.windSpeed} (${
                contractWeather.windSpeed / 100
            }km/h)`
        )
        console.log(`  Round ID: ${contractWeather.roundId}`)

        // Test weather forecast
        console.log("\nGetting weather forecast...")
        const forecast = await weatherAPI.getWeatherForecast("Brisbane,AU")

        console.log(`Forecast data (${forecast.length} entries):`)
        forecast.slice(0, 3).forEach((entry, index) => {
            console.log(`  Entry ${index + 1}:`)
            console.log(`    Temperature: ${entry.temperature / 100}°C`)
            console.log(`    Humidity: ${entry.humidity / 100}%`)
            console.log(`    Description: ${entry.description}`)
            console.log(
                `    Time: ${new Date(entry.timestamp * 1000).toISOString()}`
            )
        })

        console.log("\nWeather API service test completed successfully!")

        if (!process.env.OPENWEATHER_API_KEY) {
            console.log(
                "\nNote: No OPENWEATHER_API_KEY found, using mock data."
            )
            console.log("   To use real weather data:")
            console.log(
                "   1. Get a free API key from https://openweathermap.org/api"
            )
            console.log(
                "   2. Add OPENWEATHER_API_KEY=your_key to your .env file"
            )
        }
    } catch (error) {
        console.error("Weather API test failed:", error.message)
        console.error(error)
    }
}

// Run the test
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error)
            process.exit(1)
        })
}

module.exports = main
