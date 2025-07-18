// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ContractRegistry.sol";
import "./ProductRegistry.sol";
import "./ShipmentRegistry.sol";
import "./PublicVerification.sol";

/**
 * @title SupplyChainClient
 * @dev Example client showing how to use ContractRegistry for external integrations
 * This demonstrates the power of the Contract Registry pattern
 */
contract SupplyChainClient {
    ContractRegistry public immutable contractRegistry;

    event ProductVerified(
        uint256 indexed systemId,
        uint256 indexed productId,
        address verifier,
        bool isValid
    );

    event SystemDiscovered(
        uint256 indexed systemId,
        address[] contractAddresses,
        string[] contractTypes
    );

    constructor(address _contractRegistry) {
        require(_contractRegistry != address(0), "Invalid registry address");
        contractRegistry = ContractRegistry(_contractRegistry);
    }

    /**
     * @dev Verify a product across any supply chain system
     * Shows how external apps can discover and interact with contracts
     */
    function verifyProduct(
        uint256 systemId,
        uint256 productId
    ) external returns (bool isValid) {
        // Discover contracts for this system
        address publicVerificationAddr = contractRegistry.getSystemContract(
            systemId,
            "PublicVerification"
        );

        require(publicVerificationAddr != address(0), "System not found");

        // Interact with the discovered contract
        PublicVerification verification = PublicVerification(
            publicVerificationAddr
        );
        isValid = verification.verifyProduct(productId);

        emit ProductVerified(systemId, productId, msg.sender, isValid);

        return isValid;
    }

    /**
     * @dev Get product details from any system without knowing contract addresses
     */
    function getProductDetails(
        uint256 systemId,
        uint256 productId
    )
        external
        view
        returns (
            string memory productName,
            address farmer,
            uint256 harvestDate,
            string memory origin,
            uint8 status
        )
    {
        address productRegistryAddr = contractRegistry.getSystemContract(
            systemId,
            "ProductRegistry"
        );

        require(productRegistryAddr != address(0), "System not found");

        ProductRegistry productRegistry = ProductRegistry(productRegistryAddr);

        // Get product information
        (productName, farmer, harvestDate, origin, status, , ) = productRegistry
            .getProduct(productId);

        return (productName, farmer, harvestDate, origin, status);
    }

    /**
     * @dev Track shipments across systems
     */
    function trackShipment(
        uint256 systemId,
        uint256 shipmentId
    )
        external
        view
        returns (
            uint256[] memory productIds,
            address sender,
            address receiver,
            uint8 status,
            string memory trackingInfo
        )
    {
        address shipmentRegistryAddr = contractRegistry.getSystemContract(
            systemId,
            "ShipmentRegistry"
        );

        require(shipmentRegistryAddr != address(0), "System not found");

        ShipmentRegistry shipmentRegistry = ShipmentRegistry(
            shipmentRegistryAddr
        );

        (
            productIds,
            sender,
            receiver,
            status,
            ,
            trackingInfo,

        ) = shipmentRegistry.getShipment(shipmentId);

        return (productIds, sender, receiver, status, trackingInfo);
    }

    /**
     * @dev Discover all available supply chain systems
     */
    function discoverSystems() external {
        // Get all ProductRegistry addresses (one per system)
        address[] memory productRegistries = contractRegistry
            .getContractsByType("ProductRegistry");

        for (uint i = 0; i < productRegistries.length; i++) {
            // For each system, get full contract info
            // Note: This is simplified - in practice you'd need system ID lookup
            (
                bool isActive,
                string[] memory contractTypes,
                address[] memory contractAddresses
            ) = contractRegistry.getSystemInfo(i + 1); // Assuming systemIds start at 1

            if (isActive) {
                emit SystemDiscovered(i + 1, contractAddresses, contractTypes);
            }
        }
    }

    /**
     * @dev Get latest contract address for integration
     * Useful when contracts are upgraded
     */
    function getLatestProductRegistry() external view returns (address) {
        return contractRegistry.getLatestContract("ProductRegistry");
    }

    /**
     * @dev Check if a supply chain system supports a specific feature
     */
    function systemSupportsVerification(
        uint256 systemId
    ) external view returns (bool) {
        address verificationAddr = contractRegistry.getSystemContract(
            systemId,
            "PublicVerification"
        );

        return verificationAddr != address(0);
    }

    /**
     * @dev Batch verify multiple products across different systems
     * Demonstrates the power of unified contract discovery
     */
    function batchVerifyProducts(
        uint256[] memory systemIds,
        uint256[] memory productIds
    ) external returns (bool[] memory results) {
        require(systemIds.length == productIds.length, "Array length mismatch");

        results = new bool[](systemIds.length);

        for (uint i = 0; i < systemIds.length; i++) {
            address verificationAddr = contractRegistry.getSystemContract(
                systemIds[i],
                "PublicVerification"
            );

            if (verificationAddr != address(0)) {
                PublicVerification verification = PublicVerification(
                    verificationAddr
                );
                results[i] = verification.verifyProduct(productIds[i]);
            } else {
                results[i] = false;
            }
        }

        return results;
    }

    /**
     * @dev Get system health/stats across all systems
     */
    function getSystemsOverview()
        external
        view
        returns (
            uint256 totalSystems,
            uint256 totalContracts,
            uint256 supportedTypes
        )
    {
        (totalContracts, totalSystems, supportedTypes) = contractRegistry
            .getRegistryStats();

        return (totalSystems, totalContracts, supportedTypes);
    }
}
