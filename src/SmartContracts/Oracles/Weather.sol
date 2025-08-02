// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

library Weather {
    // Get temperature in Celsius (scaled if feed is scaled)
    function getTemperature(
        AggregatorV3Interface temperatureFeed
    ) internal view returns (int256) {
        (, int256 temperature, , , ) = temperatureFeed.latestRoundData();
        return temperature;
    }

    // Get humidity as percentage
    function getHumidity(
        AggregatorV3Interface humidityFeed
    ) internal view returns (uint256) {
        (, int256 humidity, , , ) = humidityFeed.latestRoundData();
        require(humidity >= 0, "Invalid humidity data");
        return uint256(humidity);
    }

    // Get rainfall in mm
    function getRainfall(
        AggregatorV3Interface rainfallFeed
    ) internal view returns (uint256) {
        (, int256 rainfall, , , ) = rainfallFeed.latestRoundData();
        require(rainfall >= 0, "Invalid rainfall data");
        return uint256(rainfall);
    }

    // Get wind speed in km/h
    function getWindSpeed(
        AggregatorV3Interface windSpeedFeed
    ) internal view returns (uint256) {
        (, int256 windSpeed, , , ) = windSpeedFeed.latestRoundData();
        require(windSpeed >= 0, "Invalid wind speed data");
        return uint256(windSpeed);
    }

    struct WeatherData {
        int256 temperature;
        uint256 humidity;
        uint256 rainfall;
        uint256 windSpeed;
        uint256 timestamp;
    }

    function getWeatherData(
        AggregatorV3Interface temperatureFeed,
        AggregatorV3Interface humidityFeed,
        AggregatorV3Interface rainfallFeed,
        AggregatorV3Interface windSpeedFeed
    ) internal view returns (WeatherData memory) {
        return
            WeatherData({
                temperature: getTemperature(temperatureFeed),
                humidity: getHumidity(humidityFeed),
                rainfall: getRainfall(rainfallFeed),
                windSpeed: getWindSpeed(windSpeedFeed),
                timestamp: block.timestamp
            });
    }

    // Check if temperature is within range
    function isTemperatureOptimal(
        AggregatorV3Interface temperatureFeed,
        int256 minTemp,
        int256 maxTemp
    ) internal view returns (bool) {
        int256 currentTemp = getTemperature(temperatureFeed);
        return currentTemp >= minTemp && currentTemp <= maxTemp;
    }

    // Check humidity range
    function isHumidityOptimal(
        AggregatorV3Interface humidityFeed,
        uint256 minHumidity,
        uint256 maxHumidity
    ) internal view returns (bool) {
        uint256 currentHumidity = getHumidity(humidityFeed);
        return currentHumidity >= minHumidity && currentHumidity <= maxHumidity;
    }

    // Combined suitability (requires all four feeds)
    function isFarmingConditionsSuitable(
        AggregatorV3Interface temperatureFeed,
        AggregatorV3Interface humidityFeed,
        AggregatorV3Interface rainfallFeed,
        AggregatorV3Interface windSpeedFeed,
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) internal view returns (bool) {
        WeatherData memory weather = getWeatherData(
            temperatureFeed,
            humidityFeed,
            rainfallFeed,
            windSpeedFeed
        );

        return (weather.temperature >= minTemp &&
            weather.temperature <= maxTemp &&
            weather.humidity >= minHumidity &&
            weather.humidity <= maxHumidity &&
            weather.rainfall <= maxRainfall);
    }
}
