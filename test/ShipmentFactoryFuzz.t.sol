// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ShipmentFactory.sol";
import "../src/SmartContracts/ShipmentRegistry.sol";
import "../src/SmartContracts/ProductRegistry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";

contract ShipmentFactoryFuzz is Test {
    ShipmentFactory public shipmentFactory;
    ShipmentRegistry public shipmentRegistry;
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    
    address public deployer;
    address public farmer;
    address public processor;
    address public distributor;
    address public retailer;
    address public unauthorized;
    
    uint256 public testProductId;
    
    function setUp() public {
        deployer = makeAddr("deployer");
        farmer = makeAddr("farmer");
        processor = makeAddr("processor");
        distributor = makeAddr("distributor");
        retailer = makeAddr("retailer");
        unauthorized = makeAddr("unauthorized");
        
        vm.startPrank(deployer);
        
        // Deploy StakeholderRegistry
        stakeholderRegistry = new StakeholderRegistry();
        
        // Deploy ProductRegistry with oracle feeds as address(0)
        productRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            address(0), // temperatureFeed
            address(0), // humidityFeed
            address(0), // rainfallFeed
            address(0), // windSpeedFeed
            address(0)  // priceFeed
        );
        
        // Deploy ShipmentRegistry
        shipmentRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );
        
        // Deploy ShipmentFactory
        shipmentFactory = new ShipmentFactory(
            address(shipmentRegistry),
            address(productRegistry),
            address(stakeholderRegistry)
        );
        
        // Register stakeholders
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            "Farmer Business",
            "FARM_LIC_001",
            "Farm Location",
            "Organic Certified"
        );
        
        stakeholderRegistry.registerStakeholder(
            processor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            "Processor Business",
            "PROC_LIC_001",
            "Processing Plant",
            "ISO Certified"
        );
        
        stakeholderRegistry.registerStakeholder(
            distributor,
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR,
            "Distributor Business",
            "DIST_LIC_001",
            "Distribution Center",
            "Cold Chain Certified"
        );
        
        stakeholderRegistry.registerStakeholder(
            retailer,
            StakeholderRegistry.StakeholderRole.RETAILER,
            "Retailer Business",
            "RET_LIC_001",
            "Retail Store",
            "Retail License"
        );
        
        vm.stopPrank();
        
        // Register the ShipmentFactory as a distributor so it can create shipments
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            address(shipmentFactory),
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR,
            "ShipmentFactory Business",
            "FACTORY_LIC_001",
            "Factory Location",
            "Factory License"
        );
        
        // Create test product for shipment testing
        vm.prank(farmer);
        testProductId = productRegistry.registerProduct(
            "Test Product for Shipment",
            "TEST_BATCH_001",
            "Test product data",
            "Farm Location"
        );
        
        // Move product to PROCESSING stage to make it shippable
        vm.prank(processor);
        productRegistry.updateProcessingStage(testProductId, "Processed successfully");
    }

    // ===== CONSTRUCTOR TESTS =====
    
    /**
     * @dev Test valid constructor
     */
    function testFuzzConstructorValid() public {
        ShipmentFactory newFactory = new ShipmentFactory(
            address(shipmentRegistry),
            address(productRegistry),
            address(stakeholderRegistry)
        );
        
        assertEq(address(newFactory.shipmentRegistry()), address(shipmentRegistry));
        assertEq(address(newFactory.productRegistry()), address(productRegistry));
        assertEq(address(newFactory.stakeholderRegistry()), address(stakeholderRegistry));
        assertEq(newFactory.factoryOwner(), address(this));
        assertEq(newFactory.nextTemplateId(), 1);
        assertEq(newFactory.nextRouteId(), 1);
        assertEq(newFactory.nextBatchId(), 1);
        assertEq(newFactory.totalShipmentsCreated(), 0);
    }
    
    /**
     * @dev Test constructor with zero addresses (will deploy but fail during use)
     */
    function testFuzzConstructorZeroAddresses() public {
        ShipmentFactory newFactory = new ShipmentFactory(address(0), address(0), address(0));
        
        // Operations will fail when trying to use the registries
        vm.expectRevert();
        vm.prank(distributor);
        newFactory.createStandardShipment(
            testProductId,
            retailer,
            "TRACK001",
            "TRUCK"
        );
    }

    // ===== SHIPMENT TEMPLATE TESTS =====
    
    /**
     * @dev Test creating a shipment template
     */
    function testFuzzCreateShipmentTemplate() public {
        string[] memory conditions = new string[](2);
        conditions[0] = "temperature_controlled";
        conditions[1] = "fragile_handling";
        
        vm.expectEmit(true, false, false, true);
        emit ShipmentTemplateCreated(1, "TestTemplate", distributor, block.timestamp);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        assertEq(templateId, 1);
        assertEq(shipmentFactory.nextTemplateId(), 2);
        assertEq(shipmentFactory.templateNameToId("TestTemplate"), templateId);
        
        ShipmentFactory.ShipmentTemplate memory template = shipmentFactory.getShipmentTemplate(templateId);
        assertEq(template.templateId, templateId);
        assertEq(template.templateName, "TestTemplate");
        assertEq(template.transportMode, "TRUCK");
        assertEq(template.estimatedDurationHours, 24);
        assertEq(template.temperatureControlled, false);
        assertEq(template.minTemperature, 0);
        assertEq(template.maxTemperature, 25);
        assertTrue(template.isActive);
        assertEq(template.creator, distributor);
    }
    
    /**
     * @dev Test creating template with empty name fails
     */
    function testFuzzCreateTemplateEmptyName() public {
        string[] memory conditions = new string[](0);
        
        vm.expectRevert("Template name cannot be empty");
        vm.prank(distributor);
        shipmentFactory.createShipmentTemplate(
            "",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
    }
    
    /**
     * @dev Test creating template with duplicate name fails
     */
    function testFuzzCreateTemplateDuplicateName(
        string memory templateName
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.expectRevert("Template name already exists");
        vm.prank(distributor);
        shipmentFactory.createShipmentTemplate(
            templateName,
            "AIR",
            conditions,
            12,
            true,
            -5,
            5
        );
    }
    
    /**
     * @dev Test getting template by name
     */
    function testFuzzGetTemplateByName(
        string memory templateName
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        ShipmentFactory.ShipmentTemplate memory template = shipmentFactory.getTemplateByName(templateName);
        assertEq(template.templateId, templateId);
        assertEq(template.templateName, templateName);
    }
    
    /**
     * @dev Test getting non-existent template by name fails
     */
    function testFuzzGetTemplateByNameNonExistent(
        string memory templateName
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        
        vm.expectRevert("Template not found");
        shipmentFactory.getTemplateByName(templateName);
    }

    // ===== ROUTE TEMPLATE TESTS =====
    
    /**
     * @dev Test creating a route template
     */
    function testFuzzCreateRouteTemplate() public {
        string[] memory waypoints = new string[](2);
        waypoints[0] = "Waypoint 1";
        waypoints[1] = "Waypoint 2";
        
        vm.expectEmit(true, false, false, true);
        emit RouteTemplateCreated(1, "TestRoute", "New York", "Los Angeles", block.timestamp);
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "TestRoute",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        assertEq(routeId, 1);
        assertEq(shipmentFactory.nextRouteId(), 2);
        assertEq(shipmentFactory.routeNameToId("TestRoute"), routeId);
        
        ShipmentFactory.RouteTemplate memory route = shipmentFactory.getRouteTemplate(routeId);
        assertEq(route.routeId, routeId);
        assertEq(route.routeName, "TestRoute");
        assertEq(route.origin, "New York");
        assertEq(route.destination, "Los Angeles");
        assertEq(route.estimatedDurationHours, 72);
        assertEq(route.transportMode, "TRUCK");
        assertTrue(route.isActive);
        assertEq(route.usageCount, 0);
    }
    
    /**
     * @dev Test creating route with empty name fails
     */
    function testFuzzCreateRouteEmptyName() public {
        string[] memory waypoints = new string[](0);
        
        vm.expectRevert("Route name cannot be empty");
        vm.prank(distributor);
        shipmentFactory.createRouteTemplate(
            "",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
    }
    
    /**
     * @dev Test creating route with duplicate name fails
     */
    function testFuzzCreateRouteDuplicateName(
        string memory routeName
    ) public {
        vm.assume(bytes(routeName).length > 0 && bytes(routeName).length <= 20);
        
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        shipmentFactory.createRouteTemplate(
            routeName,
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        vm.expectRevert("Route name already exists");
        vm.prank(distributor);
        shipmentFactory.createRouteTemplate(
            routeName,
            "Chicago",
            "Miami",
            waypoints,
            48,
            "AIR"
        );
    }
    
    /**
     * @dev Test getting route by name
     */
    function testFuzzGetRouteByName(
        string memory routeName
    ) public {
        vm.assume(bytes(routeName).length > 0 && bytes(routeName).length <= 20);
        
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            routeName,
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        ShipmentFactory.RouteTemplate memory route = shipmentFactory.getRouteByName(routeName);
        assertEq(route.routeId, routeId);
        assertEq(route.routeName, routeName);
    }
    
    /**
     * @dev Test getting non-existent route by name fails
     */
    function testFuzzGetRouteByNameNonExistent(
        string memory routeName
    ) public {
        vm.assume(bytes(routeName).length > 0 && bytes(routeName).length <= 20);
        
        vm.expectRevert("Route not found");
        shipmentFactory.getRouteByName(routeName);
    }

    // ===== SHIPMENT CREATION FROM TEMPLATE TESTS =====
    
    /**
     * @dev Test creating shipment from template
     */
    function testFuzzCreateShipmentFromTemplate() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentFactory.createShipmentFromTemplate(
            templateId,
            testProductId,
            retailer,
            "TRACK001"
        );
        
        assertEq(shipmentId, 1);
        assertEq(shipmentFactory.totalShipmentsCreated(), 1);
        
        uint256[] memory distributorShipments = shipmentFactory.getDistributorShipments(distributor);
        assertEq(distributorShipments.length, 1);
        assertEq(distributorShipments[0], shipmentId);
    }
    
    /**
     * @dev Test creating shipment from non-existent template fails
     */
    function testFuzzCreateShipmentFromNonExistentTemplate(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 20);
        
        vm.expectRevert("Template does not exist or is inactive");
        vm.prank(distributor);
        shipmentFactory.createShipmentFromTemplate(
            999,
            testProductId,
            retailer,
            trackingNumber
        );
    }
    
    /**
     * @dev Test creating shipment by non-distributor fails
     */
    function testFuzzCreateShipmentNonDistributor(
        string memory templateName,
        string memory trackingNumber
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.expectRevert("Only registered distributors can create shipments");
        vm.prank(unauthorized);
        shipmentFactory.createShipmentFromTemplate(
            templateId,
            testProductId,
            retailer,
            trackingNumber
        );
    }

    // ===== SHIPMENT WITH ROUTE TESTS =====
    
    /**
     * @dev Test creating shipment with route
     */
    function testFuzzCreateShipmentWithRoute() public {
        string[] memory conditions = new string[](0);
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "TestRoute",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentFactory.createShipmentWithRoute(
            testProductId,
            retailer,
            "TRACK001",
            routeId,
            templateId
        );
        
        assertEq(shipmentId, 1);
        assertEq(shipmentFactory.totalShipmentsCreated(), 1);
        
        // Check route usage was incremented
        ShipmentFactory.RouteTemplate memory route = shipmentFactory.getRouteTemplate(routeId);
        assertEq(route.usageCount, 1);
    }
    
    /**
     * @dev Test creating shipment with non-existent route fails
     */
    function testFuzzCreateShipmentWithNonExistentRoute(
        string memory templateName,
        string memory trackingNumber
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.expectRevert("Route does not exist or is inactive");
        vm.prank(distributor);
        shipmentFactory.createShipmentWithRoute(
            testProductId,
            retailer,
            trackingNumber,
            999,
            templateId
        );
    }

    // ===== BATCH SHIPMENT TESTS =====
    
    /**
     * @dev Test requesting batch shipment creation
     */
    function testFuzzRequestBatchShipmentCreation() public {
        // Create additional products
        uint256[] memory productIds = new uint256[](2);
        productIds[0] = testProductId;
        
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Product2",
            "BATCH2",
            "Test data",
            "Farm Location"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed");
        
        productIds[1] = productId2;
        
        address[] memory receivers = new address[](2);
        string[] memory trackingNumbers = new string[](2);
        
        receivers[0] = retailer;
        receivers[1] = retailer;
        trackingNumbers[0] = "TRACK1";
        trackingNumbers[1] = "TRACK2";
        
        string[] memory conditions = new string[](0);
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "TestRoute",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        vm.expectEmit(true, true, false, true);
        emit BatchShipmentRequested(1, distributor, 2, block.timestamp);
        
        vm.prank(distributor);
        uint256 batchId = shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            routeId
        );
        
        assertEq(batchId, 1);
        assertEq(shipmentFactory.nextBatchId(), 2);
        
        ShipmentFactory.BatchShipmentRequest memory request = shipmentFactory.getBatchRequest(batchId);
        assertEq(request.batchId, batchId);
        assertEq(request.distributor, distributor);
        assertEq(request.templateId, templateId);
        assertEq(request.routeId, routeId);
        assertFalse(request.isProcessed);
        assertEq(request.productIds.length, 2);
    }
    
    /**
     * @dev Test batch creation with empty arrays fails
     */
    function testFuzzBatchCreationEmptyArrays() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        uint256[] memory emptyProductIds = new uint256[](0);
        address[] memory emptyReceivers = new address[](0);
        string[] memory emptyTrackingNumbers = new string[](0);
        
        vm.expectRevert("Must specify at least one shipment");
        vm.prank(distributor);
        shipmentFactory.requestBatchShipmentCreation(
            emptyProductIds,
            emptyReceivers,
            emptyTrackingNumbers,
            templateId,
            0
        );
    }
    
    /**
     * @dev Test batch creation with mismatched array lengths fails
     */
    function testFuzzBatchCreationMismatchedArrays() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        uint256[] memory productIds = new uint256[](2);
        productIds[0] = testProductId;
        productIds[1] = testProductId;
        
        address[] memory receivers = new address[](1);
        receivers[0] = retailer;
        
        string[] memory trackingNumbers = new string[](2);
        trackingNumbers[0] = "TRACK1";
        trackingNumbers[1] = "TRACK2";
        
        vm.expectRevert("Array lengths must match");
        vm.prank(distributor);
        shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            0
        );
    }
    
    /**
     * @dev Test processing batch shipment creation
     */
    function testFuzzProcessBatchShipmentCreation() public {
        // Create additional products
        uint256[] memory productIds = new uint256[](2);
        productIds[0] = testProductId;
        
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Product2",
            "BATCH2",
            "Test data",
            "Farm Location"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed");
        
        productIds[1] = productId2;
        
        address[] memory receivers = new address[](2);
        string[] memory trackingNumbers = new string[](2);
        
        receivers[0] = retailer;
        receivers[1] = retailer;
        trackingNumbers[0] = "TRACK1";
        trackingNumbers[1] = "TRACK2";
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        uint256 batchId = shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            0
        );
        
        vm.prank(distributor);
        shipmentFactory.processBatchShipmentCreation(batchId);
        
        ShipmentFactory.BatchShipmentRequest memory request = shipmentFactory.getBatchRequest(batchId);
        assertTrue(request.isProcessed);
        assertEq(request.createdShipmentIds.length, 2);
        assertEq(shipmentFactory.totalShipmentsCreated(), 2);
    }
    
    /**
     * @dev Test processing already processed batch fails
     */
    function testFuzzProcessAlreadyProcessedBatch() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        uint256[] memory productIds = new uint256[](1);
        productIds[0] = testProductId;
        address[] memory receivers = new address[](1);
        receivers[0] = retailer;
        string[] memory trackingNumbers = new string[](1);
        trackingNumbers[0] = "TRACK1";
        
        vm.prank(distributor);
        uint256 batchId = shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            0
        );
        
        vm.prank(distributor);
        shipmentFactory.processBatchShipmentCreation(batchId);
        
        vm.expectRevert("Batch already processed");
        vm.prank(distributor);
        shipmentFactory.processBatchShipmentCreation(batchId);
    }
    
    /**
     * @dev Test processing batch by unauthorized user fails
     */
    function testFuzzProcessBatchUnauthorized() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        uint256[] memory productIds = new uint256[](1);
        productIds[0] = testProductId;
        address[] memory receivers = new address[](1);
        receivers[0] = retailer;
        string[] memory trackingNumbers = new string[](1);
        trackingNumbers[0] = "TRACK1";
        
        vm.prank(distributor);
        uint256 batchId = shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            0
        );
        
        vm.expectRevert("Only distributor or factory owner can process batch");
        vm.prank(unauthorized);
        shipmentFactory.processBatchShipmentCreation(batchId);
    }

    // ===== STANDARD SHIPMENT TESTS =====
    
    /**
     * @dev Test creating standard shipment
     */
    function testFuzzCreateStandardShipment() public {
        vm.prank(distributor);
        uint256 shipmentId = shipmentFactory.createStandardShipment(
            testProductId,
            retailer,
            "TRACK001",
            "TRUCK"
        );
        
        assertEq(shipmentId, 1);
        assertEq(shipmentFactory.totalShipmentsCreated(), 1);
        
        uint256[] memory distributorShipments = shipmentFactory.getDistributorShipments(distributor);
        assertEq(distributorShipments.length, 1);
        assertEq(distributorShipments[0], shipmentId);
    }
    
    /**
     * @dev Test creating standard shipment by non-distributor fails
     */
    function testFuzzCreateStandardShipmentNonDistributor(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 20);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 10);
        
        vm.expectRevert("Only registered distributors can create shipments");
        vm.prank(unauthorized);
        shipmentFactory.createStandardShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
    }

    // ===== EXPRESS SHIPMENT TESTS =====
    
    /**
     * @dev Test creating express shipment
     */
    function testFuzzCreateExpressShipment() public {
        vm.prank(distributor);
        uint256 shipmentId = shipmentFactory.createExpressShipment(
            testProductId,
            retailer,
            "TRACK001"
        );
        
        assertEq(shipmentId, 1);
        assertEq(shipmentFactory.totalShipmentsCreated(), 1);
        
        uint256[] memory distributorShipments = shipmentFactory.getDistributorShipments(distributor);
        assertEq(distributorShipments.length, 1);
        assertEq(distributorShipments[0], shipmentId);
    }
    
    /**
     * @dev Test creating express shipment by non-distributor fails
     */
    function testFuzzCreateExpressShipmentNonDistributor(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 15);
        
        vm.expectRevert("Only registered distributors can create shipments");
        vm.prank(unauthorized);
        shipmentFactory.createExpressShipment(
            testProductId,
            retailer,
            trackingNumber
        );
    }

    // ===== QUERY FUNCTION TESTS =====
    
    /**
     * @dev Test getting optimal routes
     */
    function testFuzzGetOptimalRoutes(
        string memory origin,
        string memory destination,
        string memory transportMode
    ) public {
        vm.assume(bytes(origin).length > 0 && bytes(origin).length <= 20);
        vm.assume(bytes(destination).length > 0 && bytes(destination).length <= 20);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 10);
        
        string[] memory waypoints = new string[](0);
        
        // Create matching route
        vm.prank(distributor);
        uint256 routeId1 = shipmentFactory.createRouteTemplate(
            "Route1",
            origin,
            destination,
            waypoints,
            72,
            transportMode
        );
        
        // Create non-matching route
        vm.prank(distributor);
        shipmentFactory.createRouteTemplate(
            "Route2",
            "Different Origin",
            destination,
            waypoints,
            48,
            transportMode
        );
        
        uint256[] memory optimalRoutes = shipmentFactory.getOptimalRoutes(
            origin,
            destination,
            transportMode
        );
        
        assertEq(optimalRoutes.length, 1);
        assertEq(optimalRoutes[0], routeId1);
    }
    
    /**
     * @dev Test getting factory statistics
     */
    function testFuzzGetFactoryStats() public {
        string[] memory conditions = new string[](0);
        string[] memory waypoints = new string[](0);
        
        // Create templates and routes
        vm.prank(distributor);
        shipmentFactory.createShipmentTemplate(
            "Template1",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        shipmentFactory.createRouteTemplate(
            "Route1",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        // Create shipment
        vm.prank(distributor);
        shipmentFactory.createStandardShipment(
            testProductId,
            retailer,
            "TRACK001",
            "TRUCK"
        );
        
        (
            uint256 totalTemplates,
            uint256 totalRoutes,
            uint256 totalShipmentsFromFactory,
            uint256 totalBatches
        ) = shipmentFactory.getFactoryStats();
        
        assertEq(totalTemplates, 1);
        assertEq(totalRoutes, 1);
        assertEq(totalShipmentsFromFactory, 1);
        assertEq(totalBatches, 0);
    }
    
    /**
     * @dev Test getting most used routes
     */
    function testFuzzGetMostUsedRoutes() public {
        string[] memory waypoints = new string[](0);
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "Template1",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "Route1",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        // Use the route to increase usage count
        vm.prank(distributor);
        shipmentFactory.createShipmentWithRoute(
            testProductId,
            retailer,
            "TRACK001",
            routeId,
            templateId
        );
        
        (uint256[] memory routeIds, uint256[] memory usageCounts) = shipmentFactory.getMostUsedRoutes(5);
        
        assertEq(routeIds.length, 1);
        assertEq(usageCounts.length, 1);
        assertEq(routeIds[0], routeId);
        assertEq(usageCounts[0], 1);
    }

    // ===== ADMIN FUNCTION TESTS =====
    
    /**
     * @dev Test updating shipment registry
     */
    function testFuzzUpdateShipmentRegistry() public {
        ShipmentRegistry newRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );
        
        vm.prank(deployer);
        shipmentFactory.updateShipmentRegistry(address(newRegistry));
        
        assertEq(address(shipmentFactory.shipmentRegistry()), address(newRegistry));
    }
    
    /**
     * @dev Test updating shipment registry with zero address fails
     */
    function testFuzzUpdateShipmentRegistryZeroAddress() public {
        vm.expectRevert("Invalid address");
        vm.prank(deployer);
        shipmentFactory.updateShipmentRegistry(address(0));
    }
    
    /**
     * @dev Test updating shipment registry by non-owner fails
     */
    function testFuzzUpdateShipmentRegistryNonOwner() public {
        ShipmentRegistry newRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );
        
        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        shipmentFactory.updateShipmentRegistry(address(newRegistry));
    }
    
    /**
     * @dev Test deactivating template
     */
    function testFuzzDeactivateTemplate(
        string memory templateName
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.prank(distributor);
        shipmentFactory.deactivateTemplate(templateId);
        
        vm.expectRevert("Template does not exist or is inactive");
        shipmentFactory.getShipmentTemplate(templateId);
    }
    
    /**
     * @dev Test deactivating template by unauthorized user fails
     */
    function testFuzzDeactivateTemplateUnauthorized(
        string memory templateName
    ) public {
        vm.assume(bytes(templateName).length > 0 && bytes(templateName).length <= 20);
        
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            templateName,
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        vm.expectRevert("Not authorized");
        vm.prank(unauthorized);
        shipmentFactory.deactivateTemplate(templateId);
    }
    
    /**
     * @dev Test deactivating route
     */
    function testFuzzDeactivateRoute(
        string memory routeName
    ) public {
        vm.assume(bytes(routeName).length > 0 && bytes(routeName).length <= 20);
        
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            routeName,
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        vm.prank(deployer);
        shipmentFactory.deactivateRoute(routeId);
        
        vm.expectRevert("Route does not exist or is inactive");
        shipmentFactory.getRouteTemplate(routeId);
    }
    
    /**
     * @dev Test deactivating route by non-owner fails
     */
    function testFuzzDeactivateRouteNonOwner(
        string memory routeName
    ) public {
        vm.assume(bytes(routeName).length > 0 && bytes(routeName).length <= 20);
        
        string[] memory waypoints = new string[](0);
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            routeName,
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        shipmentFactory.deactivateRoute(routeId);
    }
    
    /**
     * @dev Test transferring ownership
     */
    function testFuzzTransferOwnership(address newOwner) public {
        vm.assume(newOwner != address(0));
        vm.assume(newOwner != deployer);
        
        vm.prank(deployer);
        shipmentFactory.transferOwnership(newOwner);
        
        assertEq(shipmentFactory.factoryOwner(), newOwner);
    }
    
    /**
     * @dev Test transferring ownership to zero address fails
     */
    function testFuzzTransferOwnershipZeroAddress() public {
        vm.expectRevert("Invalid address");
        vm.prank(deployer);
        shipmentFactory.transferOwnership(address(0));
    }
    
    /**
     * @dev Test transferring ownership by non-owner fails
     */
    function testFuzzTransferOwnershipNonOwner(address newOwner) public {
        vm.assume(newOwner != address(0));
        
        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        shipmentFactory.transferOwnership(newOwner);
    }

    // ===== COMPLEX INTEGRATION TESTS =====
    
    /**
     * @dev Test complete factory workflow
     */
    function testFuzzCompleteFactoryWorkflow() public {
        string[] memory conditions = new string[](1);
        conditions[0] = "temperature_controlled";
        string[] memory waypoints = new string[](1);
        waypoints[0] = "Chicago";
        
        // 1. Create template
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "TestTemplate",
            "TRUCK",
            conditions,
            24,
            true,
            -5,
            5
        );
        
        // 2. Create route
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "TestRoute",
            "New York",
            "Los Angeles",
            waypoints,
            72,
            "TRUCK"
        );
        
        // 3. Create shipment using template and route
        vm.prank(distributor);
        uint256 shipmentId = shipmentFactory.createShipmentWithRoute(
            testProductId,
            retailer,
            "TRACK001",
            routeId,
            templateId
        );
        
        // 4. Create additional product for standard shipment
        vm.prank(farmer);
        uint256 secondProductId = productRegistry.registerProduct(
            "Second Test Product",
            "BATCH_002",
            "Second product data",
            "Farm Location"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(secondProductId, "Processed successfully");
        
        // 5. Create standard shipment with different product
        vm.prank(distributor);
        uint256 standardShipmentId = shipmentFactory.createStandardShipment(
            secondProductId,
            retailer,
            "STD_TRACK",
            "AIR"
        );
        
        // 5. Verify state
        assertEq(shipmentFactory.totalShipmentsCreated(), 2);
        
        uint256[] memory distributorShipments = shipmentFactory.getDistributorShipments(distributor);
        assertEq(distributorShipments.length, 2);
        assertEq(distributorShipments[0], shipmentId);
        assertEq(distributorShipments[1], standardShipmentId);
        
        ShipmentFactory.RouteTemplate memory route = shipmentFactory.getRouteTemplate(routeId);
        assertEq(route.usageCount, 1);
    }
    
    /**
     * @dev Test factory owner processing batches
     */
    function testFuzzFactoryOwnerProcessingBatch() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "Test Template",
            "TRUCK",
            conditions,
            24,
            false,
            0,
            25
        );
        
        uint256[] memory productIds = new uint256[](2);
        productIds[0] = testProductId;
        
        // Create additional product for batch test
        vm.prank(farmer);
        uint256 thirdProductId = productRegistry.registerProduct(
            "Third Test Product",
            "BATCH_003",
            "Third product data",
            "Farm Location"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(thirdProductId, "Processed successfully");
        
        productIds[1] = thirdProductId;
        
        address[] memory receivers = new address[](2);
        receivers[0] = retailer;
        receivers[1] = retailer;
        
        string[] memory trackingNumbers = new string[](2);
        trackingNumbers[0] = "TRACK1";
        trackingNumbers[1] = "TRACK2";
        
        vm.prank(distributor);
        uint256 batchId = shipmentFactory.requestBatchShipmentCreation(
            productIds,
            receivers,
            trackingNumbers,
            templateId,
            0
        );
        
        // Factory owner processes the batch instead of distributor
        vm.prank(deployer);
        shipmentFactory.processBatchShipmentCreation(batchId);
        
        ShipmentFactory.BatchShipmentRequest memory request = shipmentFactory.getBatchRequest(batchId);
        assertTrue(request.isProcessed);
        assertEq(request.createdShipmentIds.length, 2);
        assertEq(shipmentFactory.totalShipmentsCreated(), 2);
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====
    
    /**
     * @dev Test template with extreme temperature values
     */
    function testFuzzExtremeTemperatureTemplate() public {
        string[] memory conditions = new string[](0);
        
        vm.prank(distributor);
        uint256 templateId = shipmentFactory.createShipmentTemplate(
            "Extreme Temp Template",
            "CRYOGENIC",
            conditions,
            48,
            true,
            -196, // Liquid nitrogen temperature
            -150
        );
        
        ShipmentFactory.ShipmentTemplate memory template = shipmentFactory.getShipmentTemplate(templateId);
        assertEq(template.minTemperature, -196);
        assertEq(template.maxTemperature, -150);
        assertTrue(template.temperatureControlled);
    }
    
    /**
     * @dev Test route with many waypoints
     */
    function testFuzzRouteWithManyWaypoints() public {
        string[] memory waypoints = new string[](5);
        waypoints[0] = "Waypoint 1";
        waypoints[1] = "Waypoint 2";
        waypoints[2] = "Waypoint 3";
        waypoints[3] = "Waypoint 4";
        waypoints[4] = "Waypoint 5";
        
        vm.prank(distributor);
        uint256 routeId = shipmentFactory.createRouteTemplate(
            "Multi Waypoint Route",
            "Start City",
            "End City",
            waypoints,
            120,
            "TRUCK"
        );
        
        ShipmentFactory.RouteTemplate memory route = shipmentFactory.getRouteTemplate(routeId);
        assertEq(route.waypoints.length, 5);
        assertEq(route.waypoints[0], "Waypoint 1");
        assertEq(route.waypoints[4], "Waypoint 5");
    }
    
    /**
     * @dev Test getting non-existent template fails
     */
    function testFuzzGetNonExistentTemplate() public {
        vm.expectRevert("Template does not exist or is inactive");
        shipmentFactory.getShipmentTemplate(999);
    }
    
    /**
     * @dev Test getting non-existent route fails
     */
    function testFuzzGetNonExistentRoute() public {
        vm.expectRevert("Route does not exist or is inactive");
        shipmentFactory.getRouteTemplate(999);
    }

    // ===== EVENT TESTING =====
    
    event ShipmentTemplateCreated(
        uint256 indexed templateId,
        string templateName,
        address indexed creator,
        uint256 timestamp
    );

    event RouteTemplateCreated(
        uint256 indexed routeId,
        string routeName,
        string origin,
        string destination,
        uint256 timestamp
    );

    event ShipmentCreatedFromTemplate(
        uint256 indexed shipmentId,
        uint256 indexed templateId,
        uint256 indexed productId,
        address distributor,
        uint256 timestamp
    );

    event BatchShipmentRequested(
        uint256 indexed batchId,
        address indexed distributor,
        uint256 shipmentCount,
        uint256 timestamp
    );

    event BatchShipmentCompleted(
        uint256 indexed batchId,
        uint256[] shipmentIds,
        uint256 timestamp
    );
}
