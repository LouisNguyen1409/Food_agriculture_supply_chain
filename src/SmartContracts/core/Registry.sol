// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";
import "./ProductBatch.sol";
import "../verification/ProvenanceTracker.sol";
import "../verification/QRCodeVerifier.sol";
import "../verification/PublicVerification.sol";

contract Registry is AccessControl {

    struct ProductRecord {
        address productContract;
        uint256 batchId;
        address farmer;
        string name;
        string category;         // e.g., "Fruits", "Vegetables", "Grains"
        uint256 quantity;
        uint256 localPrice;      // Price in local currency (ETH)
        uint256 usdPrice;        // Price in USD (from oracle)
        string originLocation;
        uint256 createdAt;
        bool isAvailable;
        ProductBatch.TradingMode tradingMode;
        bool weatherDependent;   // Whether this product requires weather verification
    }

    struct TransactionRecord {
        uint256 id;
        uint256 batchId;
        address seller;
        address buyer;
        uint256 localPrice;      // Price in local currency
        uint256 usdPrice;        // Price in USD
        uint256 quantity;
        uint256 timestamp;
        string transactionType;  // "SPOT", "CONTRACT", "COOPERATIVE", "WEATHER_DEPENDENT"
    }

    struct WeatherAnalytics {
        uint256 totalWeatherDependentProducts;
        uint256 weatherVerifiedTransactions;
        uint256 averageTemperature;
        uint256 averageHumidity;
        uint256 lastWeatherUpdate;
    }

    struct MarketMetrics {
        uint256 totalProducts;
        uint256 availableProducts;
        uint256 totalTransactions;
        uint256 totalVolume;     // Total quantity traded
        uint256 totalUSDValue;   // Total value in USD
        uint256 totalLocalValue; // Total value in local currency
        mapping(string => uint256) categoryVolumes;
        mapping(ProductBatch.TradingMode => uint256) tradingModeVolumes;
        mapping(string => uint256) categoryUSDValues;
        mapping(string => uint256) categoryLocalValues;
    }

    // Product summary for display lists
    struct ProductSummary {
        uint256 id;
        string name;
        string category;
        uint256 price;
        uint256 usdPrice;
        uint256 quantity;
        string origin;
        address farmer;
        bool isAvailable;
        ProductBatch.TradingMode tradingMode;
    }

    // Detailed product information
    struct ProductDetails {
        uint256 id;
        string name;
        string category;
        uint256 quantity;
        uint256 localPrice;
        uint256 usdPrice;
        string originLocation;
        address farmer;
        address productContract;
        uint256 batchId;
        uint256 createdAt;
        bool isAvailable;
        ProductBatch.TradingMode tradingMode;
        bool weatherDependent;
        uint256 transactionCount;
        uint256 averageRating;
    }

    // Core mappings
    mapping(uint256 => ProductRecord) public products;
    mapping(uint256 => TransactionRecord) public transactions;
    mapping(string => uint256[]) public productsByCategory;
    mapping(ProductBatch.TradingMode => uint256[]) public productsByTradingMode;
    mapping(address => uint256[]) public userProducts;
    mapping(uint256 => uint256[]) public batchTransactions; // batchId => transactionIds[]

    // Analytics mappings
    mapping(string => uint256) public categoryUSDPrices;  // Average USD prices by category
    mapping(string => uint256) public categoryLocalPrices; // Average local prices by category
    mapping(address => uint256) public userTransactionCounts;
    mapping(uint256 => uint256) public dailyTransactionCounts; // day => count
    mapping(uint256 => uint256) public dailyUSDVolume; // day => USD volume

    // Weather-related mappings
    mapping(string => WeatherAnalytics) public weatherAnalyticsByCategory;
    mapping(uint256 => bool) public weatherVerifiedProducts;

    // State variables
    uint256 public nextProductId = 1;
    uint256 public nextTransactionId = 1;
    MarketMetrics public marketMetrics;
    WeatherAnalytics public globalWeatherAnalytics;

    // Contract references for verification
    ProvenanceTracker public provenanceTracker;
    QRCodeVerifier public qrVerifier;
    PublicVerification public publicVerification;

    // Events
    event ProductRegistered(uint256 indexed productId, address indexed farmer, string name, string category, bool weatherDependent);
    event TransactionRecorded(uint256 indexed transactionId, uint256 indexed batchId, address indexed buyer, uint256 usdValue, uint256 localValue);
    event WeatherVerifiedTransaction(uint256 indexed transactionId, uint256 indexed batchId, bool weatherSuitable);
    event MarketPriceUpdated(string indexed category, uint256 oldUSDPrice, uint256 newUSDPrice, uint256 oldLocalPrice, uint256 newLocalPrice);
    event WeatherAnalyticsUpdated(string indexed category, uint256 products, uint256 transactions);

    // ====================================================================
    // INTERNAL HELPER FUNCTIONS (Declared first to avoid forward reference issues)
    // ====================================================================

    function _markProductSold(uint256 batchId) internal {
        for (uint256 i = 1; i < nextProductId; i++) {
            if (products[i].batchId == batchId && products[i].isAvailable) {
                products[i].isAvailable = false;
                marketMetrics.availableProducts--;
                break;
            }
        }
    }

    function _updateCategoryPrices(string calldata category, uint256 localPrice, uint256 usdPrice) internal {
        uint256 oldUSDPrice = categoryUSDPrices[category];
        uint256 oldLocalPrice = categoryLocalPrices[category];

        // Simple moving average
        if (oldUSDPrice == 0) {
            categoryUSDPrices[category] = usdPrice;
            categoryLocalPrices[category] = localPrice;
        } else {
            categoryUSDPrices[category] = (oldUSDPrice + usdPrice) / 2;
            categoryLocalPrices[category] = (oldLocalPrice + localPrice) / 2;
        }

        emit MarketPriceUpdated(category, oldUSDPrice, categoryUSDPrices[category], oldLocalPrice, categoryLocalPrices[category]);
    }

    function _stringContains(string memory str, string memory searchTerm) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory termBytes = bytes(searchTerm);

        if (termBytes.length > strBytes.length) return false;
        if (termBytes.length == 0) return true;

        for (uint256 i = 0; i <= strBytes.length - termBytes.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < termBytes.length; j++) {
                if (strBytes[i + j] != termBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    function _stringEquals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    // ====================================================================
    // CORE FUNCTIONS (Declare enhanced versions first)
    // ====================================================================

    /**
     * @dev Register a new product with oracle support (enhanced version)
     */
    function registerProductWithOracle(
        address productContract,
        uint256 batchId,
        address farmer,
        string calldata name,
        string calldata category,
        uint256 quantity,
        uint256 localPrice,
        uint256 usdPrice,
        string calldata originLocation,
        ProductBatch.TradingMode tradingMode,
        bool weatherDependent
    ) public onlyActiveStakeholder returns (uint256) {
        uint256 productId = nextProductId++;

        products[productId] = ProductRecord({
            productContract: productContract,
            batchId: batchId,
            farmer: farmer,
            name: name,
            category: category,
            quantity: quantity,
            localPrice: localPrice,
            usdPrice: usdPrice,
            originLocation: originLocation,
            createdAt: block.timestamp,
            isAvailable: true,
            tradingMode: tradingMode,
            weatherDependent: weatherDependent
        });

        // Update indexes
        productsByCategory[category].push(productId);
        productsByTradingMode[tradingMode].push(productId);
        userProducts[farmer].push(productId);

        // Update market metrics
        marketMetrics.totalProducts++;
        marketMetrics.availableProducts++;
        marketMetrics.categoryVolumes[category] += quantity;
        marketMetrics.tradingModeVolumes[tradingMode] += quantity;
        marketMetrics.categoryUSDValues[category] += usdPrice * quantity;
        marketMetrics.categoryLocalValues[category] += localPrice * quantity;

        // Update category prices
        _updateCategoryPrices(category, localPrice, usdPrice);

        // Update weather analytics if weather-dependent
        if (weatherDependent) {
            weatherAnalyticsByCategory[category].totalWeatherDependentProducts++;
            globalWeatherAnalytics.totalWeatherDependentProducts++;
            weatherVerifiedProducts[productId] = true;
        }

        emit ProductRegistered(productId, farmer, name, category, weatherDependent);
        return productId;
    }

    /**
     * @dev Record a transaction with oracle data (enhanced version)
     */
    function recordTransactionWithOracle(
        uint256 batchId,
        address seller,
        address buyer,
        uint256 localPrice,
        uint256 usdPrice,
        uint256 quantity,
        string calldata transactionType,
        bool weatherVerified
    ) public onlyActiveStakeholder returns (uint256) {
        uint256 transactionId = nextTransactionId++;
        uint256 totalUSDValue = usdPrice * quantity;
        uint256 totalLocalValue = localPrice * quantity;

        transactions[transactionId] = TransactionRecord({
            id: transactionId,
            batchId: batchId,
            seller: seller,
            buyer: buyer,
            localPrice: localPrice,
            usdPrice: usdPrice,
            quantity: quantity,
            timestamp: block.timestamp,
            transactionType: transactionType
        });

        // Update batch transactions
        batchTransactions[batchId].push(transactionId);

        // Update metrics
        marketMetrics.totalTransactions++;
        marketMetrics.totalVolume += quantity;
        marketMetrics.totalUSDValue += totalUSDValue;
        marketMetrics.totalLocalValue += totalLocalValue;
        userTransactionCounts[seller]++;
        userTransactionCounts[buyer]++;

        uint256 today = block.timestamp / 86400; // day since epoch
        dailyTransactionCounts[today]++;
        dailyUSDVolume[today] += totalUSDValue;

        // Weather analytics
        if (weatherVerified) {
            globalWeatherAnalytics.weatherVerifiedTransactions++;
            emit WeatherVerifiedTransaction(transactionId, batchId, true);
        }

        // Mark product as sold
        _markProductSold(batchId);

        emit TransactionRecorded(transactionId, batchId, buyer, totalUSDValue, totalLocalValue);
        return transactionId;
    }

    /**
     * @dev Advanced search products with enhanced filters
     */
    function searchProducts(
        string memory searchTerm,        // Change from 'calldata' to 'memory'
        string memory category,
        ProductBatch.TradingMode tradingMode,
        bool weatherDependentOnly
    ) public view returns (uint256[] memory) {
        uint256[] memory results = new uint256[](100); // Max 100 results
        uint256 count = 0;

        for (uint256 i = 1; i < nextProductId && count < 100; i++) {
            ProductRecord storage product = products[i];

            if (!product.isAvailable) continue;

            // Apply filters
            if (bytes(category).length > 0 && !_stringEquals(product.category, category)) continue;
            if (product.tradingMode != tradingMode && tradingMode != ProductBatch.TradingMode.SPOT_MARKET) continue;
            if (weatherDependentOnly && !product.weatherDependent) continue;

            // Search term filter
            if (bytes(searchTerm).length > 0 &&
                !_stringContains(product.name, searchTerm) &&
                !_stringContains(product.category, searchTerm) &&
                !_stringContains(product.originLocation, searchTerm)) continue;

            results[count] = i;
            count++;
        }

        // Resize array
        uint256[] memory searchResults = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            searchResults[i] = results[i];
        }

        return searchResults;
    }

    // ====================================================================
    // COMPATIBILITY FUNCTIONS (Now that enhanced versions are declared)
    // ====================================================================

    /**
     * @dev Register a new product (standard version for compatibility)
     */
    function registerProduct(
        address productContract,
        uint256 batchId,
        address farmer,
        string calldata name,
        string calldata category,
        uint256 quantity,
        uint256 price,
        string calldata originLocation,
        ProductBatch.TradingMode tradingMode
    ) external onlyActiveStakeholder returns (uint256) {
        // Use the enhanced version with defaults for compatibility
        return registerProductWithOracle(
            productContract,
            batchId,
            farmer,
            name,
            category,
            quantity,
            price,
            price, // assume same USD price
            originLocation,
            tradingMode,
            false // not weather dependent
        );
    }

    /**
     * @dev Record a transaction (standard version for compatibility)
     */
    function recordTransaction(
        uint256 batchId,
        address seller,
        address buyer,
        uint256 price,
        uint256 quantity,
        string calldata transactionType
    ) public onlyActiveStakeholder returns (uint256) {
        // Use the enhanced version with defaults for compatibility
        return recordTransactionWithOracle(
            batchId,
            seller,
            buyer,
            price,
            price, // assume same USD price
            quantity,
            transactionType,
            false // not weather verified
        );
    }

    /**
     * @dev Get available products by category (compatibility function)
     */
    function getAvailableProductsByCategory(string calldata category) external view returns (uint256[] memory) {
        return searchProducts(string(""), category, ProductBatch.TradingMode.SPOT_MARKET, false);
    }

    /**
     * @dev Get products by trading mode (compatibility function)
     */
    function getProductsByTradingMode(ProductBatch.TradingMode mode) external view returns (uint256[] memory) {
        return searchProducts(string(""), string(""), mode, false);
    }

    // ====================================================================
    // ANALYTICS AND VIEW FUNCTIONS
    // ====================================================================

    /**
     * @dev Get comprehensive marketplace overview with oracle data
     */
    function getMarketplaceOverview() external view returns (
        uint256 totalProducts,
        uint256 availableProducts,
        uint256 totalTransactions,
        uint256 totalVolume,
        uint256 totalUSDValue,
        uint256 averageUSDPrice,
        uint256 totalLocalValue,
        uint256 averageLocalPrice,
        uint256 weatherDependentProducts
    ) {
        averageUSDPrice = marketMetrics.totalVolume > 0 ? marketMetrics.totalUSDValue / marketMetrics.totalVolume : 0;
        averageLocalPrice = marketMetrics.totalVolume > 0 ? marketMetrics.totalLocalValue / marketMetrics.totalVolume : 0;

        return (
            marketMetrics.totalProducts,
            marketMetrics.availableProducts,
            marketMetrics.totalTransactions,
            marketMetrics.totalVolume,
            marketMetrics.totalUSDValue,
            averageUSDPrice,
            marketMetrics.totalLocalValue,
            averageLocalPrice,
            globalWeatherAnalytics.totalWeatherDependentProducts
        );
    }

    /**
     * @dev Get weather analytics
     */
    function getWeatherAnalytics() external view returns (
        uint256 totalWeatherProducts,
        uint256 weatherVerifiedTransactions,
        uint256 averageTemperature,
        uint256 averageHumidity,
        uint256 lastUpdate
    ) {
        return (
            globalWeatherAnalytics.totalWeatherDependentProducts,
            globalWeatherAnalytics.weatherVerifiedTransactions,
            globalWeatherAnalytics.averageTemperature,
            globalWeatherAnalytics.averageHumidity,
            globalWeatherAnalytics.lastWeatherUpdate
        );
    }

    /**
     * @dev Get category analytics with oracle data
     */
    function getCategoryAnalytics(string calldata category) external view returns (
        uint256 averageUSDPrice,
        uint256 averageLocalPrice,
        uint256 totalVolume,
        uint256 totalUSDValue,
        uint256 totalLocalValue,
        uint256 availableCount,
        uint256 weatherDependentCount
    ) {
        averageUSDPrice = categoryUSDPrices[category];
        averageLocalPrice = categoryLocalPrices[category];
        totalVolume = marketMetrics.categoryVolumes[category];
        totalUSDValue = marketMetrics.categoryUSDValues[category];
        totalLocalValue = marketMetrics.categoryLocalValues[category];
        weatherDependentCount = weatherAnalyticsByCategory[category].totalWeatherDependentProducts;

        uint256[] memory categoryProducts = productsByCategory[category];
        for (uint256 i = 0; i < categoryProducts.length; i++) {
            if (products[categoryProducts[i]].isAvailable) {
                availableCount++;
            }
        }

        return (averageUSDPrice, averageLocalPrice, totalVolume, totalUSDValue, totalLocalValue, availableCount, weatherDependentCount);
    }

    /**
     * @dev Get batch transaction history
     */
    function getBatchTransactions(uint256 batchId) external view returns (uint256[] memory) {
        return batchTransactions[batchId];
    }

    /**
     * @dev Get trading mode analytics
     */
    function getTradingModeAnalytics(ProductBatch.TradingMode mode) external view returns (
        uint256 totalProducts,
        uint256 totalVolume,
        uint256 averagePrice
    ) {
        uint256[] memory modeProducts = productsByTradingMode[mode];
        totalProducts = modeProducts.length;
        totalVolume = marketMetrics.tradingModeVolumes[mode];

        uint256 totalValue = 0;
        uint256 count = 0;
        for (uint256 i = 0; i < modeProducts.length; i++) {
            ProductRecord storage product = products[modeProducts[i]];
            totalValue += product.usdPrice;
            count++;
        }

        averagePrice = count > 0 ? totalValue / count : 0;
        return (totalProducts, totalVolume, averagePrice);
    }

    /**
     * @dev Get daily market statistics
     */
    function getDailyStats(uint256 day) external view returns (
        uint256 transactionCount,
        uint256 usdVolume
    ) {
        return (dailyTransactionCounts[day], dailyUSDVolume[day]);
    }

    /**
     * @dev Get user dashboard with enhanced analytics
     */
    function getUserDashboard(address user) external view returns (
        uint256 totalProducts,
        uint256 availableProducts,
        uint256 transactionCount,
        uint256 totalUSDValueTraded,
        uint256 totalLocalValueTraded,
        uint256 weatherDependentProducts
    ) {
        uint256[] memory userProductList = userProducts[user];

        // Count user's products
        for (uint256 i = 0; i < userProductList.length; i++) {
            totalProducts++;
            if (products[userProductList[i]].isAvailable) {
                availableProducts++;
            }
            if (products[userProductList[i]].weatherDependent) {
                weatherDependentProducts++;
            }
        }

        transactionCount = userTransactionCounts[user];

        // Calculate total values traded
        for (uint256 i = 1; i < nextTransactionId; i++) {
            TransactionRecord storage txn = transactions[i];
            if (txn.seller == user || txn.buyer == user) {
                totalUSDValueTraded += txn.usdPrice * txn.quantity;
                totalLocalValueTraded += txn.localPrice * txn.quantity;
            }
        }

        return (totalProducts, availableProducts, transactionCount, totalUSDValueTraded, totalLocalValueTraded, weatherDependentProducts);
    }

    /**
     * @dev Update weather data for analytics
     */
    function updateWeatherAnalytics(
        uint256 temperature,
        uint256 humidity
    ) external onlyActiveStakeholder {
        globalWeatherAnalytics.averageTemperature = temperature;
        globalWeatherAnalytics.averageHumidity = humidity;
        globalWeatherAnalytics.lastWeatherUpdate = block.timestamp;
    }

    // ====================================================================
    // UTILITY FUNCTIONS FOR BACKWARD COMPATIBILITY
    // ====================================================================

    function getTotalProducts() external view returns (uint256) {
        return marketMetrics.totalProducts;
    }

    function getTotalTransactions() external view returns (uint256) {
        return marketMetrics.totalTransactions;
    }

    function getTotalShipments() external view returns (uint256) {
        // For now, return transactions as proxy for shipments
        return marketMetrics.totalTransactions;
    }

    function getMarketOverview() external view returns (
        uint256 totalActiveProducts,
        uint256 totalTransactionVolume,
        uint256 totalShipmentCount,
        uint256 spotMarketProducts,
        uint256 contractFarmingProducts,
        uint256 cooperativeProducts
    ) {
        totalActiveProducts = marketMetrics.availableProducts;
        totalTransactionVolume = marketMetrics.totalTransactions;
        totalShipmentCount = marketMetrics.totalTransactions; // proxy

        spotMarketProducts = productsByTradingMode[ProductBatch.TradingMode.SPOT_MARKET].length;
        contractFarmingProducts = productsByTradingMode[ProductBatch.TradingMode.CONTRACT_FARMING].length;
        cooperativeProducts = productsByTradingMode[ProductBatch.TradingMode.COOPERATIVE].length;

        return (
            totalActiveProducts,
            totalTransactionVolume,
            totalShipmentCount,
            spotMarketProducts,
            contractFarmingProducts,
            cooperativeProducts
        );
    }

    // Around line 550+ in Registry.sol:
    function getSystemStats() external view returns (
        uint256 totalProducts,
        uint256 totalTransactions,
        uint256 totalVolume,
        uint256 totalValue,
        uint256 availableProducts  // ADD THIS 5th RETURN VALUE
    ) {
        return (
            marketMetrics.totalProducts,
            marketMetrics.totalTransactions,
            marketMetrics.totalVolume,
            marketMetrics.totalUSDValue,
            marketMetrics.availableProducts  // ADD THIS 5th VALUE
        );
    }

   /**
    * @dev Get products by stakeholder role (CORRECTED VERSION)
    */
    function getProductsByRole(Role role) external view returns (uint256[] memory) {
        uint256[] memory temp = new uint256[](nextProductId); // Use nextProductId instead of productCount
        uint256 count = 0;

        for (uint256 i = 1; i < nextProductId; i++) { // Use nextProductId
            ProductRecord storage product = products[i]; // Use ProductRecord instead of ProductInfo
            if (product.isAvailable && hasRole(product.farmer, role)) { // Use farmer instead of owner
                temp[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }

        return result;
    }

    /**
    * @dev Get product summaries by role for display lists
    */
    function getProductSummariesByRole(Role role) external view returns (ProductSummary[] memory) {
        uint256[] memory productIds = this.getProductsByRole(role);
        ProductSummary[] memory summaries = new ProductSummary[](productIds.length);

        for (uint256 i = 0; i < productIds.length; i++) {
            ProductRecord storage product = products[productIds[i]];
            summaries[i] = ProductSummary({
                id: productIds[i],
                name: product.name,
                category: product.category,
                price: product.localPrice,
                usdPrice: product.usdPrice,
                quantity: product.quantity,
                origin: product.originLocation,
                farmer: product.farmer,
                isAvailable: product.isAvailable,
                tradingMode: product.tradingMode
            });
        }

        return summaries;
    }

    /**
    * @dev Get detailed product information
    */
    function getProductDetails(uint256 productId) external view returns (ProductDetails memory) {
        require(productId > 0 && productId < nextProductId, "Invalid product ID");

        ProductRecord storage product = products[productId];

        // Calculate transaction count for this product
        uint256 txCount = batchTransactions[product.batchId].length;

        // Calculate average rating (placeholder - you'd implement actual rating system)
        uint256 avgRating = 85; // Placeholder: 85% satisfaction

        return ProductDetails({
            id: productId,
            name: product.name,
            category: product.category,
            quantity: product.quantity,
            localPrice: product.localPrice,
            usdPrice: product.usdPrice,
            originLocation: product.originLocation,
            farmer: product.farmer,
            productContract: product.productContract,
            batchId: product.batchId,
            createdAt: product.createdAt,
            isAvailable: product.isAvailable,
            tradingMode: product.tradingMode,
            weatherDependent: product.weatherDependent,
            transactionCount: txCount,
            averageRating: avgRating
        });
    }

    /**
    * @dev Set verification contract addresses
    */
    function setVerificationContracts(
        address _provenanceTracker,
        address _qrVerifier,
        address _publicVerification
    ) external onlyAdmin {
        provenanceTracker = ProvenanceTracker(_provenanceTracker);
        qrVerifier = QRCodeVerifier(_qrVerifier);
        publicVerification = PublicVerification(_publicVerification);
    }

    /**
    * @dev Record transaction with automatic provenance tracking
    */
    function recordTransactionWithProvenance(
        uint256 batchId,
        address seller,
        address buyer,
        uint256 localPrice,
        uint256 quantity,
        string calldata transactionType,
        string calldata location
    ) external onlyActiveStakeholder {
        // Record normal transaction
        recordTransaction(batchId, seller, buyer, localPrice, quantity, transactionType);

        // Add provenance record if tracker is available
        if (address(provenanceTracker) != address(0)) {
            provenanceTracker.addProvenanceRecord(
                batchId,
                string(abi.encodePacked("Transaction: ", transactionType)),
                location,
                ""
            );
        }
    }
}