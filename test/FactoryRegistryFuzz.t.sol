// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/FactoryRegistry.sol";
import "../src/SmartContracts/ContractRegistry.sol";

contract FactoryRegistryFuzz is Test {
    FactoryRegistry factoryRegistry;
    ContractRegistry contractRegistry;

    address owner = address(0x1);
    address authorizedDeployer = address(0x2);
    address unauthorizedUser = address(0x3);
    address productFactoryAddr = address(0x100);
    address shipmentFactoryAddr = address(0x200);
    address customFactoryAddr = address(0x300);

    function setUp() public {
        // Deploy ContractRegistry first
        vm.prank(owner);
        contractRegistry = new ContractRegistry();

        // Add authorized deployer to ContractRegistry
        vm.prank(owner);
        contractRegistry.addAuthorizedDeployer(authorizedDeployer);

        // Deploy FactoryRegistry
        vm.prank(owner);
        factoryRegistry = new FactoryRegistry(address(contractRegistry));

        // Add FactoryRegistry as authorized deployer so it can register contracts
        vm.prank(owner);
        contractRegistry.addAuthorizedDeployer(address(factoryRegistry));
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test constructor with valid registry address
     */
    function testFuzzConstructorValid() public {
        FactoryRegistry newRegistry = new FactoryRegistry(
            address(contractRegistry)
        );
        assertEq(
            address(newRegistry.contractRegistry()),
            address(contractRegistry)
        );
    }

    /**
     * @dev Test constructor with invalid registry address
     */
    function testFuzzConstructorInvalid() public {
        vm.expectRevert("Invalid registry address");
        new FactoryRegistry(address(0));
    }

    // ===== FACTORY REGISTRATION TESTS =====

    /**
     * @dev Test factory registration with valid parameters
     */
    function testFuzzRegisterFactory(
        string memory factoryType,
        string memory description
    ) public {
        vm.assume(bytes(factoryType).length > 0);
        vm.assume(bytes(factoryType).length <= 50); // Reasonable limit
        vm.assume(bytes(description).length <= 200); // Reasonable limit

        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        // Verify factory was registered locally
        assertEq(factoryRegistry.getFactory(factoryType), productFactoryAddr);

        // Verify factory info
        FactoryRegistry.FactoryInfo memory info = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        assertEq(info.factoryAddress, productFactoryAddr);
        assertEq(info.factoryType, factoryType);
        assertTrue(info.registeredAt > 0);
        assertTrue(info.isActive);

        // Verify it was also registered in the main ContractRegistry
        assertEq(
            contractRegistry.getLatestContract(factoryType),
            productFactoryAddr
        );
    }

    /**
     * @dev Test factory registration access control
     */
    function testFuzzRegisterFactoryAccessControl(
        string memory factoryType,
        string memory description,
        address caller
    ) public {
        vm.assume(bytes(factoryType).length > 0);
        vm.assume(caller != owner && caller != authorizedDeployer && caller != address(factoryRegistry));

        vm.expectRevert("Not authorized deployer");
        vm.prank(caller);
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );
    }

    /**
     * @dev Test factory registration with invalid factory address
     */
    function testFuzzRegisterFactoryInvalidAddress(
        string memory factoryType,
        string memory description
    ) public {
        vm.assume(bytes(factoryType).length > 0);
        vm.assume(bytes(description).length <= 200);

        vm.expectRevert("Invalid factory address");
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(address(0), factoryType, description);
    }

    /**
     * @dev Test factory registration with empty factory type
     */
    function testFuzzRegisterFactoryEmptyType(
        string memory description
    ) public {
        vm.assume(bytes(description).length <= 200);

        vm.expectRevert("Factory type required");
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(productFactoryAddr, "", description);
    }

    /**
     * @dev Test multiple factory registrations with different types
     */
    function testFuzzMultipleFactoryRegistrations(
        string memory factoryType1,
        string memory factoryType2,
        string memory description1,
        string memory description2
    ) public {
        vm.assume(
            bytes(factoryType1).length > 0 && bytes(factoryType1).length <= 50
        );
        vm.assume(
            bytes(factoryType2).length > 0 && bytes(factoryType2).length <= 50
        );
        vm.assume(bytes(description1).length <= 200);
        vm.assume(bytes(description2).length <= 200);
        vm.assume(
            keccak256(bytes(factoryType1)) != keccak256(bytes(factoryType2))
        ); // Different types

        // Register first factory
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType1,
            description1
        );

        // Register second factory
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            shipmentFactoryAddr,
            factoryType2,
            description2
        );

        // Verify both factories are registered
        assertEq(factoryRegistry.getFactory(factoryType1), productFactoryAddr);
        assertEq(factoryRegistry.getFactory(factoryType2), shipmentFactoryAddr);

        // Verify factory info for both
        FactoryRegistry.FactoryInfo memory info1 = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        FactoryRegistry.FactoryInfo memory info2 = factoryRegistry
            .getFactoryInfo(shipmentFactoryAddr);

        assertEq(info1.factoryType, factoryType1);
        assertEq(info2.factoryType, factoryType2);
        assertTrue(info1.isActive);
        assertTrue(info2.isActive);
    }

    /**
     * @dev Test factory type override (registering new factory with same type)
     */
    function testFuzzFactoryTypeOverride(
        string memory factoryType,
        string memory description1,
        string memory description2
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description1).length <= 200);
        vm.assume(bytes(description2).length <= 200);

        // Register first factory
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description1
        );

        // Register second factory with same type (should override)
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            shipmentFactoryAddr,
            factoryType,
            description2
        );

        // Latest factory should be the second one
        assertEq(factoryRegistry.getFactory(factoryType), shipmentFactoryAddr);

        // Both factory infos should still exist
        FactoryRegistry.FactoryInfo memory info1 = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        FactoryRegistry.FactoryInfo memory info2 = factoryRegistry
            .getFactoryInfo(shipmentFactoryAddr);

        assertEq(info1.factoryType, factoryType);
        assertEq(info2.factoryType, factoryType);
        assertTrue(info1.isActive);
        assertTrue(info2.isActive);
    }

    // ===== GETTER FUNCTION TESTS =====

    /**
     * @dev Test getting factory for non-existent type
     */
    function testFuzzGetFactoryNonExistent(string memory factoryType) public {
        vm.assume(bytes(factoryType).length > 0);

        // Should return zero address for non-existent type
        assertEq(factoryRegistry.getFactory(factoryType), address(0));
    }

    /**
     * @dev Test getting factory info for non-existent factory
     */
    function testFuzzGetFactoryInfoNonExistent(address factoryAddress) public {
        vm.assume(factoryAddress != address(0));

        FactoryRegistry.FactoryInfo memory info = factoryRegistry
            .getFactoryInfo(factoryAddress);

        // Should return empty struct
        assertEq(info.factoryAddress, address(0));
        assertEq(info.factoryType, "");
        assertEq(info.registeredAt, 0);
        assertFalse(info.isActive);
    }

    /**
     * @dev Test getting factory info for registered factory
     */
    function testFuzzGetFactoryInfoRegistered(
        string memory factoryType,
        string memory description,
        uint256 timeWarp
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);
        vm.assume(timeWarp > 0 && timeWarp < 365 days);

        // Warp time to test timestamp
        vm.warp(block.timestamp + timeWarp);

        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        FactoryRegistry.FactoryInfo memory info = factoryRegistry
            .getFactoryInfo(productFactoryAddr);

        assertEq(info.factoryAddress, productFactoryAddr);
        assertEq(info.factoryType, factoryType);
        assertEq(info.registeredAt, block.timestamp);
        assertTrue(info.isActive);
    }

    // ===== BATCH REGISTRATION TESTS =====

    /**
     * @dev Test batch registration with both factories
     */
    function testFuzzRegisterCommonFactoriesBoth() public {
        vm.prank(owner); // Use owner instead of authorizedDeployer to ensure authorization
        factoryRegistry.registerCommonFactories(
            productFactoryAddr,
            shipmentFactoryAddr
        );

        // Verify both factories are registered
        assertEq(
            factoryRegistry.getFactory("ProductFactory"),
            productFactoryAddr
        );
        assertEq(
            factoryRegistry.getFactory("ShipmentFactory"),
            shipmentFactoryAddr
        );

        // Verify factory info
        FactoryRegistry.FactoryInfo memory productInfo = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        FactoryRegistry.FactoryInfo memory shipmentInfo = factoryRegistry
            .getFactoryInfo(shipmentFactoryAddr);

        assertEq(productInfo.factoryType, "ProductFactory");
        assertEq(shipmentInfo.factoryType, "ShipmentFactory");
        assertTrue(productInfo.isActive);
        assertTrue(shipmentInfo.isActive);

        // Verify they're also registered in ContractRegistry
        assertEq(
            contractRegistry.getLatestContract("ProductFactory"),
            productFactoryAddr
        );
        assertEq(
            contractRegistry.getLatestContract("ShipmentFactory"),
            shipmentFactoryAddr
        );
    }

    /**
     * @dev Test batch registration with only product factory
     */
    function testFuzzRegisterCommonFactoriesProductOnly() public {
        vm.prank(owner); // Use owner instead of authorizedDeployer
        factoryRegistry.registerCommonFactories(
            productFactoryAddr,
            address(0) // No shipment factory
        );

        // Verify only product factory is registered
        assertEq(
            factoryRegistry.getFactory("ProductFactory"),
            productFactoryAddr
        );
        assertEq(factoryRegistry.getFactory("ShipmentFactory"), address(0));

        // Verify factory info
        FactoryRegistry.FactoryInfo memory productInfo = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        FactoryRegistry.FactoryInfo memory shipmentInfo = factoryRegistry
            .getFactoryInfo(address(0));

        assertEq(productInfo.factoryType, "ProductFactory");
        assertEq(shipmentInfo.factoryType, ""); // Empty for non-existent
        assertTrue(productInfo.isActive);
        assertFalse(shipmentInfo.isActive);
    }

    /**
     * @dev Test batch registration with only shipment factory
     */
    function testFuzzRegisterCommonFactoriesShipmentOnly() public {
        vm.prank(owner); // Use owner instead of authorizedDeployer
        factoryRegistry.registerCommonFactories(
            address(0), // No product factory
            shipmentFactoryAddr
        );

        // Verify only shipment factory is registered
        assertEq(factoryRegistry.getFactory("ProductFactory"), address(0));
        assertEq(
            factoryRegistry.getFactory("ShipmentFactory"),
            shipmentFactoryAddr
        );

        // Verify factory info
        FactoryRegistry.FactoryInfo memory productInfo = factoryRegistry
            .getFactoryInfo(address(0));
        FactoryRegistry.FactoryInfo memory shipmentInfo = factoryRegistry
            .getFactoryInfo(shipmentFactoryAddr);

        assertEq(productInfo.factoryType, ""); // Empty for non-existent
        assertEq(shipmentInfo.factoryType, "ShipmentFactory");
        assertFalse(productInfo.isActive);
        assertTrue(shipmentInfo.isActive);
    }

    /**
     * @dev Test batch registration with both factories as zero addresses
     */
    function testFuzzRegisterCommonFactoriesNone() public {
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerCommonFactories(address(0), address(0));

        // Verify no factories are registered
        assertEq(factoryRegistry.getFactory("ProductFactory"), address(0));
        assertEq(factoryRegistry.getFactory("ShipmentFactory"), address(0));
    }

    /**
     * @dev Test batch registration access control
     */
    function testFuzzRegisterCommonFactoriesAccessControl(
        address caller
    ) public {
        vm.assume(caller != owner && caller != authorizedDeployer);

        vm.expectRevert("Not authorized deployer");
        vm.prank(caller);
        factoryRegistry.registerCommonFactories(
            productFactoryAddr,
            shipmentFactoryAddr
        );
    }

    // ===== AUTHORIZATION TESTS =====

    /**
     * @dev Test authorization through ContractRegistry owner
     */
    function testFuzzAuthorizationThroughOwner(
        string memory factoryType,
        string memory description
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);

        // Owner should be able to register factories (owner is automatically authorized in ContractRegistry)
        vm.prank(owner);
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        assertEq(factoryRegistry.getFactory(factoryType), productFactoryAddr);
    }

    /**
     * @dev Test authorization through ContractRegistry authorized deployer
     */
    function testFuzzAuthorizationThroughAuthorizedDeployer(
        string memory factoryType,
        string memory description,
        address newDeployer
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);
        vm.assume(
            newDeployer != address(0) &&
                newDeployer != owner &&
                newDeployer != authorizedDeployer
        );

        // Add new deployer to ContractRegistry
        vm.prank(owner);
        contractRegistry.addAuthorizedDeployer(newDeployer);

        // New deployer should be able to register factories
        vm.prank(newDeployer);
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        assertEq(factoryRegistry.getFactory(factoryType), productFactoryAddr);
    }

    /**
     * @dev Test authorization revocation
     */
    function testFuzzAuthorizationRevocation(
        string memory factoryType,
        string memory description
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);

        // Initially authorized deployer can register
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        // Remove authorization
        vm.prank(owner);
        contractRegistry.removeAuthorizedDeployer(authorizedDeployer);

        // Now should fail
        vm.expectRevert("Not authorized deployer");
        vm.prank(authorizedDeployer);
        factoryRegistry.registerFactory(
            shipmentFactoryAddr,
            "AnotherType",
            "Another description"
        );
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====

    /**
     * @dev Test with very long factory type and description
     */
    function testFuzzLongStrings() public {
        string
            memory longType = "ProductFactoryWithVeryLongNameThatShouldStillWorkWithinReasonableBounds";
        string
            memory longDescription = "This is a very long description for a factory that should still work within reasonable bounds and not cause any issues with the factory registry system implementation";

        vm.prank(owner); // Use owner instead of authorizedDeployer
        factoryRegistry.registerFactory(
            productFactoryAddr,
            longType,
            longDescription
        );

        assertEq(factoryRegistry.getFactory(longType), productFactoryAddr);

        FactoryRegistry.FactoryInfo memory info = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        assertEq(info.factoryType, longType);
    }

    /**
     * @dev Test registering same factory address with different types
     */
    function testFuzzSameAddressDifferentTypes(
        string memory type1,
        string memory type2,
        string memory description
    ) public {
        vm.assume(bytes(type1).length > 0 && bytes(type1).length <= 50);
        vm.assume(bytes(type2).length > 0 && bytes(type2).length <= 50);
        vm.assume(bytes(description).length <= 200);
        vm.assume(keccak256(bytes(type1)) != keccak256(bytes(type2)));

        // Register same address with first type
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(productFactoryAddr, type1, description);

        // Register same address with second type (should overwrite factory info)
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(productFactoryAddr, type2, description);

        // Both type mappings should point to the same address
        assertEq(factoryRegistry.getFactory(type1), productFactoryAddr);
        assertEq(factoryRegistry.getFactory(type2), productFactoryAddr);

        // Factory info should be updated to the latest registration
        FactoryRegistry.FactoryInfo memory info = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        assertEq(info.factoryType, type2); // Should be the latest type
    }

    /**
     * @dev Test timestamp accuracy
     */
    function testFuzzTimestampAccuracy(
        string memory factoryType,
        string memory description,
        uint256 timeWarp1,
        uint256 timeWarp2
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);
        vm.assume(timeWarp1 > 0 && timeWarp1 < 365 days);
        vm.assume(timeWarp2 > timeWarp1 && timeWarp2 < 730 days);

        // Register first factory at time1
        vm.warp(timeWarp1);
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        FactoryRegistry.FactoryInfo memory info1 = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        assertEq(info1.registeredAt, timeWarp1);

        // Register second factory at time2
        vm.warp(timeWarp2);
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            shipmentFactoryAddr,
            "DifferentType",
            description
        );

        FactoryRegistry.FactoryInfo memory info2 = factoryRegistry
            .getFactoryInfo(shipmentFactoryAddr);
        assertEq(info2.registeredAt, timeWarp2);

        // First factory timestamp should be unchanged
        FactoryRegistry.FactoryInfo memory info1Updated = factoryRegistry
            .getFactoryInfo(productFactoryAddr);
        assertEq(info1Updated.registeredAt, timeWarp1);
    }

    /**
     * @dev Test integration with ContractRegistry failures
     */
    function testFuzzContractRegistryIntegration(
        string memory factoryType,
        string memory description
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);

        // First registration should succeed
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );

        // Verify registration in both contracts
        assertEq(factoryRegistry.getFactory(factoryType), productFactoryAddr);
        assertEq(
            contractRegistry.getLatestContract(factoryType),
            productFactoryAddr
        );

        // Register another version
        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            shipmentFactoryAddr,
            factoryType,
            description
        );

        // FactoryRegistry should point to latest, ContractRegistry should also point to latest
        assertEq(factoryRegistry.getFactory(factoryType), shipmentFactoryAddr);
        assertEq(
            contractRegistry.getLatestContract(factoryType),
            shipmentFactoryAddr
        );
    }

    /**
     * @dev Test event emission
     */
    function testFuzzEventEmission(
        string memory factoryType,
        string memory description,
        uint256 timeWarp
    ) public {
        vm.assume(
            bytes(factoryType).length > 0 && bytes(factoryType).length <= 50
        );
        vm.assume(bytes(description).length <= 200);
        vm.assume(timeWarp > 0 && timeWarp < 365 days);

        vm.warp(timeWarp);

        // Expect the event to be emitted
        vm.expectEmit(true, true, false, true);
        emit FactoryRegistered(factoryType, productFactoryAddr, timeWarp);

        vm.prank(owner); // Use owner for authorization
        factoryRegistry.registerFactory(
            productFactoryAddr,
            factoryType,
            description
        );
    }

    // Define the event for testing
    event FactoryRegistered(
        string indexed factoryType,
        address indexed factoryAddress,
        uint256 timestamp
    );
}
