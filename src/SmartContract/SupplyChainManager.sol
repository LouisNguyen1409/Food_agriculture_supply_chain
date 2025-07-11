// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./ProductRegistry.sol";
import "./ShipmentRegistry.sol";

contract SupplyChainManager {
    StakeholderRegistry public stakeholderRegistry;
    ProductRegistry public productRegistry;
    ShipmentRegistry public shipmentRegistry;

    address public admin;

    event SystemInitialized(
        address indexed admin,
        address stakeholderRegistry,
        address productRegistry,
        address shipmentRegistry
    );

    event ContractUpgraded(string contractName, address newAddress);

    event FullProductJourneyCompleted(
        uint256 indexed productId,
        uint256 indexed shipmentId,
        address indexed consumer
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    constructor(
        address _stakeholderRegistryAddress,
        address _productRegistryAddress,
        address _shipmentRegistryAddress
    ) {
        admin = msg.sender;
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        productRegistry = ProductRegistry(_productRegistryAddress);
        shipmentRegistry = ShipmentRegistry(_shipmentRegistryAddress);

        emit SystemInitialized(
            admin,
            _stakeholderRegistryAddress,
            _productRegistryAddress,
            _shipmentRegistryAddress
        );
    }

    function createProductWithShipment(
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData,
        address _receiver,
        string memory _trackingNumber,
        string memory _transportMode
    ) external returns (uint256 productId, uint256 shipmentId) {
        productId = productRegistry.registerProduct(
            _productName,
            _batchNumber,
            _farmData
        );

        return (productId, 0);
    }

    function getCompleteProductTrace(
        uint256 _productId
    )
        external
        view
        returns (
            ProductRegistry.ProductInfo memory productInfo,
            ProductRegistry.StageData memory farmStage,
            ProductRegistry.StageData memory processingStage,
            ProductRegistry.StageData memory distributionStage,
            ProductRegistry.StageData memory retailStage,
            bool hasShipment,
            ShipmentRegistry.ShipmentInfo memory shipmentInfo,
            ShipmentRegistry.ShipmentUpdate[] memory shipmentHistory
        )
    {
        (
            productInfo,
            farmStage,
            processingStage,
            distributionStage,
            retailStage
        ) = productRegistry.getProductJourney(_productId);

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
            farmStage,
            processingStage,
            distributionStage,
            retailStage,
            hasShipment,
            shipmentInfo,
            shipmentHistory
        );
    }

    function verifyCompleteSupplyChain(
        uint256 _productId
    )
        external
        view
        returns (
            bool productIsValid,
            bool shipmentIsValid,
            string memory status
        )
    {
        (productIsValid, ) = productRegistry.verifyProduct(_productId);

        shipmentIsValid = true;
        status = "Product verified";

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
                    shipmentIsValid = false;
                    status = "Shipment issues detected";
                } else {
                    status = "Product and shipment verified";
                }
            }
        } catch {
            status = "Product verified, no shipment data";
        }

        return (productIsValid, shipmentIsValid, status);
    }

    function trackProductAndShipment(
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
            ShipmentRegistry.ShipmentUpdate memory latestUpdate
        )
    {
        (
            uint256 shipmentId,
            uint256 prodId,
            ShipmentRegistry.ShipmentStatus status,
            string memory desc,
            ShipmentRegistry.ShipmentUpdate memory update
        ) = shipmentRegistry.trackShipment(_trackingNumber);

        productId = prodId;
        shipmentStatus = status;
        statusDescription = desc;
        latestUpdate = update;

        ProductRegistry.ProductInfo memory productInfo = productRegistry
            .getProductInfo(productId);
        productStage = productInfo.currentStage;
        productName = productInfo.productName;

        return (
            productId,
            productStage,
            shipmentStatus,
            productName,
            statusDescription,
            latestUpdate
        );
    }

    function getSupplyChainDashboard()
        external
        view
        returns (
            uint256 totalProducts,
            uint256 totalShipments,
            uint256 totalStakeholders,
            uint256 productsAtFarm,
            uint256 productsInProcessing,
            uint256 productsInDistribution,
            uint256 productsAtRetail,
            uint256 productsConsumed,
            uint256 shipmentsInTransit,
            uint256 shipmentsDelivered
        )
    {
        (
            totalProducts,
            productsAtFarm,
            productsInProcessing,
            productsInDistribution,
            productsAtRetail,
            productsConsumed
        ) = productRegistry.getSupplyChainStats();

        (
            totalShipments,
            ,
            shipmentsInTransit,
            shipmentsDelivered,
            ,

        ) = shipmentRegistry.getShipmentStats();

        totalStakeholders = stakeholderRegistry.totalStakeholders();

        return (
            totalProducts,
            totalShipments,
            totalStakeholders,
            productsAtFarm,
            productsInProcessing,
            productsInDistribution,
            productsAtRetail,
            productsConsumed,
            shipmentsInTransit,
            shipmentsDelivered
        );
    }

    function findProductByBatch(
        string memory _batchNumber
    )
        external
        view
        returns (
            uint256 productId,
            ProductRegistry.ProductInfo memory productInfo,
            bool hasShipment,
            uint256 shipmentId
        )
    {
        productId = productRegistry.getProductByBatch(_batchNumber);
        productInfo = productRegistry.getProductInfo(productId);

        try shipmentRegistry.getShipmentByProduct(productId) returns (
            uint256 shipId
        ) {
            hasShipment = true;
            shipmentId = shipId;
        } catch {
            hasShipment = false;
            shipmentId = 0;
        }

        return (productId, productInfo, hasShipment, shipmentId);
    }

    function getStakeholderActivity(
        address _stakeholder
    )
        external
        view
        returns (
            uint256[] memory products,
            uint256[] memory shipments,
            StakeholderRegistry.StakeholderInfo memory stakeholderInfo
        )
    {
        products = productRegistry.getStakeholderProducts(_stakeholder);
        shipments = shipmentRegistry.getStakeholderShipments(_stakeholder);
        stakeholderInfo = stakeholderRegistry.getStakeholderInfo(_stakeholder);

        return (products, shipments, stakeholderInfo);
    }

    function getProductsByStageWithShipments(
        ProductRegistry.ProductStage _stage
    )
        external
        view
        returns (
            uint256[] memory productIds,
            uint256[] memory correspondingShipmentIds
        )
    {
        productIds = productRegistry.getProductsByStage(_stage);
        correspondingShipmentIds = new uint256[](productIds.length);

        for (uint256 i = 0; i < productIds.length; i++) {
            try shipmentRegistry.getShipmentByProduct(productIds[i]) returns (
                uint256 shipmentId
            ) {
                correspondingShipmentIds[i] = shipmentId;
            } catch {
                correspondingShipmentIds[i] = 0;
            }
        }

        return (productIds, correspondingShipmentIds);
    }

    function upgradeProductRegistry(
        address _newProductRegistry
    ) external onlyAdmin {
        require(_newProductRegistry != address(0), "Invalid address");
        productRegistry = ProductRegistry(_newProductRegistry);
        emit ContractUpgraded("ProductRegistry", _newProductRegistry);
    }

    function upgradeShipmentRegistry(
        address _newShipmentRegistry
    ) external onlyAdmin {
        require(_newShipmentRegistry != address(0), "Invalid address");
        shipmentRegistry = ShipmentRegistry(_newShipmentRegistry);
        emit ContractUpgraded("ShipmentRegistry", _newShipmentRegistry);
    }

    function upgradeStakeholderRegistry(
        address _newStakeholderRegistry
    ) external onlyAdmin {
        require(_newStakeholderRegistry != address(0), "Invalid address");
        stakeholderRegistry = StakeholderRegistry(_newStakeholderRegistry);
        emit ContractUpgraded("StakeholderRegistry", _newStakeholderRegistry);
    }

    function getSystemAddresses()
        external
        view
        returns (
            address stakeholderRegistryAddr,
            address productRegistryAddr,
            address shipmentRegistryAddr
        )
    {
        return (
            address(stakeholderRegistry),
            address(productRegistry),
            address(shipmentRegistry)
        );
    }
}
