// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";

contract StakeholderRegistryFuzz is Test {
    StakeholderRegistry stakeholderRegistry;
    
    address admin = address(0x1);
    address farmer = address(0x2);
    address processor = address(0x3);
    address distributor = address(0x4);
    address retailer = address(0x5);
    address nonAdmin = address(0x6);

    function setUp() public {
        vm.prank(admin);
        stakeholderRegistry = new StakeholderRegistry();
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test constructor sets admin correctly
     */
    function testConstructorSetsAdmin() public {
        assertEq(stakeholderRegistry.admin(), admin);
        assertEq(stakeholderRegistry.totalStakeholders(), 0);
    }

    // ===== STAKEHOLDER REGISTRATION TESTS =====

    /**
     * @dev Test successful stakeholder registration
     */
    function testFuzzRegisterStakeholder(
        string memory businessName,
        string memory businessLicense,
        string memory location,
        string memory certifications
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(location).length > 0);
        vm.assume(bytes(certifications).length > 0);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit StakeholderRegistered(farmer, StakeholderRegistry.StakeholderRole.FARMER, businessName, block.timestamp);
        
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            location,
            certifications
        );

        // Verify registration
        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertEq(info.stakeholderAddress, farmer);
        assertEq(uint(info.role), uint(StakeholderRegistry.StakeholderRole.FARMER));
        assertEq(info.businessName, businessName);
        assertEq(info.businessLicense, businessLicense);
        assertEq(info.location, location);
        assertEq(info.certifications, certifications);
        assertTrue(info.isActive);
        assertTrue(info.registeredAt > 0);
        assertTrue(info.lastActivity > 0);

        // Verify license mapping
        assertEq(stakeholderRegistry.licenseToAddress(businessLicense), farmer);

        // Verify role mapping
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.FARMER);
        assertEq(farmers.length, 1);
        assertEq(farmers[0], farmer);

        // Verify total count
        assertEq(stakeholderRegistry.totalStakeholders(), 1);
    }

    /**
     * @dev Test registration of all stakeholder roles
     */
    function testFuzzRegisterAllRoles(
        string memory businessName1,
        string memory businessName2,
        string memory businessName3,
        string memory businessName4,
        string memory license1,
        string memory license2,
        string memory license3,
        string memory license4
    ) public {
        vm.assume(bytes(businessName1).length > 0 && bytes(businessName2).length > 0);
        vm.assume(bytes(businessName3).length > 0 && bytes(businessName4).length > 0);
        vm.assume(bytes(license1).length > 0 && bytes(license2).length > 0);
        vm.assume(bytes(license3).length > 0 && bytes(license4).length > 0);
        vm.assume(keccak256(bytes(license1)) != keccak256(bytes(license2)));
        vm.assume(keccak256(bytes(license1)) != keccak256(bytes(license3)));
        vm.assume(keccak256(bytes(license1)) != keccak256(bytes(license4)));
        vm.assume(keccak256(bytes(license2)) != keccak256(bytes(license3)));
        vm.assume(keccak256(bytes(license2)) != keccak256(bytes(license4)));
        vm.assume(keccak256(bytes(license3)) != keccak256(bytes(license4)));

        vm.startPrank(admin);

        // Register farmer
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName1,
            license1,
            "Farm Location",
            "Organic Cert"
        );

        // Register processor
        stakeholderRegistry.registerStakeholder(
            processor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            businessName2,
            license2,
            "Processing Facility",
            "Food Safety Cert"
        );

        // Register distributor
        stakeholderRegistry.registerStakeholder(
            distributor,
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR,
            businessName3,
            license3,
            "Distribution Center",
            "Transport Cert"
        );

        // Register retailer
        stakeholderRegistry.registerStakeholder(
            retailer,
            StakeholderRegistry.StakeholderRole.RETAILER,
            businessName4,
            license4,
            "Retail Store",
            "Retail License"
        );

        vm.stopPrank();

        // Verify all registrations
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(processor, StakeholderRegistry.StakeholderRole.PROCESSOR));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(distributor, StakeholderRegistry.StakeholderRole.DISTRIBUTOR));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(retailer, StakeholderRegistry.StakeholderRole.RETAILER));

        // Verify role arrays
        assertEq(stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.FARMER).length, 1);
        assertEq(stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.PROCESSOR).length, 1);
        assertEq(stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.DISTRIBUTOR).length, 1);
        assertEq(stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.RETAILER).length, 1);

        // Verify total count
        assertEq(stakeholderRegistry.totalStakeholders(), 4);
    }

    /**
     * @dev Test registration access control - only admin can register
     */
    function testFuzzRegisterStakeholderAccessControl(
        address caller,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(caller != admin);
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.expectRevert("Only admin can call this function");
        vm.prank(caller);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );
    }

    /**
     * @dev Test registration with zero address fails
     */
    function testFuzzRegisterStakeholderZeroAddress(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.expectRevert("Invalid stakeholder address");
        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            address(0),
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );
    }

    /**
     * @dev Test registration of already registered stakeholder fails
     */
    function testFuzzRegisterStakeholderAlreadyRegistered(
        string memory businessName,
        string memory businessLicense1,
        string memory businessLicense2
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense1).length > 0);
        vm.assume(bytes(businessLicense2).length > 0);
        vm.assume(keccak256(bytes(businessLicense1)) != keccak256(bytes(businessLicense2)));

        vm.startPrank(admin);

        // First registration should succeed
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense1,
            "Location",
            "Certs"
        );

        // Second registration with same address should fail
        vm.expectRevert("Stakeholder already registered");
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            businessName,
            businessLicense2,
            "Location",
            "Certs"
        );

        vm.stopPrank();
    }

    /**
     * @dev Test registration with duplicate business license fails
     */
    function testFuzzRegisterStakeholderDuplicateLicense(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.startPrank(admin);

        // First registration should succeed
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Second registration with same license should fail
        vm.expectRevert("Business license already registered");
        stakeholderRegistry.registerStakeholder(
            processor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        vm.stopPrank();
    }

    /**
     * @dev Test multiple stakeholders with same role
     */
    function testFuzzMultipleStakeholdersSameRole(
        string memory businessName1,
        string memory businessName2,
        string memory license1,
        string memory license2
    ) public {
        vm.assume(bytes(businessName1).length > 0 && bytes(businessName2).length > 0);
        vm.assume(bytes(license1).length > 0 && bytes(license2).length > 0);
        vm.assume(keccak256(bytes(license1)) != keccak256(bytes(license2)));

        address farmer1 = farmer;
        address farmer2 = address(0x10);

        vm.startPrank(admin);

        // Register first farmer
        stakeholderRegistry.registerStakeholder(
            farmer1,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName1,
            license1,
            "Location 1",
            "Certs 1"
        );

        // Register second farmer
        stakeholderRegistry.registerStakeholder(
            farmer2,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName2,
            license2,
            "Location 2",
            "Certs 2"
        );

        vm.stopPrank();

        // Verify both are registered
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer1, StakeholderRegistry.StakeholderRole.FARMER));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer2, StakeholderRegistry.StakeholderRole.FARMER));

        // Verify role array contains both
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.FARMER);
        assertEq(farmers.length, 2);
        assertTrue(farmers[0] == farmer1 || farmers[1] == farmer1);
        assertTrue(farmers[0] == farmer2 || farmers[1] == farmer2);

        assertEq(stakeholderRegistry.totalStakeholders(), 2);
    }

    // ===== STAKEHOLDER QUERY TESTS =====

    /**
     * @dev Test isRegisteredStakeholder function
     */
    function testFuzzIsRegisteredStakeholder(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        // Should return false before registration
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.PROCESSOR));

        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Should return true for correct role
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));
        
        // Should return false for incorrect role
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.PROCESSOR));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.DISTRIBUTOR));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.RETAILER));

        // Should return false for unregistered address
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(processor, StakeholderRegistry.StakeholderRole.FARMER));
    }

    /**
     * @dev Test isActiveStakeholder function
     */
    function testFuzzIsActiveStakeholder(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        // Should return false before registration
        assertFalse(stakeholderRegistry.isActiveStakeholder(farmer));

        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Should return true after registration
        assertTrue(stakeholderRegistry.isActiveStakeholder(farmer));

        // Should return false for unregistered address
        assertFalse(stakeholderRegistry.isActiveStakeholder(processor));
    }

    /**
     * @dev Test getStakeholderInfo for non-existent stakeholder
     */
    function testFuzzGetStakeholderInfoNonExistent(address stakeholder) public {
        vm.assume(stakeholder != address(0));
        
        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(stakeholder);
        assertEq(info.stakeholderAddress, address(0));
        assertFalse(info.isActive);
        assertEq(info.registeredAt, 0);
        assertEq(info.lastActivity, 0);
    }

    /**
     * @dev Test getStakeholdersByRole for empty role
     */
    function testFuzzGetStakeholdersByRoleEmpty() public {
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.FARMER);
        assertEq(farmers.length, 0);

        address[] memory processors = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.PROCESSOR);
        assertEq(processors.length, 0);

        address[] memory distributors = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.DISTRIBUTOR);
        assertEq(distributors.length, 0);

        address[] memory retailers = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.RETAILER);
        assertEq(retailers.length, 0);
    }

    // ===== UPDATE ACTIVITY TESTS =====

    /**
     * @dev Test updateLastActivity function
     */
    function testFuzzUpdateLastActivity(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        uint256 initialActivity = stakeholderRegistry.getStakeholderInfo(farmer).lastActivity;

        // Advance time
        vm.warp(block.timestamp + 1000);

        vm.expectEmit(true, false, false, true);
        emit StakeholderUpdated(farmer, block.timestamp);

        stakeholderRegistry.updateLastActivity(farmer);

        uint256 newActivity = stakeholderRegistry.getStakeholderInfo(farmer).lastActivity;
        assertTrue(newActivity > initialActivity);
        assertEq(newActivity, block.timestamp);
    }

    /**
     * @dev Test updateLastActivity for inactive stakeholder fails
     */
    function testFuzzUpdateLastActivityInactive(address stakeholder) public {
        vm.assume(stakeholder != address(0));

        vm.expectRevert("Stakeholder is not active");
        stakeholderRegistry.updateLastActivity(stakeholder);
    }

    // ===== UPDATE STAKEHOLDER INFO TESTS =====

    /**
     * @dev Test updateStakeholderInfo function
     */
    function testFuzzUpdateStakeholderInfo(
        string memory businessName,
        string memory businessLicense,
        string memory newBusinessName,
        string memory newLocation,
        string memory newCertifications
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(newBusinessName).length > 0);
        vm.assume(bytes(newLocation).length > 0);
        vm.assume(bytes(newCertifications).length > 0);

        vm.startPrank(admin);

        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Original Location",
            "Original Certs"
        );

        uint256 initialActivity = stakeholderRegistry.getStakeholderInfo(farmer).lastActivity;

        // Advance time
        vm.warp(block.timestamp + 1000);

        vm.expectEmit(true, false, false, true);
        emit StakeholderUpdated(farmer, block.timestamp);

        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            newBusinessName,
            newLocation,
            newCertifications
        );

        vm.stopPrank();

        // Verify updates
        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertEq(info.businessName, newBusinessName);
        assertEq(info.location, newLocation);
        assertEq(info.certifications, newCertifications);
        assertTrue(info.lastActivity > initialActivity);

        // Verify unchangeable fields remain the same
        assertEq(info.stakeholderAddress, farmer);
        assertEq(uint(info.role), uint(StakeholderRegistry.StakeholderRole.FARMER));
        assertEq(info.businessLicense, businessLicense);
        assertTrue(info.isActive);
    }

    /**
     * @dev Test updateStakeholderInfo access control
     */
    function testFuzzUpdateStakeholderInfoAccessControl(
        address caller,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(caller != admin);
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        vm.expectRevert("Only admin can call this function");
        vm.prank(caller);
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            "New Name",
            "New Location",
            "New Certs"
        );
    }

    /**
     * @dev Test updateStakeholderInfo for inactive stakeholder
     */
    function testFuzzUpdateStakeholderInfoInactive(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.startPrank(admin);

        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Deactivate stakeholder
        stakeholderRegistry.deactivateStakeholder(farmer);

        // Try to update - should fail
        vm.expectRevert("Stakeholder is not active");
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            "New Name",
            "New Location",
            "New Certs"
        );

        vm.stopPrank();
    }

    // ===== DEACTIVATION TESTS =====

    /**
     * @dev Test deactivateStakeholder function
     */
    function testFuzzDeactivateStakeholder(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.startPrank(admin);

        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Verify active before deactivation
        assertTrue(stakeholderRegistry.isActiveStakeholder(farmer));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));

        vm.expectEmit(true, false, false, true);
        emit StakeholderDeactivated(farmer, block.timestamp);

        stakeholderRegistry.deactivateStakeholder(farmer);

        vm.stopPrank();

        // Verify deactivation
        assertFalse(stakeholderRegistry.isActiveStakeholder(farmer));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));

        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertFalse(info.isActive);
        // Other fields should remain unchanged
        assertEq(info.stakeholderAddress, farmer);
        assertEq(uint(info.role), uint(StakeholderRegistry.StakeholderRole.FARMER));
        assertEq(info.businessName, businessName);
        assertEq(info.businessLicense, businessLicense);
    }

    /**
     * @dev Test deactivateStakeholder access control
     */
    function testFuzzDeactivateStakeholderAccessControl(
        address caller,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(caller != admin);
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        vm.expectRevert("Only admin can call this function");
        vm.prank(caller);
        stakeholderRegistry.deactivateStakeholder(farmer);
    }

    /**
     * @dev Test deactivateStakeholder for already inactive stakeholder
     */
    function testFuzzDeactivateStakeholderAlreadyInactive(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.startPrank(admin);

        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // First deactivation should succeed
        stakeholderRegistry.deactivateStakeholder(farmer);

        // Second deactivation should fail
        vm.expectRevert("Stakeholder is not active");
        stakeholderRegistry.deactivateStakeholder(farmer);

        vm.stopPrank();
    }

    /**
     * @dev Test deactivateStakeholder for non-existent stakeholder
     */
    function testFuzzDeactivateStakeholderNonExistent(address stakeholder) public {
        vm.assume(stakeholder != address(0));

        vm.expectRevert("Stakeholder is not active");
        vm.prank(admin);
        stakeholderRegistry.deactivateStakeholder(stakeholder);
    }

    // ===== ADMIN TRANSFER TESTS =====

    /**
     * @dev Test transferAdmin function
     */
    function testFuzzTransferAdmin(address newAdmin) public {
        vm.assume(newAdmin != address(0));
        vm.assume(newAdmin != admin);

        assertEq(stakeholderRegistry.admin(), admin);

        vm.prank(admin);
        stakeholderRegistry.transferAdmin(newAdmin);

        assertEq(stakeholderRegistry.admin(), newAdmin);
    }

    /**
     * @dev Test transferAdmin access control
     */
    function testFuzzTransferAdminAccessControl(address caller, address newAdmin) public {
        vm.assume(caller != admin);
        vm.assume(newAdmin != address(0));

        vm.expectRevert("Only admin can call this function");
        vm.prank(caller);
        stakeholderRegistry.transferAdmin(newAdmin);
    }

    /**
     * @dev Test transferAdmin with zero address
     */
    function testFuzzTransferAdminZeroAddress() public {
        vm.expectRevert("Invalid new admin address");
        vm.prank(admin);
        stakeholderRegistry.transferAdmin(address(0));
    }

    /**
     * @dev Test admin functions after transfer
     */
    function testFuzzAdminFunctionsAfterTransfer(
        address newAdmin,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(newAdmin != address(0));
        vm.assume(newAdmin != admin);
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        // Transfer admin
        vm.prank(admin);
        stakeholderRegistry.transferAdmin(newAdmin);

        // Old admin should not be able to register stakeholders
        vm.expectRevert("Only admin can call this function");
        vm.prank(admin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // New admin should be able to register stakeholders
        vm.prank(newAdmin);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        assertTrue(stakeholderRegistry.isActiveStakeholder(farmer));
    }

    // ===== COMPLEX WORKFLOW TESTS =====

    /**
     * @dev Test complete stakeholder lifecycle
     */
    function testFuzzCompleteStakeholderLifecycle(
        string memory businessName,
        string memory businessLicense,
        string memory newLocation,
        string memory newCerts
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(newLocation).length > 0);
        vm.assume(bytes(newCerts).length > 0);

        vm.startPrank(admin);

        // 1. Register stakeholder
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Original Location",
            "Original Certs"
        );

        // 2. Verify registration
        assertTrue(stakeholderRegistry.isActiveStakeholder(farmer));
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));
        assertEq(stakeholderRegistry.totalStakeholders(), 1);

        // 3. Update activity
        uint256 initialActivity = stakeholderRegistry.getStakeholderInfo(farmer).lastActivity;
        vm.warp(block.timestamp + 100);
        
        vm.stopPrank();
        stakeholderRegistry.updateLastActivity(farmer);
        vm.startPrank(admin);

        assertTrue(stakeholderRegistry.getStakeholderInfo(farmer).lastActivity > initialActivity);

        // 4. Update stakeholder info
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            businessName,
            newLocation,
            newCerts
        );

        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertEq(info.location, newLocation);
        assertEq(info.certifications, newCerts);

        // 5. Deactivate stakeholder
        stakeholderRegistry.deactivateStakeholder(farmer);

        assertFalse(stakeholderRegistry.isActiveStakeholder(farmer));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(farmer, StakeholderRegistry.StakeholderRole.FARMER));

        vm.stopPrank();

        // 6. Verify functions fail for inactive stakeholder
        vm.expectRevert("Stakeholder is not active");
        stakeholderRegistry.updateLastActivity(farmer);

        vm.expectRevert("Stakeholder is not active");
        vm.prank(admin);
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            businessName,
            newLocation,
            newCerts
        );
    }

    /**
     * @dev Test edge cases with empty strings
     */
    function testFuzzEmptyStringHandling() public {
        vm.startPrank(admin);

        // Should allow empty strings for optional fields
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            "Business Name",
            "License123",
            "", // Empty location
            "" // Empty certifications
        );

        StakeholderRegistry.StakeholderInfo memory info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertEq(info.location, "");
        assertEq(info.certifications, "");
        assertTrue(info.isActive);

        // Should allow updating with empty strings
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            "Updated Name",
            "", // Empty location
            "" // Empty certifications
        );

        info = stakeholderRegistry.getStakeholderInfo(farmer);
        assertEq(info.businessName, "Updated Name");
        assertEq(info.location, "");
        assertEq(info.certifications, "");

        vm.stopPrank();
    }

    /**
     * @dev Test gas efficiency with multiple stakeholders
     */
    function testFuzzGasEfficiencyMultipleStakeholders() public {
        vm.startPrank(admin);

        // Register 10 stakeholders
        for (uint i = 0; i < 10; i++) {
            address stakeholder = address(uint160(0x1000 + i));
            stakeholderRegistry.registerStakeholder(
                stakeholder,
                StakeholderRegistry.StakeholderRole.FARMER,
                string(abi.encodePacked("Business", i)),
                string(abi.encodePacked("License", i)),
                string(abi.encodePacked("Location", i)),
                string(abi.encodePacked("Certs", i))
            );
        }

        // Verify all stakeholders are registered
        assertEq(stakeholderRegistry.totalStakeholders(), 10);
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(StakeholderRegistry.StakeholderRole.FARMER);
        assertEq(farmers.length, 10);

        vm.stopPrank();
    }

    // ===== EVENT EMISSION TESTS =====

    /**
     * @dev Define events for testing
     */
    event StakeholderRegistered(
        address indexed stakeholder,
        StakeholderRegistry.StakeholderRole indexed role,
        string businessName,
        uint256 timestamp
    );

    event StakeholderUpdated(address indexed stakeholder, uint256 timestamp);

    event StakeholderDeactivated(
        address indexed stakeholder,
        uint256 timestamp
    );

    /**
     * @dev Test event emissions are correct
     */
    function testFuzzEventEmissions(
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);

        vm.startPrank(admin);

        // Test StakeholderRegistered event
        vm.expectEmit(true, true, false, true);
        emit StakeholderRegistered(farmer, StakeholderRegistry.StakeholderRole.FARMER, businessName, block.timestamp);
        
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certs"
        );

        // Test StakeholderUpdated event from updateStakeholderInfo
        vm.expectEmit(true, false, false, true);
        emit StakeholderUpdated(farmer, block.timestamp);
        
        stakeholderRegistry.updateStakeholderInfo(
            farmer,
            "New Name",
            "New Location",
            "New Certs"
        );

        vm.stopPrank();

        // Test StakeholderUpdated event from updateLastActivity
        vm.expectEmit(true, false, false, true);
        emit StakeholderUpdated(farmer, block.timestamp);
        
        stakeholderRegistry.updateLastActivity(farmer);

        // Test StakeholderDeactivated event
        vm.expectEmit(true, false, false, true);
        emit StakeholderDeactivated(farmer, block.timestamp);
        
        vm.prank(admin);
        stakeholderRegistry.deactivateStakeholder(farmer);
    }
}
