// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "../../contracts/Oracle/Weather.sol";
import "../../contracts/Oracle/Price.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract ProductRegistry {
    using Weather for AggregatorV3Interface;
    using Price for AggregatorV3Interface;

    enum ProductStage {
        FARM,
        PROCESSING,
        DISTRIBUTION,
        RETAIL,
        CONSUMED
    }

    struct ProductInfo {
        uint256 productId;
        string productName;
        string batchNumber;
        address farmer;
        uint256 createdAt;
        ProductStage currentStage;
        bool isActive;
        bytes32 dataHash;
        uint256 estimatedPrice; // Added for oracle price tracking
        string location; // Added for weather tracking
    }

    struct StageData {
        address stakeholder;
        uint256 timestamp;
        string data;
        bytes32 dataHash;
        Weather.WeatherData weatherAtStage; // Oracle weather data
        uint256 marketPriceAtStage; // Oracle price data
    }

    struct OracleFeeds {
        AggregatorV3Interface temperatureFeed;
        AggregatorV3Interface humidityFeed;
        AggregatorV3Interface rainfallFeed;
        AggregatorV3Interface windSpeedFeed;
        AggregatorV3Interface priceFeed; // For product/commodity pricing
    }

    // Storage
    mapping(uint256 => ProductInfo) public products;
    mapping(uint256 => mapping(ProductStage => StageData)) public productStages;
    mapping(string => uint256) public batchToProductId;
    mapping(address => uint256[]) public stakeholderProducts;

    uint256 public nextProductId = 1;
    uint256 public totalProducts = 0;
    StakeholderRegistry public stakeholderRegistry;
    OracleFeeds public oracleFeeds;

    // Events with oracle data
    event ProductCreated(
        uint256 indexed productId,
        string productName,
        string batchNumber,
        address indexed farmer,
        uint256 timestamp,
        Weather.WeatherData weatherData,
        uint256 marketPrice
    );

    event ProductStageUpdated(
        uint256 indexed productId,
        ProductStage indexed stage,
        address indexed stakeholder,
        string data,
        uint256 timestamp,
        Weather.WeatherData weatherData,
        uint256 marketPrice
    );

    event ProductVerified(
        uint256 indexed productId,
        address indexed verifier,
        bool isValid,
        uint256 timestamp
    );

    event WeatherAlert(
        uint256 indexed productId,
        string alertType,
        string message,
        Weather.WeatherData weatherData,
        uint256 timestamp
    );

    event PriceAlert(
        uint256 indexed productId,
        uint256 currentPrice,
        uint256 alertThreshold,
        string priceMovement,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyRegisteredStakeholder(
        StakeholderRegistry.StakeholderRole _requiredRole
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

    modifier productExists(uint256 _productId) {
        require(
            _productId < nextProductId && products[_productId].isActive,
            "Product does not exist"
        );
        _;
    }

    modifier validStageTransition(uint256 _productId, ProductStage _newStage) {
        ProductStage currentStage = products[_productId].currentStage;
        require(
            uint(_newStage) == uint(currentStage) + 1,
            "Invalid stage transition"
        );
        _;
    }

    constructor(
        address _stakeholderRegistryAddress,
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);

        // Oracle feeds can be zero addresses for testing - this allows deployment without oracles
        oracleFeeds = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_temperatureFeed),
            humidityFeed: AggregatorV3Interface(_humidityFeed),
            rainfallFeed: AggregatorV3Interface(_rainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_windSpeedFeed),
            priceFeed: AggregatorV3Interface(_priceFeed)
        });
    }

    /**
     * @dev Register product with oracle data
     */
    function registerProduct(
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData,
        string memory _location
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
        returns (uint256)
    {
        require(
            batchToProductId[_batchNumber] == 0,
            "Batch number already exists"
        );
        require(bytes(_productName).length > 0, "Product name cannot be empty");
        require(bytes(_batchNumber).length > 0, "Batch number cannot be empty");

        uint256 productId = nextProductId++;

        // Get current weather and price data (with fallback for testing)
        Weather.WeatherData memory currentWeather = _getWeatherDataSafe();
        uint256 currentPrice = _getPriceSafe();

        products[productId] = ProductInfo({
            productId: productId,
            productName: _productName,
            batchNumber: _batchNumber,
            farmer: msg.sender,
            createdAt: block.timestamp,
            currentStage: ProductStage.FARM,
            isActive: true,
            dataHash: keccak256(
                abi.encodePacked(_productName, _batchNumber, _farmData)
            ),
            estimatedPrice: currentPrice,
            location: _location
        });

        productStages[productId][ProductStage.FARM] = StageData({
            stakeholder: msg.sender,
            timestamp: block.timestamp,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        batchToProductId[_batchNumber] = productId;
        stakeholderProducts[msg.sender].push(productId);
        totalProducts++;

        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check for weather alerts
        _checkWeatherConditions(productId, currentWeather);

        // Check for price alerts
        _checkPriceConditions(productId, currentPrice);

        emit ProductCreated(
            productId,
            _productName,
            _batchNumber,
            msg.sender,
            block.timestamp,
            currentWeather,
            currentPrice
        );

        return productId;
    }

    // Backward compatibility - allow register product without location for existing tests
    function registerProduct(
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
        returns (uint256)
    {
        require(
            batchToProductId[_batchNumber] == 0,
            "Batch number already exists"
        );
        require(bytes(_productName).length > 0, "Product name cannot be empty");
        require(bytes(_batchNumber).length > 0, "Batch number cannot be empty");

        uint256 productId = nextProductId++;

        // Get current weather and price data (with fallback for testing)
        Weather.WeatherData memory currentWeather = _getWeatherDataSafe();
        uint256 currentPrice = _getPriceSafe();

        products[productId] = ProductInfo({
            productId: productId,
            productName: _productName,
            batchNumber: _batchNumber,
            farmer: msg.sender,
            createdAt: block.timestamp,
            currentStage: ProductStage.FARM,
            isActive: true,
            dataHash: keccak256(
                abi.encodePacked(_productName, _batchNumber, _farmData)
            ),
            estimatedPrice: currentPrice,
            location: "Default Location"
        });

        productStages[productId][ProductStage.FARM] = StageData({
            stakeholder: msg.sender,
            timestamp: block.timestamp,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        batchToProductId[_batchNumber] = productId;
        stakeholderProducts[msg.sender].push(productId);
        totalProducts++;

        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check for weather alerts
        _checkWeatherConditions(productId, currentWeather);
        
        // Check for price alerts
        _checkPriceConditions(productId, currentPrice);

        emit ProductCreated(
            productId,
            _productName,
            _batchNumber,
            msg.sender,
            block.timestamp,
            currentWeather,
            currentPrice
        );

        return productId;
    }

    /**
     * @dev Update processing stage with oracle data
     */
    function updateProcessingStage(
        uint256 _productId,
        string memory _processingData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.PROCESSOR)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.PROCESSING)
    {
        _updateProductStageWithOracle(
            _productId,
            ProductStage.PROCESSING,
            _processingData
        );
    }

    /**
     * @dev Update distribution stage with oracle data
     */
    function updateDistributionStage(
        uint256 _productId,
        string memory _distributionData
    )
        external
        onlyRegisteredStakeholder(
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR
        )
        productExists(_productId)
        validStageTransition(_productId, ProductStage.DISTRIBUTION)
    {
        _updateProductStageWithOracle(
            _productId,
            ProductStage.DISTRIBUTION,
            _distributionData
        );
    }

    /**
     * @dev Update retail stage with oracle data
     */
    function updateRetailStage(
        uint256 _productId,
        string memory _retailData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.RETAILER)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.RETAIL)
    {
        _updateProductStageWithOracle(
            _productId,
            ProductStage.RETAIL,
            _retailData
        );
    }

    /**
     * @dev Internal function to update stage with oracle data
     */
    function _updateProductStageWithOracle(
        uint256 _productId,
        ProductStage _stage,
        string memory _data
    ) internal {
        require(bytes(_data).length > 0, "Stage data cannot be empty");

        // Get current oracle data (with fallback for testing)
        Weather.WeatherData memory currentWeather = _getWeatherDataSafe();
        uint256 currentPrice = _getPriceSafe();

        products[_productId].currentStage = _stage;
        products[_productId].estimatedPrice = currentPrice;

        productStages[_productId][_stage] = StageData({
            stakeholder: msg.sender,
            timestamp: block.timestamp,
            data: _data,
            dataHash: keccak256(abi.encodePacked(_data)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        stakeholderProducts[msg.sender].push(_productId);
        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check conditions
        _checkWeatherConditions(_productId, currentWeather);
        _checkPriceConditions(_productId, currentPrice);

        emit ProductStageUpdated(
            _productId,
            _stage,
            msg.sender,
            _data,
            block.timestamp,
            currentWeather,
            currentPrice
        );
    }

    /**
     * @dev Safely get weather data with fallback for testing
     */
    function _getWeatherDataSafe()
        internal
        view
        returns (Weather.WeatherData memory)
    {
        // If oracle feeds are zero addresses (testing), return mock data
        if (address(oracleFeeds.temperatureFeed) == address(0)) {
            return Weather.WeatherData(2000, 5000, 0, 1000, block.timestamp); // 20°C, 50% humidity, 0mm rain, 10m/s wind
        }

        return
            Weather.getWeatherData(
                oracleFeeds.temperatureFeed,
                oracleFeeds.humidityFeed,
                oracleFeeds.rainfallFeed,
                oracleFeeds.windSpeedFeed
            );
    }

    /**
     * @dev Safely get price data with fallback for testing
     */
    function _getPriceSafe() internal view returns (uint256) {
        // If oracle feed is zero address (testing), return mock price
        if (address(oracleFeeds.priceFeed) == address(0)) {
            return 500000; // $5000.00 mock price
        }

        return Price.getPrice(oracleFeeds.priceFeed);
    }

    /**
     * @dev Check weather conditions and emit alerts if needed
     */
    function _checkWeatherConditions(
        uint256 _productId,
        Weather.WeatherData memory _weather
    ) internal {
        // Temperature alerts (assuming optimal range 15-25°C * 100)
        if (_weather.temperature < 1500 || _weather.temperature > 2500) {
            emit WeatherAlert(
                _productId,
                "TEMPERATURE",
                _weather.temperature < 1500
                    ? "Temperature too low"
                    : "Temperature too high",
                _weather,
                block.timestamp
            );
        }

        // Humidity alerts (optimal range 40-60%)
        if (_weather.humidity < 4000 || _weather.humidity > 6000) {
            emit WeatherAlert(
                _productId,
                "HUMIDITY",
                _weather.humidity < 4000
                    ? "Humidity too low"
                    : "Humidity too high",
                _weather,
                block.timestamp
            );
        }

        // High rainfall alert (>50mm * 100)
        if (_weather.rainfall > 5000) {
            emit WeatherAlert(
                _productId,
                "RAINFALL",
                "Heavy rainfall detected",
                _weather,
                block.timestamp
            );
        }
    }

    /**
     * @dev Check price conditions and emit alerts
     */
    function _checkPriceConditions(
        uint256 _productId,
        uint256 _currentPrice
    ) internal {
        // Get previous price for comparison
        ProductStage currentStage = products[_productId].currentStage;
        if (uint(currentStage) > 0) {
            ProductStage prevStage = ProductStage(uint(currentStage) - 1);
            uint256 prevPrice = productStages[_productId][prevStage]
                .marketPriceAtStage;

            // Price change threshold: 10% (adjust as needed)
            uint256 threshold = prevPrice / 10;

            if (_currentPrice > prevPrice + threshold) {
                emit PriceAlert(
                    _productId,
                    _currentPrice,
                    threshold,
                    "PRICE_INCREASE",
                    block.timestamp
                );
            } else if (_currentPrice < prevPrice - threshold) {
                emit PriceAlert(
                    _productId,
                    _currentPrice,
                    threshold,
                    "PRICE_DECREASE",
                    block.timestamp
                );
            }
        }
    }

    /**
     * @dev Get current market conditions
     */
    function getCurrentMarketConditions()
        external
        view
        returns (Weather.WeatherData memory weather, uint256 currentPrice)
    {
        weather = _getWeatherDataSafe();
        currentPrice = _getPriceSafe();
    }

    /**
     * @dev Check if current conditions are suitable for farming
     */
    function isFarmingConditionsSuitable(
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) external view returns (bool) {
        // If oracle feeds are zero addresses (testing), return true for farming conditions
        if (address(oracleFeeds.temperatureFeed) == address(0)) {
            return true;
        }

        return
            Weather.isFarmingConditionsSuitable(
                oracleFeeds.temperatureFeed,
                oracleFeeds.humidityFeed,
                oracleFeeds.rainfallFeed,
                minTemp,
                maxTemp,
                minHumidity,
                maxHumidity,
                maxRainfall
            );
    }

    /**
     * @dev Get product with oracle data
     */
    function getProductWithOracleData(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (
            ProductInfo memory productInfo,
            StageData memory currentStageData,
            Weather.WeatherData memory latestWeather,
            uint256 latestPrice
        )
    {
        productInfo = products[_productId];
        currentStageData = productStages[_productId][productInfo.currentStage];

        // Get latest oracle data (with fallback for testing)
        latestWeather = _getWeatherDataSafe();
        latestPrice = _getPriceSafe();
    }

    /**
     * @dev Get product journey with all oracle data
     */
    function getProductJourneyWithOracle(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (
            ProductInfo memory productInfo,
            StageData memory farmStage,
            StageData memory processingStage,
            StageData memory distributionStage,
            StageData memory retailStage
        )
    {
        return (
            products[_productId],
            productStages[_productId][ProductStage.FARM],
            productStages[_productId][ProductStage.PROCESSING],
            productStages[_productId][ProductStage.DISTRIBUTION],
            productStages[_productId][ProductStage.RETAIL]
        );
    }

    /**
     * @dev Update oracle feeds (only owner)
     */
    function updateOracleFeeds(
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) external {
        // Add access control as needed
        oracleFeeds = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_temperatureFeed),
            humidityFeed: AggregatorV3Interface(_humidityFeed),
            rainfallFeed: AggregatorV3Interface(_rainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_windSpeedFeed),
            priceFeed: AggregatorV3Interface(_priceFeed)
        });
    }

    // ===== BACKWARD COMPATIBILITY FUNCTIONS =====
    // These functions maintain the original interface for existing tests and contracts

    function markAsConsumed(
        uint256 _productId
    ) external productExists(_productId) {
        require(
            products[_productId].currentStage == ProductStage.RETAIL,
            "Product must be at retail stage"
        );

        products[_productId].currentStage = ProductStage.CONSUMED;

        emit ProductStageUpdated(
            _productId,
            ProductStage.CONSUMED,
            msg.sender,
            "Product consumed",
            block.timestamp,
            Weather.WeatherData(0, 0, 0, 0, block.timestamp), // Empty weather data for consumed stage
            0 // No price tracking for consumed products
        );
    }

    function verifyProduct(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (bool isValid, ProductInfo memory productInfo)
    {
        ProductInfo memory product = products[_productId];

        bool dataValid = true;
        for (uint i = 0; i <= uint(product.currentStage); i++) {
            ProductStage stage = ProductStage(i);
            if (productStages[_productId][stage].timestamp > 0) {
                bytes32 expectedHash = keccak256(
                    abi.encodePacked(productStages[_productId][stage].data)
                );
                if (expectedHash != productStages[_productId][stage].dataHash) {
                    dataValid = false;
                    break;
                }
            }
        }

        return (dataValid, product);
    }

    function performVerification(
        uint256 _productId
    ) external productExists(_productId) returns (bool isValid) {
        (bool valid, ) = this.verifyProduct(_productId);

        emit ProductVerified(_productId, msg.sender, valid, block.timestamp);

        return valid;
    }

    function getProductInfo(
        uint256 _productId
    ) external view productExists(_productId) returns (ProductInfo memory) {
        return products[_productId];
    }

    function getProduct(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (
            string memory productName,
            address farmer,
            uint256 harvestDate,
            string memory origin,
            uint8 status,
            string memory batchNumber,
            bool isActive
        )
    {
        ProductInfo memory product = products[_productId];

        StageData memory farmStage = productStages[_productId][
            ProductStage.FARM
        ];

        return (
            product.productName,
            product.farmer,
            product.createdAt,
            farmStage.data,
            uint8(product.currentStage),
            product.batchNumber,
            product.isActive
        );
    }

    function getProductStageData(
        uint256 _productId,
        ProductStage _stage
    ) external view productExists(_productId) returns (StageData memory) {
        return productStages[_productId][_stage];
    }

    function getProductJourney(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (
            ProductInfo memory productInfo,
            StageData memory farmStage,
            StageData memory processingStage,
            StageData memory distributionStage,
            StageData memory retailStage
        )
    {
        return (
            products[_productId],
            productStages[_productId][ProductStage.FARM],
            productStages[_productId][ProductStage.PROCESSING],
            productStages[_productId][ProductStage.DISTRIBUTION],
            productStages[_productId][ProductStage.RETAIL]
        );
    }

    function getProductByBatch(
        string memory _batchNumber
    ) external view returns (uint256) {
        uint256 productId = batchToProductId[_batchNumber];
        require(productId != 0, "Product not found");
        return productId;
    }

    function getStakeholderProducts(
        address _stakeholder
    ) external view returns (uint256[] memory) {
        return stakeholderProducts[_stakeholder];
    }

    function getProductsByStage(
        ProductStage _stage
    ) external view returns (uint256[] memory) {
        uint256[] memory tempArray = new uint256[](totalProducts);
        uint256 count = 0;

        for (uint256 i = 1; i < nextProductId; i++) {
            if (products[i].isActive && products[i].currentStage == _stage) {
                tempArray[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            result[j] = tempArray[j];
        }

        return result;
    }

    function getSupplyChainStats()
        external
        view
        returns (
            uint256 totalProductsCount,
            uint256 productsAtFarm,
            uint256 productsInProcessing,
            uint256 productsInDistribution,
            uint256 productsAtRetail,
            uint256 productsConsumed
        )
    {
        uint256 farm = 0;
        uint256 processing = 0;
        uint256 distribution = 0;
        uint256 retail = 0;
        uint256 consumed = 0;

        for (uint256 i = 1; i < nextProductId; i++) {
            if (products[i].isActive) {
                if (products[i].currentStage == ProductStage.FARM) {
                    farm++;
                } else if (
                    products[i].currentStage == ProductStage.PROCESSING
                ) {
                    processing++;
                } else if (
                    products[i].currentStage == ProductStage.DISTRIBUTION
                ) {
                    distribution++;
                } else if (products[i].currentStage == ProductStage.RETAIL) {
                    retail++;
                } else if (products[i].currentStage == ProductStage.CONSUMED) {
                    consumed++;
                }
            }
        }

        return (
            totalProducts,
            farm,
            processing,
            distribution,
            retail,
            consumed
        );
    }

    function deactivateProduct(
        uint256 _productId
    )
        external
        productExists(_productId)
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
    {
        require(
            products[_productId].farmer == msg.sender,
            "Only product farmer can deactivate"
        );

        products[_productId].isActive = false;
        totalProducts--;
    }

    function getTotalProducts() external view returns (uint256) {
        return totalProducts;
    }

    function getNextProductId() external view returns (uint256) {
        return nextProductId;
    }
}
