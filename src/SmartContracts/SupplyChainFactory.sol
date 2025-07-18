// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";
import "./ProductRegistry.sol";
import "./ShipmentRegistry.sol";
import "./SupplyChainManager.sol";
import "./PublicVerification.sol";
import "./ContractRegistry.sol";

contract SupplyChainFactory {
    struct SupplyChainSystem {
        uint256 systemId;
        address stakeholderRegistry;
        address productRegistry;
        address shipmentRegistry;
        address supplyChainManager;
        address publicVerification;
        address owner;
        string systemName;
        uint256 createdAt;
        bool isActive;
    }

    struct SystemStats {
        uint256 totalProducts;
        uint256 totalShipments;
        uint256 totalStakeholders;
        uint256 lastUpdated;
    }

    // Storage
    mapping(uint256 => SupplyChainSystem) public supplychainSystems;
    mapping(address => uint256[]) public ownerSystems;
    mapping(string => uint256) public systemNameToId;
    mapping(uint256 => SystemStats) public systemStats;

    uint256 public nextSystemId = 1;
    uint256 public totalSystemsCreated;
    address public factoryOwner;

    // Contract Registry integration
    ContractRegistry public contractRegistry;

    // Registry templates (for cloning)
    address public stakeholderRegistryTemplate;
    address public productRegistryTemplate;
    address public shipmentRegistryTemplate;

    // Oracle Feed addresses
    address public temperatureFeed;
    address public humidityFeed;
    address public rainfallFeed;
    address public windSpeedFeed;
    address public priceFeed;

    // Events
    event SystemCreated(
        uint256 indexed systemId,
        address indexed owner,
        string systemName,
        address stakeholderRegistry,
        address productRegistry,
        address shipmentRegistry,
        address supplyChainManager,
        address publicVerification,
        uint256 timestamp
    );

    event SystemUpgraded(
        uint256 indexed systemId,
        string contractType,
        address oldAddress,
        address newAddress,
        uint256 timestamp
    );

    event SystemDeactivated(
        uint256 indexed systemId,
        address indexed owner,
        uint256 timestamp
    );

    event TemplateUpdated(
        string contractType,
        address oldTemplate,
        address newTemplate,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyFactoryOwner() {
        require(
            msg.sender == factoryOwner,
            "Only factory owner can perform this action"
        );
        _;
    }

    modifier onlySystemOwner(uint256 _systemId) {
        require(
            supplychainSystems[_systemId].owner == msg.sender,
            "Only system owner can perform this action"
        );
        _;
    }

    modifier systemExists(uint256 _systemId) {
        require(
            supplychainSystems[_systemId].isActive,
            "System does not exist or is inactive"
        );
        _;
    }

    constructor(
        address _contractRegistry,
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) {
        factoryOwner = msg.sender;
        if (_contractRegistry != address(0)) {
            contractRegistry = ContractRegistry(_contractRegistry);
        }
        
        // Set oracle feeds
        temperatureFeed = _temperatureFeed;
        humidityFeed = _humidityFeed;
        rainfallFeed = _rainfallFeed;
        windSpeedFeed = _windSpeedFeed;
        priceFeed = _priceFeed;
        
        // Allow deployment without registry initially for setup
    }

    /**
     * @dev Set the contract registry after deployment
     * Useful for initial setup where registry isn't deployed yet
     */
    function setContractRegistry(
        address _contractRegistry
    ) external onlyFactoryOwner {
        require(
            _contractRegistry != address(0),
            "Invalid contract registry address"
        );
        contractRegistry = ContractRegistry(_contractRegistry);
    }

    /**
     * @dev Update oracle feed addresses
     */
    function updateOracleFeeds(
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) external onlyFactoryOwner {
        temperatureFeed = _temperatureFeed;
        humidityFeed = _humidityFeed;
        rainfallFeed = _rainfallFeed;
        windSpeedFeed = _windSpeedFeed;
        priceFeed = _priceFeed;
    }

    // Set template contracts for cloning (optional - for gas optimization)
    function setTemplates(
        address _stakeholderRegistryTemplate,
        address _productRegistryTemplate,
        address _shipmentRegistryTemplate
    ) external onlyFactoryOwner {
        stakeholderRegistryTemplate = _stakeholderRegistryTemplate;
        productRegistryTemplate = _productRegistryTemplate;
        shipmentRegistryTemplate = _shipmentRegistryTemplate;

        emit TemplateUpdated(
            "StakeholderRegistry",
            stakeholderRegistryTemplate,
            _stakeholderRegistryTemplate,
            block.timestamp
        );
        emit TemplateUpdated(
            "ProductRegistry",
            productRegistryTemplate,
            _productRegistryTemplate,
            block.timestamp
        );
        emit TemplateUpdated(
            "ShipmentRegistry",
            shipmentRegistryTemplate,
            _shipmentRegistryTemplate,
            block.timestamp
        );
    }

    // Main factory function - creates complete supply chain system
    function createSupplyChainSystem(
        string memory _systemName
    ) external returns (uint256 systemId) {
        require(bytes(_systemName).length > 0, "System name cannot be empty");
        require(systemNameToId[_systemName] == 0, "System name already exists");

        systemId = nextSystemId++;

        // Deploy registry contracts
        StakeholderRegistry stakeholderRegistry = new StakeholderRegistry();
        ProductRegistry productRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            temperatureFeed,
            humidityFeed,
            rainfallFeed,
            windSpeedFeed,
            priceFeed
        );
        ShipmentRegistry shipmentRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );

        // Deploy manager contract
        SupplyChainManager supplyChainManager = new SupplyChainManager(
            address(stakeholderRegistry),
            address(productRegistry),
            address(shipmentRegistry)
        );

        // Deploy public verification contract
        PublicVerification publicVerification = new PublicVerification(
            address(productRegistry),
            address(stakeholderRegistry),
            address(shipmentRegistry)
        );

        // Store system information
        supplychainSystems[systemId] = SupplyChainSystem({
            systemId: systemId,
            stakeholderRegistry: address(stakeholderRegistry),
            productRegistry: address(productRegistry),
            shipmentRegistry: address(shipmentRegistry),
            supplyChainManager: address(supplyChainManager),
            publicVerification: address(publicVerification),
            owner: msg.sender,
            systemName: _systemName,
            createdAt: block.timestamp,
            isActive: true
        });

        // Initialize stats
        systemStats[systemId] = SystemStats({
            totalProducts: 0,
            totalShipments: 0,
            totalStakeholders: 0,
            lastUpdated: block.timestamp
        });

        // Register system in the ContractRegistry (if registry is set)
        if (address(contractRegistry) != address(0)) {
            contractRegistry.registerSystem(
                systemId,
                address(stakeholderRegistry),
                address(productRegistry),
                address(shipmentRegistry),
                address(supplyChainManager),
                address(publicVerification)
            );

            // Also register individual contract types for discovery
            contractRegistry.registerContract(
                address(stakeholderRegistry),
                "StakeholderRegistry",
                "Stakeholder management for supply chain"
            );
            contractRegistry.registerContract(
                address(productRegistry),
                "ProductRegistry",
                "Product tracking and registration"
            );
            contractRegistry.registerContract(
                address(shipmentRegistry),
                "ShipmentRegistry",
                "Shipment tracking and logistics"
            );
            contractRegistry.registerContract(
                address(supplyChainManager),
                "SupplyChainManager",
                "Supply chain operations management"
            );
            contractRegistry.registerContract(
                address(publicVerification),
                "PublicVerification",
                "Public verification interface"
            );
        }

        ownerSystems[msg.sender].push(systemId);
        systemNameToId[_systemName] = systemId;
        totalSystemsCreated++;

        emit SystemCreated(
            systemId,
            msg.sender,
            _systemName,
            address(stakeholderRegistry),
            address(productRegistry),
            address(shipmentRegistry),
            address(supplyChainManager),
            address(publicVerification),
            block.timestamp
        );

        return systemId;
    }

    // Create lightweight system (only essential contracts)
    function createLightweightSystem(
        string memory _systemName
    ) external returns (uint256 systemId) {
        require(bytes(_systemName).length > 0, "System name cannot be empty");
        require(systemNameToId[_systemName] == 0, "System name already exists");

        systemId = nextSystemId++;

        // Deploy only core contracts
        StakeholderRegistry stakeholderRegistry = new StakeholderRegistry();
        ProductRegistry productRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            temperatureFeed,
            humidityFeed,
            rainfallFeed,
            windSpeedFeed,
            priceFeed
        );

        // Store system information (without shipment and manager contracts)
        supplychainSystems[systemId] = SupplyChainSystem({
            systemId: systemId,
            stakeholderRegistry: address(stakeholderRegistry),
            productRegistry: address(productRegistry),
            shipmentRegistry: address(0), // Not deployed
            supplyChainManager: address(0), // Not deployed
            publicVerification: address(0), // Not deployed
            owner: msg.sender,
            systemName: _systemName,
            createdAt: block.timestamp,
            isActive: true
        });

        systemStats[systemId] = SystemStats({
            totalProducts: 0,
            totalShipments: 0,
            totalStakeholders: 0,
            lastUpdated: block.timestamp
        });

        ownerSystems[msg.sender].push(systemId);
        systemNameToId[_systemName] = systemId;
        totalSystemsCreated++;

        emit SystemCreated(
            systemId,
            msg.sender,
            _systemName,
            address(stakeholderRegistry),
            address(productRegistry),
            address(0),
            address(0),
            address(0),
            block.timestamp
        );

        return systemId;
    }

    // Upgrade individual contract in a system
    function upgradeSystemContract(
        uint256 _systemId,
        string memory _contractType,
        address _newContractAddress
    ) external onlySystemOwner(_systemId) systemExists(_systemId) {
        require(_newContractAddress != address(0), "Invalid contract address");

        SupplyChainSystem storage system = supplychainSystems[_systemId];
        address oldAddress;

        if (
            keccak256(abi.encodePacked(_contractType)) ==
            keccak256(abi.encodePacked("StakeholderRegistry"))
        ) {
            oldAddress = system.stakeholderRegistry;
            system.stakeholderRegistry = _newContractAddress;
        } else if (
            keccak256(abi.encodePacked(_contractType)) ==
            keccak256(abi.encodePacked("ProductRegistry"))
        ) {
            oldAddress = system.productRegistry;
            system.productRegistry = _newContractAddress;
        } else if (
            keccak256(abi.encodePacked(_contractType)) ==
            keccak256(abi.encodePacked("ShipmentRegistry"))
        ) {
            oldAddress = system.shipmentRegistry;
            system.shipmentRegistry = _newContractAddress;
        } else if (
            keccak256(abi.encodePacked(_contractType)) ==
            keccak256(abi.encodePacked("SupplyChainManager"))
        ) {
            oldAddress = system.supplyChainManager;
            system.supplyChainManager = _newContractAddress;
        } else if (
            keccak256(abi.encodePacked(_contractType)) ==
            keccak256(abi.encodePacked("PublicVerification"))
        ) {
            oldAddress = system.publicVerification;
            system.publicVerification = _newContractAddress;
        } else {
            revert("Invalid contract type");
        }

        emit SystemUpgraded(
            _systemId,
            _contractType,
            oldAddress,
            _newContractAddress,
            block.timestamp
        );
    }

    // Add missing contracts to lightweight system
    function expandLightweightSystem(
        uint256 _systemId
    ) external onlySystemOwner(_systemId) systemExists(_systemId) {
        SupplyChainSystem storage system = supplychainSystems[_systemId];

        // Deploy missing contracts
        if (system.shipmentRegistry == address(0)) {
            ShipmentRegistry shipmentRegistry = new ShipmentRegistry(
                system.stakeholderRegistry,
                system.productRegistry
            );
            system.shipmentRegistry = address(shipmentRegistry);
        }

        if (system.supplyChainManager == address(0)) {
            SupplyChainManager supplyChainManager = new SupplyChainManager(
                system.stakeholderRegistry,
                system.productRegistry,
                system.shipmentRegistry
            );
            system.supplyChainManager = address(supplyChainManager);
        }

        if (system.publicVerification == address(0)) {
            PublicVerification publicVerification = new PublicVerification(
                system.productRegistry,
                system.stakeholderRegistry,
                system.shipmentRegistry
            );
            system.publicVerification = address(publicVerification);
        }
    }

    // Update system statistics
    function updateSystemStats(
        uint256 _systemId
    ) external systemExists(_systemId) {
        SupplyChainSystem memory system = supplychainSystems[_systemId];

        uint256 totalProducts = 0;
        uint256 totalShipments = 0;
        uint256 totalStakeholders = 0;

        // Get stats from contracts
        if (system.productRegistry != address(0)) {
            ProductRegistry productRegistry = ProductRegistry(
                system.productRegistry
            );
            totalProducts = productRegistry.getTotalProducts();
        }

        if (system.shipmentRegistry != address(0)) {
            ShipmentRegistry shipmentRegistry = ShipmentRegistry(
                system.shipmentRegistry
            );
            totalShipments = shipmentRegistry.getTotalShipments();
        }

        if (system.stakeholderRegistry != address(0)) {
            StakeholderRegistry stakeholderRegistry = StakeholderRegistry(
                system.stakeholderRegistry
            );
            totalStakeholders = stakeholderRegistry.totalStakeholders();
        }

        systemStats[_systemId] = SystemStats({
            totalProducts: totalProducts,
            totalShipments: totalShipments,
            totalStakeholders: totalStakeholders,
            lastUpdated: block.timestamp
        });
    }

    // Deactivate system
    function deactivateSystem(
        uint256 _systemId
    ) external onlySystemOwner(_systemId) systemExists(_systemId) {
        supplychainSystems[_systemId].isActive = false;
        emit SystemDeactivated(_systemId, msg.sender, block.timestamp);
    }

    // Query functions
    function getSystemInfo(
        uint256 _systemId
    ) external view systemExists(_systemId) returns (SupplyChainSystem memory) {
        return supplychainSystems[_systemId];
    }

    function getSystemByName(
        string memory _systemName
    ) external view returns (SupplyChainSystem memory) {
        uint256 systemId = systemNameToId[_systemName];
        require(systemId != 0, "System not found");
        return supplychainSystems[systemId];
    }

    function getOwnerSystems(
        address _owner
    ) external view returns (uint256[] memory) {
        return ownerSystems[_owner];
    }

    function getSystemStats(
        uint256 _systemId
    ) external view systemExists(_systemId) returns (SystemStats memory) {
        return systemStats[_systemId];
    }

    function getAllActiveSystems()
        external
        view
        returns (uint256[] memory activeSystems)
    {
        uint256[] memory tempArray = new uint256[](totalSystemsCreated);
        uint256 count = 0;

        for (uint256 i = 1; i < nextSystemId; i++) {
            if (supplychainSystems[i].isActive) {
                tempArray[count] = i;
                count++;
            }
        }

        activeSystems = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            activeSystems[j] = tempArray[j];
        }

        return activeSystems;
    }

    function getFactoryStats()
        external
        view
        returns (uint256 totalCreated, uint256 totalActive, uint256 totalOwners)
    {
        totalCreated = totalSystemsCreated;

        uint256 activeCount = 0;
        for (uint256 i = 1; i < nextSystemId; i++) {
            if (supplychainSystems[i].isActive) {
                activeCount++;
            }
        }
        totalActive = activeCount;

        // Note: totalOwners would require additional tracking
        totalOwners = 0; // Placeholder

        return (totalCreated, totalActive, totalOwners);
    }

    // Emergency functions
    function transferSystemOwnership(
        uint256 _systemId,
        address _newOwner
    ) external onlySystemOwner(_systemId) systemExists(_systemId) {
        require(_newOwner != address(0), "Invalid new owner address");

        address oldOwner = supplychainSystems[_systemId].owner;
        supplychainSystems[_systemId].owner = _newOwner;

        // Update owner systems mapping
        ownerSystems[_newOwner].push(_systemId);

        // Remove from old owner (simplified - doesn't remove from array)
        // In production, you'd want to properly remove from the array
    }

    function transferFactoryOwnership(
        address _newOwner
    ) external onlyFactoryOwner {
        require(_newOwner != address(0), "Invalid new owner address");
        factoryOwner = _newOwner;
    }

    function transferStakeholderRegistryAdmin(
        uint256 _systemId,
        address _newAdmin
    ) external {
        require(_systemId < nextSystemId, "System does not exist");
        require(
            msg.sender == supplychainSystems[_systemId].owner,
            "Only system owner can transfer admin"
        );
        require(_newAdmin != address(0), "Invalid new admin address");

        StakeholderRegistry stakeholderRegistry = StakeholderRegistry(
            supplychainSystems[_systemId].stakeholderRegistry
        );
        stakeholderRegistry.transferAdmin(_newAdmin);
    }
}
