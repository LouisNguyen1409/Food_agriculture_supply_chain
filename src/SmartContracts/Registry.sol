// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderManager.sol";

contract Registry {

    StakeholderManager public stakeholderManager;
    
    address[] public products;
    address[] public shipments;
    mapping(address => bool) public isRegistered;

    // Events
    event ShipmentRegistered(
        address indexed _shipment,
        string indexed trackingNumber,
        address indexed productAddress,
        address sender,
        address receiver
    );
    
    event ProductRegistered(address indexed _product);

    constructor(address _stakeholderManager) {
        stakeholderManager = StakeholderManager(_stakeholderManager);
    }

    function registerShipment(
        address _shipment,
        string memory _trackingNumber,
        address _productAddress,
        address _sender,
        address _receiver
    ) public {
        require(!isRegistered[_shipment], "Shipment already registered");
        require(_productAddress != address(0), "Invalid product address");
        require(_sender != address(0), "Invalid sender address");
        require(_receiver != address(0), "Invalid receiver address");
        
        // Verify sender and receiver are registered stakeholders
        require(stakeholderManager.isRegistered(_sender), "Sender not registered");
        require(stakeholderManager.isRegistered(_receiver), "Receiver not registered");
        
        isRegistered[_shipment] = true;
        shipments.push(_shipment);
        
        emit ShipmentRegistered(
            _shipment,
            _trackingNumber,
            _productAddress,
            _sender,
            _receiver
        );
    }

    function registerProduct(address _product) public {
        require(!isRegistered[_product], "Product already registered");
        require(_product != address(0), "Invalid product address");
        
        isRegistered[_product] = true;
        products.push(_product);
        
        emit ProductRegistered(_product);
    }

    function getAllProducts() external view returns (address[] memory) {
        return products;
    }

    function getAllShipments() external view returns (address[] memory) {
        return shipments;
    }

    function getTotalProducts() external view returns (uint256) {
        return products.length;
    }

    function getTotalShipments() external view returns (uint256) {
        return shipments.length;
    }

    function isEntityRegistered(address _entity) external view returns (bool) {
        return isRegistered[_entity];
    }

    /**
     * @notice Get stakeholder information through StakeholderManager
     */
    function getStakeholderInfo(address _stakeholderAddress) 
        external 
        view 
        returns (StakeholderManager.StakeholderInfo memory) 
    {
        return stakeholderManager.getStakeholderInfo(_stakeholderAddress);
    }

    /**
     * @notice Check if address has specific role
     */
    function hasStakeholderRole(address _stakeholderAddress, StakeholderManager.StakeholderRole _role)
        external
        view
        returns (bool)
    {
        return stakeholderManager.hasRole(_stakeholderAddress, _role);
    }

    /**
     * @notice Check if stakeholder is registered
     */
    function isStakeholderRegistered(address _stakeholderAddress) external view returns (bool) {
        return stakeholderManager.isRegistered(_stakeholderAddress);
    }

    /**
     * @notice Get stakeholders by role
     */
    function getStakeholdersByRole(StakeholderManager.StakeholderRole _role)
        external
        view
        returns (address[] memory)
    {
        return stakeholderManager.getStakeholdersByRole(_role);
    }
}
