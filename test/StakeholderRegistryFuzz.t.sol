// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderFactory.sol";
import "../src/SmartContracts/Stakeholder.sol";

contract StakeholderRegistryFuzz is Test {
    StakeholderRegistry public stakeholderRegistry;
    Registry public registry;
    StakeholderFactory public stakeholderFactory;
    
    address admin = address(0x1);
    address farmer1 = address(0x2);
    address farmer2 = address(0x3);
    address distributor1 = address(0x4);
    address distributor2 = address(0x5);
    address processor1 = address(0x6);
    address retailer1 = address(0x7);
    address unauthorized = address(0x8);
    
    event StakeholderLookupPerformed(
        address indexed stakeholderContract,
        address indexed requester,
        uint256 timestamp
    );

    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy core contracts
        registry = new Registry();
        stakeholderRegistry = new StakeholderRegistry(address(registry));
        stakeholderFactory = new StakeholderFactory(address(registry));
        
        vm.stopPrank();
    }

    // ===== HELPER FUNCTIONS =====

    /**
     * @dev Sanitizes string inputs to handle invalid UTF-8 and length issues
     */
    function _sanitizeString(string memory input, string memory defaultValue) internal pure returns (string memory) {
        bytes memory inputBytes = bytes(input);
        
        // Check if string is empty or too long
        if (inputBytes.length == 0 || inputBytes.length > 50) {
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

    function _createStakeholder(
        address stakeholderAddr,
        Stakeholder.StakeholderRole role,
        string memory name,
        string memory license
    ) internal returns (address) {
        vm.prank(admin);
        return stakeholderFactory.createStakeholder(
            stakeholderAddr,
            role,
            name,
            license,
            "Location",
            "Certifications"
        );
    }

    function _getRandomRole(uint256 seed) internal pure returns (Stakeholder.StakeholderRole) {
        uint8 roleIndex = uint8(seed % 4);
        if (roleIndex == 0) return Stakeholder.StakeholderRole.FARMER;
        if (roleIndex == 1) return Stakeholder.StakeholderRole.DISTRIBUTOR;
        if (roleIndex == 2) return Stakeholder.StakeholderRole.PROCESSOR;
        return Stakeholder.StakeholderRole.RETAILER;
    }

    function _getDifferentRole(Stakeholder.StakeholderRole currentRole) internal pure returns (Stakeholder.StakeholderRole) {
        if (currentRole == Stakeholder.StakeholderRole.FARMER) return Stakeholder.StakeholderRole.DISTRIBUTOR;
        if (currentRole == Stakeholder.StakeholderRole.DISTRIBUTOR) return Stakeholder.StakeholderRole.PROCESSOR;
        if (currentRole == Stakeholder.StakeholderRole.PROCESSOR) return Stakeholder.StakeholderRole.RETAILER;
        return Stakeholder.StakeholderRole.FARMER;
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test StakeholderRegistry constructor with valid registry
     */
    function testFuzzConstructor(address registryAddr) public {
        vm.assume(registryAddr != address(0));
        
        vm.prank(admin);
        StakeholderRegistry newRegistry = new StakeholderRegistry(registryAddr);
        
        assertEq(address(newRegistry.registry()), registryAddr);
        assertEq(newRegistry.admin(), admin);
    }

    /**
     * @dev Test constructor with zero address
     */
    function testConstructorZeroAddress() public {
        vm.prank(admin);
        StakeholderRegistry newRegistry = new StakeholderRegistry(address(0));
        
        // Constructor doesn't validate, but usage would fail
        assertEq(address(newRegistry.registry()), address(0));
    }

    // ===== STAKEHOLDER REGISTRATION CHECKS =====

    /**
     * @dev Test isRegisteredStakeholder with registered stakeholder and correct role
     */
    function testFuzzIsRegisteredStakeholderCorrectRole(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        _createStakeholder(stakeholderAddr, role, name, license);
        
        // Check if registered with correct role
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(stakeholderAddr, role));
    }

    /**
     * @dev Test isRegisteredStakeholder with registered stakeholder but wrong role
     */
    function testFuzzIsRegisteredStakeholderWrongRole(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole actualRole = _getRandomRole(roleSeed);
        Stakeholder.StakeholderRole wrongRole = _getDifferentRole(actualRole);
        
        // Create stakeholder
        _createStakeholder(stakeholderAddr, actualRole, name, license);
        
        // Check if registered with wrong role (should return false)
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(stakeholderAddr, wrongRole));
    }

    /**
     * @dev Test isRegisteredStakeholder with unregistered address
     */
    function testFuzzIsRegisteredStakeholderUnregistered(
        address unregisteredAddr,
        uint256 roleSeed
    ) public {
        vm.assume(unregisteredAddr != address(0));
        // Ensure address is not one of our pre-registered addresses
        vm.assume(unregisteredAddr != admin);
        vm.assume(unregisteredAddr != farmer1);
        vm.assume(unregisteredAddr != distributor1);
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Check unregistered address (should return false)
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(unregisteredAddr, role));
    }

    /**
     * @dev Test isRegisteredStakeholder with zero address
     */
    function testIsRegisteredStakeholderZeroAddress() public {
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(address(0), Stakeholder.StakeholderRole.FARMER));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(address(0), Stakeholder.StakeholderRole.DISTRIBUTOR));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(address(0), Stakeholder.StakeholderRole.PROCESSOR));
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(address(0), Stakeholder.StakeholderRole.RETAILER));
    }

    // ===== ACTIVE STAKEHOLDER CHECKS =====

    /**
     * @dev Test isActiveStakeholder with registered and active stakeholder
     */
    function testFuzzIsActiveStakeholderRegistered(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder (should be active by default)
        _createStakeholder(stakeholderAddr, role, name, license);
        
        // Check if active
        assertTrue(stakeholderRegistry.isActiveStakeholder(stakeholderAddr));
    }

    /**
     * @dev Test isActiveStakeholder with unregistered address
     */
    function testFuzzIsActiveStakeholderUnregistered(address unregisteredAddr) public {
        vm.assume(unregisteredAddr != address(0));
        // Ensure address is not one of our pre-registered addresses
        vm.assume(unregisteredAddr != admin);
        vm.assume(unregisteredAddr != farmer1);
        vm.assume(unregisteredAddr != distributor1);
        
        // Check unregistered address (should return false)
        assertFalse(stakeholderRegistry.isActiveStakeholder(unregisteredAddr));
    }

    /**
     * @dev Test isActiveStakeholder with zero address
     */
    function testIsActiveStakeholderZeroAddress() public {
        assertFalse(stakeholderRegistry.isActiveStakeholder(address(0)));
    }

    // ===== STAKEHOLDER CONTRACT RETRIEVAL =====

    /**
     * @dev Test getStakeholderContract with registered stakeholder
     */
    function testFuzzGetStakeholderContractRegistered(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        address contractAddr = _createStakeholder(stakeholderAddr, role, name, license);
        
        // Get stakeholder contract
        address retrievedContract = stakeholderRegistry.getStakeholderContract(stakeholderAddr);
        
        assertEq(retrievedContract, contractAddr);
        assertTrue(retrievedContract != address(0));
    }

    /**
     * @dev Test getStakeholderContract with unregistered address
     */
    function testFuzzGetStakeholderContractUnregistered(address unregisteredAddr) public {
        vm.assume(unregisteredAddr != address(0));
        // Ensure address is not one of our pre-registered addresses
        vm.assume(unregisteredAddr != admin);
        vm.assume(unregisteredAddr != farmer1);
        vm.assume(unregisteredAddr != distributor1);
        
        address retrievedContract = stakeholderRegistry.getStakeholderContract(unregisteredAddr);
        assertEq(retrievedContract, address(0));
    }

    // ===== STAKEHOLDER INFO RETRIEVAL =====

    /**
     * @dev Test getStakeholderInfo with registered stakeholder
     */
    function testFuzzGetStakeholderInfoRegistered(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        _createStakeholder(stakeholderAddr, role, name, license);
        
        // Get stakeholder info
        (
            address retrievedAddr,
            Stakeholder.StakeholderRole retrievedRole,
            string memory retrievedName,
            string memory retrievedLicense,
            string memory location,
            string memory certifications,
            bool isActive,
            uint256 registeredAt,
            uint256 lastActivity
        ) = stakeholderRegistry.getStakeholderInfo(stakeholderAddr);
        
        assertEq(retrievedAddr, stakeholderAddr);
        assertEq(uint8(retrievedRole), uint8(role));
        assertEq(retrievedName, name);
        assertEq(retrievedLicense, license);
        assertEq(location, "Location");
        assertEq(certifications, "Certifications");
        assertTrue(isActive);
        assertTrue(registeredAt > 0);
        assertTrue(lastActivity > 0);
    }

    /**
     * @dev Test getStakeholderInfo with unregistered address
     */
    function testFuzzGetStakeholderInfoUnregistered(address unregisteredAddr) public {
        vm.assume(unregisteredAddr != address(0));
        // Ensure address is not one of our pre-registered addresses
        vm.assume(unregisteredAddr != admin);
        vm.assume(unregisteredAddr != farmer1);
        vm.assume(unregisteredAddr != distributor1);
        
        (
            address retrievedAddr,
            Stakeholder.StakeholderRole retrievedRole,
            string memory retrievedName,
            string memory retrievedLicense,
            string memory location,
            string memory certifications,
            bool isActive,
            uint256 registeredAt,
            uint256 lastActivity
        ) = stakeholderRegistry.getStakeholderInfo(unregisteredAddr);
        
        assertEq(retrievedAddr, address(0));
        assertEq(uint8(retrievedRole), uint8(Stakeholder.StakeholderRole.FARMER)); // Default value
        assertEq(retrievedName, "");
        assertEq(retrievedLicense, "");
        assertEq(location, "");
        assertEq(certifications, "");
        assertFalse(isActive);
        assertEq(registeredAt, 0);
        assertEq(lastActivity, 0);
    }

    // ===== STAKEHOLDERS BY ROLE =====

    /**
     * @dev Test getStakeholdersByRole with multiple stakeholders of same role
     */
    function testFuzzGetStakeholdersByRoleSameRole(
        uint8 stakeholderCount,
        uint256 roleSeed
    ) public {
        stakeholderCount = stakeholderCount % 5 + 1; // 1-5 stakeholders
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        address[] memory createdStakeholders = new address[](stakeholderCount);
        
        // Create multiple stakeholders with same role
        for (uint256 i = 0; i < stakeholderCount; i++) {
            address stakeholderAddr = address(uint160(0x1000 + i));
            string memory name = string(abi.encodePacked("Stakeholder", vm.toString(i)));
            string memory license = string(abi.encodePacked("LIC", vm.toString(i)));
            
            _createStakeholder(stakeholderAddr, role, name, license);
            createdStakeholders[i] = stakeholderAddr;
        }
        
        // Get stakeholders by role
        address[] memory retrievedStakeholders = stakeholderRegistry.getStakeholdersByRole(role);
        
        assertEq(retrievedStakeholders.length, stakeholderCount);
        
        // Verify all created stakeholders are in the result
        for (uint256 i = 0; i < stakeholderCount; i++) {
            bool found = false;
            for (uint256 j = 0; j < retrievedStakeholders.length; j++) {
                if (retrievedStakeholders[j] == createdStakeholders[i]) {
                    found = true;
                    break;
                }
            }
            assertTrue(found, "Created stakeholder not found in results");
        }
    }

    /**
     * @dev Test getStakeholdersByRole with empty role
     */
    function testFuzzGetStakeholdersByRoleEmpty(uint256 roleSeed) public {
        Stakeholder.StakeholderRole emptyRole = _getRandomRole(roleSeed);
        
        // Don't create any stakeholders with this role
        address[] memory stakeholders = stakeholderRegistry.getStakeholdersByRole(emptyRole);
        
        assertEq(stakeholders.length, 0);
    }

    /**
     * @dev Test getStakeholdersByRole with mixed roles
     */
    function testGetStakeholdersByRoleMixed() public {
        // Create stakeholders with different roles
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farmer1", "FARM001");
        _createStakeholder(farmer2, Stakeholder.StakeholderRole.FARMER, "Farmer2", "FARM002");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor1, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        _createStakeholder(retailer1, Stakeholder.StakeholderRole.RETAILER, "Retail1", "RETAIL001");
        
        // Test each role
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.FARMER);
        address[] memory distributors = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.DISTRIBUTOR);
        address[] memory processors = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.PROCESSOR);
        address[] memory retailers = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.RETAILER);
        
        assertEq(farmers.length, 2);
        assertEq(distributors.length, 1);
        assertEq(processors.length, 1);
        assertEq(retailers.length, 1);
        
        // Verify specific addresses
        assertTrue(farmers[0] == farmer1 || farmers[1] == farmer1);
        assertTrue(farmers[0] == farmer2 || farmers[1] == farmer2);
        assertEq(distributors[0], distributor1);
        assertEq(processors[0], processor1);
        assertEq(retailers[0], retailer1);
    }

    // ===== STAKEHOLDER BY LICENSE =====

    /**
     * @dev Test getStakeholderByLicense with registered license
     */
    function testFuzzGetStakeholderByLicenseRegistered(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        _createStakeholder(stakeholderAddr, role, name, license);
        
        // Get stakeholder by license
        address retrievedAddr = stakeholderRegistry.getStakeholderByLicense(license);
        
        assertEq(retrievedAddr, stakeholderAddr);
    }

    /**
     * @dev Test getStakeholderByLicense with non-existent license
     */
    function testFuzzGetStakeholderByLicenseNonExistent(string memory nonExistentLicense) public {
        nonExistentLicense = _sanitizeString(nonExistentLicense, "NONEXISTENT");
        
        // Ensure this license doesn't exist by not creating any stakeholder with it
        address retrievedAddr = stakeholderRegistry.getStakeholderByLicense(nonExistentLicense);
        
        assertEq(retrievedAddr, address(0));
    }

    /**
     * @dev Test getStakeholderByLicense with empty license
     */
    function testGetStakeholderByLicenseEmpty() public {
        address retrievedAddr = stakeholderRegistry.getStakeholderByLicense("");
        assertEq(retrievedAddr, address(0));
    }

    // ===== BUSINESS NAME SEARCH =====

    /**
     * @dev Test findStakeholdersByBusinessName with exact match
     */
    function testFuzzFindStakeholdersByBusinessNameExact(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory businessName,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        businessName = _sanitizeString(businessName, "TestBusiness");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        _createStakeholder(stakeholderAddr, role, businessName, license);
        
        // Search for exact business name
        address[] memory results = stakeholderRegistry.findStakeholdersByBusinessName(businessName);
        
        assertEq(results.length, 1);
        assertEq(results[0], stakeholderAddr);
    }

    /**
     * @dev Test findStakeholdersByBusinessName with partial match
     */
    function testFindStakeholdersByBusinessNamePartial() public {
        // Create stakeholders with related business names
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "FreshFarm Co", "FARM001");
        _createStakeholder(farmer2, Stakeholder.StakeholderRole.FARMER, "Farm Fresh Ltd", "FARM002");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Quick Distribution", "DIST001");
        
        // Search for partial match "Farm"
        address[] memory farmResults = stakeholderRegistry.findStakeholdersByBusinessName("Farm");
        
        assertEq(farmResults.length, 2);
        assertTrue(farmResults[0] == farmer1 || farmResults[1] == farmer1);
        assertTrue(farmResults[0] == farmer2 || farmResults[1] == farmer2);
        
        // Search for partial match "Fresh"
        address[] memory freshResults = stakeholderRegistry.findStakeholdersByBusinessName("Fresh");
        
        assertEq(freshResults.length, 2);
        assertTrue(freshResults[0] == farmer1 || freshResults[1] == farmer1);
        assertTrue(freshResults[0] == farmer2 || freshResults[1] == farmer2);
        
        // Search for non-matching partial
        address[] memory noResults = stakeholderRegistry.findStakeholdersByBusinessName("NonExistent");
        
        assertEq(noResults.length, 0);
    }

    /**
     * @dev Test findStakeholdersByBusinessName with empty search
     */
    function testFindStakeholdersByBusinessNameEmpty() public {
        // Create some stakeholders
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "FreshFarm Co", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Quick Distribution", "DIST001");
        
        // Search with empty string - the contract's _contains function returns true for empty needle
        // This is actually correct behavior in many string searching algorithms
        address[] memory results = stakeholderRegistry.findStakeholdersByBusinessName("");
        
        // Empty string matches all strings in the contract implementation
        assertEq(results.length, 2);
    }

    // ===== EDGE CASE TESTS =====

    /**
     * @dev Test multiple operations with same stakeholder
     */
    function testFuzzMultipleOperationsSameStakeholder(
        address stakeholderAddr,
        uint256 roleSeed,
        string memory name,
        string memory license
    ) public {
        vm.assume(stakeholderAddr != address(0));
        name = _sanitizeString(name, "TestStakeholder");
        license = _sanitizeString(license, string(abi.encodePacked("LIC", vm.toString(uint160(stakeholderAddr)))));
        
        Stakeholder.StakeholderRole role = _getRandomRole(roleSeed);
        
        // Create stakeholder
        address contractAddr = _createStakeholder(stakeholderAddr, role, name, license);
        
        // Test all registry functions with same stakeholder
        assertTrue(stakeholderRegistry.isRegisteredStakeholder(stakeholderAddr, role));
        assertTrue(stakeholderRegistry.isActiveStakeholder(stakeholderAddr));
        assertEq(stakeholderRegistry.getStakeholderContract(stakeholderAddr), contractAddr);
        
        (address addr, , string memory retrievedName, string memory retrievedLicense, , , bool active, , ) = 
            stakeholderRegistry.getStakeholderInfo(stakeholderAddr);
        
        assertEq(addr, stakeholderAddr);
        assertEq(retrievedName, name);
        assertEq(retrievedLicense, license);
        assertTrue(active);
        
        address[] memory roleStakeholders = stakeholderRegistry.getStakeholdersByRole(role);
        bool foundInRole = false;
        for (uint256 i = 0; i < roleStakeholders.length; i++) {
            if (roleStakeholders[i] == stakeholderAddr) {
                foundInRole = true;
                break;
            }
        }
        assertTrue(foundInRole);
        
        assertEq(stakeholderRegistry.getStakeholderByLicense(license), stakeholderAddr);
        
        address[] memory nameResults = stakeholderRegistry.findStakeholdersByBusinessName(name);
        bool foundInName = false;
        for (uint256 i = 0; i < nameResults.length; i++) {
            if (nameResults[i] == stakeholderAddr) {
                foundInName = true;
                break;
            }
        }
        assertTrue(foundInName);
    }

    /**
     * @dev Test case sensitivity in business name search
     */
    function testBusinessNameSearchCaseSensitive() public {
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "FreshFarm", "FARM001");
        
        // Test exact case
        address[] memory exactResults = stakeholderRegistry.findStakeholdersByBusinessName("FreshFarm");
        assertEq(exactResults.length, 1);
        assertEq(exactResults[0], farmer1);
        
        // Test different case (should not match - case sensitive)
        address[] memory lowerResults = stakeholderRegistry.findStakeholdersByBusinessName("freshfarm");
        assertEq(lowerResults.length, 0);
        
        address[] memory upperResults = stakeholderRegistry.findStakeholdersByBusinessName("FRESHFARM");
        assertEq(upperResults.length, 0);
    }

    /**
     * @dev Test behavior with invalid contract addresses in registry
     */
    function testInvalidContractHandling() public {
        // This test verifies the try-catch blocks handle invalid contracts gracefully
        // We can't easily create invalid registry entries, so we test with zero addresses
        
        assertFalse(stakeholderRegistry.isRegisteredStakeholder(address(0), Stakeholder.StakeholderRole.FARMER));
        assertFalse(stakeholderRegistry.isActiveStakeholder(address(0)));
        assertEq(stakeholderRegistry.getStakeholderContract(address(0)), address(0));
        
        (address addr, , , , , , bool active, , ) = stakeholderRegistry.getStakeholderInfo(address(0));
        assertEq(addr, address(0));
        assertFalse(active);
    }

    // ===== PERFORMANCE TESTS =====

    /**
     * @dev Test performance with many stakeholders
     */
    function testManyStakeholders() public {
        // Create many stakeholders
        uint256 stakeholderCount = 20; // Reasonable number for testing
        
        for (uint256 i = 0; i < stakeholderCount; i++) {
            address stakeholderAddr = address(uint160(0x2000 + i));
            Stakeholder.StakeholderRole role = _getRandomRole(i);
            string memory name = string(abi.encodePacked("Business", vm.toString(i)));
            string memory license = string(abi.encodePacked("LIC", vm.toString(i)));
            
            _createStakeholder(stakeholderAddr, role, name, license);
        }
        
        // Test that operations still work efficiently
        address[] memory farmers = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.FARMER);
        address[] memory distributors = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.DISTRIBUTOR);
        address[] memory processors = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.PROCESSOR);
        address[] memory retailers = stakeholderRegistry.getStakeholdersByRole(Stakeholder.StakeholderRole.RETAILER);
        
        // Verify total count
        assertEq(farmers.length + distributors.length + processors.length + retailers.length, stakeholderCount);
        
        // Test business name search still works
        address[] memory businessResults = stakeholderRegistry.findStakeholdersByBusinessName("Business");
        assertEq(businessResults.length, stakeholderCount);
    }
}
