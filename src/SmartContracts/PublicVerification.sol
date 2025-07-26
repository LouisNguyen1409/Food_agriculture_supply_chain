// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Product.sol";
import "./Shipment.sol";
import "./StakeholderRegistry.sol";
import "./StakeholderManager.sol";
import "./Registry.sol";

contract PublicVerification {
    StakeholderRegistry public stakeholderRegistry;
    Registry public registry;

    // Define the StakeholderInfo struct locally since it's used in return types
    struct StakeholderInfo {
        address stakeholderAddress;
        StakeholderManager.StakeholderRole role;
        string businessName;
        string businessLicense;
        string location;
        string certifications;
        bool isActive;
        uint256 registeredAt;
        uint256 lastActivity;
    }

    event ProductVerificationRequested(
        address indexed productAddress,
        address indexed verifier,
        uint256 timestamp
    );
    event VerificationResult(
        address indexed productAddress,
        bool isAuthentic,
        string details,
        uint256 timestamp
    );
    event AuditPerformed(
        address indexed auditor,
        address indexed productAddress,
        string auditResult,
        uint256 timestamp
    );
    event ShipmentVerificationPerformed(
        address indexed shipmentAddress,
        address indexed productAddress,
        bool isValid,
        uint256 timestamp
    );

    constructor(address _stakeholderRegistryAddress, address _registryAddress) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        registry = Registry(_registryAddress);
    }

    function verifyProductAuthenticity(
        address _productAddress
    ) external returns (bool isAuthentic, string memory details) {
        emit ProductVerificationRequested(
            _productAddress,
            msg.sender,
            block.timestamp
        );

        try Product(_productAddress).verifyProduct() returns (bool valid) {
            if (valid) {
                bool stakeholdersValid = true;
                string memory invalidReason = "";

                Product product = Product(_productAddress);
                address farmer = product.farmer();

                if (
                    !stakeholderRegistry.isRegisteredStakeholder(
                        farmer,
                        StakeholderManager.StakeholderRole.FARMER
                    )
                ) {
                    stakeholdersValid = false;
                    invalidReason = "Farmer registration invalid";
                }

                Product.ProductStage currentStage = product.currentStage();

                if (
                    stakeholdersValid &&
                    currentStage >= Product.ProductStage.PROCESSING
                ) {
                    Product.StageData memory processingStage = product
                        .getStageData(Product.ProductStage.PROCESSING);
                    if (
                        processingStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            processingStage.stakeholder,
                            StakeholderManager.StakeholderRole.PROCESSOR
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Processor registration invalid";
                    }
                }

                if (
                    stakeholdersValid &&
                    currentStage >= Product.ProductStage.DISTRIBUTION
                ) {
                    Product.StageData memory distributionStage = product
                        .getStageData(Product.ProductStage.DISTRIBUTION);
                    if (
                        distributionStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            distributionStage.stakeholder,
                            StakeholderManager.StakeholderRole.DISTRIBUTOR
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Distributor registration invalid";
                    }
                }

                if (
                    stakeholdersValid &&
                    currentStage >= Product.ProductStage.RETAIL
                ) {
                    Product.StageData memory retailStage = product.getStageData(
                        Product.ProductStage.RETAIL
                    );
                    if (
                        retailStage.timestamp > 0 &&
                        !stakeholderRegistry.isRegisteredStakeholder(
                            retailStage.stakeholder,
                            StakeholderManager.StakeholderRole.RETAILER
                        )
                    ) {
                        stakeholdersValid = false;
                        invalidReason = "Retailer registration invalid";
                    }
                }

                if (stakeholdersValid) {
                    details = "Product is authentic and all stakeholders verified";
                    emit VerificationResult(
                        _productAddress,
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
                        _productAddress,
                        false,
                        details,
                        block.timestamp
                    );
                    return (false, details);
                }
            } else {
                details = "Product data integrity compromised";
                emit VerificationResult(
                    _productAddress,
                    false,
                    details,
                    block.timestamp
                );
                return (false, details);
            }
        } catch {
            details = "Product not found or verification failed";
            emit VerificationResult(
                _productAddress,
                false,
                details,
                block.timestamp
            );
            return (false, details);
        }
    }

    function verifyCompleteSupplyChain(
        address _productAddress
    ) external returns (bool isValid, string memory details) {
        (bool productValid, string memory productDetails) = this
            .verifyProductAuthenticity(_productAddress);

        if (!productValid) {
            return (false, productDetails);
        }

        address shipmentAddress = findShipmentByProduct(_productAddress);

        if (shipmentAddress != address(0)) {
            Shipment shipment = Shipment(shipmentAddress);
            Shipment.ShipmentStatus status = shipment.status();

            if (
                status == Shipment.ShipmentStatus.CANCELLED ||
                status == Shipment.ShipmentStatus.UNABLE_TO_DELIVERED
            ) {
                emit ShipmentVerificationPerformed(
                    shipmentAddress,
                    _productAddress,
                    false,
                    block.timestamp
                );
                return (false, "Product valid but shipment has issues");
            } else {
                emit ShipmentVerificationPerformed(
                    shipmentAddress,
                    _productAddress,
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
    }

    function getTraceabilityReport(
        address _productAddress
    )
        external
        view
        returns (
            string memory productName,
            address farmer,
            StakeholderInfo memory farmerInfo,
            StakeholderInfo memory processorInfo,
            StakeholderInfo memory distributorInfo,
            StakeholderInfo memory retailerInfo,
            bool isFullyTraced
        )
    {
        try Product(_productAddress).getProductJourney() returns (
            Product.StageData memory farmStage,
            Product.StageData memory processingStage,
            Product.StageData memory distributionStage,
            Product.StageData memory retailStage
        ) {
            Product product = Product(_productAddress);
            productName = product.name();
            farmer = product.farmer();

            StakeholderInfo memory farmerStakeholder;
            StakeholderInfo memory processor;
            StakeholderInfo memory distributor;
            StakeholderInfo memory retailer;

            if (farmStage.timestamp > 0) {
                (
                    address addr,
                    StakeholderManager.StakeholderRole role,
                    string memory name,
                    string memory license,
                    string memory location,
                    string memory certs,
                    bool active,
                    uint256 registered,
                    uint256 activity
                ) = stakeholderRegistry.getStakeholderInfo(
                        farmStage.stakeholder
                    );

                farmerStakeholder = StakeholderInfo({
                    stakeholderAddress: addr,
                    role: role,
                    businessName: name,
                    businessLicense: license,
                    location: location,
                    certifications: certs,
                    isActive: active,
                    registeredAt: registered,
                    lastActivity: activity
                });
            }

            if (processingStage.timestamp > 0) {
                (
                    address addr,
                    StakeholderManager.StakeholderRole role,
                    string memory name,
                    string memory license,
                    string memory location,
                    string memory certs,
                    bool active,
                    uint256 registered,
                    uint256 activity
                ) = stakeholderRegistry.getStakeholderInfo(
                        processingStage.stakeholder
                    );

                processor = StakeholderInfo({
                    stakeholderAddress: addr,
                    role: role,
                    businessName: name,
                    businessLicense: license,
                    location: location,
                    certifications: certs,
                    isActive: active,
                    registeredAt: registered,
                    lastActivity: activity
                });
            }

            if (distributionStage.timestamp > 0) {
                (
                    address addr,
                    StakeholderManager.StakeholderRole role,
                    string memory name,
                    string memory license,
                    string memory location,
                    string memory certs,
                    bool active,
                    uint256 registered,
                    uint256 activity
                ) = stakeholderRegistry.getStakeholderInfo(
                        distributionStage.stakeholder
                    );

                distributor = StakeholderInfo({
                    stakeholderAddress: addr,
                    role: role,
                    businessName: name,
                    businessLicense: license,
                    location: location,
                    certifications: certs,
                    isActive: active,
                    registeredAt: registered,
                    lastActivity: activity
                });
            }

            if (retailStage.timestamp > 0) {
                (
                    address addr,
                    StakeholderManager.StakeholderRole role,
                    string memory name,
                    string memory license,
                    string memory location,
                    string memory certs,
                    bool active,
                    uint256 registered,
                    uint256 activity
                ) = stakeholderRegistry.getStakeholderInfo(
                        retailStage.stakeholder
                    );

                retailer = StakeholderInfo({
                    stakeholderAddress: addr,
                    role: role,
                    businessName: name,
                    businessLicense: license,
                    location: location,
                    certifications: certs,
                    isActive: active,
                    registeredAt: registered,
                    lastActivity: activity
                });
            }

            Product.ProductStage currentStage = product.currentStage();
            bool fullyTraced = (farmStage.timestamp > 0 &&
                (currentStage == Product.ProductStage.FARM ||
                    processingStage.timestamp > 0) &&
                (currentStage <= Product.ProductStage.PROCESSING ||
                    distributionStage.timestamp > 0) &&
                (currentStage <= Product.ProductStage.DISTRIBUTION ||
                    retailStage.timestamp > 0));

            return (
                productName,
                farmer,
                farmerStakeholder,
                processor,
                distributor,
                retailer,
                fullyTraced
            );
        } catch {
            // Return empty data for non-existent products
            StakeholderInfo memory emptyStakeholder;
            return (
                "",
                address(0),
                emptyStakeholder,
                emptyStakeholder,
                emptyStakeholder,
                emptyStakeholder,
                false
            );
        }
    }

    function getCompleteTraceabilityReport(
        address _productAddress
    )
        external
        view
        returns (
            string memory productName,
            address farmer,
            StakeholderInfo memory farmerInfo,
            StakeholderInfo memory processorInfo,
            StakeholderInfo memory distributorInfo,
            StakeholderInfo memory retailerInfo,
            bool isFullyTraced,
            bool hasShipment,
            address shipmentAddress,
            Shipment.ShipmentUpdate[] memory shipmentHistory
        )
    {
        (
            productName,
            farmer,
            farmerInfo,
            processorInfo,
            distributorInfo,
            retailerInfo,
            isFullyTraced
        ) = this.getTraceabilityReport(_productAddress);

        shipmentAddress = findShipmentByProduct(_productAddress);
        if (shipmentAddress != address(0)) {
            hasShipment = true;
            Shipment shipment = Shipment(shipmentAddress);
            shipmentHistory = shipment.getShipmentHistory();
        }

        return (
            productName,
            farmer,
            farmerInfo,
            processorInfo,
            distributorInfo,
            retailerInfo,
            isFullyTraced,
            hasShipment,
            shipmentAddress,
            shipmentHistory
        );
    }

    function trackShipmentByTrackingNumber(
        string memory _trackingNumber
    )
        external
        view
        returns (
            address shipmentAddress,
            address productAddress,
            Product.ProductStage productStage,
            Shipment.ShipmentStatus shipmentStatus,
            string memory productName,
            string memory statusDescription,
            bool isProductValid,
            bool isShipmentValid
        )
    {
        shipmentAddress = findShipmentByTrackingNumber(_trackingNumber);
        require(
            shipmentAddress != address(0),
            "Invalid tracking number or shipment not found"
        );

        Shipment shipment = Shipment(shipmentAddress);
        productAddress = shipment.productAddress();
        shipmentStatus = shipment.status();
        statusDescription = shipment.getStatusDescription();

        Product product = Product(productAddress);
        productStage = product.currentStage();
        productName = product.name();

        isProductValid = product.verifyProduct();

        isShipmentValid = !(shipmentStatus ==
            Shipment.ShipmentStatus.CANCELLED ||
            shipmentStatus == Shipment.ShipmentStatus.UNABLE_TO_DELIVERED);

        return (
            shipmentAddress,
            productAddress,
            productStage,
            shipmentStatus,
            productName,
            statusDescription,
            isProductValid,
            isShipmentValid
        );
    }

    function performAudit(
        address _productAddress,
        string memory _auditResult
    ) external {
        require(
            stakeholderRegistry.isActiveStakeholder(msg.sender),
            "Only registered stakeholders can perform audits"
        );

        emit AuditPerformed(
            msg.sender,
            _productAddress,
            _auditResult,
            block.timestamp
        );
    }

    function getShipmentInfo(
        address _shipmentAddress
    )
        external
        view
        returns (
            address product,
            address sender,
            address receiver,
            string memory trackingNumber,
            string memory transportMode,
            Shipment.ShipmentStatus status,
            uint256 createdAt,
            uint256 lastUpdated,
            bool isActive
        )
    {
        require(
            registry.isEntityRegistered(_shipmentAddress),
            "Shipment not registered"
        );

        Shipment shipment = Shipment(_shipmentAddress);
        return shipment.getShipmentInfo();
    }

    // Helper functions to find shipments (application-layer logic)
    function findShipmentByProduct(
        address _productAddress
    ) public view returns (address) {
        address[] memory allShipments = registry.getAllShipments();

        for (uint256 i = 0; i < allShipments.length; i++) {
            try Shipment(allShipments[i]).productAddress() returns (
                address productAddr
            ) {
                if (productAddr == _productAddress) {
                    return allShipments[i];
                }
            } catch {
                // Skip invalid shipments
                continue;
            }
        }

        return address(0);
    }

    function findShipmentByTrackingNumber(
        string memory _trackingNumber
    ) public view returns (address) {
        address[] memory allShipments = registry.getAllShipments();

        for (uint256 i = 0; i < allShipments.length; i++) {
            try Shipment(allShipments[i]).trackingNumber() returns (
                string memory trackingNum
            ) {
                if (
                    keccak256(bytes(trackingNum)) ==
                    keccak256(bytes(_trackingNumber))
                ) {
                    return allShipments[i];
                }
            } catch {
                // Skip invalid shipments
                continue;
            }
        }

        return address(0);
    }
}
