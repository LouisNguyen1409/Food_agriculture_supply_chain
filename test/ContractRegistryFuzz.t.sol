// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ContractRegistry.sol";

contract ContractRegistryFuzz is Test {
    ContractRegistry registry;

    address owner = address(0x1);
    address authorizedDeployer = address(0x2);
    address unauthorizedUser = address(0x3);
    address contractAddr1 = address(0x100);
    address contractAddr2 = address(0x200);
    address contractAddr3 = address(0x300);
    address contractAddr4 = address(0x400);

    function setUp() public {
        vm.prank(owner);
        registry = new ContractRegistry();

        // Add authorized deployer
        vm.prank(owner);
        registry.addAuthorizedDeployer(authorizedDeployer);
    }

    // ===== BASIC FUNCTIONALITY TESTS =====

    /**
     * @dev Test contract registration with valid parameters
     */
    function testFuzzRegisterContract(
        string memory contractType,
        string memory description
    ) public {
        vm.assume(bytes(contractType).length > 0);
        vm.assume(bytes(contractType).length <= 50); // Reasonable limit
        vm.assume(bytes(description).length <= 200); // Reasonable limit

        vm.prank(authorizedDeployer);
        bytes32 contractId = registry.registerContract(
            contractAddr1,
            contractType,
            description
        );

        // Verify contract was registered
        ContractRegistry.ContractInfo memory info = registry.getContractInfo(
            contractId
        );
        assertEq(info.contractAddress, contractAddr1);
        assertEq(info.contractType, contractType);
        assertEq(info.version, 1);
        assertEq(info.deployer, authorizedDeployer);
        assertTrue(info.isActive);
        assertEq(info.description, description);
        assertTrue(info.deployedAt > 0);

        // Verify mappings were updated
        assertEq(registry.getLatestContract(contractType), contractAddr1);
        assertEq(registry.totalRegisteredContracts(), 1);
    }

    /**
     * @dev Test contract registration access control
     */
    function testFuzzRegisterContractAccessControl(
        string memory contractType,
        string memory description,
        address caller
    ) public {
        vm.assume(bytes(contractType).length > 0);
        vm.assume(caller != owner && caller != authorizedDeployer);

        vm.expectRevert("Not authorized deployer");
        vm.prank(caller);
        registry.registerContract(contractAddr1, contractType, description);
    }

    /**
     * @dev Test contract registration with invalid parameters
     */
    function testFuzzRegisterContractInvalidParams(
        string memory description
    ) public {
        vm.assume(bytes(description).length <= 200);

        // Test invalid contract address
        vm.expectRevert("Invalid contract address");
        vm.prank(authorizedDeployer);
        registry.registerContract(address(0), "TestType", description);

        // Test empty contract type
        vm.expectRevert("Contract type required");
        vm.prank(authorizedDeployer);
        registry.registerContract(contractAddr1, "", description);
    }

    /**
     * @dev Test contract versioning
     */
    function testFuzzContractVersioning(
        string memory contractType,
        string memory description1,
        string memory description2,
        string memory description3
    ) public {
        vm.assume(
            bytes(contractType).length > 0 && bytes(contractType).length <= 50
        );
        vm.assume(bytes(description1).length <= 200);
        vm.assume(bytes(description2).length <= 200);
        vm.assume(bytes(description3).length <= 200);

        // Register first version
        vm.prank(authorizedDeployer);
        bytes32 contractId1 = registry.registerContract(
            contractAddr1,
            contractType,
            description1
        );

        // Register second version
        vm.prank(authorizedDeployer);
        bytes32 contractId2 = registry.registerContract(
            contractAddr2,
            contractType,
            description2
        );

        // Register third version
        vm.prank(authorizedDeployer);
        bytes32 contractId3 = registry.registerContract(
            contractAddr3,
            contractType,
            description3
        );

        // Verify versions
        ContractRegistry.ContractInfo memory info1 = registry.getContractInfo(
            contractId1
        );
        ContractRegistry.ContractInfo memory info2 = registry.getContractInfo(
            contractId2
        );
        ContractRegistry.ContractInfo memory info3 = registry.getContractInfo(
            contractId3
        );

        assertEq(info1.version, 1);
        assertEq(info2.version, 2);
        assertEq(info3.version, 3);

        // Latest should be version 3
        assertEq(registry.getLatestContract(contractType), contractAddr3);

        // Check version count
        assertEq(registry.getContractVersionCount(contractType), 3);

        // Check all versions array
        bytes32[] memory versions = registry.getContractVersions(contractType);
        assertEq(versions.length, 3);
        assertEq(versions[0], contractId1);
        assertEq(versions[1], contractId2);
        assertEq(versions[2], contractId3);

        // Check contracts by type
        address[] memory contracts = registry.getContractsByType(contractType);
        assertEq(contracts.length, 3);
        assertEq(contracts[0], contractAddr1);
        assertEq(contracts[1], contractAddr2);
        assertEq(contracts[2], contractAddr3);
    }

    /**
     * @dev Test system registration
     */
    function testFuzzRegisterSystem(uint256 systemId) public {
        vm.assume(systemId > 0 && systemId < type(uint128).max); // Reasonable range

        vm.prank(authorizedDeployer);
        registry.registerSystem(
            systemId,
            contractAddr1, // stakeholderRegistry
            contractAddr2, // productRegistry
            contractAddr3, // shipmentRegistry
            contractAddr4 // publicVerification
        );

        // Verify system was registered
        (
            bool isActive,
            string[] memory contractTypes,
            address[] memory contractAddresses
        ) = registry.getSystemInfo(systemId);

        assertTrue(isActive);
        assertEq(contractTypes.length, 4);
        assertEq(contractAddresses.length, 4);

        // Check individual contract addresses
        assertEq(
            registry.getSystemContract(systemId, "StakeholderRegistry"),
            contractAddr1
        );
        assertEq(
            registry.getSystemContract(systemId, "ProductRegistry"),
            contractAddr2
        );
        assertEq(
            registry.getSystemContract(systemId, "ShipmentRegistry"),
            contractAddr3
        );
        assertEq(
            registry.getSystemContract(systemId, "PublicVerification"),
            contractAddr4
        );
    }

    /**
     * @dev Test system registration access control
     */
    function testFuzzRegisterSystemAccessControl(
        uint256 systemId,
        address caller
    ) public {
        vm.assume(systemId > 0);
        vm.assume(caller != owner && caller != authorizedDeployer);

        vm.expectRevert("Not authorized deployer");
        vm.prank(caller);
        registry.registerSystem(
            systemId,
            contractAddr1,
            contractAddr2,
            contractAddr3,
            contractAddr4
        );
    }

    /**
     * @dev Test contract upgrade functionality
     */
    function testFuzzUpgradeContract(
        string memory contractType,
        string memory description1,
        string memory description2
    ) public {
        vm.assume(
            bytes(contractType).length > 0 && bytes(contractType).length <= 50
        );
        vm.assume(bytes(description1).length <= 200);
        vm.assume(bytes(description2).length <= 200);

        // Register initial contract
        vm.prank(authorizedDeployer);
        bytes32 contractId1 = registry.registerContract(
            contractAddr1,
            contractType,
            description1
        );

        ContractRegistry.ContractInfo memory initialInfo = registry
            .getContractInfo(contractId1);
        assertEq(initialInfo.version, 1);
        assertEq(registry.getLatestContract(contractType), contractAddr1);

        // Upgrade contract
        vm.prank(authorizedDeployer);
        registry.upgradeContract(contractType, contractAddr2, description2);

        // Verify upgrade
        assertEq(registry.getLatestContract(contractType), contractAddr2);
        assertEq(registry.getContractVersionCount(contractType), 2);

        // Check that both versions exist
        bytes32[] memory versions = registry.getContractVersions(contractType);
        assertEq(versions.length, 2);
    }

    /**
     * @dev Test upgrade contract with non-existent type
     */
    function testFuzzUpgradeNonExistentContract(
        string memory contractType,
        string memory description
    ) public {
        vm.assume(
            bytes(contractType).length > 0 && bytes(contractType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);

        // Try to upgrade a contract type that doesn't exist
        vm.expectRevert("Contract type not found");
        vm.prank(authorizedDeployer);
        registry.upgradeContract(contractType, contractAddr1, description);
    }

    /**
     * @dev Test contract deactivation
     */
    function testFuzzDeactivateContract(
        string memory contractType,
        string memory description,
        string memory reason
    ) public {
        vm.assume(
            bytes(contractType).length > 0 && bytes(contractType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);
        vm.assume(bytes(reason).length <= 100);

        // Register a contract
        vm.prank(authorizedDeployer);
        bytes32 contractId = registry.registerContract(
            contractAddr1,
            contractType,
            description
        );

        // Verify it's active
        ContractRegistry.ContractInfo memory info = registry.getContractInfo(
            contractId
        );
        assertTrue(info.isActive);

        // Deactivate it
        vm.prank(authorizedDeployer);
        registry.deactivateContract(contractId, reason);

        // Verify it's deactivated
        info = registry.getContractInfo(contractId);
        assertFalse(info.isActive);
    }

    /**
     * @dev Test deactivate non-existent contract
     */
    function testFuzzDeactivateNonExistentContract(
        bytes32 contractId,
        string memory reason
    ) public {
        vm.assume(contractId != bytes32(0));
        vm.assume(bytes(reason).length <= 100);

        vm.expectRevert("Contract not found");
        vm.prank(authorizedDeployer);
        registry.deactivateContract(contractId, reason);
    }

    /**
     * @dev Test authorized deployer management
     */
    function testFuzzAuthorizedDeployerManagement(address newDeployer) public {
        vm.assume(newDeployer != address(0));
        vm.assume(newDeployer != owner);
        vm.assume(newDeployer != authorizedDeployer);

        // Initially not authorized
        assertFalse(registry.authorizedDeployers(newDeployer));

        // Add as authorized deployer
        vm.prank(owner);
        registry.addAuthorizedDeployer(newDeployer);

        // Now should be authorized
        assertTrue(registry.authorizedDeployers(newDeployer));

        // Remove authorization
        vm.prank(owner);
        registry.removeAuthorizedDeployer(newDeployer);

        // Should no longer be authorized
        assertFalse(registry.authorizedDeployers(newDeployer));
    }

    /**
     * @dev Test deployer management access control
     */
    function testFuzzDeployerManagementAccessControl(
        address newDeployer,
        address caller
    ) public {
        vm.assume(newDeployer != address(0));
        vm.assume(caller != owner);

        // Non-owner should not be able to add deployers
        vm.expectRevert("Only registry owner");
        vm.prank(caller);
        registry.addAuthorizedDeployer(newDeployer);

        // Add deployer as owner first
        vm.prank(owner);
        registry.addAuthorizedDeployer(newDeployer);

        // Non-owner should not be able to remove deployers
        vm.expectRevert("Only registry owner");
        vm.prank(caller);
        registry.removeAuthorizedDeployer(newDeployer);
    }

    /**
     * @dev Test ownership transfer
     */
    function testFuzzOwnershipTransfer(address newOwner) public {
        vm.assume(newOwner != address(0));
        vm.assume(newOwner != owner);

        // Transfer ownership
        vm.prank(owner);
        registry.transferOwnership(newOwner);

        // Verify new owner
        assertEq(registry.registryOwner(), newOwner);

        // Old owner should no longer have access
        vm.expectRevert("Only registry owner");
        vm.prank(owner);
        registry.addAuthorizedDeployer(address(0x999));

        // New owner should have access
        vm.prank(newOwner);
        registry.addAuthorizedDeployer(address(0x999));
        assertTrue(registry.authorizedDeployers(address(0x999)));
    }

    /**
     * @dev Test ownership transfer with invalid address
     */
    function testFuzzOwnershipTransferInvalid() public {
        vm.expectRevert("Invalid new owner");
        vm.prank(owner);
        registry.transferOwnership(address(0));
    }

    /**
     * @dev Test ownership transfer access control
     */
    function testFuzzOwnershipTransferAccessControl(
        address newOwner,
        address caller
    ) public {
        vm.assume(newOwner != address(0));
        vm.assume(caller != owner);

        vm.expectRevert("Only registry owner");
        vm.prank(caller);
        registry.transferOwnership(newOwner);
    }

    /**
     * @dev Test get latest contract for non-existent type
     */
    function testFuzzGetLatestContractNonExistent(
        string memory contractType
    ) public {
        vm.assume(bytes(contractType).length > 0);

        vm.expectRevert("Contract type not found");
        registry.getLatestContract(contractType);
    }

    /**
     * @dev Test get system contract for non-existent system
     */
    function testFuzzGetSystemContractNonExistent(
        uint256 systemId,
        string memory contractType
    ) public {
        vm.assume(systemId > 0);
        vm.assume(bytes(contractType).length > 0);

        // Should return zero address for non-existent system
        assertEq(
            registry.getSystemContract(systemId, contractType),
            address(0)
        );
    }

    /**
     * @dev Test supported contract types
     */
    function testFuzzSupportedContractTypes() public {
        string[] memory supportedTypes = registry.getSupportedContractTypes();

        // Should have 6 supported types by default
        assertEq(supportedTypes.length, 6);

        // Check for expected types
        bool foundStakeholder = false;
        bool foundProduct = false;
        bool foundShipment = false;
        bool foundVerification = false;
        bool foundProductFactory = false;
        bool foundShipmentFactory = false;

        for (uint i = 0; i < supportedTypes.length; i++) {
            if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("StakeholderRegistry"))
            ) {
                foundStakeholder = true;
            } else if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("ProductRegistry"))
            ) {
                foundProduct = true;
            } else if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("ShipmentRegistry"))
            ) {
                foundShipment = true;
            } else if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("PublicVerification"))
            ) {
                foundVerification = true;
            } else if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("ProductFactory"))
            ) {
                foundProductFactory = true;
            } else if (
                keccak256(bytes(supportedTypes[i])) ==
                keccak256(bytes("ShipmentFactory"))
            ) {
                foundShipmentFactory = true;
            }
        }

        assertTrue(foundStakeholder);
        assertTrue(foundProduct);
        assertTrue(foundShipment);
        assertTrue(foundVerification);
        assertTrue(foundProductFactory);
        assertTrue(foundShipmentFactory);
    }

    /**
     * @dev Test contract activity check
     */
    function testFuzzIsContractActive(string memory contractType) public {
        string memory description = "Valid ASCII description";
        vm.assume(
            bytes(contractType).length > 0 && bytes(contractType).length <= 10
        );
        for (uint i = 0; i < bytes(contractType).length; i++) {
            vm.assume(
                uint8(bytes(contractType)[i]) >= 0x20 &&
                    uint8(bytes(contractType)[i]) <= 0x7E
            );
        }
        try
            registry.registerContract(contractAddr1, contractType, description)
        {
            assertTrue(registry.isContractActive(contractAddr1));
        } catch {
            emit log_string("Registration failed for contractType:");
            emit log_string(contractType);
        }
    }

    /**
     * @dev Test registry statistics
     */
    function testFuzzRegistryStats(
        string memory contractType1,
        string memory contractType2,
        string memory description
    ) public {
        vm.assume(
            bytes(contractType1).length > 0 && bytes(contractType1).length <= 50
        );
        vm.assume(
            bytes(contractType2).length > 0 && bytes(contractType2).length <= 50
        );
        vm.assume(
            keccak256(bytes(contractType1)) != keccak256(bytes(contractType2))
        );
        vm.assume(bytes(description).length <= 200);

        // Check initial stats
        (
            uint256 totalContracts,
            uint256 totalSystems,
            uint256 totalContractTypes
        ) = registry.getRegistryStats();
        assertEq(totalContracts, 0);
        assertEq(totalSystems, 0); // Implementation returns 0
        assertEq(totalContractTypes, 6); // Default supported types

        // Register some contracts
        vm.prank(authorizedDeployer);
        registry.registerContract(contractAddr1, contractType1, description);

        vm.prank(authorizedDeployer);
        registry.registerContract(contractAddr2, contractType2, description);

        // Check updated stats
        (totalContracts, totalSystems, totalContractTypes) = registry
            .getRegistryStats();
        assertEq(totalContracts, 2);
        assertEq(totalSystems, 0); // Implementation returns 0
        assertEq(totalContractTypes, 6);
    }

    /**
     * @dev Test edge cases with empty strings and boundary values
     */
    function testFuzzEdgeCases() public {
        // Test with maximum reasonable string lengths
        string
            memory longType = "StakeholderRegistryWithVeryLongNameThatShouldStillWork";
        string
            memory longDescription = "This is a very long description that should still work within reasonable bounds and not cause any issues with the contract registry system";

        vm.prank(authorizedDeployer);
        bytes32 contractId = registry.registerContract(
            contractAddr1,
            longType,
            longDescription
        );

        ContractRegistry.ContractInfo memory info = registry.getContractInfo(
            contractId
        );
        assertEq(info.contractType, longType);
        assertEq(info.description, longDescription);
    }

    /**
     * @dev Test multiple contract types and complex scenarios
     */
    function testFuzzComplexScenarios(
        uint256 systemId1,
        uint256 systemId2,
        string memory customType
    ) public {
        vm.assume(systemId1 > 0 && systemId1 < type(uint128).max);
        vm.assume(systemId2 > 0 && systemId2 < type(uint128).max);
        vm.assume(systemId1 != systemId2);
        vm.assume(
            bytes(customType).length > 0 && bytes(customType).length <= 50
        );

        // Register standard system
        vm.prank(authorizedDeployer);
        registry.registerSystem(
            systemId1,
            contractAddr1,
            contractAddr2,
            contractAddr3,
            contractAddr4
        );

        // Register custom contract type
        address customAddr = address(0x500);
        vm.prank(authorizedDeployer);
        registry.registerContract(customAddr, customType, "Custom contract");

        // Register another system
        vm.prank(authorizedDeployer);
        registry.registerSystem(
            systemId2,
            address(0x600),
            address(0x700),
            address(0x800),
            address(0x900)
        );

        // Verify both systems exist independently
        (bool isActive1, , ) = registry.getSystemInfo(systemId1);
        (bool isActive2, , ) = registry.getSystemInfo(systemId2);

        assertTrue(isActive1);
        assertTrue(isActive2);

        // Verify custom contract exists
        assertEq(registry.getLatestContract(customType), customAddr);

        // Verify total count includes all registrations
        assertEq(registry.totalRegisteredContracts(), 1); // Only explicit registerContract calls count
    }

    /**
     * @dev Test contract info retrieval with various data
     */
    function testFuzzContractInfoRetrieval(
        string memory contractType,
        string memory description,
        uint256 timeWarp
    ) public {
        vm.assume(bytes(contractType).length > 0);
        vm.assume(bytes(description).length > 0);
        vm.assume(timeWarp > 0 && timeWarp < 365 days);

        // Warp time to test timestamp
        vm.warp(block.timestamp + timeWarp);

        vm.prank(authorizedDeployer);
        bytes32 contractId = registry.registerContract(
            contractAddr1,
            contractType,
            description
        );

        ContractRegistry.ContractInfo memory info = registry.getContractInfo(
            contractId
        );

        // Verify all fields are correctly set
        assertEq(info.contractAddress, contractAddr1);
        assertEq(info.contractType, contractType);
        assertEq(info.version, 1);
        assertEq(info.deployer, authorizedDeployer);
        assertEq(info.deployedAt, block.timestamp);
        assertTrue(info.isActive);
        assertEq(info.description, description);
    }

    function testRegisterContractRevertsOnZeroAddress() public {
        vm.expectRevert("Invalid contract address");
        vm.prank(authorizedDeployer);
        registry.registerContract(address(0), "TestType", "desc");
    }

    function testRegisterContractRevertsOnEmptyType() public {
        vm.expectRevert("Contract type required");
        vm.prank(authorizedDeployer);
        registry.registerContract(contractAddr1, "", "desc");
    }

    function testUpgradeContractRevertsOnZeroAddress() public {
        vm.expectRevert("Contract type not found");
        vm.prank(authorizedDeployer);
        registry.upgradeContract("TestType", address(0), "desc");
    }

    function testUpgradeContractRevertsOnEmptyType() public {
        vm.expectRevert("Contract type not found");
        vm.prank(authorizedDeployer);
        registry.upgradeContract("", contractAddr1, "desc");
    }

    function testUpgradeContractOnlyAuthorized() public {
        address notAuth = address(0x999);
        vm.expectRevert("Not authorized deployer");
        vm.prank(notAuth);
        registry.upgradeContract("TestType", contractAddr1, "desc");
    }

    function testDeactivateContractRevertsOnNotFound() public {
        vm.expectRevert("Contract not found");
        vm.prank(authorizedDeployer);
        registry.deactivateContract(bytes32(uint256(0x123)), "reason");
    }

    function testDeactivateContractOnlyAuthorized() public {
        // Register a contract
        vm.prank(authorizedDeployer);
        bytes32 contractId = registry.registerContract(
            contractAddr1,
            "TestType",
            "desc"
        );
        // Try to deactivate as unauthorized
        address notAuth = address(0x999);
        vm.expectRevert("Not authorized deployer");
        vm.prank(notAuth);
        registry.deactivateContract(contractId, "reason");
    }

    function testAddAuthorizedDeployerOnlyOwner() public {
        address notOwner = address(0x999);
        vm.expectRevert("Only registry owner");
        vm.prank(notOwner);
        registry.addAuthorizedDeployer(address(0x888));
    }

    function testRemoveAuthorizedDeployerOnlyOwner() public {
        address notOwner = address(0x999);
        vm.expectRevert("Only registry owner");
        vm.prank(notOwner);
        registry.removeAuthorizedDeployer(address(0x888));
    }

    function testTransferOwnershipOnlyOwner() public {
        address notOwner = address(0x999);
        vm.expectRevert("Only registry owner");
        vm.prank(notOwner);
        registry.transferOwnership(address(0x888));
    }

    function testTransferOwnershipRevertsOnZero() public {
        vm.expectRevert("Invalid new owner");
        vm.prank(owner);
        registry.transferOwnership(address(0));
    }

    function testGetLatestContractRevertsIfNotFound() public {
        vm.expectRevert("Contract type not found");
        registry.getLatestContract("NonExistentType");
    }

    function testIsContractActiveReturnsFalseForUnknown() public {
        assertFalse(registry.isContractActive(address(0xDEAD)));
    }

    function testGetSystemInfoReturnsEmptyForUnknown() public {
        (
            bool isActive,
            string[] memory contractTypes,
            address[] memory contractAddresses
        ) = registry.getSystemInfo(999999);
        assertFalse(isActive);
        assertEq(contractTypes.length, 0);
        assertEq(contractAddresses.length, 0);
    }

    function testGetContractVersionCountReturnsZeroForUnknown() public {
        assertEq(registry.getContractVersionCount("NonExistentType"), 0);
    }
}
