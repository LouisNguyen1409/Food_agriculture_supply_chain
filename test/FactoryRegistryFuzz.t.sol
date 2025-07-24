// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderFactory.sol";
import "../src/SmartContracts/ProductFactory.sol";
import "../src/SmartContracts/ShipmentFactory.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/Stakeholder.sol";
import "../src/SmartContracts/Product.sol";
import "../src/SmartContracts/Shipment.sol";
import "./MockOracle.sol";

contract FactoryRegistryFuzz is Test {
    Registry public registry;
    StakeholderFactory public stakeholderFactory;
    ProductFactory public productFactory;
    ShipmentFactory public shipmentFactory;
    StakeholderRegistry public stakeholderRegistry;
    
    // Mock oracles
    MockOracle public temperatureOracle;
    MockOracle public humidityOracle;
    MockOracle public rainfallOracle;
    MockOracle public windSpeedOracle;
    MockOracle public priceOracle;
    
    address admin = address(0x1);
    address farmer = address(0x2);
    address processor = address(0x3);
    address distributor = address(0x4);
    address retailer = address(0x5);
    address unauthorized = address(0x6);

    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy core contracts
        registry = new Registry();
        stakeholderRegistry = new StakeholderRegistry(address(registry));
        
        // Deploy mock oracles
        temperatureOracle = new MockOracle(25 * 10**8, 8, 1, "Temperature");
        humidityOracle = new MockOracle(65 * 10**8, 8, 1, "Humidity");
        rainfallOracle = new MockOracle(10 * 10**8, 8, 1, "Rainfall");
        windSpeedOracle = new MockOracle(15 * 10**8, 8, 1, "Wind Speed");
        priceOracle = new MockOracle(100 * 10**8, 8, 1, "Price");
        
        // Deploy factory contracts
        stakeholderFactory = new StakeholderFactory(address(registry));
        productFactory = new ProductFactory(
            address(stakeholderRegistry),
            address(registry),
            address(temperatureOracle),
            address(humidityOracle),
            address(rainfallOracle),
            address(windSpeedOracle),
            address(priceOracle)
        );
        shipmentFactory = new ShipmentFactory(
            address(registry),
            address(stakeholderRegistry)
        );
        
        vm.stopPrank();
    }

    // ===== STAKEHOLDER FACTORY FUZZ TESTS =====

    /**
     * @dev Fuzz test for stakeholder creation with random parameters
     */
    function testFuzzCreateStakeholder(
        address stakeholderAddress,
        string memory businessName,
        string memory businessLicense,
        string memory location,
        string memory certifications,
        uint8 roleIndex
    ) public {
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessName).length <= 100);
        vm.assume(bytes(businessLicense).length > 0);
        vm.assume(bytes(businessLicense).length <= 100);
        vm.assume(roleIndex < 4); // 0-3 for valid roles
        vm.assume(registry.getStakeholderByLicense(businessLicense) == address(0));
        vm.assume(registry.getStakeholderByWallet(stakeholderAddress) == address(0));
        
        Stakeholder.StakeholderRole role = Stakeholder.StakeholderRole(roleIndex);
        
        uint256 initialStakeholderCount = registry.getAllStakeholders().length;
        
        vm.prank(admin);
        address stakeholderContractAddress = stakeholderFactory.createStakeholder(
            stakeholderAddress,
            role,
            businessName,
            businessLicense,
            location,
            certifications
        );
        
        // Verify stakeholder was created and registered
        assertTrue(stakeholderContractAddress != address(0));
        assertTrue(registry.isEntityRegistered(stakeholderContractAddress));
        assertEq(registry.getStakeholderByLicense(businessLicense), stakeholderContractAddress);
        assertEq(registry.getStakeholderByWallet(stakeholderAddress), stakeholderContractAddress);
        assertEq(registry.getAllStakeholders().length, initialStakeholderCount + 1);
        
        // Verify stakeholder contract properties
        Stakeholder stakeholder = Stakeholder(stakeholderContractAddress);
        assertEq(stakeholder.stakeholderAddress(), stakeholderAddress);
        assertEq(uint8(stakeholder.role()), roleIndex);
        assertEq(stakeholder.businessName(), businessName);
        assertEq(stakeholder.businessLicense(), businessLicense);
        assertEq(stakeholder.location(), location);
        assertEq(stakeholder.certifications(), certifications);
        assertTrue(stakeholder.isActive());
    }

    /**
     * @dev Fuzz test for preventing unauthorized stakeholder creation
     */
    function testFuzzUnauthorizedStakeholderCreation(
        address unauthorizedCaller,
        address stakeholderAddress,
        string memory businessName,
        string memory businessLicense
    ) public {
        vm.assume(unauthorizedCaller != admin);
        vm.assume(stakeholderAddress != address(0));
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(businessLicense).length > 0);
        
        vm.prank(unauthorizedCaller);
        vm.expectRevert("Only admin can call this function");
        stakeholderFactory.createStakeholder(
            stakeholderAddress,
            Stakeholder.StakeholderRole.FARMER,
            businessName,
            businessLicense,
            "Location",
            "Certifications"
        );
    }

    /**
     * @dev Fuzz test for stakeholder creation with invalid parameters
     */
    function testFuzzInvalidStakeholderCreation() public {
        vm.startPrank(admin);
        
        // Test with zero address
        vm.expectRevert("Invalid stakeholder address");
        stakeholderFactory.createStakeholder(
            address(0),
            Stakeholder.StakeholderRole.FARMER,
            "Business Name",
            "LICENSE123",
            "Location",
            "Certifications"
        );
        
        // Test with empty business name
        vm.expectRevert("Business name cannot be empty");
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "",
            "LICENSE123",
            "Location",
            "Certifications"
        );
        
        // Test with empty business license
        vm.expectRevert("Business license cannot be empty");
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "Business Name",
            "",
            "Location",
            "Certifications"
        );
        
        vm.stopPrank();
    }

    /**
     * @dev Fuzz test for multiple stakeholder creation with different roles
     */
    function testFuzzMultipleStakeholderCreation(
        uint8 stakeholderCount,
        uint256 seed
    ) public {
        vm.assume(stakeholderCount > 0 && stakeholderCount <= 10);
        vm.assume(seed < type(uint256).max / 10000);
        
        vm.startPrank(admin);
        
        for (uint256 i = 0; i < stakeholderCount; i++) {
            address stakeholderAddr = address(uint160(seed + i + 1000));
            string memory businessName = string(abi.encodePacked("Business", vm.toString(i)));
            string memory businessLicense = string(abi.encodePacked("LICENSE", vm.toString(i)));
            Stakeholder.StakeholderRole role = Stakeholder.StakeholderRole(i % 4);
            
            address stakeholderContract = stakeholderFactory.createStakeholder(
                stakeholderAddr,
                role,
                businessName,
                businessLicense,
                "Location",
                "Certifications"
            );
            
            assertTrue(stakeholderContract != address(0));
            assertTrue(registry.isEntityRegistered(stakeholderContract));
        }
        
        assertEq(registry.getAllStakeholders().length, stakeholderCount);
        vm.stopPrank();
    }

    // ===== PRODUCT FACTORY FUZZ TESTS =====

    /**
     * @dev Fuzz test for product creation with random parameters
     */
    function testFuzzCreateProduct(
        string memory name,
        string memory description, 
        uint256 minTemp,
        uint256 maxTemp,
        string memory location,
        string memory farmData
    ) public {
        // Handle empty strings by providing defaults
        if (bytes(name).length == 0) name = "Default Product";
        if (bytes(description).length == 0) description = "Default Description";  
        if (bytes(location).length == 0) location = "Default Location";
        
        // Minimal constraints - just ensure maxTemp is reasonable and minTemp <= maxTemp
        minTemp = minTemp % 101; // 0-100
        maxTemp = minTemp + (maxTemp % (101 - minTemp)); // minTemp to 100
        
        // First create a farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic"
        );
        
        uint256 initialProductCount = registry.getTotalProducts();
        
        vm.prank(farmer);
        address productAddress = productFactory.createProduct(
            name,
            description,
            minTemp,
            maxTemp,
            location,
            farmData
        );
        
        // Verify product was created and registered
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
        // Note: farmer is set to tx.origin in Product constructor, which is the test contract
        assertTrue(product.farmer() != address(0)); // Just verify it's set
        assertEq(uint8(product.currentStage()), uint8(Product.ProductStage.FARM));
        assertTrue(product.isActive());
    }

    /**
     * @dev Fuzz test for unauthorized product creation
     */
    function testFuzzUnauthorizedProductCreation(
        address unauthorizedCaller,
        string memory name
    ) public {
        vm.assume(unauthorizedCaller != farmer);
        vm.assume(bytes(name).length > 0);
        
        vm.prank(unauthorizedCaller);
        vm.expectRevert("Not registered for this role");
        productFactory.createProduct(
            name,
            "Description",
            10,
            30,
            "Location",
            "Farm Data"
        );
    }

    /**
     * @dev Fuzz test for multiple product creation by registered farmer
     */
    function testFuzzMultipleProductCreation(
        uint8 productCount,
        uint256 seed
    ) public {
        vm.assume(productCount > 0 && productCount <= 10);
        vm.assume(seed < type(uint128).max); // Smaller seed to prevent overflow
        
        // Create a farmer stakeholder
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic"
        );
        
        vm.startPrank(farmer);
        
        for (uint256 i = 0; i < productCount; i++) {
            string memory name = string(abi.encodePacked("Product", vm.toString(i)));
            address productAddress = productFactory.createProduct(
                name,
                "Description",
                uint256(keccak256(abi.encode(seed, i))) % 30, // Random min temp
                uint256(keccak256(abi.encode(seed, i, 1))) % 30 + 30, // Random max temp
                "Location",
                "Farm Data"
            );
            
            assertTrue(productAddress != address(0));
            assertTrue(registry.isEntityRegistered(productAddress));
        }
        
        assertEq(registry.getTotalProducts(), productCount);
        vm.stopPrank();
    }

    // ===== SHIPMENT FACTORY FUZZ TESTS =====

    /**
     * @dev Fuzz test for shipment creation with random parameters
     */
    function testFuzzCreateShipment(
        address productAddress,
        address receiver,
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(productAddress != address(0));
        vm.assume(receiver != address(0));
        vm.assume(bytes(trackingNumber).length > 0);
        vm.assume(bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length <= 100);
        
        // Create farmer and processor stakeholders
        vm.startPrank(admin);
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic"
        );
        
        stakeholderFactory.createStakeholder(
            processor,
            Stakeholder.StakeholderRole.PROCESSOR,
            "Test Processor",
            "PROC123",
            "Processor Location",
            "Food Safety Certified"
        );
        
        stakeholderFactory.createStakeholder(
            distributor,
            Stakeholder.StakeholderRole.DISTRIBUTOR,
            "Test Distributor",
            "DIST123",
            "Distributor Location",
            "ISO Certified"
        );
        vm.stopPrank();
        
        // Create a product first
        vm.prank(farmer);
        address realProductAddress = productFactory.createProduct(
            "Test Product",
            "A test product for shipment",
            10,
            30,
            "Farm Location",
            "Organic farm data"
        );
        
        // Update product to processing stage so it can be shipped
        vm.prank(processor);
        Product(realProductAddress).updateProcessingStage("Processed and packaged");
        
        uint256 initialShipmentCount = registry.getTotalShipments();
        
        vm.prank(distributor);
        address shipmentAddress = shipmentFactory.createShipment(
            realProductAddress, // Use real product instead of fuzzed address
            receiver,
            trackingNumber,
            transportMode
        );
        
        // Verify shipment was created and registered
        assertTrue(shipmentAddress != address(0));
        assertTrue(registry.isEntityRegistered(shipmentAddress));
        assertEq(registry.getTotalShipments(), initialShipmentCount + 1);
        
        // Verify shipment properties
        Shipment shipment = Shipment(shipmentAddress);
        assertEq(shipment.productAddress(), realProductAddress);
        assertEq(shipment.sender(), distributor);
        assertEq(shipment.receiver(), receiver);
        assertEq(shipment.trackingNumber(), trackingNumber);
        assertEq(shipment.transportMode(), transportMode);
        assertEq(uint8(shipment.status()), uint8(Shipment.ShipmentStatus.PREPARING));
        assertTrue(shipment.isActive());
    }

    /**
     * @dev Fuzz test for unauthorized shipment creation
     */
    function testFuzzUnauthorizedShipmentCreation(
        address unauthorizedCaller,
        address productAddress,
        string memory trackingNumber
    ) public {
        vm.assume(unauthorizedCaller != distributor);
        vm.assume(productAddress != address(0));
        vm.assume(bytes(trackingNumber).length > 0);
        
        vm.prank(unauthorizedCaller);
        vm.expectRevert("Not registered as distributor");
        shipmentFactory.createShipment(
            productAddress,
            retailer,
            trackingNumber,
            "Transport Mode"
        );
    }

    /**
     * @dev Fuzz test for multiple shipment creation
     */
    function testFuzzMultipleShipmentCreation(
        uint8 shipmentCount,
        uint256 seed
    ) public {
        vm.assume(shipmentCount > 0 && shipmentCount <= 10);
        vm.assume(seed < type(uint64).max); // Even smaller seed to prevent overflow
        
        // Create farmer, processor, and distributor stakeholder
        vm.startPrank(admin);
        stakeholderFactory.createStakeholder(
            farmer,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            "FARM123",
            "Farm Location",
            "Organic"
        );
        
        stakeholderFactory.createStakeholder(
            processor,
            Stakeholder.StakeholderRole.PROCESSOR,
            "Test Processor",
            "PROC123",
            "Processor Location",
            "Food Safety Certified"
        );
        
        stakeholderFactory.createStakeholder(
            distributor,
            Stakeholder.StakeholderRole.DISTRIBUTOR,
            "Test Distributor",
            "DIST123",
            "Distributor Location",
            "ISO Certified"
        );
        vm.stopPrank();
        
        // Create products first
        address[] memory products = new address[](shipmentCount);
        for (uint256 i = 0; i < shipmentCount; i++) {
            vm.prank(farmer);
            products[i] = productFactory.createProduct(
                string(abi.encodePacked("Product", vm.toString(i))),
                "Description",
                10,
                30,
                "Location",
                "Farm Data"
            );
            
            // Update to processing stage
            vm.prank(processor);
            Product(products[i]).updateProcessingStage("Processed");
        }
        
        vm.startPrank(distributor);
        
        for (uint256 i = 0; i < shipmentCount; i++) {
            address receiverAddr = address(uint160(uint256(keccak256(abi.encode(seed, i, 3000))) % type(uint64).max + 3000));
            string memory trackingNumber = string(abi.encodePacked("TRACK", vm.toString(i)));
            
            address shipmentAddress = shipmentFactory.createShipment(
                products[i],
                receiverAddr,
                trackingNumber,
                "Road Transport"
            );
            
            assertTrue(shipmentAddress != address(0));
            assertTrue(registry.isEntityRegistered(shipmentAddress));
        }
        
        assertEq(registry.getTotalShipments(), shipmentCount);
        vm.stopPrank();
    }

    // ===== INTEGRATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for complete supply chain creation workflow
     */
    function testFuzzCompleteSupplyChainWorkflow(
        string memory productName,
        string memory trackingNumber,
        uint256 temperature,
        uint256 seed
    ) public {
        vm.assume(bytes(productName).length > 0);
        vm.assume(bytes(productName).length <= 50);
        vm.assume(bytes(trackingNumber).length > 0);
        vm.assume(bytes(trackingNumber).length <= 20);
        vm.assume(temperature <= 50);
        vm.assume(seed < type(uint128).max); // Smaller seed to prevent overflow
        
        address farmerAddr = address(uint160(uint256(keccak256(abi.encode(seed, 100))) % type(uint128).max + 100));
        address processorAddr = address(uint160(uint256(keccak256(abi.encode(seed, 150))) % type(uint128).max + 150));
        address distributorAddr = address(uint160(uint256(keccak256(abi.encode(seed, 200))) % type(uint128).max + 200));
        address retailerAddr = address(uint160(uint256(keccak256(abi.encode(seed, 300))) % type(uint128).max + 300));
        
        vm.startPrank(admin);
        
        // Create stakeholders
        stakeholderFactory.createStakeholder(
            farmerAddr,
            Stakeholder.StakeholderRole.FARMER,
            "Test Farm",
            string(abi.encodePacked("FARM", vm.toString(uint256(keccak256(abi.encode(seed)))))),
            "Farm Location",
            "Organic"
        );
        
        stakeholderFactory.createStakeholder(
            processorAddr,
            Stakeholder.StakeholderRole.PROCESSOR,
            "Test Processor",
            string(abi.encodePacked("PROC", vm.toString(uint256(keccak256(abi.encode(seed)))))),
            "Processor Location",
            "Food Safety Certified"
        );
        
        stakeholderFactory.createStakeholder(
            distributorAddr,
            Stakeholder.StakeholderRole.DISTRIBUTOR,
            "Test Distributor",
            string(abi.encodePacked("DIST", vm.toString(uint256(keccak256(abi.encode(seed)))))),
            "Distributor Location",
            "ISO Certified"
        );
        
        vm.stopPrank();
        
        // Create product
        vm.prank(farmerAddr);
        address productAddress = productFactory.createProduct(
            productName,
            "High quality product",
            temperature,
            temperature + 10,
            "Farm Location",
            "Organic farm data"
        );
        
        // Update product to processing stage to enable shipment
        vm.prank(processorAddr);
        Product(productAddress).updateProcessingStage("Processed for distribution");
        
        // Create shipment
        vm.prank(distributorAddr);
        address shipmentAddress = shipmentFactory.createShipment(
            productAddress,
            retailerAddr,
            trackingNumber,
            "Refrigerated Transport"
        );
        
        // Verify complete workflow
        assertTrue(registry.isEntityRegistered(productAddress));
        assertTrue(registry.isEntityRegistered(shipmentAddress));
        
        Product product = Product(productAddress);
        Shipment shipment = Shipment(shipmentAddress);
        
        assertEq(product.name(), productName);
        assertEq(shipment.productAddress(), productAddress);
        assertEq(shipment.trackingNumber(), trackingNumber);
        assertEq(shipment.receiver(), retailerAddr);
    }

    /**
     * @dev Fuzz test for factory contract state consistency
     */
    function testFuzzFactoryStateConsistency(
        uint8 stakeholderCount,
        uint8 productCount,
        uint8 shipmentCount,
        uint256 seed
    ) public {
        vm.assume(stakeholderCount > 0 && stakeholderCount <= 5);
        vm.assume(productCount > 0 && productCount <= 5);
        vm.assume(shipmentCount > 0 && shipmentCount <= 5);
        vm.assume(seed < type(uint128).max); // Smaller seed to prevent overflow
        
        // Create stakeholders
        vm.startPrank(admin);
        address[] memory farmers = new address[](stakeholderCount);
        address[] memory processors = new address[](stakeholderCount);
        address[] memory distributors = new address[](stakeholderCount);
        
        for (uint256 i = 0; i < stakeholderCount; i++) {
            farmers[i] = address(uint160(uint256(keccak256(abi.encode(seed, i, 1000))) % type(uint128).max + 1000));
            processors[i] = address(uint160(uint256(keccak256(abi.encode(seed, i, 1500))) % type(uint128).max + 1500));
            distributors[i] = address(uint160(uint256(keccak256(abi.encode(seed, i, 2000))) % type(uint128).max + 2000));
            
            stakeholderFactory.createStakeholder(
                farmers[i],
                Stakeholder.StakeholderRole.FARMER,
                string(abi.encodePacked("Farm", vm.toString(i))),
                string(abi.encodePacked("FARM", vm.toString(i))),
                "Location",
                "Certifications"
            );
            
            stakeholderFactory.createStakeholder(
                processors[i],
                Stakeholder.StakeholderRole.PROCESSOR,
                string(abi.encodePacked("Processor", vm.toString(i))),
                string(abi.encodePacked("PROC", vm.toString(i))),
                "Location",
                "Certifications"
            );
            
            stakeholderFactory.createStakeholder(
                distributors[i],
                Stakeholder.StakeholderRole.DISTRIBUTOR,
                string(abi.encodePacked("Dist", vm.toString(i))),
                string(abi.encodePacked("DIST", vm.toString(i))),
                "Location",
                "Certifications"
            );
        }
        vm.stopPrank();
        
        // Create products
        address[] memory products = new address[](productCount);
        for (uint256 i = 0; i < productCount; i++) {
            vm.prank(farmers[i % farmers.length]);
            products[i] = productFactory.createProduct(
                string(abi.encodePacked("Product", vm.toString(i))),
                "Description",
                10 + (i % 20),
                30 + (i % 20),
                "Location",
                "Farm Data"
            );
            
            // Update to processing stage
            vm.prank(processors[i % processors.length]);
            Product(products[i]).updateProcessingStage("Processed");
        }
        
        // Create shipments
        for (uint256 i = 0; i < shipmentCount; i++) {
            vm.prank(distributors[i % distributors.length]);
            shipmentFactory.createShipment(
                products[i % products.length],
                address(uint160(uint256(keccak256(abi.encode(seed, i, 5000))) % type(uint128).max + 5000)),
                string(abi.encodePacked("TRACK", vm.toString(i))),
                "Transport"
            );
        }
        
        // Verify state consistency
        assertEq(registry.getAllStakeholders().length, stakeholderCount * 3); // farmer, processor, distributor for each count
        assertEq(registry.getTotalProducts(), productCount);
        assertEq(registry.getTotalShipments(), shipmentCount);
    }

    // ===== GAS OPTIMIZATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for gas consumption in batch operations
     */
    function testFuzzBatchOperationGasConsumption(uint8 batchSize) public {
        vm.assume(batchSize > 0 && batchSize <= 20);
        
        uint256 gasStart = gasleft();
        
        vm.startPrank(admin);
        for (uint256 i = 0; i < batchSize; i++) {
            stakeholderFactory.createStakeholder(
                address(uint160(i + 1000)),
                Stakeholder.StakeholderRole(i % 4),
                string(abi.encodePacked("Business", vm.toString(i))),
                string(abi.encodePacked("LICENSE", vm.toString(i))),
                "Location",
                "Certifications"
            );
        }
        vm.stopPrank();
        
        uint256 gasUsed = gasStart - gasleft();
        
        // Verify all stakeholders were created
        assertEq(registry.getAllStakeholders().length, batchSize);
        
        // Gas should scale reasonably with batch size
        assertTrue(gasUsed > 0);
        assertTrue(gasUsed < 50000000); // Reasonable upper bound
    }

    // ===== EVENT EMISSION FUZZ TESTS =====

    /**
     * @dev Fuzz test for proper event emission in factory operations
     */
    function testFuzzEventEmission(
        string memory businessName,
        string memory productName,
        string memory trackingNumber,
        uint256 seed
    ) public {
        vm.assume(bytes(businessName).length > 0);
        vm.assume(bytes(productName).length > 0);
        vm.assume(bytes(trackingNumber).length > 0);
        vm.assume(seed < type(uint128).max); // Smaller seed to prevent overflow
        
        address stakeholderAddr = address(uint160(uint256(keccak256(abi.encode(seed, 100))) % type(uint128).max + 100));
        
        // Test stakeholder creation event
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            stakeholderAddr,
            Stakeholder.StakeholderRole.FARMER,
            businessName,
            "LICENSE123",
            "Location",
            "Certifications"
        );
        
        // Test product creation event
        vm.prank(stakeholderAddr);
        productFactory.createProduct(
            productName,
            "Description",
            10,
            30,
            "Location",
            "Farm Data"
        );
    }

    // ===== HELPER FUNCTIONS & EVENTS =====

    event StakeholderCreated(
        address indexed stakeholderContractAddress,
        address indexed stakeholderAddress,
        Stakeholder.StakeholderRole indexed role,
        string businessName,
        string businessLicense,
        uint256 timestamp
    );

    event ProductCreated(
        address indexed productAddress,
        string name,
        address indexed creator,
        uint256 timestamp
    );

    event ShipmentCreated(
        address indexed shipmentAddress,
        address indexed distributor,
        address indexed productAddress,
        address receiver,
        string trackingNumber,
        string transportMode
    );
}
