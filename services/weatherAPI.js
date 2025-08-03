const axios = require("axios")
require("dotenv").config()

class WeatherAPIService {
    constructor() {
        // Using OpenWeatherMap API - you can get a free API key at openweathermap.org
        this.apiKey = process.env.OPENWEATHER_API_KEY
        this.baseUrl = "https://api.openweathermap.org/data/2.5"

        if (!this.apiKey) {
            console.warn(
                "OPENWEATHER_API_KEY not found in .env file. Using mock data."
            )
        }
    }

    /**
     * Get current weather data for a location
     * @param {string} location - City name or coordinates (lat,lon)
     * @returns {Promise<Object>} Weather data
     */
    async getCurrentWeather(location = "Sydney,AU") {
        if (!this.apiKey) {
            return this._getMockWeatherData()
        }

        try {
            const response = await axios.get(`${this.baseUrl}/weather`, {
                params: {
                    q: location,
                    appid: this.apiKey,
                    units: "metric", // Get temperature in Celsius
                },
            })

            const weather = response.data

            return {
                temperature: Math.round(weather.main.temp * 100), // Scale by 100 for Solidity (25.5°C -> 2550)
                humidity: Math.round(weather.main.humidity * 100), // Scale by 100 (65% -> 6500)
                rainfall: this._calculateRainfall(weather), // mm scaled by 100
                windSpeed: Math.round(weather.wind.speed * 3.6 * 100), // Convert m/s to km/h, scale by 100
                timestamp: Math.floor(Date.now() / 1000),
                location: weather.name,
                description: weather.weather[0].description,
            }
        } catch (error) {
            console.error("Error fetching weather data:", error.message)
            console.log("Falling back to mock data...")
            return this._getMockWeatherData()
        }
    }

    /**
     * Get weather forecast for the next 5 days
     * @param {string} location - City name or coordinates
     * @returns {Promise<Array>} Array of weather forecasts
     */
    async getWeatherForecast(location = "Sydney,AU") {
        if (!this.apiKey) {
            return [this._getMockWeatherData()]
        }

        try {
            const response = await axios.get(`${this.baseUrl}/forecast`, {
                params: {
                    q: location,
                    appid: this.apiKey,
                    units: "metric",
                },
            })

            return response.data.list.map((item) => ({
                temperature: Math.round(item.main.temp * 100),
                humidity: Math.round(item.main.humidity * 100),
                rainfall: this._calculateRainfall(item),
                windSpeed: Math.round(item.wind.speed * 3.6 * 100),
                timestamp: item.dt,
                description: item.weather[0].description,
            }))
        } catch (error) {
            console.error("Error fetching forecast data:", error.message)
            return [this._getMockWeatherData()]
        }
    }

    /**
     * Calculate rainfall from weather data
     * @param {Object} weatherData - Weather data from API
     * @returns {number} Rainfall in mm (scaled by 100)
     */
    _calculateRainfall(weatherData) {
        let rainfall = 0

        // Check for rain in the last 1 hour or 3 hours
        if (weatherData.rain) {
            rainfall = weatherData.rain["1h"] || weatherData.rain["3h"] || 0
        }

        // If no rain data but rainy conditions, estimate based on weather
        if (rainfall === 0 && weatherData.weather) {
            const mainWeather = weatherData.weather[0].main.toLowerCase()
            if (mainWeather.includes("rain")) {
                rainfall = Math.random() * 5 // Random rainfall between 0-5mm
            } else if (mainWeather.includes("drizzle")) {
                rainfall = Math.random() * 2 // Light rainfall
            }
        }

        return Math.round(rainfall * 100) // Scale by 100 for Solidity
    }

    /**
     * Get mock weather data for testing
     * @returns {Object} Mock weather data
     */
    _getMockWeatherData() {
        const baseTemp = 20 + Math.random() * 20 // 20-40°C
        const baseHumidity = 40 + Math.random() * 40 // 40-80%
        const baseRainfall = Math.random() * 10 // 0-10mm
        const baseWindSpeed = 5 + Math.random() * 25 // 5-30 km/h

        return {
            temperature: Math.round(baseTemp * 100),
            humidity: Math.round(baseHumidity * 100),
            rainfall: Math.round(baseRainfall * 100),
            windSpeed: Math.round(baseWindSpeed * 100),
            timestamp: Math.floor(Date.now() / 1000),
            location: "Mock Location",
            description: "mock weather data",
        }
    }

    /**
     * Get weather data formatted for smart contract updates
     * @param {string} location - Location to get weather for
     * @returns {Promise<Object>} Weather data formatted for contracts
     */
    async getContractFormattedWeather(location) {
        const weather = await this.getCurrentWeather(location)

        return {
            temperature: weather.temperature, // Already scaled
            humidity: weather.humidity, // Already scaled
            rainfall: weather.rainfall, // Already scaled
            windSpeed: weather.windSpeed, // Already scaled
            timestamp: weather.timestamp,
            roundId: Math.floor(Date.now() / 1000), // Use timestamp as round ID
        }
    }
}

module.exports = WeatherAPIService
