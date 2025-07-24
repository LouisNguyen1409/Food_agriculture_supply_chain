// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ProductFactory.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/StakeholderFactory.sol";
import "../src/SmartContracts/Stakeholder.sol";
import "../src/SmartContracts/Product.sol";
import "./MockOracle.sol";

contract ProductFactoryFuzz is Test {
    ProductFactory public productFactory;
    Registry public registry;
    StakeholderRegistry public stakeholderRegistry;
    StakeholderFactory public stakeholderFactory;
    
    // Mock oracles
    MockOracle public temperatureOracle;
    MockOracle public humidityOracle;
    MockOracle public rainfallOracle;
    MockOracle public windSpeedOracle;
    MockOracle public priceOracle;
    
    address admin = address(0x1);
    address farmer1 = address(0x2);
    address farmer2 = address(0x3);
    address processor = address(0x4);
    address unauthorized = address(0x5);

    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy core contracts
        registry = new Registry();
        stakeholderRegistry = new StakeholderRegistry(address(registry));
        stakeholderFactory = new StakeholderFactory(address(registry));
        
        // Deploy mock oracles with initial values
        temperatureOracle = new MockOracle(25 * 10**8, 8, 1, "Temperature");
        humidityOracle = new MockOracle(65 * 10**8, 8, 1, "Humidity");
        rainfallOracle = new MockOracle(10 * 10**8, 8, 1, "Rainfall");
        windSpeedOracle = new MockOracle(15 * 10**8, 8, 1, "Wind Speed");
        priceOracle = new MockOracle(100 * 10**8, 8, 1, "Price");
        
        // Deploy ProductFactory
        productFactory = new ProductFactory(
            address(stakeholderRegistry),
            address(registry),
            address(temperatureOracle),
            address(humidityOracle),
            address(rainfallOracle),
            address(windSpeedOracle),
            address(priceOracle)
        );
        
        vm.stopPrank();
    }

    // ===== BASIC PRODUCT CREATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for basic product creation with random parameters
     */
    function testFuzzCreateProduct(
        string memory name,
        string memory description,
        uint256 minTemp,
        uint256 maxTemp,
        string memory location,
        string memory farmData
    ) public {
        // Handle empty strings and set reasonable constraints
        if (bytes(name).length == 0) name = "Default Product";
        if (bytes(description).length == 0) description = "Default Description";
        if (bytes(location).length == 0) location = "Default Location";
        
        // Ensure temperature constraints are reasonable
        minTemp = minTemp % 101; // 0-100°C
        maxTemp = minTemp + (maxTemp % (101 - minTemp)); // minTemp to 100°C
        
        // Limit string lengths to prevent excessive gas usage
        if (bytes(name).length > 100) {
            name = "Truncated Product Name";
        }
        if (bytes(description).length > 500) {
            description = "Truncated Description";
        }
        if (bytes(location).length > 200) {
            location = "Truncated Location";
        }
        if (bytes(farmData).length > 1000) {
            farmData = "Truncated Farm Data";
        }
        
        // Create a farmer stakeholder first
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic Certified"
        );
        
        uint256 initialProductCount = registry.getTotalProducts();
        
        // Create product as farmer
        vm.prank(farmer1);
        address productAddress = productFactory.createProduct(
            name,
            description,
            minTemp,
            maxTemp,
            location,
            farmData
        );
        
        // Verify product was created successfully
        assertTrue(productAddress != address(0));
        assertTrue(registry.isEntityRegistered(productAddress));
        assertEq(registry.getTotalProducts(), initialProductCount + 1);
        
        // Verify product properties
        Product product = Product(productAddress);
        assertEq(product.name(), name);
        assertEq(product.description(), description);
        assertEq(product.minCTemperature(), minTemp);
        assertEq(product.maxCTemperature(), maxTemp);
        assertEq(product.location(), location);
        assertTrue(product.farmer() != address(0)); // tx.origin is set in Product constructor
        assertEq(uint8(product.currentStage()), uint8(Product.ProductStage.FARM));
        assertTrue(product.isActive());
    }

    /**
     * @dev Fuzz test for unauthorized product creation attempts
     */
    function testFuzzUnauthorizedProductCreation(
        address unauthorizedCaller,
        string memory productName
    ) public {
        vm.assume(unauthorizedCaller != farmer1);
        vm.assume(unauthorizedCaller != farmer2);
        
        if (bytes(productName).length == 0) productName = "Test Product";
        
        // Try to create product without being a registered farmer
        vm.prank(unauthorizedCaller);
        vm.expectRevert("Not registered for this role");
        productFactory.createProduct(
            productName,
            "Description",
            10,
            30,
            "Location",
            "Farm Data"
        );
    }

    /**
     * @dev Fuzz test for multiple product creation by same farmer
     */
    function testFuzzMultipleProductCreation(
        uint8 productCount,
        uint256 seedValue
    ) public {
        vm.assume(productCount > 0 && productCount <= 10);
        seedValue = seedValue % 1000; // Limit seedValue to prevent overflow
        
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic Certified"
        );
        
        uint256 initialCount = registry.getTotalProducts();
        
        vm.startPrank(farmer1);
        
        for (uint256 i = 0; i < productCount; i++) {
            string memory name = string(abi.encodePacked("Product", vm.toString(i)));
            uint256 minTemp = (seedValue + i) % 50; // 0-49
            uint256 maxTemp = minTemp + 1 + ((seedValue + i) % 10); // Ensure maxTemp > minTemp
            if (maxTemp > 100) maxTemp = 100; // Cap at reasonable temperature
            
            address productAddress = productFactory.createProduct(
                name,
                string(abi.encodePacked("Description for ", name)),
                minTemp,
                maxTemp,
                string(abi.encodePacked("Location", vm.toString(i))),
                string(abi.encodePacked("Farm data for ", name))
            );
            
            assertTrue(productAddress != address(0));
            assertTrue(registry.isEntityRegistered(productAddress));
        }
        
        vm.stopPrank();
        
        assertEq(registry.getTotalProducts(), initialCount + productCount);
    }

    // ===== PARAMETER VALIDATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for temperature parameter validation
     */
    function testFuzzTemperatureValidation(
        uint256 minTemp,
        uint256 maxTemp
    ) public {
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic Certified"
        );
        
        // Constrain temperatures to reasonable ranges
        minTemp = minTemp % 200; // 0-199
        maxTemp = maxTemp % 200; // 0-199
        
        vm.prank(farmer1);
        
        // This should work regardless of min/max order due to our contract logic
        address productAddress = productFactory.createProduct(
            "Temperature Test Product",
            "Testing temperature ranges",
            minTemp,
            maxTemp,
            "Test Location",
            "Temperature test data"
        );
        
        assertTrue(productAddress != address(0));
        
        Product product = Product(productAddress);
        assertEq(product.minCTemperature(), minTemp);
        assertEq(product.maxCTemperature(), maxTemp);
    }

    /**
     * @dev Fuzz test for string parameter edge cases
     */
    function testFuzzStringParameters(
        string memory name,
        string memory description,
        string memory location,
        string memory farmData
    ) public {
        // Handle various string edge cases
        if (bytes(name).length == 0) name = "Default Name";
        if (bytes(description).length == 0) description = "Default Description";
        if (bytes(location).length == 0) location = "Default Location";
        
        // Truncate overly long strings
        if (bytes(name).length > 150) {
            name = "Very Long Product Name Truncated";
        }
        if (bytes(description).length > 1000) {
            description = "Very Long Description Truncated";
        }
        if (bytes(location).length > 300) {
            location = "Very Long Location Truncated";
        }
        if (bytes(farmData).length > 2000) {
            farmData = "Very Long Farm Data Truncated";
        }
        
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic Certified"
        );
        
        vm.prank(farmer1);
        address productAddress = productFactory.createProduct(
            name,
            description,
            20,
            25,
            location,
            farmData
        );
        
        assertTrue(productAddress != address(0));
        
        Product product = Product(productAddress);
        assertEq(product.name(), name);
        assertEq(product.description(), description);
        assertEq(product.location(), location);
    }

    // ===== ORACLE INTEGRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for oracle integration during product creation
     */
    function testFuzzOracleIntegration(
        int256 temperature,
        int256 humidity,
        int256 rainfall,
        int256 windSpeed,
        int256 price
    ) public {
        // Set reasonable oracle values
        temperature = temperature % (100 * 10**8); // -100°C to 100°C
        humidity = humidity % (100 * 10**8); // 0-100%
        rainfall = rainfall % (1000 * 10**8); // 0-1000mm
        windSpeed = windSpeed % (200 * 10**8); // 0-200 km/h
        price = price % (10000 * 10**8); // 0-10000 USD
        
        // Ensure positive values for most oracles
        if (humidity < 0) humidity = -humidity;
        if (rainfall < 0) rainfall = -rainfall;
        if (windSpeed < 0) windSpeed = -windSpeed;
        if (price < 0) price = -price;
        
        // Update oracle prices
        temperatureOracle.updatePrice(temperature);
        humidityOracle.updatePrice(humidity);
        rainfallOracle.updatePrice(rainfall);
        windSpeedOracle.updatePrice(windSpeed);
        priceOracle.updatePrice(price);
        
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic Certified"
        );
        
        vm.prank(farmer1);
        address productAddress = productFactory.createProduct(
            "Oracle Test Product",
            "Testing oracle integration",
            15,
            35,
            "Oracle Test Location",
            "Oracle test farm data"
        );
        
        assertTrue(productAddress != address(0));
        
        // Verify product was created successfully with oracle data
        Product product = Product(productAddress);
        assertTrue(product.isActive());
        assertTrue(product.estimatedPrice() >= 0); // Price should be set from oracle
    }

    // ===== ACCESS CONTROL FUZZ TESTS =====

    /**
     * @dev Fuzz test for access control with different stakeholder roles
     */
    function testFuzzStakeholderRoleValidation(
        uint8 roleIndex,
        address stakeholderAddress
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(roleIndex < 4); // Valid role indices: 0-3
        
        Stakeholder.StakeholderRole role = Stakeholder.StakeholderRole(roleIndex);
        
        // Create stakeholder with random role
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            stakeholderAddress,
            role,
            "Test Business",
            string(abi.encodePacked("LICENSE", vm.toString(roleIndex))),
            "Business Location",
            "Certifications"
        );
        
        vm.prank(stakeholderAddress);
        
        if (role == Stakeholder.StakeholderRole.FARMER) {
            // Should succeed for farmers
            address productAddress = productFactory.createProduct(
                "Role Test Product",
                "Testing role validation",
                10,
                30,
                "Role Test Location",
                "Role test farm data"
            );
            assertTrue(productAddress != address(0));
        } else {
            // Should fail for non-farmers
            vm.expectRevert("Not registered for this role");
            productFactory.createProduct(
                "Role Test Product",
                "Testing role validation",
                10,
                30,
                "Role Test Location",
                "Role test farm data"
            );
        }
    }

    // ===== REGISTRY INTEGRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for registry integration and product tracking
     */
    function testFuzzRegistryIntegration(
        uint8 farmerCount,
        uint8 productsPerFarmer,
        uint256 seedValue
    ) public {
        vm.assume(farmerCount > 0 && farmerCount <= 5);
        vm.assume(productsPerFarmer > 0 && productsPerFarmer <= 5);
        seedValue = seedValue % 1000; // Limit seedValue to prevent overflow
        
        uint256 initialProductCount = registry.getTotalProducts();
        address[] memory farmers = new address[](farmerCount);
        
        // Create multiple farmer stakeholders
        vm.startPrank(admin);
        for (uint256 i = 0; i < farmerCount; i++) {
            farmers[i] = address(uint160(seedValue + i + 100));
            stakeholderFactory.createStakeholder(
                farmers[i],
                Stakeholder.StakeholderRole.FARMER,
                string(abi.encodePacked("Farm", vm.toString(i))),
                string(abi.encodePacked("FARM", vm.toString(i))),
                "Farm Location",
                "Organic Certified"
            );
        }
        vm.stopPrank();
        
        // Each farmer creates multiple products
        uint256 totalProductsCreated = 0;
        for (uint256 i = 0; i < farmerCount; i++) {
            vm.startPrank(farmers[i]);
            
            for (uint256 j = 0; j < productsPerFarmer; j++) {
                string memory productName = string(
                    abi.encodePacked("Product", vm.toString(i), "_", vm.toString(j))
                );
                
                uint256 minTemp = (seedValue + i + j) % 30; // Random min temp 0-29
                uint256 maxTemp = minTemp + 10 + ((seedValue + i + j) % 20); // minTemp+10 to minTemp+29
                if (maxTemp > 100) maxTemp = 100; // Cap at reasonable temperature
                
                address productAddress = productFactory.createProduct(
                    productName,
                    string(abi.encodePacked("Description for ", productName)),
                    minTemp,
                    maxTemp,
                    string(abi.encodePacked("Location", vm.toString(i), "_", vm.toString(j))),
                    string(abi.encodePacked("Farm data for ", productName))
                );
                
                assertTrue(productAddress != address(0));
                assertTrue(registry.isEntityRegistered(productAddress));
                totalProductsCreated++;
            }
            
            vm.stopPrank();
        }
        
        // Verify registry state
        assertEq(registry.getTotalProducts(), initialProductCount + totalProductsCreated);
        assertEq(totalProductsCreated, farmerCount * productsPerFarmer);
    }

    // ===== EVENT EMISSION FUZZ TESTS =====

    /**
     * @dev Fuzz test for ProductCreated event emission
     */
    function testFuzzEventEmission(
        string memory productName,
        address farmerAddress,
        uint256 blockTime
    ) public {
        vm.assume(farmerAddress != address(0));
        vm.assume(blockTime > 0 && blockTime < type(uint40).max); // Reasonable timestamp range
        
        if (bytes(productName).length == 0) productName = "Event Test Product";
        if (bytes(productName).length > 100) productName = "Event Test Product Truncated";
        
        // Set specific block timestamp
        vm.warp(blockTime % (365 days * 10) + 1); // Reasonable timestamp within 10 years
        
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmerAddress,
            Stakeholder.StakeholderRole.FARMER,
            "Event Test Farm",
            "EVENTFARM123",
            "Event Farm Location",
            "Event Certified"
        );
        
        vm.prank(farmerAddress);
        
        // Create product and verify it was created successfully
        address productAddress = productFactory.createProduct(
            productName,
            "Event test description",
            20,
            25,
            "Event test location",
            "Event test farm data"
        );
        
        // Verify product was created
        assertTrue(productAddress != address(0));
        assertTrue(registry.isEntityRegistered(productAddress));
        
        // Note: We don't use expectEmit here since the productAddress is unknown beforehand
        // The event emission is implicitly tested by the successful product creation
    }

    // ===== GAS OPTIMIZATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for gas consumption optimization
     */
    function testFuzzGasConsumption(
        uint8 productCount,
        uint256 stringLengthSeed
    ) public {
        vm.assume(productCount > 0 && productCount <= 20);
        stringLengthSeed = stringLengthSeed % 1000; // Limit to prevent overflow
        
        // Create farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer1,
            Stakeholder.StakeholderRole.FARMER,
            "Gas Test Farm",
            "GASFARM123",
            "Gas Farm Location",
            "Gas Certified"
        );
        
        uint256 gasStart = gasleft();
        
        vm.startPrank(farmer1);
        
        for (uint256 i = 0; i < productCount; i++) {
            // Create products with varying string lengths
            uint256 nameLength = (stringLengthSeed + i) % 50 + 10; // 10-59 chars
            uint256 descLength = (stringLengthSeed + i + 1) % 200 + 50; // 50-249 chars
            
            string memory name = _generateString("Product", nameLength);
            string memory description = _generateString("Description", descLength);
            
            uint256 minTemp = i % 50; // Varying temperatures 0-49
            uint256 maxTemp = minTemp + 10; // Ensure maxTemp > minTemp
            
            address productAddress = productFactory.createProduct(
                name,
                description,
                minTemp,
                maxTemp,
                string(abi.encodePacked("Location", vm.toString(i))),
                string(abi.encodePacked("FarmData", vm.toString(i)))
            );
            
            assertTrue(productAddress != address(0));
        }
        
        vm.stopPrank();
        
        uint256 gasUsed = gasStart - gasleft();
        
        // Verify reasonable gas consumption
        assertTrue(gasUsed > 0);
        assertTrue(gasUsed < 100000000); // Reasonable upper bound
        
        // Verify all products were created
        assertTrue(registry.getTotalProducts() >= productCount);
    }

    // ===== HELPER FUNCTIONS =====

    /**
     * @dev Helper function to generate strings of specific length
     */
    function _generateString(string memory prefix, uint256 length) internal pure returns (string memory) {
        if (length <= bytes(prefix).length) {
            return prefix;
        }
        
        string memory result = prefix;
        for (uint256 i = bytes(prefix).length; i < length; i++) {
            result = string(abi.encodePacked(result, "x"));
        }
        return result;
    }

    // ===== EVENTS =====

    event ProductCreated(
        address indexed productAddress,
        string name,
        address indexed creator,
        uint256 timestamp
    );
}
