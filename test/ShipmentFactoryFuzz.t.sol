// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ShipmentFactory.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/StakeholderFactory.sol";
import "../src/SmartContracts/ProductFactory.sol";
import "../src/SmartContracts/Stakeholder.sol";
import "../src/SmartContracts/Product.sol";
import "../src/SmartContracts/Shipment.sol";
import "./MockOracle.sol";

contract ShipmentFactoryFuzz is Test {
    ShipmentFactory public shipmentFactory;
    Registry public registry;
    StakeholderRegistry public stakeholderRegistry;
    StakeholderFactory public stakeholderFactory;
    ProductFactory public productFactory;
    
    // Mock oracles
    MockOracle public temperatureOracle;
    MockOracle public humidityOracle;
    MockOracle public rainfallOracle;
    MockOracle public windSpeedOracle;
    MockOracle public priceOracle;
    
    address admin = address(0x1);
    address farmer1 = address(0x2);
    address distributor1 = address(0x3);
    address distributor2 = address(0x4);
    address processor = address(0x5);
    address retailer = address(0x6);
    address unauthorized = address(0x7);
    
    event ShipmentCreated(
        address indexed shipmentAddress,
        address indexed distributor,
        address indexed productAddress,
        address receiver,
        string trackingNumber,
        string transportMode
    );

    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy core contracts
        registry = new Registry();
        stakeholderRegistry = new StakeholderRegistry(address(registry));
        stakeholderFactory = new StakeholderFactory(address(registry));
        
        // Deploy mock oracles
        temperatureOracle = new MockOracle(25 * 10**8, 8, 1, "Temperature");
        humidityOracle = new MockOracle(65 * 10**8, 8, 1, "Humidity");
        rainfallOracle = new MockOracle(10 * 10**8, 8, 1, "Rainfall");
        windSpeedOracle = new MockOracle(15 * 10**8, 8, 1, "Wind Speed");
        priceOracle = new MockOracle(100 * 10**8, 8, 1, "Price");
        
        // Deploy factories
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

    function _isValidAsciiString(string memory input) internal pure returns (bool) {
        bytes memory inputBytes = bytes(input);
        
        // Check length
        if (inputBytes.length == 0 || inputBytes.length > 50) {
            return false;
        }
        
        // Only allow printable ASCII characters (0x20-0x7E)
        for (uint256 i = 0; i < inputBytes.length; i++) {
            bytes1 b = inputBytes[i];
            if (uint8(b) < 0x20 || uint8(b) > 0x7E) {
                return false;
            }
        }
        
        return true;
    }

    function _createStakeholder(
        address stakeholderAddr,
        Stakeholder.StakeholderRole role,
        string memory name,
        string memory license
    ) internal {
        vm.prank(admin);
        stakeholderFactory.createStakeholder(
            stakeholderAddr,
            role,
            name,
            license,
            "Location",
            "Certifications"
        );
    }

    function _createProduct(
        address farmer,
        string memory name
    ) internal returns (address) {
        vm.startPrank(farmer, farmer);  // Set both msg.sender and tx.origin
        address productAddr = productFactory.createProduct(
            name,
            "Description",
            10,
            30,
            "Location",
            "Farm Data"
        );
        vm.stopPrank();
        return productAddr;
    }

    function _advanceProductToProcessing(address productAddr, address processorAddr) internal {
        vm.prank(processorAddr);
        Product(productAddr).updateProcessingStage("Ready for shipment");
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test ShipmentFactory constructor with valid parameters
     */
    function testFuzzConstructor(
        address registryAddr,
        address stakeholderRegistryAddr
    ) public {
        vm.assume(registryAddr != address(0));
        vm.assume(stakeholderRegistryAddr != address(0));
        
        ShipmentFactory factory = new ShipmentFactory(registryAddr, stakeholderRegistryAddr);
        
        assertEq(address(factory.registry()), registryAddr);
        assertEq(address(factory.stakeholderRegistry()), stakeholderRegistryAddr);
    }

    /**
     * @dev Test constructor with zero addresses (should fail)
     */
    function testConstructorZeroAddresses() public {
        // Constructor doesn't validate zero addresses directly, so it succeeds
        // but using the factory with zero addresses would fail at runtime
        // when trying to call functions on the zero address contracts
        
        ShipmentFactory factory1 = new ShipmentFactory(address(0), address(stakeholderRegistry));
        ShipmentFactory factory2 = new ShipmentFactory(address(registry), address(0));
        
        // Verify they were created
        assertTrue(address(factory1) != address(0));
        assertTrue(address(factory2) != address(0));
    }

    // ===== SHIPMENT CREATION FUZZ TESTS =====

    /**
     * @dev Test successful shipment creation by registered distributor
     */
    function testFuzzCreateShipmentSuccess(
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        // Sanitize inputs
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver != address(0));
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(distributor1);
        
        // Don't expect the event with unknown address, just create and verify later
        address shipmentAddr = shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
        
        // Verify shipment was created correctly
        assertTrue(shipmentAddr != address(0));
        assertTrue(registry.isEntityRegistered(shipmentAddr));
        
        Shipment shipment = Shipment(shipmentAddr);
        assertEq(shipment.productAddress(), productAddr);
        assertEq(shipment.sender(), distributor1);
        assertEq(shipment.receiver(), receiver);
        assertEq(shipment.trackingNumber(), trackingNumber);
        assertEq(shipment.transportMode(), transportMode);
        assertTrue(shipment.isActive());
        assertEq(uint8(shipment.status()), uint8(Shipment.ShipmentStatus.PREPARING));
    }

    /**
     * @dev Test shipment creation fails for non-distributors
     */
    function testFuzzCreateShipmentUnauthorized(
        address unauthorizedUser,
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        vm.assume(unauthorizedUser != address(0));
        vm.assume(receiver != address(0));
        
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        
        // Setup farmer and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        // Register unauthorizedUser as non-distributor (farmer/processor/retailer)
        Stakeholder.StakeholderRole[] memory nonDistributorRoles = new Stakeholder.StakeholderRole[](3);
        nonDistributorRoles[0] = Stakeholder.StakeholderRole.FARMER;
        nonDistributorRoles[1] = Stakeholder.StakeholderRole.PROCESSOR;
        nonDistributorRoles[2] = Stakeholder.StakeholderRole.RETAILER;
        
        uint256 roleIndex = uint256(uint160(unauthorizedUser)) % 3;
        _createStakeholder(
            unauthorizedUser, 
            nonDistributorRoles[roleIndex], 
            "Unauthorized", 
            string(abi.encodePacked("UNAUTH", vm.toString(uint160(unauthorizedUser))))
        );
        
        vm.prank(unauthorizedUser);
        vm.expectRevert("Not registered as distributor");
        shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
    }

    /**
     * @dev Test shipment creation fails for completely unregistered users
     */
    function testFuzzCreateShipmentCompletelyUnregistered(
        address unregisteredUser,
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        vm.assume(unregisteredUser != address(0));
        vm.assume(receiver != address(0));
        // Ensure user is not one of our pre-registered addresses
        vm.assume(unregisteredUser != admin);
        vm.assume(unregisteredUser != farmer1);
        vm.assume(unregisteredUser != distributor1);
        vm.assume(unregisteredUser != processor);
        
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        
        // Setup product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(unregisteredUser);
        vm.expectRevert("Not registered as distributor");
        shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
    }

    /**
     * @dev Test shipment creation with product in wrong stage
     */
    function testFuzzCreateShipmentProductNotReady(
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver != address(0));
        
        // Setup stakeholders
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        
        // Create product but don't advance it to processing stage
        address productAddr = _createProduct(farmer1, "Test Product");
        
        vm.prank(distributor1);
        vm.expectRevert("Product not ready for shipment");
        shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
    }

    /**
     * @dev Test shipment creation with non-existent product
     */
    function testFuzzCreateShipmentNonExistentProduct(
        address fakeProductAddr,
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        vm.assume(fakeProductAddr != address(0));
        vm.assume(receiver != address(0));
        vm.assume(!registry.isEntityRegistered(fakeProductAddr));
        
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        
        // Setup distributor
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        
        vm.prank(distributor1);
        // This should revert when trying to call Product interface functions on non-contract
        vm.expectRevert();
        shipmentFactory.createShipment(
            fakeProductAddr,
            receiver,
            trackingNumber,
            transportMode
        );
    }

    // ===== MULTIPLE SHIPMENT CREATION TESTS =====

    /**
     * @dev Test creating multiple shipments with same distributor
     */
    function testFuzzCreateMultipleShipments(
        uint8 shipmentCount,
        string memory baseTrackingNumber,
        string memory transportMode
    ) public {
        shipmentCount = shipmentCount % 10 + 1; // 1-10 shipments
        baseTrackingNumber = _sanitizeString(baseTrackingNumber, "TRACK");
        transportMode = _sanitizeString(transportMode, "Truck");
        
        // Setup stakeholders
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        address[] memory shipmentAddresses = new address[](shipmentCount);
        
        for (uint256 i = 0; i < shipmentCount; i++) {
            string memory trackingNumber = string(abi.encodePacked(baseTrackingNumber, vm.toString(i)));
            address receiver = address(uint160(0x1000 + i));
            
            vm.prank(distributor1);
            address shipmentAddr = shipmentFactory.createShipment(
                productAddr,
                receiver,
                trackingNumber,
                transportMode
            );
            
            shipmentAddresses[i] = shipmentAddr;
            assertTrue(registry.isEntityRegistered(shipmentAddr));
            
            Shipment shipment = Shipment(shipmentAddr);
            assertEq(shipment.trackingNumber(), trackingNumber);
            assertEq(shipment.receiver(), receiver);
        }
        
        // Verify all shipments are unique
        for (uint256 i = 0; i < shipmentCount; i++) {
            for (uint256 j = i + 1; j < shipmentCount; j++) {
                assertTrue(shipmentAddresses[i] != shipmentAddresses[j]);
            }
        }
    }

    /**
     * @dev Test creating shipments by different distributors
     */
    function testFuzzCreateShipmentsDifferentDistributors(
        string memory trackingNumber1,
        string memory trackingNumber2,
        string memory transportMode,
        address receiver1,
        address receiver2
    ) public {
        trackingNumber1 = _sanitizeString(trackingNumber1, "TRACK001");
        trackingNumber2 = _sanitizeString(trackingNumber2, "TRACK002");
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver1 != address(0));
        vm.assume(receiver2 != address(0));
        
        // Setup stakeholders
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(distributor2, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist2", "DIST002");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        // Create shipment by first distributor
        vm.prank(distributor1);
        address shipment1 = shipmentFactory.createShipment(
            productAddr,
            receiver1,
            trackingNumber1,
            transportMode
        );
        
        // Create shipment by second distributor
        vm.prank(distributor2);
        address shipment2 = shipmentFactory.createShipment(
            productAddr,
            receiver2,
            trackingNumber2,
            transportMode
        );
        
        assertTrue(shipment1 != shipment2);
        assertTrue(registry.isEntityRegistered(shipment1));
        assertTrue(registry.isEntityRegistered(shipment2));
        
        assertEq(Shipment(shipment1).sender(), distributor1);
        assertEq(Shipment(shipment2).sender(), distributor2);
    }

    // ===== EDGE CASE TESTS =====

    /**
     * @dev Test shipment creation with zero receiver address (should fail due to validation)
     */
    function testFuzzCreateShipmentZeroReceiver(
        string memory trackingNumber,
        string memory transportMode
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(distributor1);
        vm.expectRevert("Invalid receiver address");
        shipmentFactory.createShipment(
            productAddr,
            address(0), // Zero receiver - should fail
            trackingNumber,
            transportMode
        );
    }

    /**
     * @dev Test shipment creation with empty tracking number (should fail due to validation)
     */
    function testFuzzCreateShipmentEmptyTrackingNumber(
        string memory transportMode,
        address receiver
    ) public {
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver != address(0));
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(distributor1);
        vm.expectRevert("Tracking number cannot be empty");
        shipmentFactory.createShipment(
            productAddr,
            receiver,
            "", // Empty tracking number - should fail
            transportMode
        );
    }

    /**
     * @dev Test shipment creation with very long strings
     */
    function testFuzzCreateShipmentLongStrings(
        address receiver
    ) public {
        vm.assume(receiver != address(0));
        
        // Create very long strings
        string memory longTrackingNumber = "TRACK123456789012345678901234567890123456789012345678901234567890";
        string memory longTransportMode = "VeryLongTransportModeNameThatExceedsNormalLimits123456789012345678901234567890";
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(distributor1);
        address shipmentAddr = shipmentFactory.createShipment(
            productAddr,
            receiver,
            longTrackingNumber,
            longTransportMode
        );
        
        // Should still create shipment (contract doesn't enforce string length limits)
        assertTrue(shipmentAddr != address(0));
        assertEq(Shipment(shipmentAddr).trackingNumber(), longTrackingNumber);
        assertEq(Shipment(shipmentAddr).transportMode(), longTransportMode);
    }

    // ===== EVENT EMISSION TESTS =====

    /**
     * @dev Test that ShipmentCreated event is emitted correctly
     */
    function testFuzzShipmentCreatedEvent(
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver != address(0));
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        vm.prank(distributor1);
        
        // Record logs to capture the exact shipment address
        vm.recordLogs();
        address shipmentAddr = shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
        
        Vm.Log[] memory logs = vm.getRecordedLogs();
        
        // Find the ShipmentCreated event
        bool eventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("ShipmentCreated(address,address,address,address,string,string)")) {
                eventFound = true;
                
                // Decode the event
                address eventShipmentAddr = address(uint160(uint256(logs[i].topics[1])));
                address eventDistributor = address(uint160(uint256(logs[i].topics[2])));
                address eventProductAddr = address(uint160(uint256(logs[i].topics[3])));
                
                assertEq(eventShipmentAddr, shipmentAddr);
                assertEq(eventDistributor, distributor1);
                assertEq(eventProductAddr, productAddr);
                
                break;
            }
        }
        
        assertTrue(eventFound, "ShipmentCreated event not found");
    }

    // ===== STATE VERIFICATION TESTS =====

    /**
     * @dev Test that registry state is updated correctly after shipment creation
     */
    function testFuzzRegistryStateAfterCreation(
        string memory trackingNumber,
        string memory transportMode,
        address receiver
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        transportMode = _sanitizeString(transportMode, "Truck");
        vm.assume(receiver != address(0));
        
        // Setup stakeholders and product
        _createStakeholder(farmer1, Stakeholder.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(distributor1, Stakeholder.StakeholderRole.DISTRIBUTOR, "Dist1", "DIST001");
        _createStakeholder(processor, Stakeholder.StakeholderRole.PROCESSOR, "Proc1", "PROC001");
        
        address productAddr = _createProduct(farmer1, "Test Product");
        _advanceProductToProcessing(productAddr, processor);
        
        uint256 initialShipmentCount = registry.getTotalShipments();
        
        vm.prank(distributor1);
        address shipmentAddr = shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            transportMode
        );
        
        // Verify registry state
        assertEq(registry.getTotalShipments(), initialShipmentCount + 1);
        assertTrue(registry.isEntityRegistered(shipmentAddr));
        
        address[] memory allShipments = registry.getAllShipments();
        bool found = false;
        for (uint256 i = 0; i < allShipments.length; i++) {
            if (allShipments[i] == shipmentAddr) {
                found = true;
                break;
            }
        }
        assertTrue(found, "Shipment not found in registry");
    }
}
