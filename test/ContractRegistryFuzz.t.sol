// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/Stakeholder.sol";

contract ContractRegistryFuzz is Test {
    Registry registry;
    
    address admin = address(0x1);
    address farmer = address(0x2);
    address processor = address(0x3);
    address distributor = address(0x4);
    address retailer = address(0x5);
    address nonAdmin = address(0x6);

    function setUp() public {
        vm.prank(admin);
        registry = new Registry();
    }

    // ===== PRODUCT REGISTRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for product registration with random addresses
     */
    function testFuzzRegisterProduct(address productAddress) public {
        vm.assume(productAddress != address(0));
        vm.assume(!registry.isEntityRegistered(productAddress));
        
        uint256 initialCount = registry.getTotalProducts();
        
        vm.expectEmit(true, false, false, true);
        emit ProductRegistered(productAddress);
        
        registry.registerProduct(productAddress);
        
        assertTrue(registry.isEntityRegistered(productAddress));
        assertEq(registry.getTotalProducts(), initialCount + 1);
        
        address[] memory products = registry.getAllProducts();
        assertEq(products[products.length - 1], productAddress);
    }

    /**
     * @dev Fuzz test for preventing duplicate product registration
     */
    function testFuzzPreventDuplicateProductRegistration(address productAddress) public {
        vm.assume(productAddress != address(0));
        
        registry.registerProduct(productAddress);
        
        vm.expectRevert("Product already registered");
        registry.registerProduct(productAddress);
    }

    /**
     * @dev Fuzz test for multiple product registrations
     */
    function testFuzzMultipleProductRegistrations(address[10] memory productAddresses) public {
        uint256 expectedCount = 0;
        
        for (uint256 i = 0; i < productAddresses.length; i++) {
            vm.assume(productAddresses[i] != address(0));
            
            // Skip if already registered (to handle duplicate addresses in array)
            if (!registry.isEntityRegistered(productAddresses[i])) {
                registry.registerProduct(productAddresses[i]);
                expectedCount++;
                
                assertTrue(registry.isEntityRegistered(productAddresses[i]));
            }
        }
        
        assertEq(registry.getTotalProducts(), expectedCount);
    }

    // ===== SHIPMENT REGISTRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for shipment registration
     */
    function testFuzzRegisterShipment(
        address shipmentAddress,
        string memory trackingNumber,
        address productAddress,
        address sender,
        address receiver
    ) public {
        vm.assume(shipmentAddress != address(0));
        vm.assume(productAddress != address(0));
        vm.assume(sender != address(0));
        vm.assume(receiver != address(0));
        vm.assume(bytes(trackingNumber).length > 0);
        vm.assume(bytes(trackingNumber).length <= 100); // Reasonable limit
        vm.assume(!registry.isEntityRegistered(shipmentAddress));
        
        uint256 initialCount = registry.getTotalShipments();
        
        vm.expectEmit(true, true, true, true);
        emit ShipmentRegistered(shipmentAddress, trackingNumber, productAddress, sender, receiver);
        
        registry.registerShipment(shipmentAddress, trackingNumber, productAddress, sender, receiver);
        
        assertTrue(registry.isEntityRegistered(shipmentAddress));
        assertEq(registry.getTotalShipments(), initialCount + 1);
        
        address[] memory shipments = registry.getAllShipments();
        assertEq(shipments[shipments.length - 1], shipmentAddress);
    }

    /**
     * @dev Fuzz test for preventing duplicate shipment registration
     */
    function testFuzzPreventDuplicateShipmentRegistration(
        address shipmentAddress,
        string memory trackingNumber,
        address productAddress,
        address sender,
        address receiver
    ) public {
        vm.assume(shipmentAddress != address(0));
        vm.assume(productAddress != address(0));
        vm.assume(sender != address(0));
        vm.assume(receiver != address(0));
        vm.assume(bytes(trackingNumber).length > 0);
        
        registry.registerShipment(shipmentAddress, trackingNumber, productAddress, sender, receiver);
        
        vm.expectRevert("Shipment already registered");
        registry.registerShipment(shipmentAddress, trackingNumber, productAddress, sender, receiver);
    }

    /**
     * @dev Fuzz test for shipment registration with extreme string lengths
     */
    function testFuzzShipmentRegistrationStringLimits(
        address shipmentAddress,
        address productAddress,
        address sender,
        address receiver,
        uint8 stringLength
    ) public {
        vm.assume(shipmentAddress != address(0));
        vm.assume(productAddress != address(0));
        vm.assume(sender != address(0));
        vm.assume(receiver != address(0));
        vm.assume(stringLength > 0);
        vm.assume(stringLength <= 200); // Gas limit consideration
        vm.assume(!registry.isEntityRegistered(shipmentAddress));
        
        string memory trackingNumber = _generateString(stringLength);
        
        registry.registerShipment(shipmentAddress, trackingNumber, productAddress, sender, receiver);
        
        assertTrue(registry.isEntityRegistered(shipmentAddress));
    }

    // ===== STAKEHOLDER REGISTRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for stakeholder registration
     */
    function testFuzzRegisterStakeholder(
        address stakeholderContract,
        string memory businessLicense,
        address stakeholderAddress,
        uint8 roleIndex
    ) public {
        vm.assume(stakeholderContract != address(0));
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(businessLicense).length <= 100);
        vm.assume(roleIndex < 4); // 0-3 for FARMER, PROCESSOR, RETAILER, DISTRIBUTOR
        vm.assume(!registry.isEntityRegistered(stakeholderContract));
        vm.assume(registry.getStakeholderByLicense(businessLicense) == address(0));
        vm.assume(registry.getStakeholderByWallet(stakeholderAddress) == address(0));
        
        Stakeholder.StakeholderRole role = Stakeholder.StakeholderRole(roleIndex);
        
        vm.expectEmit(true, true, true, true);
        emit StakeholderRegistered(stakeholderContract, businessLicense, stakeholderAddress, role);
        
        registry.registerStakeholder(stakeholderContract, businessLicense, stakeholderAddress, role);
        
        assertTrue(registry.isEntityRegistered(stakeholderContract));
        assertEq(registry.getStakeholderByLicense(businessLicense), stakeholderContract);
        assertEq(registry.getStakeholderByWallet(stakeholderAddress), stakeholderContract);
        
        address[] memory stakeholdersByRole = registry.getStakeholdersByRole(role);
        bool found = false;
        for (uint256 i = 0; i < stakeholdersByRole.length; i++) {
            if (stakeholdersByRole[i] == stakeholderContract) {
                found = true;
                break;
            }
        }
        assertTrue(found);
    }

    /**
     * @dev Fuzz test for preventing duplicate stakeholder contract registration
     */
    function testFuzzPreventDuplicateStakeholderContract(
        address stakeholderContract,
        string memory businessLicense1,
        string memory businessLicense2,
        address stakeholderAddress1,
        address stakeholderAddress2,
        uint8 role1,
        uint8 role2
    ) public {
        vm.assume(stakeholderContract != address(0));
        vm.assume(stakeholderAddress1 != address(0));
        vm.assume(stakeholderAddress2 != address(0));
        vm.assume(bytes(businessLicense1).length > 0);
        vm.assume(bytes(businessLicense2).length > 0);
        vm.assume(role1 < 4 && role2 < 4);
        vm.assume(!_stringEquals(businessLicense1, businessLicense2));
        vm.assume(stakeholderAddress1 != stakeholderAddress2);
        
        registry.registerStakeholder(
            stakeholderContract, 
            businessLicense1, 
            stakeholderAddress1, 
            Stakeholder.StakeholderRole(role1)
        );
        
        vm.expectRevert("Stakeholder already registered");
        registry.registerStakeholder(
            stakeholderContract, 
            businessLicense2, 
            stakeholderAddress2, 
            Stakeholder.StakeholderRole(role2)
        );
    }

    /**
     * @dev Fuzz test for preventing duplicate business license
     */
    function testFuzzPreventDuplicateBusinessLicense(
        address stakeholderContract1,
        address stakeholderContract2,
        string memory businessLicense,
        address stakeholderAddress1,
        address stakeholderAddress2,
        uint8 role1,
        uint8 role2
    ) public {
        vm.assume(stakeholderContract1 != address(0));
        vm.assume(stakeholderContract2 != address(0));
        vm.assume(stakeholderContract1 != stakeholderContract2);
        vm.assume(stakeholderAddress1 != address(0));
        vm.assume(stakeholderAddress2 != address(0));
        vm.assume(stakeholderAddress1 != stakeholderAddress2);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(role1 < 4 && role2 < 4);
        
        registry.registerStakeholder(
            stakeholderContract1, 
            businessLicense, 
            stakeholderAddress1, 
            Stakeholder.StakeholderRole(role1)
        );
        
        vm.expectRevert("Business license already registered");
        registry.registerStakeholder(
            stakeholderContract2, 
            businessLicense, 
            stakeholderAddress2, 
            Stakeholder.StakeholderRole(role2)
        );
    }

    /**
     * @dev Fuzz test for preventing duplicate stakeholder address
     */
    function testFuzzPreventDuplicateStakeholderAddress(
        address stakeholderContract1,
        address stakeholderContract2,
        string memory businessLicense1,
        string memory businessLicense2,
        address stakeholderAddress,
        uint8 role1,
        uint8 role2
    ) public {
        vm.assume(stakeholderContract1 != address(0));
        vm.assume(stakeholderContract2 != address(0));
        vm.assume(stakeholderContract1 != stakeholderContract2);
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessLicense1).length > 0);
        vm.assume(bytes(businessLicense2).length > 0);
        vm.assume(!_stringEquals(businessLicense1, businessLicense2));
        vm.assume(role1 < 4 && role2 < 4);
        
        registry.registerStakeholder(
            stakeholderContract1, 
            businessLicense1, 
            stakeholderAddress, 
            Stakeholder.StakeholderRole(role1)
        );
        
        vm.expectRevert("Stakeholder address already has a contract");
        registry.registerStakeholder(
            stakeholderContract2, 
            businessLicense2, 
            stakeholderAddress, 
            Stakeholder.StakeholderRole(role2)
        );
    }

    // ===== ROLE DISTRIBUTION FUZZ TESTS =====

    /**
     * @dev Fuzz test for stakeholder role distribution
     */
    function testFuzzStakeholderRoleDistribution(
        uint8 stakeholderCount,
        uint256 seed
    ) public {
        vm.assume(stakeholderCount > 0 && stakeholderCount <= 10); // Reduced array size
        vm.assume(seed < type(uint256).max / 10000); // Prevent overflow
        
        uint256[4] memory roleCounts;
        
        for (uint256 i = 0; i < stakeholderCount; i++) {
            address stakeholderContract = address(uint160(seed + i + 1000));
            string memory businessLicense = string(abi.encodePacked("LICENSE", vm.toString(i)));
            address stakeholderAddress = address(uint160(seed + i + 2000));
            uint8 roleIndex = uint8(i % 4);
            
            Stakeholder.StakeholderRole role = Stakeholder.StakeholderRole(roleIndex);
            
            registry.registerStakeholder(
                stakeholderContract,
                businessLicense,
                stakeholderAddress,
                role
            );
            
            roleCounts[roleIndex]++;
        }
        
        // Verify role distribution
        for (uint256 i = 0; i < 4; i++) {
            address[] memory roleStakeholders = registry.getStakeholdersByRole(Stakeholder.StakeholderRole(i));
            assertEq(roleStakeholders.length, roleCounts[i]);
        }
    }

    // ===== QUERY FUNCTION FUZZ TESTS =====

    /**
     * @dev Fuzz test for querying non-existent entities
     */
    function testFuzzQueryNonExistentEntities(
        address randomAddress,
        string memory randomLicense
    ) public {
        vm.assume(randomAddress != address(0));
        vm.assume(bytes(randomLicense).length > 0);
        vm.assume(!registry.isEntityRegistered(randomAddress));
        vm.assume(registry.getStakeholderByLicense(randomLicense) == address(0));
        
        assertFalse(registry.isEntityRegistered(randomAddress));
        assertEq(registry.getStakeholderByLicense(randomLicense), address(0));
        assertEq(registry.getStakeholderByWallet(randomAddress), address(0));
    }

    /**
     * @dev Fuzz test for array bounds and consistency
     */
    function testFuzzArrayConsistency(
        address[5] memory products,
        address[5] memory shipments,
        address[5] memory stakeholderContracts,
        string[5] memory businessLicenses,
        address[5] memory stakeholderAddresses
    ) public {
        uint256 productCount = 0;
        uint256 shipmentCount = 0;
        uint256 stakeholderCount = 0;
        
        // Register products
        for (uint256 i = 0; i < products.length; i++) {
            if (products[i] != address(0) && !registry.isEntityRegistered(products[i])) {
                registry.registerProduct(products[i]);
                productCount++;
            }
        }
        
        // Register shipments
        for (uint256 i = 0; i < shipments.length; i++) {
            if (shipments[i] != address(0) && !registry.isEntityRegistered(shipments[i])) {
                registry.registerShipment(
                    shipments[i],
                    string(abi.encodePacked("TRACK", vm.toString(i))),
                    address(uint160(i + 100)), // Dummy product address
                    address(uint160(i + 200)), // Dummy sender
                    address(uint160(i + 300))  // Dummy receiver
                );
                shipmentCount++;
            }
        }
        
        // Register stakeholders
        for (uint256 i = 0; i < stakeholderContracts.length; i++) {
            if (stakeholderContracts[i] != address(0) &&
                stakeholderAddresses[i] != address(0) &&
                bytes(businessLicenses[i]).length > 0 &&
                !registry.isEntityRegistered(stakeholderContracts[i]) &&
                registry.getStakeholderByLicense(businessLicenses[i]) == address(0) &&
                registry.getStakeholderByWallet(stakeholderAddresses[i]) == address(0)) {
                
                registry.registerStakeholder(
                    stakeholderContracts[i],
                    businessLicenses[i],
                    stakeholderAddresses[i],
                    Stakeholder.StakeholderRole(i % 4)
                );
                stakeholderCount++;
            }
        }
        
        // Verify counts
        assertEq(registry.getTotalProducts(), productCount);
        assertEq(registry.getTotalShipments(), shipmentCount);
        assertEq(registry.getAllProducts().length, productCount);
        assertEq(registry.getAllShipments().length, shipmentCount);
        assertEq(registry.getAllStakeholders().length, stakeholderCount);
    }

    // ===== EDGE CASE FUZZ TESTS =====

    /**
     * @dev Fuzz test with address(0) inputs
     */
    function testFuzzZeroAddressHandling(string memory businessLicense) public {
        vm.assume(bytes(businessLicense).length > 0);
        
        // Test product registration with address(0) - should succeed in Registry contract
        // as it only checks for duplicates, not zero addresses
        registry.registerProduct(address(0));
        assertTrue(registry.isEntityRegistered(address(0)));
    }

    /**
     * @dev Fuzz test with empty string inputs
     */
    function testFuzzEmptyStringHandling(
        address stakeholderContract,
        address stakeholderAddress
    ) public {
        vm.assume(stakeholderContract != address(0));
        vm.assume(stakeholderAddress != address(0));
        
        // Empty business license should be handled gracefully
        registry.registerStakeholder(
            stakeholderContract,
            "",
            stakeholderAddress,
            Stakeholder.StakeholderRole.FARMER
        );
        
        assertEq(registry.getStakeholderByLicense(""), stakeholderContract);
    }

    /**
     * @dev Fuzz test for gas consumption with large arrays
     */
    function testFuzzGasConsumption(uint8 itemCount) public {
        vm.assume(itemCount > 0 && itemCount <= 50); // Reasonable gas limit
        
        uint256 gasStart = gasleft();
        
        for (uint256 i = 0; i < itemCount; i++) {
            address productAddr = address(uint160(i + 1000));
            registry.registerProduct(productAddr);
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        // Verify all products were registered
        assertEq(registry.getTotalProducts(), itemCount);
        
        // Gas should scale reasonably with item count
        assertTrue(gasUsed > 0);
    }

    // ===== HELPER FUNCTIONS =====

    /**
     * @dev Generate a string of specified length for testing
     */
    function _generateString(uint256 length) internal pure returns (string memory) {
        bytes memory str = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            str[i] = bytes1(uint8(65 + (i % 26))); // A-Z
        }
        return string(str);
    }

    /**
     * @dev Compare two strings for equality
     */
    function _stringEquals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked(b));
    }

    // ===== EVENTS =====
    
    event ProductRegistered(address indexed _product);
    event ShipmentRegistered(
        address indexed _shipment,
        string indexed trackingNumber,
        address indexed productAddress,
        address sender,
        address receiver
    );
    event StakeholderRegistered(
        address indexed _stakeholderContract,
        string indexed businessLicense,
        address indexed stakeholderAddress,
        Stakeholder.StakeholderRole role
    );
}
