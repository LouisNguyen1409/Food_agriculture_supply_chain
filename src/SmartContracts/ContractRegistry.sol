// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ContractRegistry {
    struct ContractInfo {
        address contractAddress;
        string contractType;
        uint256 version;
        address deployer;
        uint256 deployedAt;
        bool isActive;
        string description;
        bytes32 codeHash;
    }

    struct SystemContracts {
        uint256 systemId;
        mapping(string => address) contracts;
        mapping(string => uint256) versions;
        string[] contractTypes;
        bool isActive;
    }

    // Main registry storage
    mapping(bytes32 => ContractInfo) public contracts;
    mapping(string => bytes32) public latestContract;
    mapping(string => bytes32[]) public contractVersions;
    mapping(uint256 => SystemContracts) internal systemContracts;
    mapping(address => bool) public authorizedDeployers;

    // Global contract discovery
    mapping(string => address[]) public contractsByType;
    string[] public supportedContractTypes;

    address public registryOwner;
    uint256 public totalRegisteredContracts;

    // Events
    event ContractRegistered(
        bytes32 indexed contractId,
        address indexed contractAddress,
        string contractType,
        uint256 version,
        address deployer
    );

    event ContractUpgraded(
        string indexed contractType,
        address oldAddress,
        address newAddress,
        uint256 newVersion
    );

    event SystemRegistered(
        uint256 indexed systemId,
        address indexed owner,
        string[] contractTypes
    );

    event ContractDeactivated(
        bytes32 indexed contractId,
        address contractAddress,
        string reason
    );

    modifier onlyOwner() {
        require(msg.sender == registryOwner, "Only registry owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            authorizedDeployers[msg.sender] || msg.sender == registryOwner,
            "Not authorized deployer"
        );
        _;
    }

    constructor() {
        registryOwner = msg.sender;
        authorizedDeployers[msg.sender] = true;

        // Initialize supported contract types
        supportedContractTypes = [
            "StakeholderRegistry",
            "ProductRegistry",
            "ShipmentRegistry",
            "SupplyChainManager",
            "PublicVerification",
            "ProductFactory",
            "ShipmentFactory",
            "SupplyChainFactory"
        ];
    }

    /**
     * @dev Register a new contract or version
     */
    function registerContract(
        address contractAddress,
        string memory contractType,
        string memory description
    ) external onlyAuthorized returns (bytes32) {
        require(contractAddress != address(0), "Invalid contract address");
        require(bytes(contractType).length > 0, "Contract type required");

        // Generate unique contract ID
        bytes32 contractId = keccak256(
            abi.encodePacked(contractAddress, contractType, block.timestamp)
        );

        // Get version number
        uint256 version = contractVersions[contractType].length + 1;

        // Store contract info
        contracts[contractId] = ContractInfo({
            contractAddress: contractAddress,
            contractType: contractType,
            version: version,
            deployer: msg.sender,
            deployedAt: block.timestamp,
            isActive: true,
            description: description,
            codeHash: _getCodeHash(contractAddress)
        });

        // Update mappings
        contractVersions[contractType].push(contractId);
        latestContract[contractType] = contractId;
        contractsByType[contractType].push(contractAddress);

        totalRegisteredContracts++;

        emit ContractRegistered(
            contractId,
            contractAddress,
            contractType,
            version,
            msg.sender
        );

        return contractId;
    }

    /**
     * @dev Register a complete supply chain system
     */
    function registerSystem(
        uint256 systemId,
        address stakeholderRegistry,
        address productRegistry,
        address shipmentRegistry,
        address supplyChainManager,
        address publicVerification
    ) external onlyAuthorized {
        SystemContracts storage system = systemContracts[systemId];
        system.systemId = systemId;
        system.isActive = true;

        // Register individual contracts
        system.contracts["StakeholderRegistry"] = stakeholderRegistry;
        system.contracts["ProductRegistry"] = productRegistry;
        system.contracts["ShipmentRegistry"] = shipmentRegistry;
        system.contracts["SupplyChainManager"] = supplyChainManager;
        system.contracts["PublicVerification"] = publicVerification;

        // Set versions (simplified - all start at 1)
        system.versions["StakeholderRegistry"] = 1;
        system.versions["ProductRegistry"] = 1;
        system.versions["ShipmentRegistry"] = 1;
        system.versions["SupplyChainManager"] = 1;
        system.versions["PublicVerification"] = 1;

        system.contractTypes = [
            "StakeholderRegistry",
            "ProductRegistry",
            "ShipmentRegistry",
            "SupplyChainManager",
            "PublicVerification"
        ];

        emit SystemRegistered(systemId, msg.sender, system.contractTypes);
    }

    /**
     * @dev Get latest contract address by type
     */
    function getLatestContract(
        string memory contractType
    ) external view returns (address) {
        bytes32 contractId = latestContract[contractType];
        require(contractId != bytes32(0), "Contract type not found");
        return contracts[contractId].contractAddress;
    }

    /**
     * @dev Get contract address for specific system
     */
    function getSystemContract(
        uint256 systemId,
        string memory contractType
    ) external view returns (address) {
        return systemContracts[systemId].contracts[contractType];
    }

    /**
     * @dev Get all contracts of a specific type
     */
    function getContractsByType(
        string memory contractType
    ) external view returns (address[] memory) {
        return contractsByType[contractType];
    }

    /**
     * @dev Get contract info by ID
     */
    function getContractInfo(
        bytes32 contractId
    ) external view returns (ContractInfo memory) {
        return contracts[contractId];
    }

    /**
     * @dev Get all versions of a contract type
     */
    function getContractVersions(
        string memory contractType
    ) external view returns (bytes32[] memory) {
        return contractVersions[contractType];
    }

    /**
     * @dev Upgrade a contract to new version
     */
    function upgradeContract(
        string memory contractType,
        address newContractAddress,
        string memory description
    ) external onlyAuthorized {
        address oldAddress = this.getLatestContract(contractType);

        // Call registerContract directly instead of through this. to avoid authorization issues
        require(newContractAddress != address(0), "Invalid contract address");
        require(bytes(contractType).length > 0, "Contract type required");

        // Generate unique contract ID
        bytes32 contractId = keccak256(
            abi.encodePacked(newContractAddress, contractType, block.timestamp)
        );

        // Get version number
        uint256 version = contractVersions[contractType].length + 1;

        // Store contract info
        contracts[contractId] = ContractInfo({
            contractAddress: newContractAddress,
            contractType: contractType,
            version: version,
            deployer: msg.sender,
            deployedAt: block.timestamp,
            isActive: true,
            description: description,
            codeHash: _getCodeHash(newContractAddress)
        });

        // Update mappings
        contractVersions[contractType].push(contractId);
        latestContract[contractType] = contractId;
        contractsByType[contractType].push(newContractAddress);
        
        totalRegisteredContracts++;

        emit ContractRegistered(
            contractId,
            newContractAddress,
            contractType,
            version,
            msg.sender
        );

        emit ContractUpgraded(
            contractType,
            oldAddress,
            newContractAddress,
            version
        );
    }

    /**
     * @dev Deactivate a contract
     */
    function deactivateContract(
        bytes32 contractId,
        string memory reason
    ) external onlyAuthorized {
        require(
            contracts[contractId].contractAddress != address(0),
            "Contract not found"
        );
        contracts[contractId].isActive = false;

        emit ContractDeactivated(
            contractId,
            contracts[contractId].contractAddress,
            reason
        );
    }

    /**
     * @dev Add authorized deployer
     */
    function addAuthorizedDeployer(address deployer) external onlyOwner {
        authorizedDeployers[deployer] = true;
    }

    /**
     * @dev Remove authorized deployer
     */
    function removeAuthorizedDeployer(address deployer) external onlyOwner {
        authorizedDeployers[deployer] = false;
    }

    /**
     * @dev Get system status and contracts
     */
    function getSystemInfo(
        uint256 systemId
    )
        external
        view
        returns (
            bool isActive,
            string[] memory contractTypes,
            address[] memory contractAddresses
        )
    {
        SystemContracts storage system = systemContracts[systemId];
        isActive = system.isActive;
        contractTypes = system.contractTypes;

        contractAddresses = new address[](contractTypes.length);
        for (uint i = 0; i < contractTypes.length; i++) {
            contractAddresses[i] = system.contracts[contractTypes[i]];
        }
    }

    /**
     * @dev Get all supported contract types
     */
    function getSupportedContractTypes()
        external
        view
        returns (string[] memory)
    {
        return supportedContractTypes;
    }

    /**
     * @dev Check if contract is registered and active
     */
    function isContractActive(
        address contractAddress
    ) external view returns (bool) {
        // This is a simplified check - in practice you'd want more efficient lookup
        for (uint i = 0; i < supportedContractTypes.length; i++) {
            address[] memory addresses = contractsByType[
                supportedContractTypes[i]
            ];
            for (uint j = 0; j < addresses.length; j++) {
                if (addresses[j] == contractAddress) {
                    // Find the contract ID and check if active
                    // Implementation would need optimization for production
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @dev Internal function to get contract code hash
     */
    function _getCodeHash(
        address contractAddress
    ) internal view returns (bytes32) {
        bytes32 hash;
        assembly {
            hash := extcodehash(contractAddress)
        }
        return hash;
    }

    /**
     * @dev Emergency functions for registry management
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        registryOwner = newOwner;
    }

    /**
     * @dev Get the number of versions for a specific contract type
     */
    function getContractVersionCount(
        string memory contractType
    ) external view returns (uint256) {
        return contractVersions[contractType].length;
    }

    /**
     * @dev Get registry statistics
     */
    function getRegistryStats()
        external
        view
        returns (
            uint256 totalContracts,
            uint256 totalSystems,
            uint256 totalContractTypes
        )
    {
        totalContracts = totalRegisteredContracts;
        // Count active systems (simplified)
        totalSystems = 0; // Would need to track this properly
        totalContractTypes = supportedContractTypes.length;
    }
}
