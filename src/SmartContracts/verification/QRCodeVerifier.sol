// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ProvenanceTracker.sol";
import "../core/ProductBatch.sol";
import "../core/Registry.sol";
import "../access/AccessControl.sol";
import "../Oracles/Weather.sol";

/**
 * @title QRCodeVerifier
 * @dev Verifies products via QR code scanning for public consumers
 */
contract QRCodeVerifier is AccessControl {

    struct QRData {
        uint256 batchId;
        address productContract;
        bytes32 verificationHash;
        uint256 createdAt;
        bool isActive;
        string productName;
        address farmer;
    }

    struct VerificationResult {
        bool isValid;
        string productName;
        string origin;
        uint256 batchId;
        address currentOwner;
        address farmer;
        uint256 productionDate;
        ProductBatch.BatchStatus status;
        ProductBatch.TradingMode tradingMode;
        string lastLocation;
        uint256 lastUpdate;
        uint256 provenanceRecords;
        bool isProvenanceComplete;
    }

    // Contract references
    ProvenanceTracker public provenanceTracker;
    ProductBatch public productBatch;
    Registry public registry;

    // QR Code mappings
    mapping(string => QRData) public qrCodes;
    mapping(uint256 => string) public batchToQR;
    uint256 public totalQRCodes;

    // Events
    event QRCodeGenerated(string indexed qrCode, uint256 indexed batchId, address indexed farmer);
    event QRCodeVerified(string indexed qrCode, address indexed verifier, bool isValid);
    event QRCodeDeactivated(string indexed qrCode, uint256 indexed batchId);

    constructor(
        address _provenanceTracker,
        address _productBatch,
        address _registry
    ) {
        provenanceTracker = ProvenanceTracker(_provenanceTracker);
        productBatch = ProductBatch(_productBatch);
        registry = Registry(_registry);
    }

    /**
     * @dev Generate QR code for a batch
     */
    function generateQRCode(uint256 batchId) external returns (string memory) {
        // Verify batch exists and caller has permission
        require(hasRole(msg.sender, Role.FARMER) ||
                hasRole(msg.sender, Role.PROCESSOR) ||
                hasRole(msg.sender, Role.DISTRIBUTOR) ||
                hasRole(msg.sender, Role.RETAILER), "Unauthorized");

        // Get batch info to verify it exists
        (address farmer, address currentOwner, string memory name,,,,,,,) =
            productBatch.getBatchInfo(batchId);
        require(farmer != address(0), "Batch does not exist");

        // Generate unique QR code
        string memory qrCode = _generateUniqueQR(batchId);

        // Store QR data
        qrCodes[qrCode] = QRData({
            batchId: batchId,
            productContract: address(productBatch),
            verificationHash: _generateVerificationHash(batchId),
            createdAt: block.timestamp,
            isActive: true,
            productName: name,
            farmer: farmer
        });

        batchToQR[batchId] = qrCode;
        totalQRCodes++;

        emit QRCodeGenerated(qrCode, batchId, farmer);
        return qrCode;
    }

    /**
     * @dev Verify product via QR code scan
     */
    function verifyQRCode(string calldata qrCode)
        external
        returns (VerificationResult memory result)
    {
        QRData storage qrData = qrCodes[qrCode];

        if (!qrData.isActive || qrData.batchId == 0) {
            result.isValid = false;
            emit QRCodeVerified(qrCode, msg.sender, false);
            return result;
        }

        // Get batch information
        try productBatch.getBatchInfo(qrData.batchId) returns (
            address farmer,
            address currentOwner,
            string memory name,
            string memory description,
            uint256 quantity,
            uint256 basePrice,
            string memory originLocation,
            ProductBatch.BatchStatus status,
            uint256 createdAt,
            uint256 lastUpdated
        ) {
            result.isValid = true;
            result.productName = name;
            result.origin = originLocation;
            result.batchId = qrData.batchId;
            result.currentOwner = currentOwner;
            result.farmer = farmer;
            result.productionDate = createdAt;
            result.status = status;
            result.lastUpdate = lastUpdated;

            // Get provenance data
            try provenanceTracker.getProvenanceSummary(qrData.batchId) returns (
                address,
                string memory,
                string memory,
                uint256,
                address,
                string memory,
                string memory lastLocation,
                uint256,
                uint256 totalRecords,
                bool isComplete
            ) {
                result.lastLocation = lastLocation;
                result.provenanceRecords = totalRecords;
                result.isProvenanceComplete = isComplete;
            } catch {
                result.lastLocation = originLocation;
                result.provenanceRecords = 0;
                result.isProvenanceComplete = false;
            }

            // Get trading mode
            try productBatch.getBatchMarketInfo(qrData.batchId) returns (
                address,
                string memory,
                uint256,
                uint256,
                uint256,
                ProductBatch.BatchStatus,
                ProductBatch.TradingMode tradingMode,
                Weather.WeatherData memory,  // FIXED: Use Weather.WeatherData instead of ProductBatch.Weather.WeatherData
                bool
            ) {
                result.tradingMode = tradingMode;
            } catch {
                result.tradingMode = ProductBatch.TradingMode.SPOT_MARKET;
            }

        } catch {
            result.isValid = false;
        }

        emit QRCodeVerified(qrCode, msg.sender, result.isValid);
        return result;
    }

    /**
    * @dev View-only version of verifyQRCode (no state changes)
    */
    function verifyQRCodeView(string calldata qrCode)
        external
        view
        returns (VerificationResult memory result)
    {
        QRData storage qrData = qrCodes[qrCode];

        if (!qrData.isActive || qrData.batchId == 0) {
            result.isValid = false;
            return result;
        }

        // Get batch information (same logic as verifyQRCode but no events)
        try productBatch.getBatchInfo(qrData.batchId) returns (
            address farmer,
            address currentOwner,
            string memory name,
            string memory,
            uint256,
            uint256,
            string memory originLocation,
            ProductBatch.BatchStatus status,
            uint256 createdAt,
            uint256 lastUpdated
        ) {
            result.isValid = true;
            result.productName = name;
            result.origin = originLocation;
            result.batchId = qrData.batchId;
            result.currentOwner = currentOwner;
            result.farmer = farmer;
            result.productionDate = createdAt;
            result.status = status;
            result.lastUpdate = lastUpdated;

            // Get provenance data
            try provenanceTracker.getProvenanceSummary(qrData.batchId) returns (
                address,
                string memory,
                string memory,
                uint256,
                address,
                string memory,
                string memory lastLocation,
                uint256,
                uint256 totalRecords,
                bool isComplete
            ) {
                result.lastLocation = lastLocation;
                result.provenanceRecords = totalRecords;
                result.isProvenanceComplete = isComplete;
            } catch {
                result.lastLocation = originLocation;
                result.provenanceRecords = 0;
                result.isProvenanceComplete = false;
            }

            // Simplified trading mode
            result.tradingMode = ProductBatch.TradingMode.SPOT_MARKET;

        } catch {
            result.isValid = false;
        }

        return result;
    }

    /**
     * @dev Get QR code for a batch
     */
    function getQRCodeForBatch(uint256 batchId) external view returns (string memory) {
        return batchToQR[batchId];
    }

    /**
     * @dev Check if QR code is valid
     */
    function isQRCodeValid(string calldata qrCode) external view returns (bool) {
        QRData storage qrData = qrCodes[qrCode];
        return qrData.isActive && qrData.batchId != 0;
    }

    /**
     * @dev Get complete verification data including provenance chain
     */
    function getFullVerificationData(string calldata qrCode)
        external
        view
        returns (
            VerificationResult memory basicInfo,
            uint256[] memory provenanceIndices,
            string[] memory actions,
            string[] memory locations,
            address[] memory actors
        )
    {
        basicInfo = this.verifyQRCodeView(qrCode);

        if (basicInfo.isValid) {
            try provenanceTracker.getFullProvenanceChain(basicInfo.batchId) returns (
                uint256 recordCount,
                bytes32,
                bool
            ) {
                provenanceIndices = new uint256[](recordCount);
                actions = new string[](recordCount);
                locations = new string[](recordCount);
                actors = new address[](recordCount);

                for (uint256 i = 0; i < recordCount; i++) {
                    try provenanceTracker.getProvenanceRecord(basicInfo.batchId, i) returns (
                        address actor,
                        string memory action,
                        string memory location,
                        uint256,
                        string memory,
                        bytes32,
                        bytes32
                    ) {
                        provenanceIndices[i] = i;
                        actions[i] = action;
                        locations[i] = location;
                        actors[i] = actor;
                    } catch {
                        // Skip invalid records
                    }
                }
            } catch {
                // Return empty arrays if provenance chain fails
                provenanceIndices = new uint256[](0);
                actions = new string[](0);
                locations = new string[](0);
                actors = new address[](0);
            }
        }

        return (basicInfo, provenanceIndices, actions, locations, actors);
    }

    /**
     * @dev Deactivate QR code (for recalls or expired products)
     */
    function deactivateQRCode(string calldata qrCode) external {
        QRData storage qrData = qrCodes[qrCode];
        require(qrData.isActive, "QR code not active");
        require(hasRole(msg.sender, Role.ADMIN) || msg.sender == qrData.farmer, "Unauthorized");

        qrData.isActive = false;
        emit QRCodeDeactivated(qrCode, qrData.batchId);
    }

    /**
     * @dev Get QR code analytics
     */
    function getQRAnalytics() external view returns (
        uint256 totalGenerated,
        uint256 totalActive,
        uint256 totalDeactivated
    ) {
        totalGenerated = totalQRCodes;
        // Note: In production, you'd track these more efficiently
        totalActive = totalQRCodes; // Simplified
        totalDeactivated = 0; // Simplified

        return (totalGenerated, totalActive, totalDeactivated);
    }

    /**
     * @dev Generate unique QR code string
     */
    function _generateUniqueQR(uint256 batchId) internal view returns (string memory) {
        bytes32 hash = keccak256(abi.encodePacked(
            batchId,
            block.timestamp,
            block.prevrandao,
            msg.sender,
            totalQRCodes
        ));

        return string(abi.encodePacked("QR-", _toHexString(uint256(hash))));
    }

    /**
     * @dev Generate verification hash
     */
    function _generateVerificationHash(uint256 batchId) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            batchId,
            address(this),
            block.timestamp,
            msg.sender
        ));
    }

    /**
    * @dev Convert uint to hex string (simplified and safe)
    */
    function _toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        // Take only the last 32 bits to avoid overflow
        uint256 temp = value & 0xFFFFFFFF;
        uint256 length = 0;
        uint256 tempValue = temp;

        // Calculate length needed
        while (tempValue != 0) {
            length++;
            tempValue >>= 4;
        }

        if (length == 0) length = 1;

        bytes memory buffer = new bytes(length);

        for (uint256 i = length; i > 0; i--) {
            buffer[i - 1] = bytes1(uint8(48 + (temp & 0xf) + (temp & 0xf > 9 ? 39 : 0)));
            temp >>= 4;
        }

        return string(buffer);
    }
}