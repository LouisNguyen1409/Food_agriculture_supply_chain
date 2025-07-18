// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Oracles/Weather.sol";
import "./Oracles/Price.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract OracleManager {
    using Weather for AggregatorV3Interface;
    using Price for AggregatorV3Interface;

    struct OracleFeeds {
        AggregatorV3Interface temperatureFeed;
        AggregatorV3Interface humidityFeed;
        AggregatorV3Interface rainfallFeed;
        AggregatorV3Interface windSpeedFeed;
        AggregatorV3Interface priceFeed;
        string feedName;
        bool isActive;
        uint256 lastUpdated;
    }

    struct MarketConditions {
        Weather.WeatherData weather;
        uint256 currentPrice;
        uint256 timestamp;
        string priceStatus; // "STABLE", "RISING", "FALLING"
        string weatherStatus; // "OPTIMAL", "WARNING", "CRITICAL"
    }

    // Storage
    mapping(string => OracleFeeds) public oracleFeeds; // location -> feeds
    mapping(address => bool) public authorizedContracts;
    address public owner;
    
    // Default feeds for general use
    OracleFeeds public defaultFeeds;
    
    // Historical data
    mapping(string => MarketConditions[]) public historicalConditions;
    uint256 public constant MAX_HISTORY = 100; // Last 100 readings per location

    // Events
    event OracleFeedsUpdated(
        string indexed location,
        address temperatureFeed,
        address humidityFeed,
        address rainfallFeed,
        address windSpeedFeed,
        address priceFeed
    );

    event MarketConditionsUpdated(
        string indexed location,
        Weather.WeatherData weather,
        uint256 price,
        string priceStatus,
        string weatherStatus,
        uint256 timestamp
    );

    event ContractAuthorized(address indexed contractAddress, bool authorized);
    
    event AlertTriggered(
        string indexed location,
        string alertType,
        string message,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyAuthorized() {
        require(
            authorizedContracts[msg.sender] || msg.sender == owner,
            "Not authorized to access oracle data"
        );
        _;
    }

    constructor(
        address _defaultTemperatureFeed,
        address _defaultHumidityFeed,
        address _defaultRainfallFeed,
        address _defaultWindSpeedFeed,
        address _defaultPriceFeed
    ) {
        owner = msg.sender;
        
        // Set up default feeds
        defaultFeeds = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_defaultTemperatureFeed),
            humidityFeed: AggregatorV3Interface(_defaultHumidityFeed),
            rainfallFeed: AggregatorV3Interface(_defaultRainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_defaultWindSpeedFeed),
            priceFeed: AggregatorV3Interface(_defaultPriceFeed),
            feedName: "Default",
            isActive: true,
            lastUpdated: block.timestamp
        });

        // Set up default location
        oracleFeeds["default"] = defaultFeeds;
    }

    /**
     * @dev Set oracle feeds for a specific location
     */
    function setOracleFeeds(
        string memory _location,
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed,
        string memory _feedName
    ) external onlyOwner {
        oracleFeeds[_location] = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_temperatureFeed),
            humidityFeed: AggregatorV3Interface(_humidityFeed),
            rainfallFeed: AggregatorV3Interface(_rainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_windSpeedFeed),
            priceFeed: AggregatorV3Interface(_priceFeed),
            feedName: _feedName,
            isActive: true,
            lastUpdated: block.timestamp
        });

        emit OracleFeedsUpdated(
            _location,
            _temperatureFeed,
            _humidityFeed,
            _rainfallFeed,
            _windSpeedFeed,
            _priceFeed
        );
    }

    /**
     * @dev Get current market conditions for a location
     */
    function getMarketConditions(string memory _location) 
        external 
        onlyAuthorized 
        returns (MarketConditions memory conditions) 
    {
        OracleFeeds memory feeds = oracleFeeds[_location];
        if (!feeds.isActive) {
            feeds = defaultFeeds; // Fall back to default
        }

        // Get weather data
        Weather.WeatherData memory weather = Weather.getWeatherData(
            feeds.temperatureFeed,
            feeds.humidityFeed,
            feeds.rainfallFeed,
            feeds.windSpeedFeed
        );

        // Get price data
        uint256 currentPrice = Price.getPrice(feeds.priceFeed);

        // Analyze price trend
        string memory priceStatus = _analyzePriceStatus(_location, currentPrice);
        
        // Analyze weather conditions
        string memory weatherStatus = _analyzeWeatherStatus(weather);

        conditions = MarketConditions({
            weather: weather,
            currentPrice: currentPrice,
            timestamp: block.timestamp,
            priceStatus: priceStatus,
            weatherStatus: weatherStatus
        });

        // Store historical data
        _storeHistoricalData(_location, conditions);

        emit MarketConditionsUpdated(
            _location,
            weather,
            currentPrice,
            priceStatus,
            weatherStatus,
            block.timestamp
        );

        return conditions;
    }

    /**
     * @dev Get current weather data only
     */
    function getCurrentWeather(string memory _location) 
        external 
        view 
        onlyAuthorized 
        returns (Weather.WeatherData memory) 
    {
        OracleFeeds memory feeds = oracleFeeds[_location];
        if (!feeds.isActive) {
            feeds = defaultFeeds;
        }

        return Weather.getWeatherData(
            feeds.temperatureFeed,
            feeds.humidityFeed,
            feeds.rainfallFeed,
            feeds.windSpeedFeed
        );
    }

    /**
     * @dev Get current price only
     */
    function getCurrentPrice(string memory _location) 
        external 
        view 
        onlyAuthorized 
        returns (uint256) 
    {
        OracleFeeds memory feeds = oracleFeeds[_location];
        if (!feeds.isActive) {
            feeds = defaultFeeds;
        }

        return Price.getPrice(feeds.priceFeed);
    }

    /**
     * @dev Check if farming conditions are suitable
     */
    function isFarmingConditionsSuitable(
        string memory _location,
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) external view onlyAuthorized returns (bool) {
        OracleFeeds memory feeds = oracleFeeds[_location];
        if (!feeds.isActive) {
            feeds = defaultFeeds;
        }

        return Weather.isFarmingConditionsSuitable(
            feeds.temperatureFeed,
            feeds.humidityFeed,
            feeds.rainfallFeed,
            minTemp,
            maxTemp,
            minHumidity,
            maxHumidity,
            maxRainfall
        );
    }

    /**
     * @dev Get price conversion rate (ETH to USD)
     */
    function getPriceConversionRate(string memory _location, uint256 ethAmount) 
        external 
        view 
        onlyAuthorized 
        returns (uint256) 
    {
        OracleFeeds memory feeds = oracleFeeds[_location];
        if (!feeds.isActive) {
            feeds = defaultFeeds;
        }

        return Price.getConversionRate(ethAmount, feeds.priceFeed);
    }

    /**
     * @dev Get historical conditions for a location
     */
    function getHistoricalConditions(string memory _location, uint256 _count) 
        external 
        view 
        onlyAuthorized 
        returns (MarketConditions[] memory) 
    {
        MarketConditions[] storage history = historicalConditions[_location];
        uint256 length = history.length;
        
        if (_count > length) {
            _count = length;
        }
        
        MarketConditions[] memory result = new MarketConditions[](_count);
        uint256 startIndex = length - _count;
        
        for (uint256 i = 0; i < _count; i++) {
            result[i] = history[startIndex + i];
        }
        
        return result;
    }

    /**
     * @dev Authorize contract to access oracle data
     */
    function authorizeContract(address _contract, bool _authorized) external onlyOwner {
        authorizedContracts[_contract] = _authorized;
        emit ContractAuthorized(_contract, _authorized);
    }

    /**
     * @dev Internal function to analyze price status
     */
    function _analyzePriceStatus(string memory _location, uint256 _currentPrice) 
        internal 
        view 
        returns (string memory) 
    {
        MarketConditions[] storage history = historicalConditions[_location];
        if (history.length == 0) {
            return "STABLE";
        }

        uint256 lastPrice = history[history.length - 1].currentPrice;
        uint256 threshold = lastPrice / 20; // 5% threshold

        if (_currentPrice > lastPrice + threshold) {
            return "RISING";
        } else if (_currentPrice < lastPrice - threshold) {
            return "FALLING";
        } else {
            return "STABLE";
        }
    }

    /**
     * @dev Internal function to analyze weather status
     */
    function _analyzeWeatherStatus(Weather.WeatherData memory _weather) 
        internal 
        pure 
        returns (string memory) 
    {
        // Temperature check (15-25°C * 100)
        bool tempOk = _weather.temperature >= 1500 && _weather.temperature <= 2500;
        
        // Humidity check (40-60%)
        bool humidityOk = _weather.humidity >= 4000 && _weather.humidity <= 6000;
        
        // Rainfall check (<50mm * 100)
        bool rainfallOk = _weather.rainfall <= 5000;

        if (tempOk && humidityOk && rainfallOk) {
            return "OPTIMAL";
        } else if ((_weather.temperature < 1000 || _weather.temperature > 3000) ||
                   (_weather.humidity < 2000 || _weather.humidity > 8000) ||
                   _weather.rainfall > 10000) {
            return "CRITICAL";
        } else {
            return "WARNING";
        }
    }

    /**
     * @dev Internal function to store historical data
     */
    function _storeHistoricalData(string memory _location, MarketConditions memory _conditions) 
        internal 
    {
        MarketConditions[] storage history = historicalConditions[_location];
        
        // Remove oldest entry if at max capacity
        if (history.length >= MAX_HISTORY) {
            for (uint256 i = 0; i < MAX_HISTORY - 1; i++) {
                history[i] = history[i + 1];
            }
            history.pop();
        }
        
        history.push(_conditions);
    }

    /**
     * @dev Emergency function to deactivate feeds
     */
    function deactivateFeeds(string memory _location) external onlyOwner {
        oracleFeeds[_location].isActive = false;
    }

    /**
     * @dev Get feed info for a location
     */
    function getFeedInfo(string memory _location) 
        external 
        view 
        returns (
            string memory feedName,
            bool isActive,
            uint256 lastUpdated,
            address temperatureFeed,
            address priceFeed
        ) 
    {
        OracleFeeds memory feeds = oracleFeeds[_location];
        return (
            feeds.feedName,
            feeds.isActive,
            feeds.lastUpdated,
            address(feeds.temperatureFeed),
            address(feeds.priceFeed)
        );
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid new owner");
        owner = _newOwner;
    }
} 