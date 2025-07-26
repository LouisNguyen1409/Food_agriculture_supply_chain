// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Registry.sol";
import "./Shipment.sol";
import "./StakeholderRegistry.sol";
import "./StakeholderManager.sol";

contract ShipmentFactory {
    Registry public registry;
    StakeholderRegistry public stakeholderRegistry;
    

    event ShipmentCreated(
        address indexed shipmentAddress,
        address indexed distributor,
        address indexed productAddress,
        address receiver,
        string trackingNumber,
        string transportMode
    );

    modifier onlyDistributor() {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                StakeholderManager.StakeholderRole.DISTRIBUTOR
            ),
            "Not registered as distributor"
        );
        _;
    }

    constructor(
        address _registry,
        address _stakeholderRegistry
    ) {
        registry = Registry(_registry);
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistry);
    }

    function createShipment(
        address productAddress,
        address receiver,
        string memory trackingNumber,
        string memory transportMode
    ) public onlyDistributor returns (address shipmentAddress) {
        
        // Create new Shipment contract
        shipmentAddress = address(new Shipment(
            productAddress,
            msg.sender,     // sender (distributor)
            receiver,
            trackingNumber,
            transportMode,
            address(stakeholderRegistry)
        ));
        
        // Register the shipment in the main registry only
        registry.registerShipment(
            shipmentAddress,
            trackingNumber,
            productAddress,
            msg.sender,
            receiver
        );
        
        emit ShipmentCreated(
            shipmentAddress,
            msg.sender,
            productAddress,
            receiver,
            trackingNumber,
            transportMode
        );
        
        return shipmentAddress;
    }
}