// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./QRCodeVerifier.sol";
import "./ProvenanceTracker.sol";
import "../core/Registry.sol";

/**
 * @title PublicVerification
 * @dev Public interface for consumers to verify products without authentication
 */
contract PublicVerification {

    struct PublicProductInfo {
        string productName;
        string category;
        string origin;
        string description;
        uint256 productionDate;
        bool isVerified;
        uint256 lastUpdate;
        string currentLocation;
        string farmerInfo;
        uint256 supplyChainSteps;
        bool isOrganic;
        string qualityGrade;
    }

    struct SupplyChainStep {
        string actor;
        string action;
        string location;
        uint256 timestamp;
        bool isVerified;
    }

    struct ConsumerSummary {
        bool isAuthentic;
        string productName;
        string farmOrigin;
        uint256 harvestDate;
        string currentStatus;
        uint256 daysFromHarvest;
        uint256 totalSteps;
        string qualityIndicator;
    }

    // Contract references
    QRCodeVerifier public qrVerifier;
    ProvenanceTracker public provenanceTracker;
    Registry public registry;

    // Public stats
    uint256 public totalVerifications;
    uint256 public totalUniqueProducts;
    uint256 public dailyVerifications;
    uint256 public lastResetDay;

    // Events
    event ProductVerification(string indexed qrCode, address indexed verifier, bool isValid);
    event StatsUpdated(uint256 totalVerifications, uint256 totalProducts, uint256 dailyCount);

    constructor(
        address _qrVerifier,
        address _provenanceTracker,
        address _registry
    ) {
        qrVerifier = QRCodeVerifier(_qrVerifier);
        provenanceTracker = ProvenanceTracker(_provenanceTracker);
        registry = Registry(_registry);
        lastResetDay = block.timestamp / 1 days;
    }

    /**
     * @dev Public function to verify a product by QR code (main consumer interface)
     */
    function verifyProduct(string calldata qrCode)
        external
        returns (PublicProductInfo memory productInfo, bool isValid)
    {
        _updateDailyStats();
        totalVerifications++;

        // Get verification result from QRCodeVerifier
        QRCodeVerifier.VerificationResult memory result = qrVerifier.verifyQRCode(qrCode);

        if (result.isValid) {
            productInfo = PublicProductInfo({
                productName: result.productName,
                category: "Agricultural Product", // Could be enhanced
                origin: result.origin,
                description: "Verified supply chain product",
                productionDate: result.productionDate,
                isVerified: true,
                lastUpdate: result.lastUpdate,
                currentLocation: result.lastLocation,
                farmerInfo: _getShortAddress(result.farmer),
                supplyChainSteps: result.provenanceRecords,
                isOrganic: false, // Could be enhanced with quality data
                qualityGrade: "A+" // Could be enhanced with quality data
            });
            isValid = true;

            // Track unique products
            if (result.batchId > totalUniqueProducts) {
                totalUniqueProducts = result.batchId;
            }
        } else {
            isValid = false;
        }

        emit ProductVerification(qrCode, msg.sender, isValid);
        emit StatsUpdated(totalVerifications, totalUniqueProducts, dailyVerifications);

        return (productInfo, isValid);
    }

    /**
     * @dev Get simple consumer summary (mobile-friendly)
     */
    function getConsumerSummary(string calldata qrCode)
        external
        view
        returns (ConsumerSummary memory summary)
    {
        QRCodeVerifier.VerificationResult memory result = qrVerifier.verifyQRCodeView(qrCode);

        if (result.isValid) {
            uint256 daysFromHarvest = (block.timestamp - result.productionDate) / 1 days;

            summary = ConsumerSummary({
                isAuthentic: true,
                productName: result.productName,
                farmOrigin: result.origin,
                harvestDate: result.productionDate,
                currentStatus: _getStatusText(result.status),
                daysFromHarvest: daysFromHarvest,
                totalSteps: result.provenanceRecords,
                qualityIndicator: daysFromHarvest < 7 ? "Fresh" : daysFromHarvest < 14 ? "Good" : "Check Quality"
            });
        } else {
            summary.isAuthentic = false;
            summary.productName = "Invalid Product";
            summary.qualityIndicator = "Not Verified";
        }

        return summary;
    }

    /**
     * @dev Get complete supply chain for a verified product
     */
    function getSupplyChainHistory(string calldata qrCode)
        external
        view
        returns (SupplyChainStep[] memory steps)
    {
        QRCodeVerifier.VerificationResult memory result = qrVerifier.verifyQRCodeView(qrCode);

        if (!result.isValid) {
            return new SupplyChainStep[](0);
        }

        // Get full verification data including provenance
        try qrVerifier.getFullVerificationData(qrCode) returns (
            QRCodeVerifier.VerificationResult memory,
            uint256[] memory indices,
            string[] memory actions,
            string[] memory locations,
            address[] memory actors
        ) {
            steps = new SupplyChainStep[](indices.length);

            for (uint256 i = 0; i < indices.length; i++) {
                steps[i] = SupplyChainStep({
                    actor: _getActorName(actors[i]),
                    action: actions[i],
                    location: locations[i],
                    timestamp: block.timestamp, // Simplified - should get from provenance
                    isVerified: true
                });
            }
        } catch {
            return new SupplyChainStep[](0);
        }

        return steps;
    }

    /**
     * @dev Quick verification check (read-only, no stats update)
     */
    function quickVerify(string calldata qrCode)
        external
        view
        returns (bool isValid, string memory productName, string memory origin)
    {
        QRCodeVerifier.VerificationResult memory result = qrVerifier.verifyQRCodeView(qrCode);
        return (result.isValid, result.productName, result.origin);
    }

    /**
     * @dev Get public statistics dashboard
     */
    function getPublicStats()
        external
        view
        returns (
            uint256 _totalVerifications,
            uint256 _totalProducts,
            uint256 _dailyVerifications,
            uint256 _totalSupplyChains,
            uint256 _avgStepsPerChain
        )
    {
        return (
            totalVerifications,
            totalUniqueProducts,
            dailyVerifications,
            provenanceTracker.totalChains(),
            totalUniqueProducts > 0 ? provenanceTracker.totalChains() / totalUniqueProducts : 0
        );
    }

    /**
     * @dev Get verification trends (last 7 days)
     */
    function getVerificationTrends()
        external
        view
        returns (
            uint256 todayCount,
            uint256 weeklyAverage,
            bool isTrending
        )
    {
        // Simplified implementation
        todayCount = dailyVerifications;
        weeklyAverage = totalVerifications / 7; // Simplified
        isTrending = dailyVerifications > weeklyAverage;

        return (todayCount, weeklyAverage, isTrending);
    }

    /**
     * @dev Search products by origin (public search)
     */
    function searchByOrigin(string calldata origin)
        external
        view
        returns (uint256[] memory batchIds, string[] memory productNames)
    {
        // This would need to be implemented with proper indexing
        // For now, return empty arrays
        batchIds = new uint256[](0);
        productNames = new string[](0);

        return (batchIds, productNames);
    }

    /**
     * @dev Get farmer reputation for public viewing
     */
    function getFarmerReputation(address farmer)
        external
        view
        returns (
            uint256 totalProducts,
            uint256 verificationScore,
            bool isVerifiedFarmer
        )
    {
        // Simplified implementation
        totalProducts = 0; // Would query from Registry
        verificationScore = 85; // Placeholder
        isVerifiedFarmer = true; // Would check from StakeholderManager

        return (totalProducts, verificationScore, isVerifiedFarmer);
    }

    /**
     * @dev Update daily statistics
     */
    function _updateDailyStats() internal {
        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay > lastResetDay) {
            dailyVerifications = 0;
            lastResetDay = currentDay;
        }
        dailyVerifications++;
    }

    /**
     * @dev Convert address to readable farmer name
     */
    function _getActorName(address actor) internal pure returns (string memory) {
        return string(abi.encodePacked("Actor-", _getShortAddress(actor)));
    }

    /**
    * @dev Get shortened address for display (fixed version)
    */
    function _getShortAddress(address addr) internal pure returns (string memory) {
        if (addr == address(0)) {
            return "0x0000";
        }

        // Convert address to string safely
        bytes memory addrBytes = abi.encodePacked(addr);
        bytes memory result = new bytes(10); // "0x" + 8 chars

        result[0] = "0";
        result[1] = "x";

        for (uint256 i = 0; i < 4; i++) {
            uint8 byteValue = uint8(addrBytes[i]);
            result[2 + i * 2] = _toHexChar(byteValue >> 4);
            result[3 + i * 2] = _toHexChar(byteValue & 0x0f);
        }

        return string(result);
    }

    /**
    * @dev Convert single hex digit to character
    */
    function _toHexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) {
            return bytes1(uint8(48 + value)); // '0'-'9'
        } else {
            return bytes1(uint8(87 + value)); // 'a'-'f'
        }
    }

    /**
     * @dev Convert batch status to readable text
     */
    function _getStatusText(ProductBatch.BatchStatus status) internal pure returns (string memory) {
        if (status == ProductBatch.BatchStatus.CREATED) return "Created";
        if (status == ProductBatch.BatchStatus.LISTED) return "Listed";
        if (status == ProductBatch.BatchStatus.SOLD) return "Sold";
        if (status == ProductBatch.BatchStatus.SHIPPED) return "Shipped";
        if (status == ProductBatch.BatchStatus.RECEIVED) return "Received";
        if (status == ProductBatch.BatchStatus.PROCESSED) return "Processed";
        if (status == ProductBatch.BatchStatus.QUALITY_CHECKED) return "Quality Checked";
        if (status == ProductBatch.BatchStatus.FINALIZED) return "Finalized";
        return "Unknown";
    }
}