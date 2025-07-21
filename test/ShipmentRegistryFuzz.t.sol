// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ShipmentRegistry.sol";
import "../src/SmartContracts/ProductRegistry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";

contract ShipmentRegistryFuzz is Test {
    ShipmentRegistry public shipmentRegistry;
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    
    address public deployer;
    address public farmer;
    address public processor;
    address public distributor;
    address public retailer;
    address public unauthorized;
    address public consumer;
    
    uint256 public testProductId;
    
    function setUp() public {
        deployer = makeAddr("deployer");
        farmer = makeAddr("farmer");
        processor = makeAddr("processor");
        distributor = makeAddr("distributor");
        retailer = makeAddr("retailer");
        unauthorized = makeAddr("unauthorized");
        consumer = makeAddr("consumer");
        
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
        
        // Create a test product for shipment testing
        vm.prank(farmer);
        testProductId = productRegistry.registerProduct(
            "Test Product for Shipment",
            "TEST_BATCH_001",
            "Test product data"
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
        ShipmentRegistry newRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );
        
        assertEq(address(newRegistry.stakeholderRegistry()), address(stakeholderRegistry));
        assertEq(address(newRegistry.productRegistry()), address(productRegistry));
        assertEq(newRegistry.nextShipmentId(), 1);
        assertEq(newRegistry.totalShipments(), 0);
    }
    
    /**
     * @dev Test constructor with zero addresses (will deploy but fail during use)
     */
    function testFuzzConstructorZeroAddresses() public {
        // Constructor doesn't validate addresses, so this will deploy
        ShipmentRegistry newRegistry = new ShipmentRegistry(address(0), address(0));
        
        // But operations will fail when trying to use the registries
        vm.expectRevert();
        vm.prank(distributor);
        newRegistry.createShipment(
            testProductId,
            retailer,
            "TRACK001",
            "Road"
        );
    }

    // ===== SHIPMENT CREATION TESTS =====
    
    /**
     * @dev Test creating a shipment
     */
    function testFuzzCreateShipment(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.expectEmit(true, true, true, true);
        emit ShipmentCreated(1, testProductId, distributor, retailer, trackingNumber, block.timestamp);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        assertEq(shipmentId, 1);
        assertEq(shipmentRegistry.nextShipmentId(), 2);
        assertEq(shipmentRegistry.totalShipments(), 1);
        assertEq(shipmentRegistry.getShipmentByProduct(testProductId), shipmentId);
        assertEq(shipmentRegistry.getShipmentByTrackingNumber(trackingNumber), shipmentId);
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(shipment.shipmentId, shipmentId);
        assertEq(shipment.productId, testProductId);
        assertEq(shipment.sender, distributor);
        assertEq(shipment.receiver, retailer);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.PREPARING));
        assertTrue(shipment.isActive);
        assertEq(shipment.trackingNumber, trackingNumber);
        assertEq(shipment.transportMode, transportMode);
    }
    
    /**
     * @dev Test creating shipment with invalid receiver fails
     */
    function testFuzzCreateShipmentInvalidReceiver(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.expectRevert("Invalid receiver address");
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            address(0),
            trackingNumber,
            transportMode
        );
    }
    
    /**
     * @dev Test creating shipment with empty tracking number fails
     */
    function testFuzzCreateShipmentEmptyTracking(
        string memory transportMode
    ) public {
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.expectRevert("Tracking number cannot be empty");
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            "",
            transportMode
        );
    }
    
    /**
     * @dev Test creating shipment with duplicate tracking number fails
     */
    function testFuzzCreateShipmentDuplicateTracking(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // Create another product for second shipment
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Test Product 2",
            "TEST_BATCH_002",
            "Test product data 2"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed successfully");
        
        vm.expectRevert("Tracking number already exists");
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            productId2,
            retailer,
            trackingNumber,
            "Air"
        );
    }
    
    /**
     * @dev Test creating shipment for product already shipped fails
     */
    function testFuzzCreateShipmentProductAlreadyShipped(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber1).length > 0 && bytes(trackingNumber1).length <= 50);
        vm.assume(bytes(trackingNumber2).length > 0 && bytes(trackingNumber2).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber2)));
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber1,
            transportMode
        );
        
        vm.expectRevert("Product already has an active shipment");
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber2,
            transportMode
        );
    }
    
    /**
     * @dev Test creating shipment by non-distributor fails
     */
    function testFuzzCreateShipmentUnauthorized(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.expectRevert("Not registered as distributor");
        vm.prank(unauthorized);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
    }

    // ===== SHIPMENT STATUS UPDATE TESTS =====
    
    /**
     * @dev Test updating shipment status
     */
    function testFuzzUpdateShipmentStatus(
        string memory trackingNumber,
        string memory transportMode,
        string memory trackingInfo,
        string memory location
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(bytes(trackingInfo).length > 0 && bytes(trackingInfo).length <= 100);
        vm.assume(bytes(location).length > 0 && bytes(location).length <= 100);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        vm.expectEmit(true, true, true, true);
        emit ShipmentStatusUpdated(
            shipmentId,
            testProductId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            distributor,
            trackingInfo,
            block.timestamp
        );
        
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            trackingInfo,
            location
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.SHIPPED));
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history.length, 2); // Initial + update
        assertEq(uint8(history[1].status), uint8(ShipmentRegistry.ShipmentStatus.SHIPPED));
        assertEq(history[1].trackingInfo, trackingInfo);
        assertEq(history[1].location, location);
        assertEq(history[1].updater, distributor);
    }
    
    /**
     * @dev Test updating shipment status with simple method
     */
    function testFuzzUpdateShipmentStatusSimple(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.SHIPPED));
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history.length, 2);
        assertEq(history[1].trackingInfo, "Shipment dispatched");
    }
    
    /**
     * @dev Test invalid status transition fails
     */
    function testFuzzInvalidStatusTransition(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // Try to go directly from PREPARING to DELIVERED (invalid)
        vm.expectRevert("Invalid shipment status transition");
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.DELIVERED,
            "Invalid transition",
            "Location"
        );
    }
    
    /**
     * @dev Test updating shipment by unauthorized user fails
     */
    function testFuzzUpdateShipmentUnauthorized(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        vm.expectRevert("Not authorized for this shipment");
        vm.prank(unauthorized);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            "Unauthorized update",
            "Location"
        );
    }

    // ===== SHIPMENT WORKFLOW TESTS =====
    
    /**
     * @dev Test complete shipment workflow
     */
    function testFuzzCompleteShipmentWorkflow(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        // 1. Create shipment
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // 2. Ship the product
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            "Package shipped",
            "Distribution center"
        );
        
        // 3. Deliver the product
        vm.expectEmit(true, true, true, true);
        emit ShipmentDelivered(shipmentId, testProductId, retailer, block.timestamp);
        
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.DELIVERED,
            "Package delivered",
            "Retail store"
        );
        
        // 4. Verify delivery
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.VERIFIED,
            "Delivery confirmed",
            "Retail store"
        );
        
        // Verify final state
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.VERIFIED));
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history.length, 4); // PREPARING, SHIPPED, DELIVERED, VERIFIED
    }
    
    /**
     * @dev Test shipment cancellation
     */
    function testFuzzCancelShipment(
        string memory trackingNumber,
        string memory transportMode,
        string memory reason
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(bytes(reason).length > 0 && bytes(reason).length <= 100);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        vm.expectEmit(true, true, false, true);
        emit ShipmentCancelled(shipmentId, testProductId, reason, block.timestamp);
        
        vm.prank(distributor);
        shipmentRegistry.cancelShipment(shipmentId, reason);
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.CANCELLED));
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history.length, 2); // PREPARING, CANCELLED
        assertEq(history[1].trackingInfo, reason);
    }
    
    /**
     * @dev Test cancelling delivered shipment fails
     */
    function testFuzzCancelDeliveredShipmentFails(
        string memory trackingNumber,
        string memory transportMode,
        string memory reason
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(bytes(reason).length > 0 && bytes(reason).length <= 100);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // Progress to delivered
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.DELIVERED
        );
        
        vm.expectRevert("Cannot cancel shipment in current status");
        vm.prank(distributor);
        shipmentRegistry.cancelShipment(shipmentId, reason);
    }

    // ===== QUERY FUNCTION TESTS =====
    
    /**
     * @dev Test getting shipment information
     */
    function testFuzzGetShipmentInfo(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(shipment.shipmentId, shipmentId);
        assertEq(shipment.productId, testProductId);
        assertEq(shipment.sender, distributor);
        assertEq(shipment.receiver, retailer);
        assertEq(shipment.trackingNumber, trackingNumber);
        assertEq(shipment.transportMode, transportMode);
        assertTrue(shipment.isActive);
    }
    
    /**
     * @dev Test getting shipment by product
     */
    function testFuzzGetShipmentByProduct(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        uint256 foundShipmentId = shipmentRegistry.getShipmentByProduct(testProductId);
        assertEq(foundShipmentId, shipmentId);
    }
    
    /**
     * @dev Test getting shipment by tracking number
     */
    function testFuzzGetShipmentByTrackingNumber(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        uint256 foundShipmentId = shipmentRegistry.getShipmentByTrackingNumber(trackingNumber);
        assertEq(foundShipmentId, shipmentId);
    }
    
    /**
     * @dev Test getting shipment by non-existent tracking number
     */
    function testFuzzGetShipmentByNonExistentTrackingNumber(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        
        uint256 foundShipmentId = shipmentRegistry.getShipmentByTrackingNumber(trackingNumber);
        assertEq(foundShipmentId, 0);
    }
    
    /**
     * @dev Test getting stakeholder shipments
     */
    function testFuzzGetStakeholderShipments(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber1).length > 0 && bytes(trackingNumber1).length <= 50);
        vm.assume(bytes(trackingNumber2).length > 0 && bytes(trackingNumber2).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber2)));
        
        // Create additional product
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Test Product 2",
            "TEST_BATCH_002",
            "Test product data 2"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed successfully");
        
        vm.prank(distributor);
        uint256 shipmentId1 = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber1,
            transportMode
        );
        
        vm.prank(distributor);
        uint256 shipmentId2 = shipmentRegistry.createShipment(
            productId2,
            retailer,
            trackingNumber2,
            transportMode
        );
        
        uint256[] memory distributorShipments = shipmentRegistry.getStakeholderShipments(distributor);
        assertEq(distributorShipments.length, 2);
        assertEq(distributorShipments[0], shipmentId1);
        assertEq(distributorShipments[1], shipmentId2);
        
        uint256[] memory retailerShipments = shipmentRegistry.getStakeholderShipments(retailer);
        assertEq(retailerShipments.length, 2);
        assertEq(retailerShipments[0], shipmentId1);
        assertEq(retailerShipments[1], shipmentId2);
    }
    
    /**
     * @dev Test getting shipments by status
     */
    function testFuzzGetShipmentsByStatus(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber1).length > 0 && bytes(trackingNumber1).length <= 50);
        vm.assume(bytes(trackingNumber2).length > 0 && bytes(trackingNumber2).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber2)));
        
        // Create additional product
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Test Product 2",
            "TEST_BATCH_002",
            "Test product data 2"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed successfully");
        
        vm.prank(distributor);
        uint256 shipmentId1 = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber1,
            transportMode
        );
        
        vm.prank(distributor);
        uint256 shipmentId2 = shipmentRegistry.createShipment(
            productId2,
            retailer,
            trackingNumber2,
            transportMode
        );
        
        // Ship one package
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId2,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        uint256[] memory preparingShipments = shipmentRegistry.getShipmentsByStatus(
            ShipmentRegistry.ShipmentStatus.PREPARING
        );
        assertEq(preparingShipments.length, 1);
        assertEq(preparingShipments[0], shipmentId1);
        
        uint256[] memory shippedShipments = shipmentRegistry.getShipmentsByStatus(
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        assertEq(shippedShipments.length, 1);
        assertEq(shippedShipments[0], shipmentId2);
    }

    // ===== TRACKING FUNCTION TESTS =====
    
    /**
     * @dev Test tracking shipment
     */
    function testFuzzTrackShipment(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            "Package shipped from warehouse",
            "Distribution center"
        );
        
        (
            uint256 foundShipmentId,
            uint256 foundProductId,
            ShipmentRegistry.ShipmentStatus status,
            string memory statusDescription,
            ShipmentRegistry.ShipmentUpdate memory latestUpdate
        ) = shipmentRegistry.trackShipment(trackingNumber);
        
        assertEq(foundShipmentId, shipmentId);
        assertEq(foundProductId, testProductId);
        assertEq(uint8(status), uint8(ShipmentRegistry.ShipmentStatus.SHIPPED));
        assertEq(statusDescription, "In transit");
        assertEq(latestUpdate.trackingInfo, "Package shipped from warehouse");
        assertEq(latestUpdate.location, "Distribution center");
        assertEq(latestUpdate.updater, distributor);
    }
    
    /**
     * @dev Test tracking with invalid tracking number fails
     */
    function testFuzzTrackShipmentInvalidTracking(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        
        vm.expectRevert("Invalid tracking number");
        shipmentRegistry.trackShipment(trackingNumber);
    }

    // ===== STATISTICS TESTS =====
    
    /**
     * @dev Test getting shipment statistics
     */
    function testFuzzGetShipmentStats(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory trackingNumber3,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber1).length > 0 && bytes(trackingNumber1).length <= 50);
        vm.assume(bytes(trackingNumber2).length > 0 && bytes(trackingNumber2).length <= 50);
        vm.assume(bytes(trackingNumber3).length > 0 && bytes(trackingNumber3).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber2)));
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber3)));
        vm.assume(keccak256(bytes(trackingNumber2)) != keccak256(bytes(trackingNumber3)));
        
        // Create additional products
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Test Product 2",
            "TEST_BATCH_002",
            "Test product data 2"
        );
        
        vm.prank(farmer);
        uint256 productId3 = productRegistry.registerProduct(
            "Test Product 3",
            "TEST_BATCH_003",
            "Test product data 3"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed successfully");
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId3, "Processed successfully");
        
        // Create shipments in different states
        vm.prank(distributor);
        uint256 shipmentId1 = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber1,
            transportMode
        );
        
        vm.prank(distributor);
        uint256 shipmentId2 = shipmentRegistry.createShipment(
            productId2,
            retailer,
            trackingNumber2,
            transportMode
        );
        
        vm.prank(distributor);
        uint256 shipmentId3 = shipmentRegistry.createShipment(
            productId3,
            retailer,
            trackingNumber3,
            transportMode
        );
        
        // Progress shipments to different states
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId2,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId3,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId3,
            ShipmentRegistry.ShipmentStatus.DELIVERED
        );
        
        (
            uint256 totalShipmentsCount,
            uint256 preparing,
            uint256 shipped,
            uint256 delivered,
            uint256 verified,
            uint256 cancelled
        ) = shipmentRegistry.getShipmentStats();
        
        assertEq(totalShipmentsCount, 3);
        assertEq(preparing, 1); // shipmentId1
        assertEq(shipped, 1);   // shipmentId2
        assertEq(delivered, 1); // shipmentId3
        assertEq(verified, 0);
        assertEq(cancelled, 0);
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====
    
    /**
     * @dev Test getting non-existent shipment info fails
     */
    function testFuzzGetNonExistentShipmentInfo() public {
        vm.expectRevert("Shipment does not exist");
        shipmentRegistry.getShipmentInfo(999);
    }
    
    /**
     * @dev Test getting history of non-existent shipment fails
     */
    function testFuzzGetNonExistentShipmentHistory() public {
        vm.expectRevert("Shipment does not exist");
        shipmentRegistry.getShipmentHistory(999);
    }
    
    /**
     * @dev Test updating non-existent shipment fails
     */
    function testFuzzUpdateNonExistentShipment() public {
        vm.expectRevert("Shipment does not exist");
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            999,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            "Info",
            "Location"
        );
    }
    
    /**
     * @dev Test maximum tracking number length
     */
    function testFuzzMaxTrackingNumberLength() public {
        string memory longTracking = "TRACK123456789012345678901234567890123456789012345678901234567890";
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            longTracking,
            "Road"
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(shipment.trackingNumber, longTracking);
        assertEq(shipmentRegistry.getShipmentByTrackingNumber(longTracking), shipmentId);
    }
    
    /**
     * @dev Test shipment with empty transport mode
     */
    function testFuzzEmptyTransportMode(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            "" // Empty transport mode
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(shipment.transportMode, "");
    }

    // ===== COMPLEX INTEGRATION TESTS =====
    
    /**
     * @dev Test multiple stakeholders updating same shipment
     */
    function testFuzzMultipleStakeholderUpdates(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // Distributor ships the package
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED,
            "Package shipped by distributor",
            "Distribution center"
        );
        
        // Retailer confirms delivery
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.DELIVERED,
            "Package received by retailer",
            "Retail store"
        );
        
        // Retailer verifies delivery
        vm.prank(retailer);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.VERIFIED,
            "Delivery verified by retailer",
            "Retail store"
        );
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history.length, 4);
        assertEq(history[1].updater, distributor);
        assertEq(history[2].updater, retailer);
        assertEq(history[3].updater, retailer);
    }
    
    /**
     * @dev Test unable to deliver scenario
     */
    function testFuzzUnableToDeliverScenario(
        string memory trackingNumber,
        string memory transportMode,
        string memory failureReason
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(bytes(failureReason).length > 0 && bytes(failureReason).length <= 100);
        
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        // Ship the package
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatusSimple(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.SHIPPED
        );
        
        // Unable to deliver
        vm.prank(distributor);
        shipmentRegistry.updateShipmentStatus(
            shipmentId,
            ShipmentRegistry.ShipmentStatus.UNABLE_TO_DELIVERED,
            failureReason,
            "Failed delivery location"
        );
        
        ShipmentRegistry.ShipmentInfo memory shipment = shipmentRegistry.getShipmentInfo(shipmentId);
        assertEq(uint8(shipment.status), uint8(ShipmentRegistry.ShipmentStatus.UNABLE_TO_DELIVERED));
        
        ShipmentRegistry.ShipmentUpdate[] memory history = shipmentRegistry.getShipmentHistory(shipmentId);
        assertEq(history[history.length - 1].trackingInfo, failureReason);
    }

    // ===== UTILITY FUNCTION TESTS =====
    
    /**
     * @dev Test getTotalShipments
     */
    function testFuzzGetTotalShipments(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber1).length > 0 && bytes(trackingNumber1).length <= 50);
        vm.assume(bytes(trackingNumber2).length > 0 && bytes(trackingNumber2).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        vm.assume(keccak256(bytes(trackingNumber1)) != keccak256(bytes(trackingNumber2)));
        
        assertEq(shipmentRegistry.getTotalShipments(), 0);
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber1,
            transportMode
        );
        
        assertEq(shipmentRegistry.getTotalShipments(), 1);
        
        // Create another product and shipment
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct(
            "Test Product 2",
            "TEST_BATCH_002",
            "Test product data 2"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed successfully");
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            productId2,
            retailer,
            trackingNumber2,
            transportMode
        );
        
        assertEq(shipmentRegistry.getTotalShipments(), 2);
    }
    
    /**
     * @dev Test getNextShipmentId
     */
    function testFuzzGetNextShipmentId(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(bytes(transportMode).length > 0 && bytes(transportMode).length <= 30);
        
        assertEq(shipmentRegistry.getNextShipmentId(), 1);
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(
            testProductId,
            retailer,
            trackingNumber,
            transportMode
        );
        
        assertEq(shipmentRegistry.getNextShipmentId(), 2);
    }

    // ===== EVENT TESTING =====
    
    event ShipmentCreated(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        address indexed sender,
        address receiver,
        string trackingNumber,
        uint256 timestamp
    );

    event ShipmentStatusUpdated(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        ShipmentRegistry.ShipmentStatus indexed newStatus,
        address updater,
        string trackingInfo,
        uint256 timestamp
    );

    event ShipmentDelivered(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        address indexed receiver,
        uint256 timestamp
    );

    event ShipmentCancelled(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        string reason,
        uint256 timestamp
    );
}
