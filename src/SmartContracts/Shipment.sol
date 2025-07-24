// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./Product.sol";
import "./Stakeholder.sol";

contract Shipment {
    enum ShipmentStatus {
        NOT_SHIPPED,
        PREPARING,
        SHIPPED,
        DELIVERED,
        CANCELLED,
        UNABLE_TO_DELIVERED,
        VERIFIED
    }

    struct ShipmentUpdate {
        uint256 timestamp;
        ShipmentStatus status;
        address updater;
        string trackingInfo;
        string location;
    }

    // Basic shipment info
    address public productAddress;
    address public sender;
    address public receiver;
    string public trackingNumber;
    string public transportMode;
    
    // State tracking
    ShipmentStatus public status;
    uint256 public createdAt;
    uint256 public lastUpdated;
    bool public isActive;

    // History tracking
    ShipmentUpdate[] public shipmentHistory;
    
    // External contracts
    StakeholderRegistry public immutable stakeholderRegistry;

    // Events
    event ShipmentStatusUpdated(
        ShipmentStatus indexed newStatus,
        address indexed updater,
        string trackingInfo,
        string location,
        uint256 timestamp
    );

    event ShipmentDelivered(
        address indexed receiver,
        uint256 timestamp
    );

    event ShipmentCancelled(
        string reason,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyRegisteredStakeholder(
        Stakeholder.StakeholderRole _requiredRole
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

    modifier onlyShipmentParticipant() {
        require(
            msg.sender == sender ||
                msg.sender == receiver ||
                stakeholderRegistry.isRegisteredStakeholder(
                    msg.sender,
                    Stakeholder.StakeholderRole.DISTRIBUTOR
                ),
            "Not authorized for this shipment"
        );
        _;
    }

    modifier validProductForShipment(address _productAddress) {
        Product product = Product(_productAddress);
        require(product.isActive(), "Product is not active");
        
        Product.ProductStage currentStage = product.currentStage();
        require(
            currentStage == Product.ProductStage.PROCESSING ||
            currentStage == Product.ProductStage.DISTRIBUTION ||
            currentStage == Product.ProductStage.RETAIL,
            "Product not ready for shipment"
        );
        _;
    }

    /**
     * @dev Constructor creates a new shipment
     * @notice Tracking number uniqueness should be validated at the factory level
     * @notice Product shipment eligibility is validated via modifier
     */
    constructor(
        address _productAddress,
        address _sender,
        address _receiver,
        string memory _trackingNumber,
        string memory _transportMode,
        address _stakeholderRegistry
    ) validProductForShipment(_productAddress) {
        require(_productAddress != address(0), "Invalid product address");
        require(_sender != address(0), "Invalid sender address");
        require(_receiver != address(0), "Invalid receiver address");
        require(bytes(_trackingNumber).length > 0, "Tracking number cannot be empty");

        productAddress = _productAddress;
        sender = _sender;
        receiver = _receiver;
        trackingNumber = _trackingNumber;
        transportMode = _transportMode;
        status = ShipmentStatus.PREPARING;
        createdAt = block.timestamp;
        lastUpdated = block.timestamp;
        isActive = true;

        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistry);

        // Add initial status to history
        shipmentHistory.push(
            ShipmentUpdate({
                timestamp: block.timestamp,
                status: ShipmentStatus.PREPARING,
                updater: _sender,
                trackingInfo: "Shipment created and preparing",
                location: "Origin facility"
            })
        );

        emit ShipmentStatusUpdated(
            ShipmentStatus.PREPARING,
            _sender,
            "Shipment created and preparing",
            "Origin facility",
            block.timestamp
        );
    }

    /**
     * @dev Update shipment status
     */
    function updateStatus(
        ShipmentStatus _newStatus,
        string memory _trackingInfo,
        string memory _location
    ) public onlyShipmentParticipant {
        require(
            _isValidShipmentTransition(status, _newStatus),
            "Invalid shipment status transition"
        );

        status = _newStatus;
        lastUpdated = block.timestamp;

        shipmentHistory.push(
            ShipmentUpdate({
                timestamp: block.timestamp,
                status: _newStatus,
                updater: msg.sender,
                trackingInfo: _trackingInfo,
                location: _location
            })
        );

        emit ShipmentStatusUpdated(
            _newStatus,
            msg.sender,
            _trackingInfo,
            _location,
            block.timestamp
        );

        if (_newStatus == ShipmentStatus.DELIVERED) {
            emit ShipmentDelivered(receiver, block.timestamp);
        }

        if (_newStatus == ShipmentStatus.CANCELLED) {
            emit ShipmentCancelled(_trackingInfo, block.timestamp);
        }
    }

    /**
     * @dev Cancel shipment with reason
     */
    function cancel(string memory _reason) external onlyShipmentParticipant {
        require(
            status == ShipmentStatus.PREPARING || status == ShipmentStatus.SHIPPED,
            "Cannot cancel shipment in current status"
        );

        updateStatus(ShipmentStatus.CANCELLED, _reason, "");
    }

    /**
     * @dev Verify delivery
     */
    function verifyDelivery() external {
        require(msg.sender == receiver, "Only receiver can verify delivery");
        require(status == ShipmentStatus.DELIVERED, "Shipment must be delivered first");

        updateStatus(ShipmentStatus.VERIFIED, "Delivery verified by receiver", "");
    }

    /**
     * @dev Get complete shipment history
     */
    function getShipmentHistory() external view returns (ShipmentUpdate[] memory) {
        return shipmentHistory;
    }

    /**
     * @dev Get latest update
     */
    function getLatestUpdate() external view returns (ShipmentUpdate memory) {
        require(shipmentHistory.length > 0, "No updates available");
        return shipmentHistory[shipmentHistory.length - 1];
    }

    /**
     * @dev Get shipment info
     */
    function getShipmentInfo()
        external
        view
        returns (
            address product,
            address shipmentSender,
            address shipmentReceiver,
            string memory tracking,
            string memory transport,
            ShipmentStatus currentStatus,
            uint256 created,
            uint256 updated,
            bool active
        )
    {
        return (
            productAddress,
            sender,
            receiver,
            trackingNumber,
            transportMode,
            status,
            createdAt,
            lastUpdated,
            isActive
        );
    }

    /**
     * @dev Get status description
     */
    function getStatusDescription() external view returns (string memory) {
        return _getShipmentStatusDescription(status);
    }

    /**
     * @dev Internal function to validate status transitions
     */
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

    /**
     * @dev Internal function to get status description
     */
    function _getShipmentStatusDescription(
        ShipmentStatus _status
    ) internal pure returns (string memory) {
        if (_status == ShipmentStatus.NOT_SHIPPED) return "Not yet shipped";
        if (_status == ShipmentStatus.PREPARING) return "Preparing for shipment";
        if (_status == ShipmentStatus.SHIPPED) return "In transit";
        if (_status == ShipmentStatus.DELIVERED) return "Delivered";
        if (_status == ShipmentStatus.CANCELLED) return "Shipment cancelled";
        if (_status == ShipmentStatus.UNABLE_TO_DELIVERED) return "Delivery failed";
        if (_status == ShipmentStatus.VERIFIED) return "Delivery confirmed";
        return "Unknown status";
    }
}