// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ContractRegistry.sol";
import "./ProductFactory.sol";
import "./ShipmentFactory.sol";

/**
 * @title FactoryRegistry
 * @dev Helper contract to register factories with the main ContractRegistry
 * Provides a unified way to register and discover factories
 */
contract FactoryRegistry {
    ContractRegistry public immutable contractRegistry;

    struct FactoryInfo {
        address factoryAddress;
        string factoryType;
        uint256 registeredAt;
        bool isActive;
    }

    mapping(string => address) public factories;
    mapping(address => FactoryInfo) public factoryInfo;

    event FactoryRegistered(
        string indexed factoryType,
        address indexed factoryAddress,
        uint256 timestamp
    );

    modifier onlyAuthorized() {
        require(
            contractRegistry.authorizedDeployers(msg.sender) || 
            msg.sender == contractRegistry.registryOwner(),
            "Not authorized deployer"
        );
        _;
    }

    constructor(address _contractRegistry) {
        require(_contractRegistry != address(0), "Invalid registry address");
        contractRegistry = ContractRegistry(_contractRegistry);
    }

    /**
     * @dev Register a factory with both registries
     */
    function registerFactory(
        address _factoryAddress,
        string memory _factoryType,
        string memory _description
    ) public onlyAuthorized {
        require(_factoryAddress != address(0), "Invalid factory address");
        require(bytes(_factoryType).length > 0, "Factory type required");

        // Register with main ContractRegistry
        contractRegistry.registerContract(
            _factoryAddress,
            _factoryType,
            _description
        );

        // Register locally for easy discovery
        factories[_factoryType] = _factoryAddress;
        factoryInfo[_factoryAddress] = FactoryInfo({
            factoryAddress: _factoryAddress,
            factoryType: _factoryType,
            registeredAt: block.timestamp,
            isActive: true
        });

        emit FactoryRegistered(_factoryType, _factoryAddress, block.timestamp);
    }

    /**
     * @dev Get factory address by type
     */
    function getFactory(
        string memory _factoryType
    ) external view returns (address) {
        return factories[_factoryType];
    }

    /**
     * @dev Get factory info
     */
    function getFactoryInfo(
        address _factoryAddress
    ) external view returns (FactoryInfo memory) {
        return factoryInfo[_factoryAddress];
    }

    /**
     * @dev Batch register common factories
     */
    function registerCommonFactories(
        address _productFactory,
        address _shipmentFactory
    ) external onlyAuthorized {
        if (_productFactory != address(0)) {
            registerFactory(
                _productFactory,
                "ProductFactory",
                "Product creation and templates"
            );
        }

        if (_shipmentFactory != address(0)) {
            registerFactory(
                _shipmentFactory,
                "ShipmentFactory",
                "Shipment creation and logistics"
            );
        }
    }
}
