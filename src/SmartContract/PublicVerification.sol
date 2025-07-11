// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProductRegistry.sol";
import "./StakeholderRegistry.sol";
import "./ShipmentRegistry.sol";

contract PublicVerification {
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    ShipmentRegistry public shipmentRegistry;

    event ProductVerificationRequested(
        uint256 indexed productId,
        address indexed verifier,
        uint256 timestamp
    );
    event VerificationResult(
        uint256 indexed productId,
        bool isAuthentic,
        string details,
        uint256 timestamp
    );
    event AuditPerformed(
        address indexed auditor,
        uint256 indexed productId,
        string auditResult,
        uint256 timestamp
    );
    event ShipmentVerificationPerformed(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        bool isValid,
        uint256 timestamp
    );

    constructor(
        address _productRegistryAddress,
        address _stakeholderRegistryAddress,
        address _shipmentRegistryAddress
    ) {
        productRegistry = ProductRegistry(_productRegistryAddress);
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        shipmentRegistry = ShipmentRegistry(_shipmentRegistryAddress);
    }

    function verifyProductAuthenticity(
        uint256 _productId
    ) external returns (bool isAuthentic, string memory details) {
        emit ProductVerificationRequested(
            _productId,
            msg.sender,
            block.timestamp
        );

        try productRegistry.verifyProduct(_productId) returns (
            bool valid,
            ProductRegistry.ProductInfo memory product
        ) {
            if (valid) {
                bool stakeholdersValid = true;
                string memory invalidReason = "";

                if (
                    !stakeholderRegistry.isRegisteredStakeholder(
                        product.farmer,
                        StakeholderRegistry.StakeholderRole.FARMER
                    )
                ) {
                    stakeholdersValid = false;
                    invalidReason = "Farmer registration invalid";
                }

                if (
                    stakeholdersValid &&
                    product.currentStage >=
                    ProductRegistry.ProductStage.PROCESSING
                ) {
                    ProductRegistry.StageData
                        memory processingStage = productRegistry
                            .getProductStageData(
                                _productId,
                                ProductRegistry.ProductStage.PROCESSING
                            );
                    if (
                        processingStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            processingStage.stakeholder,
                            StakeholderRegistry.StakeholderRole.PROCESSOR
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Processor registration invalid";
                    }
                }

                if (
                    stakeholdersValid &&
                    product.currentStage >=
                    ProductRegistry.ProductStage.DISTRIBUTION
                ) {
                    ProductRegistry.StageData
                        memory distributionStage = productRegistry
                            .getProductStageData(
                                _productId,
                                ProductRegistry.ProductStage.DISTRIBUTION
                            );
                    if (
                        distributionStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            distributionStage.stakeholder,
                            StakeholderRegistry.StakeholderRole.DISTRIBUTOR
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Distributor registration invalid";
                    }
                }

                if (
                    stakeholdersValid &&
                    product.currentStage >= ProductRegistry.ProductStage.RETAIL
                ) {
                    ProductRegistry.StageData
                        memory retailStage = productRegistry
                            .getProductStageData(
                                _productId,
                                ProductRegistry.ProductStage.RETAIL
                            );
                    if (
                        retailStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            retailStage.stakeholder,
                            StakeholderRegistry.StakeholderRole.RETAILER
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Retailer registration invalid";
                    }
                }

                if (stakeholdersValid) {
                    details = "Product is authentic and all stakeholders verified";
                    emit VerificationResult(
                        _productId,
                        true,
                        details,
                        block.timestamp
                    );
                    return (true, details);
                } else {
                    details = string(
                        abi.encodePacked(
                            "Product data valid but ",
                            invalidReason
                        )
                    );
                    emit VerificationResult(
                        _productId,
                        false,
                        details,
                        block.timestamp
                    );
                    return (false, details);
                }
            } else {
                details = "Product data integrity compromised";
                emit VerificationResult(
                    _productId,
                    false,
                    details,
                    block.timestamp
                );
                return (false, details);
            }
        } catch {
            details = "Product not found or verification failed";
            emit VerificationResult(
                _productId,
                false,
                details,
                block.timestamp
            );
            return (false, details);
        }
    }

    function verifyCompleteSupplyChain(
        uint256 _productId
    ) external returns (bool isValid, string memory details) {
        (bool productValid, string memory productDetails) = this
            .verifyProductAuthenticity(_productId);

        if (!productValid) {
            return (false, productDetails);
        }

        try shipmentRegistry.getShipmentByProduct(_productId) returns (
            uint256 shipmentId
        ) {
            if (shipmentId > 0) {
                ShipmentRegistry.ShipmentInfo
                    memory shipmentInfo = shipmentRegistry.getShipmentInfo(
                        shipmentId
                    );

                if (
                    shipmentInfo.status ==
                    ShipmentRegistry.ShipmentStatus.CANCELLED ||
                    shipmentInfo.status ==
                    ShipmentRegistry.ShipmentStatus.UNABLE_TO_DELIVERED
                ) {
                    emit ShipmentVerificationPerformed(
                        shipmentId,
                        _productId,
                        false,
                        block.timestamp
                    );
                    return (false, "Product valid but shipment has issues");
                } else {
                    emit ShipmentVerificationPerformed(
                        shipmentId,
                        _productId,
                        true,
                        block.timestamp
                    );
                    return (
                        true,
                        "Product and shipment both verified successfully"
                    );
                }
            } else {
                return (true, "Product verified, no shipment data available");
            }
        } catch {
            return (true, "Product verified, no shipment data available");
        }
    }

    function getTraceabilityReport(
        uint256 _productId
    )
        external
        view
        returns (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced
        )
    {
        (
            ProductRegistry.ProductInfo memory product,
            ProductRegistry.StageData memory farmStage,
            ProductRegistry.StageData memory processingStage,
            ProductRegistry.StageData memory distributionStage,
            ProductRegistry.StageData memory retailStage
        ) = productRegistry.getProductJourney(_productId);

        StakeholderRegistry.StakeholderInfo memory farmer;
        StakeholderRegistry.StakeholderInfo memory processor;
        StakeholderRegistry.StakeholderInfo memory distributor;
        StakeholderRegistry.StakeholderInfo memory retailer;

        if (farmStage.timestamp > 0) {
            farmer = stakeholderRegistry.getStakeholderInfo(
                farmStage.stakeholder
            );
        }

        if (processingStage.timestamp > 0) {
            processor = stakeholderRegistry.getStakeholderInfo(
                processingStage.stakeholder
            );
        }

        if (distributionStage.timestamp > 0) {
            distributor = stakeholderRegistry.getStakeholderInfo(
                distributionStage.stakeholder
            );
        }

        if (retailStage.timestamp > 0) {
            retailer = stakeholderRegistry.getStakeholderInfo(
                retailStage.stakeholder
            );
        }

        bool fullyTraced = (farmStage.timestamp > 0 &&
            (product.currentStage == ProductRegistry.ProductStage.FARM ||
                processingStage.timestamp > 0) &&
            (product.currentStage <= ProductRegistry.ProductStage.PROCESSING ||
                distributionStage.timestamp > 0) &&
            (product.currentStage <=
                ProductRegistry.ProductStage.DISTRIBUTION ||
                retailStage.timestamp > 0));

        return (product, farmer, processor, distributor, retailer, fullyTraced);
    }

    function getCompleteTraceabilityReport(
        uint256 _productId
    )
        external
        view
        returns (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced,
            bool hasShipment,
            ShipmentRegistry.ShipmentInfo memory shipmentInfo,
            ShipmentRegistry.ShipmentUpdate[] memory shipmentHistory
        )
    {
        (
            productInfo,
            farmerInfo,
            processorInfo,
            distributorInfo,
            retailerInfo,
            isFullyTraced
        ) = this.getTraceabilityReport(_productId);

        try shipmentRegistry.getShipmentByProduct(_productId) returns (
            uint256 shipmentId
        ) {
            if (shipmentId > 0) {
                hasShipment = true;
                shipmentInfo = shipmentRegistry.getShipmentInfo(shipmentId);
                shipmentHistory = shipmentRegistry.getShipmentHistory(
                    shipmentId
                );
            }
        } catch {
            hasShipment = false;
        }

        return (
            productInfo,
            farmerInfo,
            processorInfo,
            distributorInfo,
            retailerInfo,
            isFullyTraced,
            hasShipment,
            shipmentInfo,
            shipmentHistory
        );
    }

    function performAudit(
        uint256 _productId,
        string memory _auditResult
    ) external {
        emit AuditPerformed(
            msg.sender,
            _productId,
            _auditResult,
            block.timestamp
        );
    }

    function getTransparencyMetrics()
        external
        view
        returns (
            uint256 totalProducts,
            uint256 totalStakeholders,
            uint256 totalFarmers,
            uint256 totalProcessors,
            uint256 totalDistributors,
            uint256 totalRetailers,
            uint256 totalShipments
        )
    {
        (totalProducts, , , , , ) = productRegistry.getSupplyChainStats();
        totalStakeholders = stakeholderRegistry.totalStakeholders();

        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(
            StakeholderRegistry.StakeholderRole.FARMER
        );
        address[] memory processors = stakeholderRegistry.getStakeholdersByRole(
            StakeholderRegistry.StakeholderRole.PROCESSOR
        );
        address[] memory distributors = stakeholderRegistry
            .getStakeholdersByRole(
                StakeholderRegistry.StakeholderRole.DISTRIBUTOR
            );
        address[] memory retailers = stakeholderRegistry.getStakeholdersByRole(
            StakeholderRegistry.StakeholderRole.RETAILER
        );

        (totalShipments, , , , , ) = shipmentRegistry.getShipmentStats();

        return (
            totalProducts,
            totalStakeholders,
            farmers.length,
            processors.length,
            distributors.length,
            retailers.length,
            totalShipments
        );
    }

    function trackProductWithShipment(
        string memory _trackingNumber
    )
        external
        view
        returns (
            uint256 productId,
            ProductRegistry.ProductStage productStage,
            ShipmentRegistry.ShipmentStatus shipmentStatus,
            string memory productName,
            string memory statusDescription,
            bool isProductValid,
            bool isShipmentValid
        )
    {
        try shipmentRegistry.trackShipment(_trackingNumber) returns (
            uint256 shipmentId,
            uint256 prodId,
            ShipmentRegistry.ShipmentStatus status,
            string memory desc,
            ShipmentRegistry.ShipmentUpdate memory
        ) {
            productId = prodId;
            shipmentStatus = status;
            statusDescription = desc;

            ProductRegistry.ProductInfo memory productInfo = productRegistry
                .getProductInfo(productId);
            productStage = productInfo.currentStage;
            productName = productInfo.productName;

            (isProductValid, ) = productRegistry.verifyProduct(productId);

            isShipmentValid = !(status ==
                ShipmentRegistry.ShipmentStatus.CANCELLED ||
                status == ShipmentRegistry.ShipmentStatus.UNABLE_TO_DELIVERED);

            return (
                productId,
                productStage,
                shipmentStatus,
                productName,
                statusDescription,
                isProductValid,
                isShipmentValid
            );
        } catch {
            revert("Invalid tracking number or shipment not found");
        }
    }

    function getSystemOverview()
        external
        view
        returns (
            uint256 totalProducts,
            uint256 totalShipments,
            uint256 totalStakeholders,
            uint256 activeProducts,
            uint256 shipmentsInTransit,
            string memory systemStatus
        )
    {
        (totalProducts, , , , , ) = productRegistry.getSupplyChainStats();
        (totalShipments, , shipmentsInTransit, , , ) = shipmentRegistry
            .getShipmentStats();
        totalStakeholders = stakeholderRegistry.totalStakeholders();

        activeProducts = totalProducts;
        systemStatus = "Operational - Public verification available";

        return (
            totalProducts,
            totalShipments,
            totalStakeholders,
            activeProducts,
            shipmentsInTransit,
            systemStatus
        );
    }
}
