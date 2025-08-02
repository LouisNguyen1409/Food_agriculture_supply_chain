// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IShipmentTracker {
    enum ShipmentStatus {
        INITIATED,
        IN_TRANSIT,
        DELIVERED,
        CONFIRMED
    }

    enum ShipmentType {
        FARMER_TO_PROCESSOR,
        PROCESSOR_TO_DISTRIBUTOR,
        DISTRIBUTOR_TO_RETAILER
    }

    struct ShipmentInfo {
        uint256 id;
        uint256 batchId;
        address sender;
        address receiver;
        address shipper;
        string trackingId;
        string fromLocation;
        string toLocation;
        ShipmentStatus status;
        ShipmentType shipmentType;
        uint256 initiatedAt;
        uint256 deliveredAt;
        uint256 confirmedAt;
    }

    function initiateShipment(
        uint256 batchId,
        address receiver,
        address shipper,
        string calldata trackingId,
        string calldata fromLocation,
        string calldata toLocation,
        string calldata metadataHash,
        ShipmentType shipmentType
    ) external returns (uint256);

    function confirmDelivery(uint256 shipmentId) external;
    function getShipmentInfo(uint256 shipmentId) external view returns (ShipmentInfo memory);
}