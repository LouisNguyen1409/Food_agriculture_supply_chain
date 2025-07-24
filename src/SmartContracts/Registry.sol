// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Stakeholder.sol";

contract Registry {

    address[] public products;
    address[] public shipments;
    address[] public stakeholders;
    mapping(address => bool) public isRegistered;

    // Stakeholder-specific mappings for efficient lookups
    mapping(string => address) public licenseToStakeholder;
    mapping(address => address) public walletToStakeholderContract;
    mapping(Stakeholder.StakeholderRole => address[]) public stakeholdersByRole;

    event ShipmentRegistered(
        address indexed _shipment,
        string indexed trackingNumber,
        address indexed productAddress,
        address sender,
        address receiver
    );
    event ProductRegistered(address indexed _product);
    event StakeholderRegistered(
        address indexed _stakeholderContract,
        string indexed businessLicense,
        address indexed stakeholderAddress,
        Stakeholder.StakeholderRole role
    );

    function registerShipment(
        address _shipment,
        string memory _trackingNumber,
        address _productAddress,
        address _sender,
        address _receiver
    ) public {
        require(!isRegistered[_shipment], "Shipment already registered");
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
        isRegistered[_product] = true;
        products.push(_product);
        emit ProductRegistered(_product);
    }

    function registerStakeholder(
        address _stakeholderContract,
        string memory _businessLicense,
        address _stakeholderAddress,
        Stakeholder.StakeholderRole _role
    ) public {
        require(
            !isRegistered[_stakeholderContract],
            "Stakeholder already registered"
        );
        require(
            licenseToStakeholder[_businessLicense] == address(0),
            "Business license already registered"
        );
        require(
            walletToStakeholderContract[_stakeholderAddress] == address(0),
            "Stakeholder address already has a contract"
        );

        isRegistered[_stakeholderContract] = true;
        stakeholders.push(_stakeholderContract);
        licenseToStakeholder[_businessLicense] = _stakeholderContract;
        walletToStakeholderContract[_stakeholderAddress] = _stakeholderContract;
        stakeholdersByRole[_role].push(_stakeholderContract);

        emit StakeholderRegistered(
            _stakeholderContract,
            _businessLicense,
            _stakeholderAddress,
            _role
        );
    }

    function getAllProducts() external view returns (address[] memory) {
        return products;
    }

    function getAllShipments() external view returns (address[] memory) {
        return shipments;
    }

    function getAllStakeholders() external view returns (address[] memory) {
        return stakeholders;
    }

    function getStakeholdersByRole(
        Stakeholder.StakeholderRole _role
    ) external view returns (address[] memory) {
        return stakeholdersByRole[_role];
    }

    function getStakeholderByLicense(
        string memory _businessLicense
    ) external view returns (address) {
        return licenseToStakeholder[_businessLicense];
    }

    function getStakeholderByWallet(
        address _stakeholderAddress
    ) external view returns (address) {
        return walletToStakeholderContract[_stakeholderAddress];
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
}
