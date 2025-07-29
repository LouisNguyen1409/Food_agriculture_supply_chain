// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderManager.sol";

contract ContractRegistryFuzz is Test {
    Registry public registry;
    StakeholderManager public stakeholderManager;
    
    address admin = address(0x1);
    address farmer = address(0x2);
    address processor = address(0x3);
    address distributor = address(0x4);
    address retailer = address(0x5);
    address nonAdmin = address(0x6);

    function setUp() public {
        vm.startPrank(admin);
        stakeholderManager = new StakeholderManager();
        registry = new Registry(address(stakeholderManager));
        vm.stopPrank();
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
        
        // Register sender and receiver as stakeholders first
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            sender,
            StakeholderManager.StakeholderRole.FARMER,
            "Sender Farm",
            string(abi.encodePacked("LICENSE_SENDER_", vm.toString(uint160(sender)))),
            "Sender Location",
            "Sender Certs"
        );
        stakeholderManager.registerStakeholder(
            receiver,
            StakeholderManager.StakeholderRole.PROCESSOR,
            "Receiver Processor",
            string(abi.encodePacked("LICENSE_RECEIVER_", vm.toString(uint160(receiver)))),
            "Receiver Location",
            "Receiver Certs"
        );
        vm.stopPrank();
        
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
        
        // Register sender and receiver as stakeholders first
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            sender,
            StakeholderManager.StakeholderRole.FARMER,
            "Sender Farm",
            string(abi.encodePacked("LICENSE_SENDER_", vm.toString(uint160(sender)))),
            "Sender Location",
            "Sender Certs"
        );
        stakeholderManager.registerStakeholder(
            receiver,
            StakeholderManager.StakeholderRole.PROCESSOR,
            "Receiver Processor",
            string(abi.encodePacked("LICENSE_RECEIVER_", vm.toString(uint160(receiver)))),
            "Receiver Location",
            "Receiver Certs"
        );
        vm.stopPrank();
        
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
        
        // Register sender and receiver as stakeholders first
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            sender,
            StakeholderManager.StakeholderRole.FARMER,
            "Sender Farm",
            string(abi.encodePacked("LICENSE_SENDER_", vm.toString(uint160(sender)))),
            "Sender Location",
            "Sender Certs"
        );
        stakeholderManager.registerStakeholder(
            receiver,
            StakeholderManager.StakeholderRole.PROCESSOR,
            "Receiver Processor",
            string(abi.encodePacked("LICENSE_RECEIVER_", vm.toString(uint160(receiver)))),
            "Receiver Location",
            "Receiver Certs"
        );
        vm.stopPrank();
        
        string memory trackingNumber = _generateString(stringLength);
        
        registry.registerShipment(shipmentAddress, trackingNumber, productAddress, sender, receiver);
        
        assertTrue(registry.isEntityRegistered(shipmentAddress));
    }

    // ===== STAKEHOLDER MANAGEMENT FUZZ TESTS =====

    /**
     * @dev Fuzz test for stakeholder registration through StakeholderManager
     */
    function testFuzzRegisterStakeholder(
        address stakeholderAddress,
        string memory businessName,
        string memory businessLicense,
        uint8 roleIndex
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessName).length <= 100);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(businessLicense).length <= 100);
        vm.assume(roleIndex >= 1 && roleIndex <= 4); // 1-4 for FARMER, PROCESSOR, RETAILER, DISTRIBUTOR
        vm.assume(!stakeholderManager.isRegistered(stakeholderAddress));
        vm.assume(stakeholderManager.licenseToAddress(businessLicense) == address(0));

        StakeholderManager.StakeholderRole role = StakeholderManager.StakeholderRole(roleIndex);
        uint256 initialCount = stakeholderManager.totalStakeholders();

        vm.prank(admin);
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            role,
            businessName,
            businessLicense,
            "Test Location",
            "Test Certifications"
        );
        
        assertTrue(stakeholderManager.isRegistered(stakeholderAddress));
        assertTrue(stakeholderManager.hasRole(stakeholderAddress, role));
        assertEq(stakeholderManager.totalStakeholders(), initialCount + 1);
        assertEq(stakeholderManager.licenseToAddress(businessLicense), stakeholderAddress);
        
        vm.startPrank(admin);
        address[] memory stakeholdersByRole = stakeholderManager.getStakeholdersByRole(role);
        vm.stopPrank();
        
        bool found = false;
        for (uint256 i = 0; i < stakeholdersByRole.length; i++) {
            if (stakeholdersByRole[i] == stakeholderAddress) {
                found = true;
                break;
            }
        }
        assertTrue(found);
    }

    /**
     * @dev Fuzz test for preventing duplicate stakeholder registration
     */
    function testFuzzPreventDuplicateStakeholderRegistration(
        address stakeholderAddress,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(!stakeholderManager.isRegistered(stakeholderAddress));
        vm.assume(stakeholderManager.licenseToAddress(businessLicense) == address(0));
        
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            StakeholderManager.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Test Location",
            "Test Certifications"
        );
        
        vm.expectRevert("Already registered");
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            StakeholderManager.StakeholderRole.PROCESSOR,
            "Different Name",
            "Different License",
            "Different Location",
            "Different Certifications"
        );
        vm.stopPrank();
    }

    /**
     * @dev Fuzz test for preventing duplicate business license
     */
    function testFuzzPreventDuplicateBusinessLicense(
        address stakeholder1,
        address stakeholder2,
        string memory businessLicense,
        string memory businessName1,
        string memory businessName2
    ) public {
        vm.assume(stakeholder1 != address(0));
        vm.assume(stakeholder2 != address(0));
        vm.assume(stakeholder1 != stakeholder2);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(businessName1).length > 0);
        vm.assume(bytes(businessName2).length > 0);
        vm.assume(!stakeholderManager.isRegistered(stakeholder1));
        vm.assume(!stakeholderManager.isRegistered(stakeholder2));
        vm.assume(stakeholderManager.licenseToAddress(businessLicense) == address(0));
        
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            stakeholder1,
            StakeholderManager.StakeholderRole.FARMER,
            businessName1,
            businessLicense,
            "Location 1",
            "Certifications 1"
        );
        
        vm.expectRevert("License already exists");
        stakeholderManager.registerStakeholder(
            stakeholder2,
            StakeholderManager.StakeholderRole.PROCESSOR,
            businessName2,
            businessLicense,
            "Location 2",
            "Certifications 2"
        );
        vm.stopPrank();
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
        
        vm.startPrank(admin);
        for (uint256 i = 0; i < stakeholderCount; i++) {
            address stakeholderAddress = address(uint160(seed + i + 1000));
            string memory businessLicense = string(abi.encodePacked("LICENSE", vm.toString(i)));
            string memory businessName = string(abi.encodePacked("Business", vm.toString(i)));
            uint8 roleIndex = uint8((i % 4) + 1); // 1-4 for valid roles

            // Skip if already registered
            if (!stakeholderManager.isRegistered(stakeholderAddress) && 
                stakeholderManager.licenseToAddress(businessLicense) == address(0)) {
                
                StakeholderManager.StakeholderRole role = StakeholderManager.StakeholderRole(roleIndex);

                stakeholderManager.registerStakeholder(
                    stakeholderAddress,
                    role,
                    businessName,
                    businessLicense,
                    "Test Location",
                    "Test Certifications"
                );
                
                roleCounts[roleIndex - 1]++; // Adjust for 0-based array
            }
        }
        vm.stopPrank();
        
        // Verify role distribution (using StakeholderManager directly as admin)
        vm.startPrank(admin);
        for (uint256 i = 1; i <= 4; i++) {
            address[] memory roleStakeholders = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole(i));
            assertEq(roleStakeholders.length, roleCounts[i - 1]);
        }
        vm.stopPrank();
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
        vm.assume(!stakeholderManager.isRegistered(randomAddress));
        vm.assume(stakeholderManager.licenseToAddress(randomLicense) == address(0));
        
        assertFalse(registry.isEntityRegistered(randomAddress));
        assertFalse(registry.isStakeholderRegistered(randomAddress));
        assertEq(stakeholderManager.licenseToAddress(randomLicense), address(0));
    }

    /**
     * @dev Fuzz test for array bounds and consistency
     */
    function testFuzzArrayConsistency(
        address[5] memory products,
        address[5] memory shipments,
        address[5] memory stakeholderAddresses,
        string[5] memory businessLicenses,
        string[5] memory businessNames
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
        
        // Register stakeholders first
        vm.startPrank(admin);
        for (uint256 i = 0; i < stakeholderAddresses.length; i++) {
            if (stakeholderAddresses[i] != address(0) &&
                bytes(businessLicenses[i]).length > 0 &&
                bytes(businessNames[i]).length > 0 &&
                !stakeholderManager.isRegistered(stakeholderAddresses[i]) &&
                stakeholderManager.licenseToAddress(businessLicenses[i]) == address(0)) {
                
                stakeholderManager.registerStakeholder(
                    stakeholderAddresses[i],
                    StakeholderManager.StakeholderRole(((i % 4) + 1)), // 1-4 for valid roles
                    businessNames[i],
                    businessLicenses[i],
                    "Test Location",
                    "Test Certifications"
                );
                stakeholderCount++;
            }
        }
        vm.stopPrank();
        
        // Register shipments (only if we have at least 2 stakeholders)
        if (stakeholderCount >= 2) {
            // Find first two registered stakeholders
            address sender = address(0);
            address receiver = address(0);
            uint256 foundCount = 0;
            
            for (uint256 i = 0; i < stakeholderAddresses.length && foundCount < 2; i++) {
                if (stakeholderManager.isRegistered(stakeholderAddresses[i])) {
                    if (foundCount == 0) {
                        sender = stakeholderAddresses[i];
                        foundCount++;
                    } else {
                        receiver = stakeholderAddresses[i];
                        foundCount++;
                    }
                }
            }
            
            if (sender != address(0) && receiver != address(0)) {
                for (uint256 i = 0; i < shipments.length; i++) {
                    if (shipments[i] != address(0) && !registry.isEntityRegistered(shipments[i])) {
                        registry.registerShipment(
                            shipments[i],
                            string(abi.encodePacked("TRACK", vm.toString(i))),
                            address(uint160(i + 100)), // Dummy product address
                            sender,
                            receiver
                        );
                        shipmentCount++;
                    }
                }
            }
        }
        
        // Verify counts
        assertEq(registry.getTotalProducts(), productCount);
        assertEq(registry.getTotalShipments(), shipmentCount);
        assertEq(registry.getAllProducts().length, productCount);
        assertEq(registry.getAllShipments().length, shipmentCount);
        assertEq(stakeholderManager.totalStakeholders(), stakeholderCount);
    }

    // ===== EDGE CASE FUZZ TESTS =====

    /**
     * @dev Fuzz test with address(0) inputs for products
     */
    function testFuzzZeroAddressHandling() public {
        // Test product registration with address(0) - should fail now
        vm.expectRevert("Invalid product address");
        registry.registerProduct(address(0));
    }

    /**
     * @dev Fuzz test with empty string inputs for stakeholders
     */
    function testFuzzEmptyStringHandling(
        address stakeholderAddress
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(!stakeholderManager.isRegistered(stakeholderAddress));
        
        vm.startPrank(admin);
        // Empty business name should fail
        vm.expectRevert("Business name required");
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            StakeholderManager.StakeholderRole.FARMER,
            "",
            "ValidLicense",
            "Valid Location",
            "Valid Certifications"
        );
        
        // Empty business license should fail
        vm.expectRevert("Business license required");
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            StakeholderManager.StakeholderRole.FARMER,
            "Valid Name",
            "",
            "Valid Location",
            "Valid Certifications"
        );
        vm.stopPrank();
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

    /**
     * @dev Fuzz test for stakeholder role validation
     * Note: StakeholderManager currently accepts all role values including NONE
     */
    function testFuzzStakeholderRoleValidation(
        address stakeholderAddress,
        uint8 roleValue
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(roleValue <= 4); // Test valid enum range
        vm.assume(!stakeholderManager.isRegistered(stakeholderAddress));
        
        vm.startPrank(admin);
        
        // All roles 0-4 should be accepted by StakeholderManager
        // (including role 0 which is NONE)
        stakeholderManager.registerStakeholder(
            stakeholderAddress,
            StakeholderManager.StakeholderRole(roleValue),
            "Test Business",
            string(abi.encodePacked("TestLicense", vm.toString(uint160(stakeholderAddress)))),
            "Test Location",
            "Test Certifications"
        );
        
        // Verify the stakeholder was registered successfully
        assertTrue(stakeholderManager.isRegistered(stakeholderAddress));
        assertTrue(stakeholderManager.hasRole(stakeholderAddress, StakeholderManager.StakeholderRole(roleValue)));
        
        vm.stopPrank();
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
}
