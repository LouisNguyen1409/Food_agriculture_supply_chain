// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./Stakeholder.sol";
import "./Oracles/Weather.sol";
import "./Oracles/Price.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract Product {
    using Weather for AggregatorV3Interface;
    using Price for AggregatorV3Interface;

    enum ProductStage {
        FARM,
        PROCESSING,
        DISTRIBUTION,
        RETAIL,
        CONSUMED
    }

    struct StageData {
        address stakeholder;
        uint32 timestamp;
        string data;
        bytes32 dataHash;
        Weather.WeatherData weatherAtStage;
        uint256 marketPriceAtStage;
    }

    struct OracleFeeds {
        AggregatorV3Interface temperatureFeed;
        AggregatorV3Interface humidityFeed;
        AggregatorV3Interface rainfallFeed;
        AggregatorV3Interface windSpeedFeed;
        AggregatorV3Interface priceFeed;
    }

    // Product basic info
    string public name;
    string public description;
    uint256 public minCTemperature;
    uint256 public maxCTemperature;
    string public location;

    // Product state
    address public farmer;
    uint32 public createdAt;
    ProductStage public currentStage;
    bool public isActive;
    bytes32 public dataHash;
    uint256 public estimatedPrice;

    // Stage tracking
    mapping(ProductStage => StageData) public productStages;

    // External contracts
    StakeholderRegistry public immutable stakeholderRegistry;
    OracleFeeds public oracleFeeds;

    // Events
    event ProductStageUpdated(
        ProductStage indexed stage,
        address indexed stakeholder,
        string data,
        uint32 timestamp,
        Weather.WeatherData weatherData,
        uint256 marketPrice
    );

    event WeatherAlert(
        string alertType,
        string message,
        Weather.WeatherData weatherData,
        uint32 timestamp
    );

    event PriceAlert(
        uint256 currentPrice,
        uint256 alertThreshold,
        string priceMovement,
        uint32 timestamp
    );

    // Modifiers
    modifier onlyRegisteredStakeholder(
        Stakeholder.StakeholderRole _requiredRole
    ) {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                _requiredRole
            ),
            "Not registered for this role"
        );
        _;
    }

    modifier validStageTransition(ProductStage _newStage) {
        require(
            uint(_newStage) == uint(currentStage) + 1,
            "Invalid stage transition"
        );
        _;
    }

    modifier nonEmptyString(string calldata _str) {
        require(bytes(_str).length > 0, "String cannot be empty");
        _;
    }

    constructor(
        string memory _name,
        string memory _description,
        uint256 _minCTemperature,
        uint256 _maxCTemperature,
        string memory _location,
        string memory _farmData,
        address _stakeholderRegistry,
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) {
        require(bytes(_name).length > 0, "Product name cannot be empty");
        require(bytes(_description).length > 0, "Product description cannot be empty");
        require(bytes(_location).length > 0, "Product location cannot be empty");
        
        name = _name;
        description = _description;
        minCTemperature = _minCTemperature;
        maxCTemperature = _maxCTemperature;
        location = _location;
        farmer = tx.origin; // The farmer who initiated the factory call
        createdAt = uint32(block.timestamp);
        currentStage = ProductStage.FARM;
        isActive = true;
        dataHash = keccak256(abi.encodePacked(_name, _farmData));

        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistry);

        oracleFeeds = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_temperatureFeed),
            humidityFeed: AggregatorV3Interface(_humidityFeed),
            rainfallFeed: AggregatorV3Interface(_rainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_windSpeedFeed),
            priceFeed: AggregatorV3Interface(_priceFeed)
        });

        // Get initial oracle data
        (
            Weather.WeatherData memory currentWeather,
            uint256 currentPrice
        ) = _getOracleDataSafe();

        estimatedPrice = currentPrice;

        // Create initial farm stage data
        productStages[ProductStage.FARM] = StageData({
            stakeholder: farmer,
            timestamp: createdAt,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        // Check conditions and emit events
        _checkConditionsAndEmitEvents(currentWeather, currentPrice);
    }

    /**
     * @dev Update processing stage
     */
    function updateProcessingStage(
        string calldata _processingData
    )
        external
        onlyRegisteredStakeholder(Stakeholder.StakeholderRole.PROCESSOR)
        validStageTransition(ProductStage.PROCESSING)
        nonEmptyString(_processingData)
    {
        _updateProductStage(ProductStage.PROCESSING, _processingData);
    }

    /**
     * @dev Update distribution stage
     */
    function updateDistributionStage(
        string calldata _distributionData
    )
        external
        onlyRegisteredStakeholder(Stakeholder.StakeholderRole.DISTRIBUTOR)
        validStageTransition(ProductStage.DISTRIBUTION)
        nonEmptyString(_distributionData)
    {
        _updateProductStage(ProductStage.DISTRIBUTION, _distributionData);
    }

    /**
     * @dev Update retail stage
     */
    function updateRetailStage(
        string calldata _retailData
    )
        external
        onlyRegisteredStakeholder(Stakeholder.StakeholderRole.RETAILER)
        validStageTransition(ProductStage.RETAIL)
        nonEmptyString(_retailData)
    {
        _updateProductStage(ProductStage.RETAIL, _retailData);
    }

    /**
     * @dev Internal function to update stage
     */
    function _updateProductStage(
        ProductStage _stage,
        string calldata _data
    ) internal {
        uint32 currentTime = uint32(block.timestamp);

        // Get oracle data
        (
            Weather.WeatherData memory currentWeather,
            uint256 currentPrice
        ) = _getOracleDataSafe();

        // Update product state
        currentStage = _stage;
        estimatedPrice = currentPrice;

        // Update stage data
        productStages[_stage] = StageData({
            stakeholder: msg.sender,
            timestamp: currentTime,
            data: _data,
            dataHash: keccak256(abi.encodePacked(_data)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        // Check conditions and emit events
        _checkConditionsAndEmitEvents(currentWeather, currentPrice);

        emit ProductStageUpdated(
            _stage,
            msg.sender,
            _data,
            currentTime,
            currentWeather,
            currentPrice
        );
    }

    /**
     * @dev Mark product as consumed
     */
    function markAsConsumed() external {
        require(
            currentStage == ProductStage.RETAIL,
            "Product must be at retail stage"
        );

        currentStage = ProductStage.CONSUMED;

        emit ProductStageUpdated(
            ProductStage.CONSUMED,
            msg.sender,
            "Product consumed",
            uint32(block.timestamp),
            Weather.WeatherData(0, 0, 0, 0, uint32(block.timestamp)),
            0
        );
    }

    /**
     * @dev Verify product data integrity
     */
    function verifyProduct() external view returns (bool isValid) {
        bool dataValid = true;

        for (uint i = 0; i <= uint(currentStage); i++) {
            ProductStage stage = ProductStage(i);
            StageData memory stageData = productStages[stage];

            if (stageData.timestamp > 0) {
                bytes32 expectedHash = keccak256(
                    abi.encodePacked(stageData.data)
                );
                if (expectedHash != stageData.dataHash) {
                    dataValid = false;
                    break;
                }
            }
        }

        return dataValid;
    }

    /**
     * @dev Get stage data
     */
    function getStageData(
        ProductStage _stage
    ) external view returns (StageData memory) {
        return productStages[_stage];
    }

    /**
     * @dev Get complete product journey
     */
    function getProductJourney()
        external
        view
        returns (
            StageData memory farmStage,
            StageData memory processingStage,
            StageData memory distributionStage,
            StageData memory retailStage
        )
    {
        return (
            productStages[ProductStage.FARM],
            productStages[ProductStage.PROCESSING],
            productStages[ProductStage.DISTRIBUTION],
            productStages[ProductStage.RETAIL]
        );
    }

    /**
     * @dev Get basic product info
     */
    function getProductInfo()
        external
        view
        returns (
            string memory productName,
            string memory productDescription,
            address productFarmer,
            uint32 productCreatedAt,
            ProductStage productCurrentStage,
            bool productIsActive,
            uint256 productEstimatedPrice,
            string memory productLocation
        )
    {
        return (
            name,
            description,
            farmer,
            createdAt,
            currentStage,
            isActive,
            estimatedPrice,
            location
        );
    }

    // Oracle and condition checking functions (same as ProductRegistry)
    function _getOracleDataSafe()
        internal
        view
        returns (Weather.WeatherData memory weather, uint256 price)
    {
        weather = _getWeatherDataSafe();
        price = _getPriceSafe();
    }

    function _getWeatherDataSafe()
        internal
        view
        returns (Weather.WeatherData memory)
    {
        if (address(oracleFeeds.temperatureFeed) == address(0)) {
            return
                Weather.WeatherData(
                    2000,
                    5000,
                    0,
                    1000,
                    uint32(block.timestamp)
                );
        }

        return
            Weather.getWeatherData(
                oracleFeeds.temperatureFeed,
                oracleFeeds.humidityFeed,
                oracleFeeds.rainfallFeed,
                oracleFeeds.windSpeedFeed
            );
    }

    function _getPriceSafe() internal view returns (uint256) {
        if (address(oracleFeeds.priceFeed) == address(0)) {
            return 500000;
        }
        return Price.getPrice(oracleFeeds.priceFeed);
    }

    function _checkConditionsAndEmitEvents(
        Weather.WeatherData memory _weather,
        uint256 _currentPrice
    ) internal {
        uint32 currentTime = uint32(block.timestamp);

        // Check weather conditions
        if (_weather.temperature < 1500 || _weather.temperature > 2500) {
            emit WeatherAlert(
                "TEMPERATURE",
                _weather.temperature < 1500
                    ? "Temperature too low"
                    : "Temperature too high",
                _weather,
                currentTime
            );
        }

        if (_weather.humidity < 4000 || _weather.humidity > 6000) {
            emit WeatherAlert(
                "HUMIDITY",
                _weather.humidity < 4000
                    ? "Humidity too low"
                    : "Humidity too high",
                _weather,
                currentTime
            );
        }

        if (_weather.rainfall > 5000) {
            emit WeatherAlert(
                "RAINFALL",
                "Heavy rainfall detected",
                _weather,
                currentTime
            );
        }

        // Check price conditions
        _checkPriceConditions(_currentPrice);
    }

    function _checkPriceConditions(uint256 _currentPrice) internal {
        if (uint(currentStage) == 0) {
            return;
        }

        uint256 oraclePrice = _getPriceSafe();
        uint256 prevPrice = _getPreviousStagePrice();

        _checkOraclePriceChange(oraclePrice, prevPrice);
        _checkStageOracleDifference(_currentPrice, oraclePrice);
    }

    function _getPreviousStagePrice() internal view returns (uint256) {
        ProductStage prevStage = ProductStage(uint(currentStage) - 1);
        return productStages[prevStage].marketPriceAtStage;
    }

    function _checkOraclePriceChange(
        uint256 _oraclePrice,
        uint256 _prevPrice
    ) internal {
        uint256 threshold = _prevPrice / 10; // 10% threshold
        uint32 currentTime = uint32(block.timestamp);

        if (_oraclePrice > _prevPrice + threshold) {
            emit PriceAlert(
                _oraclePrice,
                threshold,
                "ORACLE_PRICE_INCREASE",
                currentTime
            );
        } else if (_oraclePrice < _prevPrice - threshold) {
            emit PriceAlert(
                _oraclePrice,
                threshold,
                "ORACLE_PRICE_DECREASE",
                currentTime
            );
        }
    }

    function _checkStageOracleDifference(
        uint256 _stagePrice,
        uint256 _oraclePrice
    ) internal {
        uint256 threshold = _oraclePrice / 20; // 5% threshold
        uint256 difference = _stagePrice > _oraclePrice
            ? _stagePrice - _oraclePrice
            : _oraclePrice - _stagePrice;

        if (difference > threshold) {
            string memory alertType = _stagePrice > _oraclePrice
                ? "STAGE_PRICE_ABOVE_ORACLE"
                : "STAGE_PRICE_BELOW_ORACLE";

            emit PriceAlert(
                _oraclePrice,
                threshold,
                alertType,
                uint32(block.timestamp)
            );
        }
    }
}
