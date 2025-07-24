// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/Stakeholder.sol";

contract StakeholderFuzz is Test {
    Stakeholder public stakeholder;
    
    address admin = address(0x1);
    address stakeholderAddr = address(0x2);
    address unauthorizedUser = address(0x3);
    address newAdmin = address(0x4);
    
    string constant DEFAULT_BUSINESS_NAME = "Test Business";
    string constant DEFAULT_LICENSE = "LIC001";
    string constant DEFAULT_LOCATION = "Test Location";
    string constant DEFAULT_CERTIFICATIONS = "Test Certifications";
    
    event StakeholderUpdated(
        string businessName,
        string location,
        string certifications,
        uint256 timestamp
    );
    
    event StakeholderDeactivated(uint256 timestamp);
    event StakeholderReactivated(uint256 timestamp);

    function setUp() public {
        vm.prank(admin);
        stakeholder = new Stakeholder(
            stakeholderAddr,
            Stakeholder.StakeholderRole.FARMER,
            DEFAULT_BUSINESS_NAME,
            DEFAULT_LICENSE,
            DEFAULT_LOCATION,
            DEFAULT_CERTIFICATIONS,
            admin
        );
    }

    // ===== HELPER FUNCTIONS =====

    /**
     * @dev Sanitizes string inputs to handle invalid UTF-8 and length issues
     */
    function _sanitizeString(string memory input, string memory defaultValue) internal pure returns (string memory) {
        bytes memory inputBytes = bytes(input);
        
        // Check if string is empty or too long
        if (inputBytes.length == 0 || inputBytes.length > 100) {
            return defaultValue;
        }
        
        // Only allow printable ASCII characters (0x20-0x7E)
        for (uint256 i = 0; i < inputBytes.length; i++) {
            bytes1 b = inputBytes[i];
            if (uint8(b) < 0x20 || uint8(b) > 0x7E) {
                return defaultValue;
            }
        }
        
        return input;
    }

    function _getRandomRole(uint256 seed) internal pure returns (Stakeholder.StakeholderRole) {
        uint8 roleIndex = uint8(seed % 4);
        if (roleIndex == 0) return Stakeholder.StakeholderRole.FARMER;
        if (roleIndex == 1) return Stakeholder.StakeholderRole.PROCESSOR;
        if (roleIndex == 2) return Stakeholder.StakeholderRole.RETAILER;
        return Stakeholder.StakeholderRole.DISTRIBUTOR;
    }

    function _createStakeholder(
        address _stakeholderAddr,
        Stakeholder.StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications,
        address _admin
    ) internal returns (Stakeholder) {
        return new Stakeholder(
            _stakeholderAddr,
            _role,
            _businessName,
            _businessLicense,
            _location,
            _certifications,
            _admin
        );
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test Stakeholder constructor with valid parameters
     */
    function testFuzzConstructorValid(
        address _stakeholderAddr,
        uint256 roleSeed,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications,
        address _admin
    ) public {
        vm.assume(_stakeholderAddr != address(0));
        vm.assume(_admin != address(0));
        
        _businessName = _sanitizeString(_businessName, "ValidBusiness");
        _businessLicense = _sanitizeString(_businessLicense, "VALID001");
        _location = _sanitizeString(_location, "ValidLocation");
        _certifications = _sanitizeString(_certifications, "ValidCerts");
        
        // Ensure business name and license are not empty after sanitization
        vm.assume(bytes(_businessName).length > 0);
        vm.assume(bytes(_businessLicense).length > 0);
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        Stakeholder newStakeholder = _createStakeholder(
            _stakeholderAddr,
            role,
            _businessName,
            _businessLicense,
            _location,
            _certifications,
            _admin
        );
        
        // Verify all fields are set correctly
        assertEq(newStakeholder.stakeholderAddress(), _stakeholderAddr);
        assertEq(uint8(newStakeholder.role()), uint8(role));
        assertEq(newStakeholder.businessName(), _businessName);
        assertEq(newStakeholder.businessLicense(), _businessLicense);
        assertEq(newStakeholder.location(), _location);
        assertEq(newStakeholder.certifications(), _certifications);
        assertEq(newStakeholder.admin(), _admin);
        assertTrue(newStakeholder.isActive());
        assertTrue(newStakeholder.registeredAt() > 0);
        assertTrue(newStakeholder.lastActivity() > 0);
    }

    /**
     * @dev Test constructor with zero stakeholder address (should fail)
     */
    function testConstructorZeroStakeholderAddress() public {
        vm.expectRevert("Invalid stakeholder address");
        new Stakeholder(
            address(0),
            Stakeholder.StakeholderRole.FARMER,
            DEFAULT_BUSINESS_NAME,
            DEFAULT_LICENSE,
            DEFAULT_LOCATION,
            DEFAULT_CERTIFICATIONS,
            admin
        );
    }

    /**
     * @dev Test constructor with empty business name (should fail)
     */
    function testConstructorEmptyBusinessName() public {
        vm.expectRevert("Business name cannot be empty");
        new Stakeholder(
            stakeholderAddr,
            Stakeholder.StakeholderRole.FARMER,
            "", // Empty business name
            DEFAULT_LICENSE,
            DEFAULT_LOCATION,
            DEFAULT_CERTIFICATIONS,
            admin
        );
    }

    /**
     * @dev Test constructor with empty business license (should fail)
     */
    function testConstructorEmptyBusinessLicense() public {
        vm.expectRevert("Business license cannot be empty");
        new Stakeholder(
            stakeholderAddr,
            Stakeholder.StakeholderRole.FARMER,
            DEFAULT_BUSINESS_NAME,
            "", // Empty business license
            DEFAULT_LOCATION,
            DEFAULT_CERTIFICATIONS,
            admin
        );
    }

    /**
     * @dev Test constructor with zero admin address (should succeed but may cause issues later)
     */
    function testConstructorZeroAdminAddress() public {
        Stakeholder newStakeholder = new Stakeholder(
            stakeholderAddr,
            Stakeholder.StakeholderRole.FARMER,
            DEFAULT_BUSINESS_NAME,
            DEFAULT_LICENSE,
            DEFAULT_LOCATION,
            DEFAULT_CERTIFICATIONS,
            address(0) // Zero admin
        );
        
        assertEq(newStakeholder.admin(), address(0));
        assertTrue(newStakeholder.isActive());
    }

    // ===== UPDATE INFO TESTS =====

    /**
     * @dev Test updateInfo with valid parameters by admin
     */
    function testFuzzUpdateInfoValid(
        string memory newBusinessName,
        string memory newLocation,
        string memory newCertifications
    ) public {
        newBusinessName = _sanitizeString(newBusinessName, "NewBusiness");
        newLocation = _sanitizeString(newLocation, "NewLocation");
        newCertifications = _sanitizeString(newCertifications, "NewCerts");
        
        // Ensure business name is not empty
        vm.assume(bytes(newBusinessName).length > 0);
        
        uint256 initialActivity = stakeholder.lastActivity();
        
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderUpdated(newBusinessName, newLocation, newCertifications, block.timestamp);
        
        stakeholder.updateInfo(newBusinessName, newLocation, newCertifications);
        
        assertEq(stakeholder.businessName(), newBusinessName);
        assertEq(stakeholder.location(), newLocation);
        assertEq(stakeholder.certifications(), newCertifications);
        assertTrue(stakeholder.lastActivity() >= initialActivity);
    }

    /**
     * @dev Test updateInfo with empty business name (should fail)
     */
    function testUpdateInfoEmptyBusinessName() public {
        vm.prank(admin);
        vm.expectRevert("Business name cannot be empty");
        stakeholder.updateInfo("", "New Location", "New Certs");
    }

    /**
     * @dev Test updateInfo by non-admin (should fail)
     */
    function testFuzzUpdateInfoUnauthorized(
        address unauthorizedAddr,
        string memory newBusinessName,
        string memory newLocation,
        string memory newCertifications
    ) public {
        vm.assume(unauthorizedAddr != admin);
        vm.assume(unauthorizedAddr != address(0));
        
        newBusinessName = _sanitizeString(newBusinessName, "NewBusiness");
        newLocation = _sanitizeString(newLocation, "NewLocation");
        newCertifications = _sanitizeString(newCertifications, "NewCerts");
        
        vm.assume(bytes(newBusinessName).length > 0);
        
        vm.prank(unauthorizedAddr);
        vm.expectRevert("Only admin can call this function");
        stakeholder.updateInfo(newBusinessName, newLocation, newCertifications);
    }

    /**
     * @dev Test updateInfo on deactivated stakeholder (should fail)
     */
    function testUpdateInfoWhenDeactivated() public {
        // First deactivate the stakeholder
        vm.prank(admin);
        stakeholder.deactivate();
        
        // Try to update info (should fail)
        vm.prank(admin);
        vm.expectRevert("Stakeholder is not active");
        stakeholder.updateInfo("New Business", "New Location", "New Certs");
    }

    // ===== DEACTIVATE TESTS =====

    /**
     * @dev Test deactivate by admin
     */
    function testDeactivateByAdmin() public {
        assertTrue(stakeholder.isActive());
        
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderDeactivated(block.timestamp);
        
        stakeholder.deactivate();
        
        assertFalse(stakeholder.isActive());
    }

    /**
     * @dev Test deactivate by non-admin (should fail)
     */
    function testFuzzDeactivateUnauthorized(address unauthorizedAddr) public {
        vm.assume(unauthorizedAddr != admin);
        vm.assume(unauthorizedAddr != address(0));
        
        vm.prank(unauthorizedAddr);
        vm.expectRevert("Only admin can call this function");
        stakeholder.deactivate();
        
        assertTrue(stakeholder.isActive()); // Should still be active
    }

    /**
     * @dev Test deactivate when already deactivated (should fail)
     */
    function testDeactivateWhenAlreadyDeactivated() public {
        // First deactivate
        vm.prank(admin);
        stakeholder.deactivate();
        
        // Try to deactivate again (should fail)
        vm.prank(admin);
        vm.expectRevert("Stakeholder is not active");
        stakeholder.deactivate();
    }

    // ===== REACTIVATE TESTS =====

    /**
     * @dev Test reactivate by admin
     */
    function testReactivateByAdmin() public {
        // First deactivate
        vm.prank(admin);
        stakeholder.deactivate();
        assertFalse(stakeholder.isActive());
        
        // Then reactivate
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderReactivated(block.timestamp);
        
        stakeholder.reactivate();
        
        assertTrue(stakeholder.isActive());
    }

    /**
     * @dev Test reactivate by non-admin (should fail)
     */
    function testFuzzReactivateUnauthorized(address unauthorizedAddr) public {
        vm.assume(unauthorizedAddr != admin);
        vm.assume(unauthorizedAddr != address(0));
        
        // First deactivate
        vm.prank(admin);
        stakeholder.deactivate();
        
        // Try to reactivate as unauthorized user
        vm.prank(unauthorizedAddr);
        vm.expectRevert("Only admin can call this function");
        stakeholder.reactivate();
        
        assertFalse(stakeholder.isActive()); // Should still be inactive
    }

    /**
     * @dev Test reactivate when already active (should fail)
     */
    function testReactivateWhenAlreadyActive() public {
        assertTrue(stakeholder.isActive());
        
        vm.prank(admin);
        vm.expectRevert("Stakeholder is already active");
        stakeholder.reactivate();
    }

    // ===== UPDATE ACTIVITY TESTS =====

    /**
     * @dev Test updateActivity by stakeholder
     */
    function testUpdateActivityByStakeholder() public {
        uint256 initialActivity = stakeholder.lastActivity();
        
        vm.warp(block.timestamp + 100); // Move forward in time
        
        vm.prank(stakeholderAddr);
        stakeholder.updateActivity();
        
        assertTrue(stakeholder.lastActivity() > initialActivity);
    }

    /**
     * @dev Test updateActivity by admin
     */
    function testUpdateActivityByAdmin() public {
        uint256 initialActivity = stakeholder.lastActivity();
        
        vm.warp(block.timestamp + 100); // Move forward in time
        
        vm.prank(admin);
        stakeholder.updateActivity();
        
        assertTrue(stakeholder.lastActivity() > initialActivity);
    }

    /**
     * @dev Test updateActivity by unauthorized user (should fail)
     */
    function testFuzzUpdateActivityUnauthorized(address unauthorizedAddr) public {
        vm.assume(unauthorizedAddr != stakeholderAddr);
        vm.assume(unauthorizedAddr != admin);
        vm.assume(unauthorizedAddr != address(0));
        
        vm.prank(unauthorizedAddr);
        vm.expectRevert("Only stakeholder or admin can update activity");
        stakeholder.updateActivity();
    }

    // ===== HAS ROLE TESTS =====

    /**
     * @dev Test hasRole with correct role when active
     */
    function testHasRoleCorrect() public {
        assertTrue(stakeholder.hasRole(Stakeholder.StakeholderRole.FARMER));
        assertFalse(stakeholder.hasRole(Stakeholder.StakeholderRole.PROCESSOR));
        assertFalse(stakeholder.hasRole(Stakeholder.StakeholderRole.RETAILER));
        assertFalse(stakeholder.hasRole(Stakeholder.StakeholderRole.DISTRIBUTOR));
    }

    /**
     * @dev Test hasRole when deactivated (should return false)
     */
    function testHasRoleWhenDeactivated() public {
        // Deactivate stakeholder
        vm.prank(admin);
        stakeholder.deactivate();
        
        // hasRole should return false even for correct role
        assertFalse(stakeholder.hasRole(Stakeholder.StakeholderRole.FARMER));
    }

    /**
     * @dev Test hasRole with different roles for different stakeholder types
     */
    function testFuzzHasRoleWithDifferentTypes(
        uint256 roleSeed,
        address _stakeholderAddr,
        address _admin
    ) public {
        vm.assume(_stakeholderAddr != address(0));
        vm.assume(_admin != address(0));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        Stakeholder newStakeholder = _createStakeholder(
            _stakeholderAddr,
            role,
            "Test Business",
            "TEST001",
            "Test Location",
            "Test Certs",
            _admin
        );
        
        // Should return true only for the assigned role
        assertTrue(newStakeholder.hasRole(role));
        
        // Test all other roles should return false
        Stakeholder.StakeholderRole[] memory allRoles = new Stakeholder.StakeholderRole[](4);
        allRoles[0] = Stakeholder.StakeholderRole.FARMER;
        allRoles[1] = Stakeholder.StakeholderRole.PROCESSOR;
        allRoles[2] = Stakeholder.StakeholderRole.RETAILER;
        allRoles[3] = Stakeholder.StakeholderRole.DISTRIBUTOR;
        
        for (uint256 i = 0; i < allRoles.length; i++) {
            if (allRoles[i] != role) {
                assertFalse(newStakeholder.hasRole(allRoles[i]));
            }
        }
    }

    // ===== GET STAKEHOLDER INFO TESTS =====

    /**
     * @dev Test getStakeholderInfo returns correct values
     */
    function testGetStakeholderInfo() public {
        (
            address addr,
            Stakeholder.StakeholderRole role,
            string memory name,
            string memory license,
            string memory location,
            string memory certifications,
            bool active,
            uint256 registered,
            uint256 activity
        ) = stakeholder.getStakeholderInfo();
        
        assertEq(addr, stakeholderAddr);
        assertEq(uint8(role), uint8(Stakeholder.StakeholderRole.FARMER));
        assertEq(name, DEFAULT_BUSINESS_NAME);
        assertEq(license, DEFAULT_LICENSE);
        assertEq(location, DEFAULT_LOCATION);
        assertEq(certifications, DEFAULT_CERTIFICATIONS);
        assertTrue(active);
        assertTrue(registered > 0);
        assertTrue(activity > 0);
    }

    /**
     * @dev Test getStakeholderInfo after deactivation
     */
    function testGetStakeholderInfoWhenDeactivated() public {
        vm.prank(admin);
        stakeholder.deactivate();
        
        (
            address addr,
            Stakeholder.StakeholderRole role,
            string memory name,
            string memory license,
            string memory location,
            string memory certifications,
            bool active,
            uint256 registered,
            uint256 activity
        ) = stakeholder.getStakeholderInfo();
        
        assertEq(addr, stakeholderAddr);
        assertEq(uint8(role), uint8(Stakeholder.StakeholderRole.FARMER));
        assertEq(name, DEFAULT_BUSINESS_NAME);
        assertEq(license, DEFAULT_LICENSE);
        assertEq(location, DEFAULT_LOCATION);
        assertEq(certifications, DEFAULT_CERTIFICATIONS);
        assertFalse(active); // Should be false now
        assertTrue(registered > 0);
        assertTrue(activity > 0);
    }

    // ===== GET ROLE STRING TESTS =====

    /**
     * @dev Test getRoleString for all role types
     */
    function testGetRoleStringAllRoles() public {
        // Test FARMER
        assertEq(stakeholder.getRoleString(), "FARMER");
        
        // Test other roles by creating new stakeholders
        Stakeholder processor = _createStakeholder(
            address(0x10),
            Stakeholder.StakeholderRole.PROCESSOR,
            "Processor Co",
            "PROC001",
            "Processor Location",
            "Processor Certs",
            admin
        );
        assertEq(processor.getRoleString(), "PROCESSOR");
        
        Stakeholder retailer = _createStakeholder(
            address(0x11),
            Stakeholder.StakeholderRole.RETAILER,
            "Retailer Co",
            "RET001",
            "Retailer Location",
            "Retailer Certs",
            admin
        );
        assertEq(retailer.getRoleString(), "RETAILER");
        
        Stakeholder distributor = _createStakeholder(
            address(0x12),
            Stakeholder.StakeholderRole.DISTRIBUTOR,
            "Distributor Co",
            "DIST001",
            "Distributor Location",
            "Distributor Certs",
            admin
        );
        assertEq(distributor.getRoleString(), "DISTRIBUTOR");
    }

    /**
     * @dev Test getRoleString with fuzz testing
     */
    function testFuzzGetRoleString(uint256 roleSeed) public {
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        Stakeholder newStakeholder = _createStakeholder(
            address(0x20),
            role,
            "Test Business",
            "TEST001",
            "Test Location",
            "Test Certs",
            admin
        );
        
        string memory roleString = newStakeholder.getRoleString();
        
        if (role == Stakeholder.StakeholderRole.FARMER) {
            assertEq(roleString, "FARMER");
        } else if (role == Stakeholder.StakeholderRole.PROCESSOR) {
            assertEq(roleString, "PROCESSOR");
        } else if (role == Stakeholder.StakeholderRole.RETAILER) {
            assertEq(roleString, "RETAILER");
        } else if (role == Stakeholder.StakeholderRole.DISTRIBUTOR) {
            assertEq(roleString, "DISTRIBUTOR");
        }
    }

    // ===== IS VALID FOR OPERATIONS TESTS =====

    /**
     * @dev Test isValidForOperations when active
     */
    function testIsValidForOperationsWhenActive() public {
        // Move forward in time since isValidForOperations requires block.timestamp > registeredAt
        vm.warp(block.timestamp + 1);
        assertTrue(stakeholder.isValidForOperations());
    }

    /**
     * @dev Test isValidForOperations when deactivated
     */
    function testIsValidForOperationsWhenDeactivated() public {
        vm.prank(admin);
        stakeholder.deactivate();
        
        assertFalse(stakeholder.isValidForOperations());
    }

    /**
     * @dev Test isValidForOperations with time progression
     */
    function testIsValidForOperationsWithTime() public {
        // Initially, should be invalid since block.timestamp == registeredAt
        assertFalse(stakeholder.isValidForOperations());
        
        // Move forward in time
        vm.warp(block.timestamp + 1000);
        
        // Should now be valid
        assertTrue(stakeholder.isValidForOperations());
    }

    // ===== EDGE CASE TESTS =====

    /**
     * @dev Test multiple state changes in sequence
     */
    function testMultipleStateChanges() public {
        // Move forward in time to make stakeholder valid for operations
        vm.warp(block.timestamp + 1);
        
        // Initial state
        assertTrue(stakeholder.isActive());
        assertTrue(stakeholder.isValidForOperations());
        
        // Deactivate
        vm.prank(admin);
        stakeholder.deactivate();
        assertFalse(stakeholder.isActive());
        assertFalse(stakeholder.isValidForOperations());
        
        // Reactivate
        vm.prank(admin);
        stakeholder.reactivate();
        assertTrue(stakeholder.isActive());
        assertTrue(stakeholder.isValidForOperations());
        
        // Update info
        vm.prank(admin);
        stakeholder.updateInfo("Updated Business", "Updated Location", "Updated Certs");
        assertEq(stakeholder.businessName(), "Updated Business");
        assertEq(stakeholder.location(), "Updated Location");
        assertEq(stakeholder.certifications(), "Updated Certs");
        
        // Deactivate again
        vm.prank(admin);
        stakeholder.deactivate();
        assertFalse(stakeholder.isActive());
    }

    /**
     * @dev Test activity updates with various callers
     */
    function testActivityUpdatesVariousCallers() public {
        uint256 initialActivity = stakeholder.lastActivity();
        
        vm.warp(block.timestamp + 100);
        
        // Update by stakeholder
        vm.prank(stakeholderAddr);
        stakeholder.updateActivity();
        uint256 activity1 = stakeholder.lastActivity();
        assertTrue(activity1 > initialActivity);
        
        vm.warp(block.timestamp + 100);
        
        // Update by admin
        vm.prank(admin);
        stakeholder.updateActivity();
        uint256 activity2 = stakeholder.lastActivity();
        assertTrue(activity2 > activity1);
    }

    /**
     * @dev Test with very long strings
     */
    function testVeryLongStrings() public {
        string memory longString = "This is a very long string that exceeds normal length limits and should be handled properly by the contract without causing issues";
        
        // Should work as contract doesn't enforce length limits
        vm.prank(admin);
        stakeholder.updateInfo(longString, longString, longString);
        
        assertEq(stakeholder.businessName(), longString);
        assertEq(stakeholder.location(), longString);
        assertEq(stakeholder.certifications(), longString);
    }

    /**
     * @dev Test event emissions
     */
    function testEventEmissions() public {
        // Test StakeholderUpdated event
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderUpdated("New Business", "New Location", "New Certs", block.timestamp);
        stakeholder.updateInfo("New Business", "New Location", "New Certs");
        
        // Test StakeholderDeactivated event
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderDeactivated(block.timestamp);
        stakeholder.deactivate();
        
        // Test StakeholderReactivated event
        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit StakeholderReactivated(block.timestamp);
        stakeholder.reactivate();
    }

    /**
     * @dev Test state consistency after operations
     */
    function testStateConsistency() public {
        // Initial state
        uint256 initialRegistered = stakeholder.registeredAt();
        uint256 initialActivity = stakeholder.lastActivity();
        
        // Registration time should never change
        vm.prank(admin);
        stakeholder.updateInfo("New Business", "New Location", "New Certs");
        assertEq(stakeholder.registeredAt(), initialRegistered);
        
        // Activity should update
        assertTrue(stakeholder.lastActivity() >= initialActivity);
        
        // Deactivate/reactivate shouldn't change registration time
        vm.prank(admin);
        stakeholder.deactivate();
        assertEq(stakeholder.registeredAt(), initialRegistered);
        
        vm.prank(admin);
        stakeholder.reactivate();
        assertEq(stakeholder.registeredAt(), initialRegistered);
    }

    /**
     * @dev Test all fields are immutable except those that should be mutable
     */
    function testFieldImmutability() public {
        // Store initial values
        address initialStakeholderAddr = stakeholder.stakeholderAddress();
        Stakeholder.StakeholderRole initialRole = stakeholder.role();
        string memory initialLicense = stakeholder.businessLicense();
        address initialAdmin = stakeholder.admin();
        uint256 initialRegistered = stakeholder.registeredAt();
        
        // Perform various operations
        vm.startPrank(admin);
        stakeholder.updateInfo("New Business", "New Location", "New Certs");
        stakeholder.deactivate();
        stakeholder.reactivate();
        vm.stopPrank();
        
        // Verify immutable fields haven't changed
        assertEq(stakeholder.stakeholderAddress(), initialStakeholderAddr);
        assertEq(uint8(stakeholder.role()), uint8(initialRole));
        assertEq(stakeholder.businessLicense(), initialLicense);
        assertEq(stakeholder.admin(), initialAdmin);
        assertEq(stakeholder.registeredAt(), initialRegistered);
        
        // Verify mutable fields have changed appropriately
        assertEq(stakeholder.businessName(), "New Business");
        assertEq(stakeholder.location(), "New Location");
        assertEq(stakeholder.certifications(), "New Certs");
        assertTrue(stakeholder.isActive()); // Should be active after reactivate
    }
}
