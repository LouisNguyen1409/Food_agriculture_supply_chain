// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/StakeholderManager.sol";

contract StakeholderManagerTest is Test {
    StakeholderManager public stakeholderManager;
    
    // Test addresses
    address admin = address(0x1);
    address farmer1 = address(0x2);
    address farmer2 = address(0x3);
    address processor1 = address(0x4);
    address distributor1 = address(0x5);
    address retailer1 = address(0x6);
    address unauthorized = address(0x7);
    
    // Sample data
    string constant FARMER_NAME = "Fresh Farm Co";
    string constant FARMER_LICENSE = "FARM001";
    string constant FARMER_LOCATION = "California, USA";
    string constant FARMER_CERTS = "Organic Certified";
    
    string constant PROCESSOR_NAME = "Food Processing Inc";
    string constant PROCESSOR_LICENSE = "PROC001";
    string constant PROCESSOR_LOCATION = "Texas, USA";
    string constant PROCESSOR_CERTS = "FDA Approved";
    
    // Events to test
    event StakeholderRegistered(
        address indexed stakeholderAddress,
        StakeholderManager.StakeholderRole indexed role,
        string businessName,
        string businessLicense,
        uint256 timestamp
    );
    
    event StakeholderUpdated(
        address indexed stakeholderAddress,
        string businessName,
        string location,
        string certifications,
        uint256 timestamp
    );
    
    event StakeholderDeactivated(
        address indexed stakeholderAddress,
        uint256 timestamp
    );
    
    event StakeholderReactivated(
        address indexed stakeholderAddress,
        uint256 timestamp
    );

    function setUp() public {
        vm.startPrank(admin);
        stakeholderManager = new StakeholderManager();
        vm.stopPrank();
    }

    // ===== CONSTRUCTOR TESTS =====
    
    function testConstructor() public {
        assertEq(stakeholderManager.admin(), admin);
        assertEq(stakeholderManager.totalStakeholders(), 0);
    }

    // ===== REGISTRATION TESTS =====
    
    function testRegisterStakeholder() public {
        vm.startPrank(admin);
        
        vm.expectEmit(true, true, false, true);
        emit StakeholderRegistered(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            block.timestamp
        );
        
        bool success = stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        assertTrue(success);
        assertTrue(stakeholderManager.isRegistered(farmer1));
        assertEq(stakeholderManager.totalStakeholders(), 1);
        assertEq(stakeholderManager.licenseToAddress(FARMER_LICENSE), farmer1);
        
        vm.stopPrank();
    }
    
    function testRegisterMultipleStakeholders() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        assertEq(stakeholderManager.totalStakeholders(), 2);
        assertTrue(stakeholderManager.isRegistered(farmer1));
        assertTrue(stakeholderManager.isRegistered(processor1));
        
        vm.stopPrank();
    }

    function testRegisterStakeholderFailsWithZeroAddress() public {
        vm.startPrank(admin);
        
        vm.expectRevert("Invalid address");
        stakeholderManager.registerStakeholder(
            address(0),
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
    }
    
    function testRegisterStakeholderFailsWithEmptyName() public {
        vm.startPrank(admin);
        
        vm.expectRevert("Business name required");
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            "",
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
    }
    
    function testRegisterStakeholderFailsWithEmptyLicense() public {
        vm.startPrank(admin);
        
        vm.expectRevert("Business license required");
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            "",
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
    }
    
    function testRegisterStakeholderFailsWithDuplicateAddress() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.expectRevert("Already registered");
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        vm.stopPrank();
    }
    
    function testRegisterStakeholderFailsWithDuplicateLicense() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.expectRevert("License already exists");
        stakeholderManager.registerStakeholder(
            farmer2,
            StakeholderManager.StakeholderRole.FARMER,
            "Another Farm",
            FARMER_LICENSE, // Same license
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
    }
    
    function testRegisterStakeholderFailsWhenNotAdmin() public {
        vm.startPrank(unauthorized);
        
        vm.expectRevert("Only admin can call this function");
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
    }

    // ===== ROLE CHECKING TESTS =====
    
    function testHasRole() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        assertTrue(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.FARMER));
        assertFalse(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.PROCESSOR));
        assertFalse(stakeholderManager.hasRole(unauthorized, StakeholderManager.StakeholderRole.FARMER));
        
        vm.stopPrank();
    }
    
    function testHasRoleAfterDeactivation() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        assertTrue(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.FARMER));
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        assertFalse(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.FARMER));
        
        vm.stopPrank();
    }

    // ===== UPDATE TESTS =====
    
    function testUpdateStakeholderInfoByAdmin() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        string memory newName = "Updated Farm Name";
        string memory newLocation = "New Location";
        string memory newCerts = "New Certifications";
        
        vm.expectEmit(true, false, false, true);
        emit StakeholderUpdated(farmer1, newName, newLocation, newCerts, block.timestamp);
        
        stakeholderManager.updateStakeholderInfo(
            farmer1,
            newName,
            newLocation,
            newCerts
        );
        
        vm.stopPrank();
    }
    
    function testUpdateStakeholderInfoBySelf() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(farmer1);
        
        string memory newName = "Self Updated Farm";
        string memory newLocation = "Self Updated Location";
        string memory newCerts = "Self Updated Certs";
        
        stakeholderManager.updateStakeholderInfo(
            farmer1,
            newName,
            newLocation,
            newCerts
        );
        
        vm.stopPrank();
    }
    
    function testUpdateStakeholderInfoFailsWhenUnauthorized() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(unauthorized);
        
        vm.expectRevert("Unauthorized to update");
        stakeholderManager.updateStakeholderInfo(
            farmer1,
            "Unauthorized Update",
            "Unauthorized Location",
            "Unauthorized Certs"
        );
        
        vm.stopPrank();
    }
    
    function testUpdateStakeholderInfoFailsWithEmptyName() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.expectRevert("Business name required");
        stakeholderManager.updateStakeholderInfo(
            farmer1,
            "",
            "New Location",
            "New Certs"
        );
        
        vm.stopPrank();
    }
    
    function testUpdateStakeholderInfoFailsWhenDeactivated() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        vm.expectRevert("Stakeholder not active");
        stakeholderManager.updateStakeholderInfo(
            farmer1,
            "New Name",
            "New Location",
            "New Certs"
        );
        
        vm.stopPrank();
    }

    // ===== ACTIVATION/DEACTIVATION TESTS =====
    
    function testDeactivateStakeholder() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.expectEmit(true, false, false, true);
        emit StakeholderDeactivated(farmer1, block.timestamp);
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        assertFalse(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.FARMER));
        
        vm.stopPrank();
    }
    
    function testDeactivateStakeholderFailsWhenNotAdmin() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(unauthorized);
        
        vm.expectRevert("Only admin can call this function");
        stakeholderManager.deactivateStakeholder(farmer1);
        
        vm.stopPrank();
    }
    
    function testDeactivateStakeholderFailsWhenAlreadyInactive() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        vm.expectRevert("Already inactive");
        stakeholderManager.deactivateStakeholder(farmer1);
        
        vm.stopPrank();
    }
    
    function testReactivateStakeholder() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        vm.expectEmit(true, false, false, true);
        emit StakeholderReactivated(farmer1, block.timestamp);
        
        stakeholderManager.reactivateStakeholder(farmer1);
        
        assertTrue(stakeholderManager.hasRole(farmer1, StakeholderManager.StakeholderRole.FARMER));
        
        vm.stopPrank();
    }
    
    function testReactivateStakeholderFailsWhenAlreadyActive() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.expectRevert("Already active");
        stakeholderManager.reactivateStakeholder(farmer1);
        
        vm.stopPrank();
    }

    // ===== INFORMATION RETRIEVAL TESTS =====
    
    function testGetStakeholderInfoAsAdmin() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        StakeholderManager.StakeholderInfo memory info = stakeholderManager.getStakeholderInfo(farmer1);
        
        assertEq(info.stakeholderAddress, farmer1);
        assertEq(uint8(info.role), uint8(StakeholderManager.StakeholderRole.FARMER));
        assertEq(info.businessName, FARMER_NAME);
        assertEq(info.businessLicense, FARMER_LICENSE);
        assertEq(info.location, FARMER_LOCATION);
        assertEq(info.certifications, FARMER_CERTS);
        assertTrue(info.isActive);
        assertTrue(info.registeredAt > 0);
        assertTrue(info.lastActivity > 0);
        
        vm.stopPrank();
    }
    
    function testGetStakeholderInfoAsRegisteredStakeholder() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(farmer1);
        
        StakeholderManager.StakeholderInfo memory info = stakeholderManager.getStakeholderInfo(processor1);
        assertEq(info.stakeholderAddress, processor1);
        
        vm.stopPrank();
    }
    
    function testGetStakeholderInfoFailsWhenUnauthorized() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(unauthorized);
        
        vm.expectRevert("Permission denied");
        stakeholderManager.getStakeholderInfo(farmer1);
        
        vm.stopPrank();
    }

    // ===== ROLE-BASED QUERIES =====
    
    function testGetStakeholdersByRole() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            farmer2,
            StakeholderManager.StakeholderRole.FARMER,
            "Farm 2",
            "FARM002",
            "Location 2",
            "Certs 2"
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        address[] memory farmers = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole.FARMER);
        address[] memory processors = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole.PROCESSOR);
        address[] memory distributors = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole.DISTRIBUTOR);
        
        assertEq(farmers.length, 2);
        assertEq(processors.length, 1);
        assertEq(distributors.length, 0);
        
        assertTrue(farmers[0] == farmer1 || farmers[1] == farmer1);
        assertTrue(farmers[0] == farmer2 || farmers[1] == farmer2);
        assertEq(processors[0], processor1);
        
        vm.stopPrank();
    }
    
    function testGetStakeholdersByRoleExcludesInactive() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            farmer2,
            StakeholderManager.StakeholderRole.FARMER,
            "Farm 2",
            "FARM002",
            "Location 2",
            "Certs 2"
        );
        
        stakeholderManager.deactivateStakeholder(farmer1);
        
        address[] memory farmers = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole.FARMER);
        
        assertEq(farmers.length, 1);
        assertEq(farmers[0], farmer2);
        
        vm.stopPrank();
    }

    // ===== SEARCH TESTS =====
    
    function testSearchByBusinessName() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            "Fresh Farm Co",
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            farmer2,
            StakeholderManager.StakeholderRole.FARMER,
            "Green Farm Ltd",
            "FARM002",
            "Location 2",
            "Certs 2"
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            "Farm Processing Inc",
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        address[] memory farmResults = stakeholderManager.searchByBusinessName("Farm");
        assertEq(farmResults.length, 3);
        
        address[] memory freshResults = stakeholderManager.searchByBusinessName("Fresh");
        assertEq(freshResults.length, 1);
        assertEq(freshResults[0], farmer1);
        
        address[] memory noResults = stakeholderManager.searchByBusinessName("NonExistent");
        assertEq(noResults.length, 0);
        
        vm.stopPrank();
    }

    // ===== BATCH OPERATIONS =====
    
    function testGetBatchStakeholderInfo() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        address[] memory addresses = new address[](3);
        addresses[0] = farmer1;
        addresses[1] = processor1;
        addresses[2] = unauthorized;
        
        StakeholderManager.StakeholderInfo[] memory results = stakeholderManager.getBatchStakeholderInfo(addresses);
        
        assertEq(results.length, 3);
        assertEq(results[0].stakeholderAddress, farmer1);
        assertEq(results[1].stakeholderAddress, processor1);
        assertEq(results[2].stakeholderAddress, address(0)); // Empty for unauthorized
        
        vm.stopPrank();
    }

    // ===== ACTIVITY TRACKING =====
    
    function testUpdateActivity() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(farmer1);
        
        // Get initial activity timestamp through tuple destructuring
        (,,,,,, bool isActive1, uint256 registeredAt1, uint256 initialActivity) = stakeholderManager.stakeholders(farmer1);
        
        vm.warp(block.timestamp + 1000);
        
        stakeholderManager.updateActivity();
        
        // Get updated activity timestamp
        (,,,,,, bool isActive2, uint256 registeredAt2, uint256 newActivity) = stakeholderManager.stakeholders(farmer1);
        assertTrue(newActivity > initialActivity);
        
        vm.stopPrank();
    }
    
    function testUpdateActivityFailsWhenNotRegistered() public {
        vm.startPrank(unauthorized);
        
        vm.expectRevert("Not a registered stakeholder");
        stakeholderManager.updateActivity();
        
        vm.stopPrank();
    }

    // ===== VIEW FUNCTIONS =====
    
    function testGetAllViewableStakeholders() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        address[] memory allStakeholders = stakeholderManager.getAllViewableStakeholders();
        assertEq(allStakeholders.length, 2);
        
        vm.stopPrank();
    }
    
    function testGetAllViewableStakeholdersAsUnauthorized() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(unauthorized);
        
        address[] memory allStakeholders = stakeholderManager.getAllViewableStakeholders();
        assertEq(allStakeholders.length, 0);
        
        vm.stopPrank();
    }
    
    function testGetAllStakeholdersRoles() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        stakeholderManager.registerStakeholder(
            processor1,
            StakeholderManager.StakeholderRole.PROCESSOR,
            PROCESSOR_NAME,
            PROCESSOR_LICENSE,
            PROCESSOR_LOCATION,
            PROCESSOR_CERTS
        );
        
        StakeholderManager.StakeholderRole[] memory roles = stakeholderManager.getAllStakeholdersRoles();
        assertEq(roles.length, 2);
        assertEq(uint8(roles[0]), uint8(StakeholderManager.StakeholderRole.FARMER));
        assertEq(uint8(roles[1]), uint8(StakeholderManager.StakeholderRole.PROCESSOR));
        
        vm.stopPrank();
    }

    // ===== EDGE CASES AND SECURITY =====
    
    function testPermissionSystem() public {
        vm.startPrank(admin);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        vm.stopPrank();
        vm.startPrank(unauthorized);
        
        // Unauthorized user should not be able to view
        address[] memory viewableStakeholders = stakeholderManager.getAllViewableStakeholders();
        assertEq(viewableStakeholders.length, 0);
        
        address[] memory farmersFromUnauth = stakeholderManager.getStakeholdersByRole(StakeholderManager.StakeholderRole.FARMER);
        assertEq(farmersFromUnauth.length, 0);
        
        address[] memory searchResults = stakeholderManager.searchByBusinessName("Fresh");
        assertEq(searchResults.length, 0);
        
        vm.stopPrank();
    }
    
    function testRoleCountTracking() public {
        vm.startPrank(admin);
        
        assertEq(stakeholderManager.roleCount(StakeholderManager.StakeholderRole.FARMER), 0);
        
        stakeholderManager.registerStakeholder(
            farmer1,
            StakeholderManager.StakeholderRole.FARMER,
            FARMER_NAME,
            FARMER_LICENSE,
            FARMER_LOCATION,
            FARMER_CERTS
        );
        
        assertEq(stakeholderManager.roleCount(StakeholderManager.StakeholderRole.FARMER), 1);
        
        stakeholderManager.registerStakeholder(
            farmer2,
            StakeholderManager.StakeholderRole.FARMER,
            "Farm 2",
            "FARM002",
            "Location 2",
            "Certs 2"
        );
        
        assertEq(stakeholderManager.roleCount(StakeholderManager.StakeholderRole.FARMER), 2);
        assertEq(stakeholderManager.roleCount(StakeholderManager.StakeholderRole.PROCESSOR), 0);
        
        vm.stopPrank();
    }
}
