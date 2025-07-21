// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./ProductRegistry.sol";

contract ShipmentRegistry {
    enum ShipmentStatus {
        NOT_SHIPPED,
        PREPARING,
        SHIPPED,
        DELIVERED,
        CANCELLED,
        UNABLE_TO_DELIVERED,
        VERIFIED
    }

    struct ShipmentInfo {
        uint256 shipmentId;
        uint256 productId;
        address sender;
        address receiver;
        ShipmentStatus status;
        uint256 createdAt;
        uint256 lastUpdated;
        string trackingNumber;
        string transportMode;
        bool isActive;
    }

    struct ShipmentUpdate {
        uint256 timestamp;
        ShipmentStatus status;
        address updater;
        string trackingInfo;
        string location;
    }

    mapping(uint256 => ShipmentInfo) public shipments;
    mapping(uint256 => ShipmentUpdate[]) public shipmentHistory;
    mapping(uint256 => uint256) public productToShipment;
    mapping(address => uint256[]) public stakeholderShipments;
    mapping(string => uint256) public trackingNumberToShipment;

    uint256 public nextShipmentId = 1;
    uint256 public totalShipments = 0;

    StakeholderRegistry public stakeholderRegistry;
    ProductRegistry public productRegistry;

    event ShipmentCreated(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        address indexed sender,
        address receiver,
        string trackingNumber,
        uint256 timestamp
    );

    event ShipmentStatusUpdated(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        ShipmentStatus indexed newStatus,
        address updater,
        string trackingInfo,
        uint256 timestamp
    );

    event ShipmentDelivered(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        address indexed receiver,
        uint256 timestamp
    );

    event ShipmentCancelled(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        string reason,
        uint256 timestamp
    );

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

    modifier shipmentExists(uint256 _shipmentId) {
        require(
            _shipmentId < nextShipmentId && shipments[_shipmentId].isActive,
            "Shipment does not exist"
        );
        _;
    }

    modifier validProductForShipment(uint256 _productId) {
        require(
            productToShipment[_productId] == 0,
            "Product already has an active shipment"
        );
        (
            bool isValid,
            ProductRegistry.ProductInfo memory product
        ) = productRegistry.verifyProduct(_productId);
        require(isValid, "Product is not valid for shipment");
        require(
            product.currentStage == ProductRegistry.ProductStage.PROCESSING ||
                product.currentStage ==
                ProductRegistry.ProductStage.DISTRIBUTION ||
                product.currentStage == ProductRegistry.ProductStage.RETAIL,
            "Product not ready for shipment"
        );
        _;
    }

    modifier onlyShipmentParticipant(uint256 _shipmentId) {
        ShipmentInfo storage shipment = shipments[_shipmentId];
        require(
            msg.sender == shipment.sender ||
                msg.sender == shipment.receiver ||
                stakeholderRegistry.isRegisteredStakeholder(
                    msg.sender,
                    StakeholderRegistry.StakeholderRole.DISTRIBUTOR
                ),
            "Not authorized for this shipment"
        );
        _;
    }

    modifier onlyRegisteredDistributor() {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                StakeholderRegistry.StakeholderRole.DISTRIBUTOR
            ),
            "Not registered as distributor"
        );
        _;
    }

    constructor(
        address _stakeholderRegistryAddress,
        address _productRegistryAddress
    ) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        productRegistry = ProductRegistry(_productRegistryAddress);
    }

    function createShipment(
        uint256 _productId,
        address _receiver,
        string memory _trackingNumber,
        string memory _transportMode
    )
        external
        onlyRegisteredDistributor
        validProductForShipment(_productId)
        returns (uint256)
    {
        require(_receiver != address(0), "Invalid receiver address");
        require(
            bytes(_trackingNumber).length > 0,
            "Tracking number cannot be empty"
        );
        require(
            trackingNumberToShipment[_trackingNumber] == 0,
            "Tracking number already exists"
        );

        uint256 shipmentId = nextShipmentId++;

        shipments[shipmentId] = ShipmentInfo({
            shipmentId: shipmentId,
            productId: _productId,
            sender: msg.sender,
            receiver: _receiver,
            status: ShipmentStatus.PREPARING,
            createdAt: block.timestamp,
            lastUpdated: block.timestamp,
            trackingNumber: _trackingNumber,
            transportMode: _transportMode,
            isActive: true
        });

        shipmentHistory[shipmentId].push(
            ShipmentUpdate({
                timestamp: block.timestamp,
                status: ShipmentStatus.PREPARING,
                updater: msg.sender,
                trackingInfo: "Shipment created and preparing",
                location: "Origin facility"
            })
        );

        productToShipment[_productId] = shipmentId;
        stakeholderShipments[msg.sender].push(shipmentId);
        stakeholderShipments[_receiver].push(shipmentId);
        trackingNumberToShipment[_trackingNumber] = shipmentId;
        totalShipments++;

        stakeholderRegistry.updateLastActivity(msg.sender);

        emit ShipmentCreated(
            shipmentId,
            _productId,
            msg.sender,
            _receiver,
            _trackingNumber,
            block.timestamp
        );

        return shipmentId;
    }

    function updateShipmentStatus(
        uint256 _shipmentId,
        ShipmentStatus _newStatus,
        string memory _trackingInfo,
        string memory _location
    ) public shipmentExists(_shipmentId) onlyShipmentParticipant(_shipmentId) {
        ShipmentInfo storage shipment = shipments[_shipmentId];

        require(
            _isValidShipmentTransition(shipment.status, _newStatus),
            "Invalid shipment status transition"
        );

        shipment.status = _newStatus;
        shipment.lastUpdated = block.timestamp;

        shipmentHistory[_shipmentId].push(
            ShipmentUpdate({
                timestamp: block.timestamp,
                status: _newStatus,
                updater: msg.sender,
                trackingInfo: _trackingInfo,
                location: _location
            })
        );

        stakeholderRegistry.updateLastActivity(msg.sender);

        emit ShipmentStatusUpdated(
            _shipmentId,
            shipment.productId,
            _newStatus,
            msg.sender,
            _trackingInfo,
            block.timestamp
        );

        if (_newStatus == ShipmentStatus.DELIVERED) {
            emit ShipmentDelivered(
                _shipmentId,
                shipment.productId,
                shipment.receiver,
                block.timestamp
            );
        }

        if (_newStatus == ShipmentStatus.CANCELLED) {
            emit ShipmentCancelled(
                _shipmentId,
                shipment.productId,
                _trackingInfo,
                block.timestamp
            );
        }
    }

    function updateShipmentStatusSimple(
        uint256 _shipmentId,
        ShipmentStatus _newStatus
    )
        external
        shipmentExists(_shipmentId)
        onlyShipmentParticipant(_shipmentId)
    {
        string memory defaultInfo = _getDefaultTrackingInfo(_newStatus);
        updateShipmentStatus(_shipmentId, _newStatus, defaultInfo, "");
    }

    function _isValidShipmentTransition(
        ShipmentStatus _current,
        ShipmentStatus _new
    ) internal pure returns (bool) {
        if (_current == ShipmentStatus.NOT_SHIPPED) {
            return
                _new == ShipmentStatus.PREPARING ||
                _new == ShipmentStatus.CANCELLED;
        } else if (_current == ShipmentStatus.PREPARING) {
            return
                _new == ShipmentStatus.SHIPPED ||
                _new == ShipmentStatus.CANCELLED;
        } else if (_current == ShipmentStatus.SHIPPED) {
            return
                _new == ShipmentStatus.DELIVERED ||
                _new == ShipmentStatus.UNABLE_TO_DELIVERED;
        } else if (_current == ShipmentStatus.DELIVERED) {
            return _new == ShipmentStatus.VERIFIED;
        }
        return false;
    }

    function _getDefaultTrackingInfo(
        ShipmentStatus _status
    ) internal pure returns (string memory) {
        if (_status == ShipmentStatus.PREPARING) return "Preparing shipment";
        if (_status == ShipmentStatus.SHIPPED) return "Shipment dispatched";
        if (_status == ShipmentStatus.DELIVERED) return "Shipment delivered";
        if (_status == ShipmentStatus.VERIFIED) return "Delivery verified";
        if (_status == ShipmentStatus.CANCELLED) return "Shipment cancelled";
        if (_status == ShipmentStatus.UNABLE_TO_DELIVERED)
            return "Delivery failed";
        return "Status updated";
    }

    function getShipmentInfo(
        uint256 _shipmentId
    ) external view shipmentExists(_shipmentId) returns (ShipmentInfo memory) {
        return shipments[_shipmentId];
    }

    function getShipment(
        uint256 _shipmentId
    )
        external
        view
        shipmentExists(_shipmentId)
        returns (
            uint256[] memory productIds,
            address sender,
            address receiver,
            uint8 status,
            uint256 createdAt,
            string memory trackingInfo,
            string memory transportMode
        )
    {
        ShipmentInfo memory shipment = shipments[_shipmentId];

        productIds = new uint256[](1);
        productIds[0] = shipment.productId;

        string memory latestTrackingInfo = "";
        if (shipmentHistory[_shipmentId].length > 0) {
            ShipmentUpdate[] memory history = shipmentHistory[_shipmentId];
            latestTrackingInfo = history[history.length - 1].trackingInfo;
        }

        return (
            productIds,
            shipment.sender,
            shipment.receiver,
            uint8(shipment.status),
            shipment.createdAt,
            latestTrackingInfo,
            shipment.transportMode
        );
    }

    function getShipmentHistory(
        uint256 _shipmentId
    )
        external
        view
        shipmentExists(_shipmentId)
        returns (ShipmentUpdate[] memory)
    {
        return shipmentHistory[_shipmentId];
    }

    function getShipmentByProduct(
        uint256 _productId
    ) external view returns (uint256) {
        return productToShipment[_productId];
    }

    function getShipmentByTrackingNumber(
        string memory _trackingNumber
    ) external view returns (uint256) {
        uint256 shipmentId = trackingNumberToShipment[_trackingNumber];
        require(
            shipmentId != 0 || trackingNumberToShipment[_trackingNumber] == 0,
            "Tracking number not found"
        );
        return shipmentId;
    }

    function getStakeholderShipments(
        address _stakeholder
    ) external view returns (uint256[] memory) {
        return stakeholderShipments[_stakeholder];
    }

    function getShipmentsByStatus(
        ShipmentStatus _status
    ) external view returns (uint256[] memory) {
        uint256[] memory tempArray = new uint256[](totalShipments);
        uint256 count = 0;

        for (uint256 i = 1; i < nextShipmentId; i++) {
            if (shipments[i].isActive && shipments[i].status == _status) {
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

    function getShipmentStats()
        external
        view
        returns (
            uint256 totalShipmentsCount,
            uint256 preparing,
            uint256 shipped,
            uint256 delivered,
            uint256 verified,
            uint256 cancelled
        )
    {
        uint256 prep = 0;
        uint256 ship = 0;
        uint256 deliv = 0;
        uint256 verif = 0;
        uint256 cancel = 0;

        for (uint256 i = 1; i < nextShipmentId; i++) {
            if (shipments[i].isActive) {
                if (shipments[i].status == ShipmentStatus.PREPARING) prep++;
                else if (shipments[i].status == ShipmentStatus.SHIPPED) ship++;
                else if (shipments[i].status == ShipmentStatus.DELIVERED)
                    deliv++;
                else if (shipments[i].status == ShipmentStatus.VERIFIED)
                    verif++;
                else if (shipments[i].status == ShipmentStatus.CANCELLED)
                    cancel++;
            }
        }

        return (totalShipments, prep, ship, deliv, verif, cancel);
    }

    function trackShipment(
        string memory _trackingNumber
    )
        external
        view
        returns (
            uint256 shipmentId,
            uint256 productId,
            ShipmentStatus status,
            string memory statusDescription,
            ShipmentUpdate memory latestUpdate
        )
    {
        shipmentId = trackingNumberToShipment[_trackingNumber];
        require(shipmentId != 0, "Invalid tracking number");

        ShipmentInfo memory shipment = shipments[shipmentId];
        productId = shipment.productId;
        status = shipment.status;
        statusDescription = _getShipmentStatusDescription(status);

        ShipmentUpdate[] memory history = shipmentHistory[shipmentId];
        if (history.length > 0) {
            latestUpdate = history[history.length - 1];
        }

        return (shipmentId, productId, status, statusDescription, latestUpdate);
    }

    function _getShipmentStatusDescription(
        ShipmentStatus _status
    ) internal pure returns (string memory) {
        if (_status == ShipmentStatus.NOT_SHIPPED) return "Not yet shipped";
        if (_status == ShipmentStatus.PREPARING)
            return "Preparing for shipment";
        if (_status == ShipmentStatus.SHIPPED) return "In transit";
        if (_status == ShipmentStatus.DELIVERED) return "Delivered";
        if (_status == ShipmentStatus.CANCELLED) return "Shipment cancelled";
        if (_status == ShipmentStatus.UNABLE_TO_DELIVERED)
            return "Delivery failed";
        if (_status == ShipmentStatus.VERIFIED) return "Delivery confirmed";
        return "Unknown status";
    }

    function cancelShipment(
        uint256 _shipmentId,
        string memory _reason
    )
        external
        shipmentExists(_shipmentId)
        onlyShipmentParticipant(_shipmentId)
    {
        ShipmentInfo storage shipment = shipments[_shipmentId];
        require(
            shipment.status == ShipmentStatus.PREPARING ||
                shipment.status == ShipmentStatus.SHIPPED,
            "Cannot cancel shipment in current status"
        );

        updateShipmentStatus(
            _shipmentId,
            ShipmentStatus.CANCELLED,
            _reason,
            ""
        );
    }

    function getTotalShipments() external view returns (uint256) {
        return totalShipments;
    }

    function getNextShipmentId() external view returns (uint256) {
        return nextShipmentId;
    }
}
