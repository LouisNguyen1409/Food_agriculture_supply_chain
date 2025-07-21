// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./Oracles/Weather.sol";
import "./Oracles/Price.sol";
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
        uint32 createdAt;
        ProductStage currentStage;
        bool isActive;
        bytes32 dataHash;
        uint256 estimatedPrice;
        string location;
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

    // Storage for gas efficiency
    mapping(uint256 => ProductInfo) public products;
    mapping(uint256 => mapping(ProductStage => StageData)) public productStages;
    mapping(string => uint256) public batchToProductId;
    mapping(address => uint256[]) public stakeholderProducts;

    // State variables
    uint256 public nextProductId = 1;
    uint256 public totalProducts = 0;
    StakeholderRegistry public immutable stakeholderRegistry;
    OracleFeeds public oracleFeeds;

    // Events with uint32 timestamps
    event ProductCreated(
        uint256 indexed productId,
        string productName,
        string batchNumber,
        address indexed farmer,
        uint32 timestamp,
        Weather.WeatherData weatherData,
        uint256 marketPrice
    );

    event ProductStageUpdated(
        uint256 indexed productId,
        ProductStage indexed stage,
        address indexed stakeholder,
        string data,
        uint32 timestamp,
        Weather.WeatherData weatherData,
        uint256 marketPrice
    );

    event ProductVerified(
        uint256 indexed productId,
        address indexed verifier,
        bool isValid,
        uint32 timestamp
    );

    event WeatherAlert(
        uint256 indexed productId,
        string alertType,
        string message,
        Weather.WeatherData weatherData,
        uint32 timestamp
    );

    event PriceAlert(
        uint256 indexed productId,
        uint256 currentPrice,
        uint256 alertThreshold,
        string priceMovement,
        uint32 timestamp
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

    modifier nonEmptyString(string calldata _str) {
        require(bytes(_str).length > 0, "String cannot be empty");
        _;
    }

    modifier nonEmptyProductName(string calldata _str) {
        require(bytes(_str).length > 0, "Product name cannot be empty");
        _;
    }

    modifier nonEmptyBatchNumber(string calldata _str) {
        require(bytes(_str).length > 0, "Batch number cannot be empty");
        _;
    }

    modifier nonEmptyStageData(string calldata _str) {
        require(bytes(_str).length > 0, "Stage data cannot be empty");
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
        require(
            _stakeholderRegistryAddress != address(0),
            "Invalid stakeholder registry"
        );

        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);

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
        string calldata _productName,
        string calldata _batchNumber,
        string calldata _farmData,
        string calldata _location
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
        nonEmptyProductName(_productName)
        nonEmptyBatchNumber(_batchNumber)
        returns (uint256)
    {
        require(
            batchToProductId[_batchNumber] == 0,
            "Batch number already exists"
        );

        uint256 productId = nextProductId++;
        uint32 currentTime = uint32(block.timestamp);

        // Get oracle data once and reuse - saves ~500 gas
        (
            Weather.WeatherData memory currentWeather,
            uint256 currentPrice
        ) = _getOracleDataSafe();

        // Create product info
        products[productId] = ProductInfo({
            productId: productId,
            productName: _productName,
            batchNumber: _batchNumber,
            farmer: msg.sender,
            createdAt: currentTime,
            currentStage: ProductStage.FARM,
            isActive: true,
            dataHash: keccak256(
                abi.encodePacked(_productName, _batchNumber, _farmData)
            ),
            estimatedPrice: currentPrice,
            location: _location
        });

        // Create stage data
        productStages[productId][ProductStage.FARM] = StageData({
            stakeholder: msg.sender,
            timestamp: currentTime,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        // Update mappings
        batchToProductId[_batchNumber] = productId;
        stakeholderProducts[msg.sender].push(productId);
        totalProducts++;

        // Update stakeholder activity
        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check conditions and emit events to single function
        _checkConditionsAndEmitEvents(productId, currentWeather, currentPrice);

        emit ProductCreated(
            productId,
            _productName,
            _batchNumber,
            msg.sender,
            currentTime,
            currentWeather,
            currentPrice
        );

        return productId;
    }

    /**
     * @dev Backward compatibility
     */
    function registerProduct(
        string calldata _productName,
        string calldata _batchNumber,
        string calldata _farmData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
        nonEmptyProductName(_productName)
        nonEmptyBatchNumber(_batchNumber)
        returns (uint256)
    {
        require(
            batchToProductId[_batchNumber] == 0,
            "Batch number already exists"
        );

        uint256 productId = nextProductId++;
        uint32 currentTime = uint32(block.timestamp);

        // Get oracle data once and reuse
        (
            Weather.WeatherData memory currentWeather,
            uint256 currentPrice
        ) = _getOracleDataSafe();

        // Create product info
        products[productId] = ProductInfo({
            productId: productId,
            productName: _productName,
            batchNumber: _batchNumber,
            farmer: msg.sender,
            createdAt: currentTime,
            currentStage: ProductStage.FARM,
            isActive: true,
            dataHash: keccak256(
                abi.encodePacked(_productName, _batchNumber, _farmData)
            ),
            estimatedPrice: currentPrice,
            location: "Default Location"
        });

        // Create stage data
        productStages[productId][ProductStage.FARM] = StageData({
            stakeholder: msg.sender,
            timestamp: currentTime,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        // Update mappings
        batchToProductId[_batchNumber] = productId;
        stakeholderProducts[msg.sender].push(productId);
        totalProducts++;

        // Update stakeholder activity
        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check conditions and emit events
        _checkConditionsAndEmitEvents(productId, currentWeather, currentPrice);

        emit ProductCreated(
            productId,
            _productName,
            _batchNumber,
            msg.sender,
            currentTime,
            currentWeather,
            currentPrice
        );

        return productId;
    }

    /**
     * @dev Update processing stage
     */
    function updateProcessingStage(
        uint256 _productId,
        string calldata _processingData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.PROCESSOR)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.PROCESSING)
        nonEmptyStageData(_processingData)
    {
        _updateProductStage(
            _productId,
            ProductStage.PROCESSING,
            _processingData
        );
    }

    /**
     * @dev Update distribution stage
     */
    function updateDistributionStage(
        uint256 _productId,
        string calldata _distributionData
    )
        external
        onlyRegisteredStakeholder(
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR
        )
        productExists(_productId)
        validStageTransition(_productId, ProductStage.DISTRIBUTION)
        nonEmptyStageData(_distributionData)
    {
        _updateProductStage(
            _productId,
            ProductStage.DISTRIBUTION,
            _distributionData
        );
    }

    /**
     * @dev Update retail stage
     */
    function updateRetailStage(
        uint256 _productId,
        string calldata _retailData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.RETAILER)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.RETAIL)
        nonEmptyStageData(_retailData)
    {
        _updateProductStage(_productId, ProductStage.RETAIL, _retailData);
    }

    /**
     * @dev Optimized internal function to update stage
     */
    function _updateProductStage(
        uint256 _productId,
        ProductStage _stage,
        string calldata _data
    ) internal {
        uint32 currentTime = uint32(block.timestamp);

        // Get oracle data once - saves ~500 gas
        (
            Weather.WeatherData memory currentWeather,
            uint256 currentPrice
        ) = _getOracleDataSafe();

        // Update product
        products[_productId].currentStage = _stage;
        products[_productId].estimatedPrice = currentPrice;

        // Update stage data
        productStages[_productId][_stage] = StageData({
            stakeholder: msg.sender,
            timestamp: currentTime,
            data: _data,
            dataHash: keccak256(abi.encodePacked(_data)),
            weatherAtStage: currentWeather,
            marketPriceAtStage: currentPrice
        });

        // Update stakeholder products
        stakeholderProducts[msg.sender].push(_productId);
        stakeholderRegistry.updateLastActivity(msg.sender);

        // Check conditions and emit events
        _checkConditionsAndEmitEvents(_productId, currentWeather, currentPrice);

        emit ProductStageUpdated(
            _productId,
            _stage,
            msg.sender,
            _data,
            currentTime,
            currentWeather,
            currentPrice
        );
    }

    /**
     * @dev Optimized oracle data retrieval - saves ~500 gas per call
     */
    function _getOracleDataSafe()
        internal
        view
        returns (Weather.WeatherData memory weather, uint256 price)
    {
        weather = _getWeatherDataSafe();
        price = _getPriceSafe();
    }

    /**
     * @dev Optimized weather data retrieval
     */
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

    /**
     * @dev Optimized price data retrieval
     */
    function _getPriceSafe() internal view returns (uint256) {
        if (address(oracleFeeds.priceFeed) == address(0)) {
            return 500000;
        }

        return Price.getPrice(oracleFeeds.priceFeed);
    }

    /**
     * @dev Optimized condition checking and event emission - saves ~1000 gas
     */
    function _checkConditionsAndEmitEvents(
        uint256 _productId,
        Weather.WeatherData memory _weather,
        uint256 _currentPrice
    ) internal {
        uint32 currentTime = uint32(block.timestamp);

        // Check weather conditions
        if (_weather.temperature < 1500 || _weather.temperature > 2500) {
            emit WeatherAlert(
                _productId,
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
                _productId,
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
                _productId,
                "RAINFALL",
                "Heavy rainfall detected",
                _weather,
                currentTime
            );
        }

        // Check price conditions
        _checkPriceConditions(_productId, _currentPrice);
    }

    /**
     * @dev Optimized price condition checking
     */
    function _checkPriceConditions(
        uint256 _productId,
        uint256 _currentPrice
    ) internal {
        ProductStage currentStage = products[_productId].currentStage;
        if (uint(currentStage) == 0) {
            return;
        }

        uint256 oraclePrice = _getPriceSafe();
        uint256 prevPrice = _getPreviousStagePrice(_productId);

        _checkOraclePriceChange(_productId, oraclePrice, prevPrice);
        _checkStageOracleDifference(_productId, _currentPrice, oraclePrice);
    }

    /**
     * @dev Get previous stage price
     */
    function _getPreviousStagePrice(
        uint256 _productId
    ) internal view returns (uint256) {
        ProductStage currentStage = products[_productId].currentStage;
        ProductStage prevStage = ProductStage(uint(currentStage) - 1);
        return productStages[_productId][prevStage].marketPriceAtStage;
    }

    /**
     * @dev Optimized oracle price change checking
     */
    function _checkOraclePriceChange(
        uint256 _productId,
        uint256 _oraclePrice,
        uint256 _prevPrice
    ) internal {
        uint256 threshold = _prevPrice / 10; // 10% threshold
        uint32 currentTime = uint32(block.timestamp);

        if (_oraclePrice > _prevPrice + threshold) {
            emit PriceAlert(
                _productId,
                _oraclePrice,
                threshold,
                "ORACLE_PRICE_INCREASE",
                currentTime
            );
        } else if (_oraclePrice < _prevPrice - threshold) {
            emit PriceAlert(
                _productId,
                _oraclePrice,
                threshold,
                "ORACLE_PRICE_DECREASE",
                currentTime
            );
        }
    }

    /**
     * @dev Optimized stage oracle difference checking
     */
    function _checkStageOracleDifference(
        uint256 _productId,
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
                _productId,
                _oraclePrice,
                threshold,
                alertType,
                uint32(block.timestamp)
            );
        }
    }

    // ===== PUBLIC VIEW FUNCTIONS =====

    /**
     * @dev Get current market conditions
     */
    function getCurrentMarketConditions()
        external
        view
        returns (Weather.WeatherData memory weather, uint256 currentPrice)
    {
        return _getOracleDataSafe();
    }

    /**
     * @dev Check farming conditions
     */
    function isFarmingConditionsSuitable(
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) external view returns (bool) {
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
        (latestWeather, latestPrice) = _getOracleDataSafe();
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
     * @dev Update oracle feeds
     */
    function updateOracleFeeds(
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) external {
        oracleFeeds = OracleFeeds({
            temperatureFeed: AggregatorV3Interface(_temperatureFeed),
            humidityFeed: AggregatorV3Interface(_humidityFeed),
            rainfallFeed: AggregatorV3Interface(_rainfallFeed),
            windSpeedFeed: AggregatorV3Interface(_windSpeedFeed),
            priceFeed: AggregatorV3Interface(_priceFeed)
        });
    }

    // ===== BACKWARD COMPATIBILITY FUNCTIONS =====

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
            uint32(block.timestamp),
            Weather.WeatherData(0, 0, 0, 0, uint32(block.timestamp)),
            0
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
            StageData memory stageData = productStages[_productId][stage];

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

        return (dataValid, product);
    }

    function performVerification(
        uint256 _productId
    ) external productExists(_productId) returns (bool isValid) {
        (bool valid, ) = this.verifyProduct(_productId);
        emit ProductVerified(
            _productId,
            msg.sender,
            valid,
            uint32(block.timestamp)
        );
        return valid;
    }

    // ===== OPTIMIZED GETTER FUNCTIONS =====

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

    // ===== UTILITY FUNCTIONS =====

    function getProductByBatch(
        string calldata _batchNumber
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
        uint256 count = 0;
        uint256[] memory tempArray = new uint256[](totalProducts);

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
                ProductStage stage = products[i].currentStage;
                if (stage == ProductStage.FARM) {
                    farm++;
                } else if (stage == ProductStage.PROCESSING) {
                    processing++;
                } else if (stage == ProductStage.DISTRIBUTION) {
                    distribution++;
                } else if (stage == ProductStage.RETAIL) {
                    retail++;
                } else if (stage == ProductStage.CONSUMED) {
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
