// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";
import "../Oracles/Price.sol";
import "../Oracles/Weather.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract ProductBatch is AccessControl {
    using Price for AggregatorV3Interface;
    using Weather for AggregatorV3Interface;

    enum BatchStatus {
        CREATED,
        LISTED,
        OFFERED,
        SOLD,
        SHIPPED,
        RECEIVED,
        PROCESSED,
        QUALITY_CHECKED,
        FINALIZED
    }

    enum TradingMode {
        SPOT_MARKET,
        CONTRACT_FARMING,
        COOPERATIVE,
        WEATHER_DEPENDENT
    }

    struct Batch {
        uint256 id;
        address farmer;
        address currentOwner;
        string name;
        string description;
        uint256 quantity;
        uint256 basePrice;           // Base price in local currency
        uint256 currentMarketPrice;  // Current USD price via oracle
        string originLocation;
        string metadataHash;
        BatchStatus status;
        TradingMode tradingMode;
        uint256 createdAt;
        uint256 lastUpdated;
        address[] authorizedBuyers;
        uint256[] offerIds;
        bool isAvailableForSale;

        // Oracle-related fields
        bool requiresWeatherVerification;
        Weather.WeatherData lastWeatherCheck;
        uint256 priceLastUpdated;
    }

    struct ProcessingData {
        address processor;
        string processingType;
        string qualityMetrics;
        string certificationHash;
        uint256 processedAt;
        uint256 inputQuantity;
        uint256 outputQuantity;
        Weather.WeatherData processingConditions;
    }

    struct QualityData {
        uint256 batchId;
        string qualityGrade;
        uint256 moistureContent;
        uint256 purityLevel;
        bool isOrganic;
        string certificationBody;
        Weather.WeatherData harvestConditions;
        uint256 checkedAt;
    }

    struct ConsumerPurchase {
        uint256 batchId;
        address consumer;
        address retailer;
        uint256 purchasePrice;
        uint256 quantity;
        uint256 purchaseTime;
        bool isPickedUp;
        bool ownershipClaimed;
        string pickupLocation;   // Retailer location
    }

    // Add to state variables section
    mapping(uint256 => ConsumerPurchase) public consumerPurchases;
    mapping(address => uint256[]) public consumerPurchaseHistory;
    uint256 public nextPurchaseId = 1;

    // Add events
    event ConsumerPurchaseCreated(uint256 indexed purchaseId, uint256 indexed batchId, address indexed consumer, address retailer);
    event ProductPickedUp(uint256 indexed purchaseId, address indexed consumer);
    event OwnershipClaimed(uint256 indexed purchaseId, uint256 indexed batchId, address indexed consumer);


    // State variables
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => ProcessingData) public processingData;
    mapping(uint256 => QualityData) public qualityData;
    mapping(BatchStatus => uint256[]) public batchesByStatus;
    mapping(TradingMode => uint256[]) public batchesByTradingMode;

    uint256 public nextBatchId = 1;
    uint256 public totalBatches;

    // Oracle feeds
    AggregatorV3Interface public priceFeed;           // ETH/USD price feed
    AggregatorV3Interface public temperatureFeed;     // Temperature data
    AggregatorV3Interface public humidityFeed;        // Humidity data
    AggregatorV3Interface public rainfallFeed;        // Rainfall data
    AggregatorV3Interface public windSpeedFeed;       // Wind speed data

    // Weather thresholds for different crops
    mapping(string => Weather.WeatherData) public cropWeatherRequirements;

    // Events
    event BatchCreated(uint256 indexed batchId, address indexed farmer, string name, TradingMode tradingMode);
    event BatchListed(uint256 indexed batchId, uint256 price, TradingMode tradingMode);
    event WeatherVerified(uint256 indexed batchId, bool suitable, Weather.WeatherData conditions);
    event PriceUpdated(uint256 indexed batchId, uint256 oldPrice, uint256 newPrice, uint256 usdValue);
    event QualityChecked(uint256 indexed batchId, string grade, bool passed);
    event ProcessingCompleted(uint256 indexed batchId, uint256 inputQty, uint256 outputQty);
    event BatchUpdated(uint256 indexed batchId, string action);

    /**
     * @dev Create a new batch with oracle integration
     */
    function createBatch(
        string calldata name,
        string calldata description,
        uint256 quantity,
        uint256 basePrice,
        string calldata originLocation,
        string calldata metadataHash,
        TradingMode tradingMode,
        address[] calldata authorizedBuyers,
        bool requiresWeatherVerification
    ) external onlyActiveStakeholder returns (uint256) {
        require(hasRole(msg.sender, Role.FARMER), "Only farmers can create batches");
        require(bytes(name).length > 0, "Name required");
        require(quantity > 0, "Quantity must be > 0");

        uint256 batchId = nextBatchId++;

        // Get current weather conditions if required
        Weather.WeatherData memory currentWeather;
        if (requiresWeatherVerification && _hasWeatherFeeds()) {
            currentWeather = Weather.getWeatherData(
                temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed
            );
        }

        // Calculate current USD price
        uint256 currentUSDPrice = _calculateUSDPrice(basePrice);

        batches[batchId] = Batch({
            id: batchId,
            farmer: msg.sender,
            currentOwner: msg.sender,
            name: name,
            description: description,
            quantity: quantity,
            basePrice: basePrice,
            currentMarketPrice: currentUSDPrice,
            originLocation: originLocation,
            metadataHash: metadataHash,
            status: BatchStatus.CREATED,
            tradingMode: tradingMode,
            createdAt: block.timestamp,
            lastUpdated: block.timestamp,
            authorizedBuyers: authorizedBuyers,
            offerIds: new uint256[](0),
            isAvailableForSale: false,
            requiresWeatherVerification: requiresWeatherVerification,
            lastWeatherCheck: currentWeather,
            priceLastUpdated: block.timestamp
        });

        // Update indexes
        batchesByStatus[BatchStatus.CREATED].push(batchId);
        batchesByTradingMode[tradingMode].push(batchId);
        totalBatches++;

        emit BatchCreated(batchId, msg.sender, name, tradingMode);

        if (requiresWeatherVerification) {
            emit WeatherVerified(batchId, true, currentWeather);
        }

        return batchId;
    }

    /**
     * @dev List batch for sale with weather verification
     */
    function listForSale(
        uint256 batchId,
        uint256 askingPrice,
        TradingMode tradingMode
    ) external onlyActiveStakeholder {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];
        require(msg.sender == batch.currentOwner, "Only owner can list");
        require(!batch.isAvailableForSale, "Already listed");

        // Weather verification for weather-dependent trading
        if (batch.requiresWeatherVerification && _hasWeatherFeeds()) {
            Weather.WeatherData memory currentWeather = Weather.getWeatherData(
                temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed
            );

            bool weatherSuitable = _checkWeatherSuitability(batch.name, currentWeather);
            require(weatherSuitable, "Weather conditions not suitable for trading");

            batch.lastWeatherCheck = currentWeather;
            emit WeatherVerified(batchId, weatherSuitable, currentWeather);
        }

        // Update price with oracle data
        uint256 newUSDPrice = _calculateUSDPrice(askingPrice);
        uint256 oldPrice = batch.currentMarketPrice;

        batch.currentMarketPrice = newUSDPrice;
        batch.tradingMode = tradingMode;
        batch.isAvailableForSale = true;
        batch.status = BatchStatus.LISTED;
        batch.lastUpdated = block.timestamp;
        batch.priceLastUpdated = block.timestamp;

        // Update indexes
        _removeFromStatusIndex(batchId, BatchStatus.CREATED);
        batchesByStatus[BatchStatus.LISTED].push(batchId);

        emit BatchListed(batchId, newUSDPrice, tradingMode);
        emit PriceUpdated(batchId, oldPrice, askingPrice, newUSDPrice);
    }

    /**
     * @dev Check quality with weather conditions recorded
     */
    function checkQuality(
        uint256 batchId,
        string calldata qualityGrade,
        uint256 moistureContent,
        uint256 purityLevel,
        bool isOrganic,
        string calldata certificationBody
    ) external onlyActiveStakeholder {
        require(_batchExists(batchId), "Batch does not exist");
        require(hasRole(msg.sender, Role.PROCESSOR), "Unauthorized");

        // Get current weather conditions
        Weather.WeatherData memory currentWeather;
        if (_hasWeatherFeeds()) {
            currentWeather = Weather.getWeatherData(
                temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed
            );
        }

        qualityData[batchId] = QualityData({
            batchId: batchId,
            qualityGrade: qualityGrade,
            moistureContent: moistureContent,
            purityLevel: purityLevel,
            isOrganic: isOrganic,
            certificationBody: certificationBody,
            harvestConditions: currentWeather,
            checkedAt: block.timestamp
        });

        // Determine if quality check passed
        bool qualityPassed = purityLevel >= 80 && moistureContent <= 15; // Basic criteria

        batches[batchId].status = BatchStatus.QUALITY_CHECKED;
        batches[batchId].lastUpdated = block.timestamp;

        emit QualityChecked(batchId, qualityGrade, qualityPassed);
    }

    /**
     * @dev Process batch with weather conditions recorded
     */
    function processBatch(
        uint256 batchId,
        string calldata processingType,
        string calldata qualityMetrics,
        uint256 outputQuantity
    ) external onlyActiveStakeholder {
        require(_batchExists(batchId), "Batch does not exist");
        require(hasRole(msg.sender, Role.PROCESSOR), "Only processors can process");

        Batch storage batch = batches[batchId];
        require(msg.sender == batch.currentOwner, "Only owner can process");

        // Record current weather conditions during processing
        Weather.WeatherData memory processingWeather;
        if (_hasWeatherFeeds()) {
            processingWeather = Weather.getWeatherData(
                temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed
            );
        }

        processingData[batchId] = ProcessingData({
            processor: msg.sender,
            processingType: processingType,
            qualityMetrics: qualityMetrics,
            certificationHash: "", // ADD THIS LINE
            processedAt: block.timestamp,
            inputQuantity: batch.quantity,
            outputQuantity: outputQuantity,
            processingConditions: processingWeather
        });

        // Update batch
        batch.quantity = outputQuantity;
        batch.status = BatchStatus.PROCESSED;
        batch.lastUpdated = block.timestamp;

        // Update indexes
        _removeFromStatusIndex(batchId, batch.status);
        batchesByStatus[BatchStatus.PROCESSED].push(batchId);

        emit ProcessingCompleted(batchId, processingData[batchId].inputQuantity, outputQuantity);
    }

    /**
     * @dev Update market price using oracle
     */
    function updateMarketPrice(uint256 batchId) external {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];

        uint256 newUSDPrice = _calculateUSDPrice(batch.basePrice);
        uint256 oldPrice = batch.currentMarketPrice;

        batch.currentMarketPrice = newUSDPrice;
        batch.priceLastUpdated = block.timestamp;

        emit PriceUpdated(batchId, oldPrice, batch.basePrice, newUSDPrice);
    }

    /**
     * @dev Get batch info with oracle data
     */
    function getBatchMarketInfo(uint256 batchId) external view returns (
        address owner,
        string memory name,
        uint256 quantity,
        uint256 localPrice,
        uint256 usdPrice,
        BatchStatus status,
        TradingMode tradingMode,
        Weather.WeatherData memory lastWeather,
        bool weatherVerificationRequired
    ) {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];

        return (
            batch.currentOwner,
            batch.name,
            batch.quantity,
            batch.basePrice,
            batch.currentMarketPrice,
            batch.status,
            batch.tradingMode,
            batch.lastWeatherCheck,
            batch.requiresWeatherVerification
        );
    }

    /**
     * @dev Get available batches by trading mode with price data
     */
    function getAvailableBatches(TradingMode tradingMode) external view returns (
        uint256[] memory batchIds,
        uint256[] memory localPrices,
        uint256[] memory usdPrices,
        Weather.WeatherData[] memory weatherConditions
    ) {
        uint256[] memory modeBatches = batchesByTradingMode[tradingMode];
        uint256 count = 0;

        // Count available batches
        for (uint256 i = 0; i < modeBatches.length; i++) {
            if (batches[modeBatches[i]].isAvailableForSale) {
                count++;
            }
        }

        // Fill arrays
        batchIds = new uint256[](count);
        localPrices = new uint256[](count);
        usdPrices = new uint256[](count);
        weatherConditions = new Weather.WeatherData[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < modeBatches.length; i++) {
            uint256 batchId = modeBatches[i];
            if (batches[batchId].isAvailableForSale) {
                batchIds[index] = batchId;
                localPrices[index] = batches[batchId].basePrice;
                usdPrices[index] = batches[batchId].currentMarketPrice;
                weatherConditions[index] = batches[batchId].lastWeatherCheck;
                index++;
            }
        }

        return (batchIds, localPrices, usdPrices, weatherConditions);
    }

    /**
     * @dev Get current USD value of a batch
     */
    function getCurrentUSDValue(uint256 batchId) external view returns (uint256) {
        require(_batchExists(batchId), "Batch does not exist");
        if (address(priceFeed) == address(0)) return 0;

        Batch storage batch = batches[batchId];
        uint256 totalValue = batch.currentMarketPrice * batch.quantity;
        return Price.getConversionRate(totalValue, priceFeed);
    }

    /**
     * @dev Check if current weather is suitable for farming/trading
     */
    function checkFarmingSuitability(
        string calldata cropType,
        int256 minTemp,
        int256 maxTemp,
        uint256 minHumidity,
        uint256 maxHumidity,
        uint256 maxRainfall
    ) external view returns (bool suitable, Weather.WeatherData memory currentConditions) {
        require(_hasWeatherFeeds(), "Weather feeds not available");

        currentConditions = Weather.getWeatherData(
            temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed
        );

        suitable = Weather.isFarmingConditionsSuitable(
            temperatureFeed, humidityFeed, rainfallFeed, windSpeedFeed,
            minTemp, maxTemp, minHumidity, maxHumidity, maxRainfall
        );

        return (suitable, currentConditions);
    }

    /**
     * @dev Add shipment ID to batch tracking (called by ShipmentTracker)
     */
    function addShipmentToBatch(uint256 batchId, uint256 shipmentId) external {
        require(_batchExists(batchId), "Batch does not exist");
        // Note: You'll need to add shipmentIds array to Batch struct first
        // For now, just emit an event as a placeholder
        emit BatchUpdated(batchId, "Shipment added");
    }

    // Admin functions for oracle management
    function setPriceFeed(address _priceFeed) external onlyAdmin {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function setWeatherFeeds(
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed
    ) external onlyAdmin {
        temperatureFeed = AggregatorV3Interface(_temperatureFeed);
        humidityFeed = AggregatorV3Interface(_humidityFeed);
        rainfallFeed = AggregatorV3Interface(_rainfallFeed);
        windSpeedFeed = AggregatorV3Interface(_windSpeedFeed);
    }

    function setCropWeatherRequirements(
        string calldata cropType,
        int256 temperature,
        uint256 humidity,
        uint256 rainfall,
        uint256 windSpeed
    ) external onlyAdmin {
        cropWeatherRequirements[cropType] = Weather.WeatherData({
            temperature: temperature,
            humidity: humidity,
            rainfall: rainfall,
            windSpeed: windSpeed,
            timestamp: block.timestamp
        });
    }

    // Internal functions
    function _calculateUSDPrice(uint256 localPrice) internal view returns (uint256) {
        if (address(priceFeed) == address(0)) return localPrice;
        return Price.getConversionRate(localPrice, priceFeed);
    }

    function _hasWeatherFeeds() internal view returns (bool) {
        return address(temperatureFeed) != address(0) &&
               address(humidityFeed) != address(0) &&
               address(rainfallFeed) != address(0) &&
               address(windSpeedFeed) != address(0);
    }

    function _checkWeatherSuitability(string memory cropType, Weather.WeatherData memory current) internal view returns (bool) {
        Weather.WeatherData storage requirements = cropWeatherRequirements[cropType];

        // If no requirements set, default to suitable
        if (requirements.timestamp == 0) return true;

        // Basic suitability check (can be enhanced)
        return (current.temperature >= requirements.temperature - 500 && // ±5°C tolerance
                current.temperature <= requirements.temperature + 500 &&
                current.humidity >= requirements.humidity - 10 && // ±10% tolerance
                current.humidity <= requirements.humidity + 10 &&
                current.rainfall <= requirements.rainfall + 50); // +50mm tolerance
    }

    function _batchExists(uint256 batchId) internal view returns (bool) {
        return batchId > 0 && batchId < nextBatchId;
    }

    function _removeFromStatusIndex(uint256 batchId, BatchStatus status) internal {
        uint256[] storage statusBatches = batchesByStatus[status];
        for (uint256 i = 0; i < statusBatches.length; i++) {
            if (statusBatches[i] == batchId) {
                statusBatches[i] = statusBatches[statusBatches.length - 1];
                statusBatches.pop();
                break;
            }
        }
    }

    // Standard functions for compatibility
    function transferOwnership(uint256 batchId, address newOwner) external onlyActiveStakeholder {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];
        require(msg.sender == batch.currentOwner, "Only current owner");

        batch.currentOwner = newOwner;
        batch.lastUpdated = block.timestamp;
    }

    function getBatchInfo(uint256 batchId) external view returns (
        address farmer,
        address currentOwner,
        string memory name,
        string memory description,
        uint256 quantity,
        uint256 basePrice,
        string memory originLocation,
        BatchStatus status,
        uint256 createdAt,
        uint256 lastUpdated
    ) {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];

        return (
            batch.farmer,
            batch.currentOwner,
            batch.name,
            batch.description,
            batch.quantity,
            batch.basePrice,
            batch.originLocation,
            batch.status,
            batch.createdAt,
            batch.lastUpdated
        );
    }

    /**
    * @dev Mark batch as sold (called by OfferManager)
    */
    function markAsSold(uint256 batchId, address buyer, uint256 salePrice) external {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];

        batch.status = BatchStatus.SOLD;
        batch.currentOwner = buyer;
        batch.isAvailableForSale = false;
        batch.lastUpdated = block.timestamp;

        // Update status index
        _removeFromStatusIndex(batchId, BatchStatus.LISTED);
        batchesByStatus[BatchStatus.SOLD].push(batchId);

        emit BatchUpdated(batchId, "Sold");
    }

    // Replace all the consumer functions with these:
    /**
    * @dev Consumer purchases product from retailer - Direct ownership transfer
    */
    function purchaseFromRetailer(
        uint256 batchId,
        address retailer,
        uint256 quantity,
        string calldata pickupLocation
    ) external payable returns (uint256) {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];
        require(batch.isAvailableForSale, "Product not for sale");
        require(batch.currentOwner == retailer, "Retailer doesn't own this batch");
        require(hasRole(retailer, Role.RETAILER), "Invalid retailer");
        require(quantity <= batch.quantity, "Insufficient quantity");

        // Calculate purchase price
        uint256 totalPrice = (batch.basePrice * quantity) / batch.quantity;
        require(msg.value >= totalPrice, "Insufficient payment");

        uint256 purchaseId = nextPurchaseId++;

        // Create purchase record (no pickup code)
        consumerPurchases[purchaseId] = ConsumerPurchase({
            batchId: batchId,
            consumer: msg.sender,
            retailer: retailer,
            purchasePrice: totalPrice,
            quantity: quantity,
            purchaseTime: block.timestamp,
            isPickedUp: false,
            ownershipClaimed: false,
            pickupLocation: pickupLocation
        });

        // Update mappings
        consumerPurchaseHistory[msg.sender].push(purchaseId);

        // Update batch quantity
        batch.quantity -= quantity;
        if (batch.quantity == 0) {
            batch.isAvailableForSale = false;
            batch.status = BatchStatus.SOLD;
        }

        // Transfer payment to retailer
        payable(retailer).transfer(totalPrice);

        // Return excess payment
        if (msg.value > totalPrice) {
            payable(msg.sender).transfer(msg.value - totalPrice);
        }

        emit ConsumerPurchaseCreated(purchaseId, batchId, msg.sender, retailer);
        return purchaseId;
    }

    /**
    * @dev Consumer confirms pickup using purchase ID
    */
    function confirmPickup(uint256 purchaseId) external returns (bool) {
        require(purchaseId < nextPurchaseId, "Invalid purchase ID");
        ConsumerPurchase storage purchase = consumerPurchases[purchaseId];
        require(purchase.consumer == msg.sender, "Not your purchase");
        require(!purchase.isPickedUp, "Already picked up");

        // Mark as picked up
        purchase.isPickedUp = true;

        emit ProductPickedUp(purchaseId, msg.sender);
        return true;
    }

    /**
    * @dev Consumer claims ownership after pickup
    */
    function claimOwnership(uint256 purchaseId) external returns (bool) {
        require(purchaseId < nextPurchaseId, "Invalid purchase ID");
        ConsumerPurchase storage purchase = consumerPurchases[purchaseId];
        require(purchase.consumer == msg.sender, "Not your purchase");
        require(purchase.isPickedUp, "Product not picked up yet");
        require(!purchase.ownershipClaimed, "Ownership already claimed");

        // Mark ownership as claimed
        purchase.ownershipClaimed = true;

        // Update batch ownership
        Batch storage batch = batches[purchase.batchId];
        batch.currentOwner = msg.sender;
        batch.lastUpdated = block.timestamp;

        emit OwnershipClaimed(purchaseId, purchase.batchId, msg.sender);
        return true;
    }

    /**
    * @dev Alternative: Direct purchase with immediate ownership transfer
    */
    function purchaseWithImmediateOwnership(
        uint256 batchId,
        address retailer,
        uint256 quantity,
        string calldata deliveryAddress
    ) external payable returns (uint256) {
        require(_batchExists(batchId), "Batch does not exist");
        Batch storage batch = batches[batchId];
        require(batch.isAvailableForSale, "Product not for sale");
        require(batch.currentOwner == retailer, "Retailer doesn't own this batch");
        require(hasRole(retailer, Role.RETAILER), "Invalid retailer");
        require(quantity <= batch.quantity, "Insufficient quantity");

        // Calculate purchase price
        uint256 totalPrice = (batch.basePrice * quantity) / batch.quantity;
        require(msg.value >= totalPrice, "Insufficient payment");

        uint256 purchaseId = nextPurchaseId++;

        // Create purchase record with immediate ownership
        consumerPurchases[purchaseId] = ConsumerPurchase({
            batchId: batchId,
            consumer: msg.sender,
            retailer: retailer,
            purchasePrice: totalPrice,
            quantity: quantity,
            purchaseTime: block.timestamp,
            isPickedUp: true,        // Automatically marked as picked up
            ownershipClaimed: true,  // Automatically claimed ownership
            pickupLocation: deliveryAddress
        });

        // Update mappings
        consumerPurchaseHistory[msg.sender].push(purchaseId);

        // Update batch
        batch.quantity -= quantity;
        batch.currentOwner = msg.sender; // Transfer ownership immediately
        if (batch.quantity == 0) {
            batch.isAvailableForSale = false;
            batch.status = BatchStatus.SOLD;
        }
        batch.lastUpdated = block.timestamp;

        // Transfer payment to retailer
        payable(retailer).transfer(totalPrice);

        // Return excess payment
        if (msg.value > totalPrice) {
            payable(msg.sender).transfer(msg.value - totalPrice);
        }

        emit ConsumerPurchaseCreated(purchaseId, batchId, msg.sender, retailer);
        emit ProductPickedUp(purchaseId, msg.sender);
        emit OwnershipClaimed(purchaseId, batchId, msg.sender);

        return purchaseId;
    }

    /**
    * @dev Get consumer purchase details (updated without pickup code)
    */
    function getConsumerPurchase(uint256 purchaseId) external view returns (
        uint256 batchId,
        address consumer,
        address retailer,
        uint256 purchasePrice,
        uint256 quantity,
        uint256 purchaseTime,
        bool isPickedUp,
        bool ownershipClaimed,
        string memory pickupLocation
    ) {
        require(purchaseId < nextPurchaseId, "Invalid purchase ID");
        ConsumerPurchase storage purchase = consumerPurchases[purchaseId];

        return (
            purchase.batchId,
            purchase.consumer,
            purchase.retailer,
            purchase.purchasePrice,
            purchase.quantity,
            purchase.purchaseTime,
            purchase.isPickedUp,
            purchase.ownershipClaimed,
            purchase.pickupLocation
        );
    }

    /**
    * @dev Get consumer's purchase history
    */
    function getConsumerHistory(address consumer) external view returns (uint256[] memory) {
        return consumerPurchaseHistory[consumer];
    }

    /**
    * @dev Get purchases pending pickup for a retailer
    */
    function getRetailerPendingPickups(address retailer) external view returns (uint256[] memory) {
        uint256[] memory allPurchases = new uint256[](nextPurchaseId - 1);
        uint256 count = 0;

        for (uint256 i = 1; i < nextPurchaseId; i++) {
            ConsumerPurchase storage purchase = consumerPurchases[i];
            if (purchase.retailer == retailer && !purchase.isPickedUp) {
                allPurchases[count] = i;
                count++;
            }
        }

        // Resize array to actual count
        uint256[] memory pendingPickups = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            pendingPickups[i] = allPurchases[i];
        }

        return pendingPickups;
    }
}