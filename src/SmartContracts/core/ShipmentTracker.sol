// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";
import "./ProductBatch.sol";

contract ShipmentTracker is AccessControl {

    enum ShipmentStatus {
        CREATED,
        PICKED_UP,
        IN_TRANSIT,
        DELIVERED,
        CONFIRMED
    }

    struct Shipment {
        uint256 id;
        uint256 batchId;
        uint256 offerId;           // Related offer
        address sender;
        address receiver;
        address shipper;           // Can be sender if self-delivery
        string trackingId;
        string fromLocation;
        string toLocation;
        ShipmentStatus status;
        string metadataHash;       // IPFS hash for additional data
        uint256 createdAt;
        uint256 pickedUpAt;
        uint256 deliveredAt;
        uint256 confirmedAt;

        // Tracking data
        string[] locationUpdates;
        uint256[] timestamps;
    }

    mapping(uint256 => Shipment) public shipments;
    mapping(uint256 => uint256[]) public batchShipments;  // batchId => shipmentIds[]
    mapping(address => uint256[]) public userShipments;   // user => shipmentIds[]
    mapping(string => uint256) public trackingIdToShipment; // trackingId => shipmentId

    uint256 public nextShipmentId = 1;
    ProductBatch public productBatch;

    // Events
    event ShipmentCreated(uint256 indexed shipmentId, uint256 indexed batchId, address indexed receiver);
    event ShipmentPickedUp(uint256 indexed shipmentId, address indexed shipper);
    event ShipmentInTransit(uint256 indexed shipmentId, string location);
    event ShipmentDelivered(uint256 indexed shipmentId, uint256 deliveredAt);
    event DeliveryConfirmed(uint256 indexed shipmentId, address indexed receiver);
    event LocationUpdated(uint256 indexed shipmentId, string location, uint256 timestamp);

    constructor(address _productBatch) {
        require(_productBatch != address(0), "Invalid ProductBatch address");
        productBatch = ProductBatch(_productBatch);
    }

    /**
     * @dev Create a new shipment after offer acceptance
     */
    function createShipment(
        uint256 batchId,
        uint256 offerId,
        address receiver,
        address shipper,        // Can be address(0) for sender to handle
        string calldata trackingId,
        string calldata fromLocation,
        string calldata toLocation,
        string calldata metadataHash
    ) external onlyActiveStakeholder returns (uint256) {
        require(bytes(trackingId).length > 0, "Tracking ID required");
        require(trackingIdToShipment[trackingId] == 0, "Tracking ID already exists");

        // Verify sender owns the batch
        (address owner,,,,,,,,) = productBatch.getBatchMarketInfo(batchId);
        require(msg.sender == owner, "Only batch owner can create shipment");

        // If no shipper specified, sender handles delivery
        if (shipper == address(0)) {
            shipper = msg.sender;
        }

        uint256 shipmentId = nextShipmentId++;

        shipments[shipmentId] = Shipment({
            id: shipmentId,
            batchId: batchId,
            offerId: offerId,
            sender: msg.sender,
            receiver: receiver,
            shipper: shipper,
            trackingId: trackingId,
            fromLocation: fromLocation,
            toLocation: toLocation,
            status: ShipmentStatus.CREATED,
            metadataHash: metadataHash,
            createdAt: block.timestamp,
            pickedUpAt: 0,
            deliveredAt: 0,
            confirmedAt: 0,
            locationUpdates: new string[](0),
            timestamps: new uint256[](0)
        });

        // Update indexes
        batchShipments[batchId].push(shipmentId);
        userShipments[msg.sender].push(shipmentId);
        userShipments[receiver].push(shipmentId);
        if (shipper != msg.sender) {
            userShipments[shipper].push(shipmentId);
        }
        trackingIdToShipment[trackingId] = shipmentId;

        // Update batch with shipment
        productBatch.addShipmentToBatch(batchId, shipmentId);

        emit ShipmentCreated(shipmentId, batchId, receiver);
        return shipmentId;
    }

    /**
     * @dev Shipper picks up the shipment
     */
    function pickupShipment(uint256 shipmentId) external onlyActiveStakeholder {
        require(_shipmentExists(shipmentId), "Shipment does not exist");
        Shipment storage shipment = shipments[shipmentId];

        require(msg.sender == shipment.shipper, "Only assigned shipper can pickup");
        require(shipment.status == ShipmentStatus.CREATED, "Invalid status for pickup");

        shipment.status = ShipmentStatus.PICKED_UP;
        shipment.pickedUpAt = block.timestamp;

        _addLocationUpdate(shipmentId, shipment.fromLocation);

        emit ShipmentPickedUp(shipmentId, msg.sender);
    }

    /**
     * @dev Update shipment location during transit
     */
    function updateLocation(uint256 shipmentId, string calldata location) external onlyActiveStakeholder {
        require(_shipmentExists(shipmentId), "Shipment does not exist");
        Shipment storage shipment = shipments[shipmentId];

        require(msg.sender == shipment.shipper, "Only shipper can update location");
        require(
            shipment.status == ShipmentStatus.PICKED_UP ||
            shipment.status == ShipmentStatus.IN_TRANSIT,
            "Invalid status for location update"
        );

        if (shipment.status == ShipmentStatus.PICKED_UP) {
            shipment.status = ShipmentStatus.IN_TRANSIT;
            emit ShipmentInTransit(shipmentId, location);
        }

        _addLocationUpdate(shipmentId, location);
        emit LocationUpdated(shipmentId, location, block.timestamp);
    }

    /**
     * @dev Mark shipment as delivered
     */
    function markDelivered(uint256 shipmentId) external onlyActiveStakeholder {
        require(_shipmentExists(shipmentId), "Shipment does not exist");
        Shipment storage shipment = shipments[shipmentId];

        require(msg.sender == shipment.shipper, "Only shipper can mark delivered");
        require(
            shipment.status == ShipmentStatus.PICKED_UP ||
            shipment.status == ShipmentStatus.IN_TRANSIT,
            "Invalid status for delivery"
        );

        shipment.status = ShipmentStatus.DELIVERED;
        shipment.deliveredAt = block.timestamp;

        _addLocationUpdate(shipmentId, shipment.toLocation);

        emit ShipmentDelivered(shipmentId, block.timestamp);
    }

    /**
     * @dev Receiver confirms delivery
     */
    function confirmDelivery(uint256 shipmentId) external onlyActiveStakeholder {
        require(_shipmentExists(shipmentId), "Shipment does not exist");
        Shipment storage shipment = shipments[shipmentId];

        require(msg.sender == shipment.receiver, "Only receiver can confirm");
        require(shipment.status == ShipmentStatus.DELIVERED, "Not delivered yet");

        shipment.status = ShipmentStatus.CONFIRMED;
        shipment.confirmedAt = block.timestamp;

        // Transfer batch ownership
        //productBatch.transferOwnership(shipment.batchId, msg.sender);

        emit DeliveryConfirmed(shipmentId, msg.sender);
    }

    /**
     * @dev Get shipment info by tracking ID (public function for transparency)
     */
    function getShipmentByTrackingId(string calldata trackingId) external view returns (
        uint256 shipmentId,
        uint256 batchId,
        address sender,
        address receiver,
        ShipmentStatus status,
        string memory fromLocation,
        string memory toLocation,
        uint256 createdAt,
        uint256 deliveredAt
    ) {
        shipmentId = trackingIdToShipment[trackingId];
        require(shipmentId != 0, "Tracking ID not found");

        Shipment storage shipment = shipments[shipmentId];
        return (
            shipmentId,
            shipment.batchId,
            shipment.sender,
            shipment.receiver,
            shipment.status,
            shipment.fromLocation,
            shipment.toLocation,
            shipment.createdAt,
            shipment.deliveredAt
        );
    }

    /**
     * @dev Get shipment tracking history
     */
    function getTrackingHistory(uint256 shipmentId) external view returns (
        string[] memory locations,
        uint256[] memory timestamps
    ) {
        require(_shipmentExists(shipmentId), "Shipment does not exist");
        Shipment storage shipment = shipments[shipmentId];

        return (shipment.locationUpdates, shipment.timestamps);
    }

    /**
     * @dev Get user shipments by status
     */
    function getUserShipmentsByStatus(address user, ShipmentStatus status) external view returns (uint256[] memory) {
        uint256[] memory userShipmentList = userShipments[user];
        uint256 count = 0;

        // Count matching shipments
        for (uint256 i = 0; i < userShipmentList.length; i++) {
            if (shipments[userShipmentList[i]].status == status) {
                count++;
            }
        }

        // Fill result array
        uint256[] memory matchingShipments = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < userShipmentList.length; i++) {
            if (shipments[userShipmentList[i]].status == status) {
                matchingShipments[index] = userShipmentList[i];
                index++;
            }
        }

        return matchingShipments;
    }

    // Internal functions
    function _addLocationUpdate(uint256 shipmentId, string memory location) internal {
        Shipment storage shipment = shipments[shipmentId];
        shipment.locationUpdates.push(location);
        shipment.timestamps.push(block.timestamp);
    }

    function _shipmentExists(uint256 shipmentId) internal view returns (bool) {
        return shipmentId > 0 && shipmentId < nextShipmentId;
    }
}