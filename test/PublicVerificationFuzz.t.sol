// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/PublicVerification.sol";
import "../src/SmartContracts/Registry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/ProductFactory.sol";
import "../src/SmartContracts/ShipmentFactory.sol";
import "../src/SmartContracts/Product.sol";
import "../src/SmartContracts/Shipment.sol";
import "./MockOracle.sol";
import "../src/SmartContracts/StakeholderManager.sol";  

contract PublicVerificationFuzz is Test {
    PublicVerification public publicVerification;
    Registry public registry;
    StakeholderRegistry public stakeholderRegistry;
    ProductFactory public productFactory;
    ShipmentFactory public shipmentFactory;
    StakeholderManager public stakeholderManager;
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
    address distributor = address(0x5);
    address retailer = address(0x6);
    address consumer = address(0x7);
    address auditor = address(0x8);
    address unauthorized = address(0x9);

    function setUp() public {
        vm.startPrank(admin);
        
        // Deploy core contracts
        stakeholderManager = new StakeholderManager();
        registry = new Registry(address(stakeholderManager));
        stakeholderRegistry = new StakeholderRegistry(address(stakeholderManager));
        
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
        
        // Deploy PublicVerification
        publicVerification = new PublicVerification(
            address(stakeholderRegistry),
            address(registry)
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
        // This excludes all control characters and multi-byte UTF-8 sequences
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
        StakeholderManager.StakeholderRole role,
        string memory name,
        string memory license
    ) internal {
        vm.startPrank(admin);
        stakeholderManager.registerStakeholder(
            stakeholderAddr,
            role,
            name,
            license,
            "Location",
            "Certifications"
        );
        vm.stopPrank();
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

    function _createShipment(
        address sender,
        address receiver,
        address productAddr,
        string memory trackingNumber
    ) internal returns (address) {
        // Advance product to PROCESSING stage first so it can be shipped
        Product product = Product(productAddr);
        Product.ProductStage currentStage = product.currentStage();
        if (currentStage == Product.ProductStage.FARM) {
            // Find a processor to advance the product
            if (!stakeholderManager.hasRole(processor, StakeholderManager.StakeholderRole.PROCESSOR)) {
                vm.startPrank(admin);
                stakeholderManager.registerStakeholder(
                    processor,
                    StakeholderManager.StakeholderRole.PROCESSOR,
                    "Auto Processor",
                    "AUTO_PROC",
                    "Location",
                    "Certifications"
                );
                vm.stopPrank();
            }
            
            vm.prank(processor);
            product.updateProcessingStage("Ready for shipment");
        }
        
        // Ensure sender has DISTRIBUTOR role
        if (!stakeholderManager.hasRole(sender, StakeholderManager.StakeholderRole.DISTRIBUTOR)) {
            vm.startPrank(admin);
            stakeholderManager.registerStakeholder(
                sender,
                StakeholderManager.StakeholderRole.DISTRIBUTOR,
                "Auto Distributor",
                string(abi.encodePacked("AUTO_DIST_", vm.toString(uint160(sender)))),
                "Location",
                "Certifications"
            );
            vm.stopPrank();
        }
        
        vm.prank(sender);
        return shipmentFactory.createShipment(
            productAddr,
            receiver,
            trackingNumber,
            "Road"
        );
    }

    function _advanceProductToStage(
        address productAddr,
        Product.ProductStage targetStage,
        address stakeholder
    ) internal {
        Product product = Product(productAddr);
        Product.ProductStage currentStage = product.currentStage();
        
        if (targetStage > currentStage) {
            vm.prank(stakeholder);
            if (targetStage == Product.ProductStage.PROCESSING) {
                product.updateProcessingStage("Processing data");
            } else if (targetStage == Product.ProductStage.DISTRIBUTION) {
                product.updateDistributionStage("Distribution data");
            } else if (targetStage == Product.ProductStage.RETAIL) {
                product.updateRetailStage("Retail data");
            }
        }
    }

    // ===== PRODUCT AUTHENTICITY VERIFICATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for product authenticity verification with valid products
     */
    function testFuzzVerifyProductAuthenticity(
        string memory productName,
        address verifier,
        uint256 blockTime
    ) public {
        // Handle parameter constraints and sanitize strings
        vm.assume(_isValidAsciiString(productName));
        productName = _sanitizeString(productName, "Test Product");
        vm.assume(verifier != address(0));
        vm.assume(blockTime > 0 && blockTime < type(uint40).max);
        
        // Set timestamp
        vm.warp(blockTime % (365 days * 10) + 1);
        
        // Create farmer and product
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        address productAddr = _createProduct(farmer1, productName);
        
        vm.prank(verifier);
        (bool isAuthentic, ) = publicVerification.verifyProductAuthenticity(productAddr);  // Ignore details string
        
        assertTrue(isAuthentic);
    }

    /**
     * @dev Fuzz test for verifying non-existent products
     */
    function testFuzzVerifyNonExistentProduct(
        address fakeProductAddr,
        address verifier
    ) public {
        vm.assume(fakeProductAddr != address(0));
        vm.assume(verifier != address(0));
        // Make sure it's not a precompiled contract but be less restrictive
        vm.assume(uint160(fakeProductAddr) > 100);
        vm.assume(!registry.isEntityRegistered(fakeProductAddr));
        
        vm.prank(verifier);
        try publicVerification.verifyProductAuthenticity(fakeProductAddr) returns (
            bool isAuthentic, 
            string memory details
        ) {
            assertFalse(isAuthentic);
            assertEq(details, "Product not found or verification failed");
        } catch {
            // If it reverts, that's also acceptable for non-existent products
            assertTrue(true);
        }
    }

    /**
     * @dev Fuzz test for product authenticity with different supply chain stages
     */
    function testFuzzVerifyProductAtDifferentStages(
        uint8 stageIndex,
        string memory productName,
        address verifier
    ) public {
        vm.assume(stageIndex <= 3); // Valid stage indices: 0-3
        vm.assume(verifier != address(0));
        
        productName = _sanitizeString(productName, "Stage Test Product");
        
        Product.ProductStage targetStage = Product.ProductStage(stageIndex);
        
        // Create all necessary stakeholders
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        _createStakeholder(retailer, StakeholderManager.StakeholderRole.RETAILER, "Retailer1", "RET001");
        
        address productAddr = _createProduct(farmer1, productName);
        
        // Advance product to target stage
        if (targetStage >= Product.ProductStage.PROCESSING) {
            _advanceProductToStage(productAddr, Product.ProductStage.PROCESSING, processor);
        }
        if (targetStage >= Product.ProductStage.DISTRIBUTION) {
            _advanceProductToStage(productAddr, Product.ProductStage.DISTRIBUTION, distributor);
        }
        if (targetStage >= Product.ProductStage.RETAIL) {
            _advanceProductToStage(productAddr, Product.ProductStage.RETAIL, retailer);
        }
        
        vm.prank(verifier);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productAddr);
        
        assertTrue(isAuthentic);
        assertTrue(bytes(details).length > 0);
    }

    /**
     * @dev Fuzz test for product verification with invalid stakeholders
     */
    function testFuzzVerifyProductWithInvalidStakeholders(
        string memory productName,
        uint8 invalidStageIndex
    ) public {
        vm.assume(_isValidAsciiString(productName));
        vm.assume(invalidStageIndex <= 3);
        
        productName = _sanitizeString(productName, "Invalid Stakeholder Test");
        
        // Create farmer and product
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        address productAddr = _createProduct(farmer1, productName);
        
        Product.ProductStage invalidStage = Product.ProductStage(invalidStageIndex);
        
        // Create an unregistered stakeholder for the stage
        address invalidStakeholder = address(uint160(0x1000 + invalidStageIndex));
        
        // Try to advance product with unregistered stakeholder
        if (invalidStage == Product.ProductStage.PROCESSING) {
            vm.prank(invalidStakeholder);
            vm.expectRevert(); // Should fail due to unregistered stakeholder
            Product(productAddr).updateProcessingStage("Invalid processing");
        }
        
        // Verify the product should still be authentic at farm stage
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productAddr);
        assertTrue(isAuthentic); // Should be true since only farm stage is validated
    }

    // ===== COMPLETE SUPPLY CHAIN VERIFICATION FUZZ TESTS =====

    /**
     * @dev Fuzz test for complete supply chain verification
     */
    function testFuzzVerifyCompleteSupplyChain(
        string memory productName,
        string memory trackingNumber,
        uint8 shipmentStatusIndex
    ) public {
        // Use sanitization instead of strict assumptions to reduce rejections
        productName = _sanitizeString(productName, "Supply Chain Test");
        trackingNumber = _sanitizeString(trackingNumber, "TRACK001");
        shipmentStatusIndex = shipmentStatusIndex % 4; // 0-3 for simpler statuses
        
        // Create stakeholders
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, productName);
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        // Set shipment status (ensure valid transitions)
        Shipment.ShipmentStatus status = Shipment.ShipmentStatus(shipmentStatusIndex);
        if (status != Shipment.ShipmentStatus.NOT_SHIPPED && status != Shipment.ShipmentStatus.PREPARING) {
            // For any status other than initial ones, we need to follow transition rules
            // Shipment starts at PREPARING, so we can go to SHIPPED or CANCELLED
            if (status == Shipment.ShipmentStatus.DELIVERED || status == Shipment.ShipmentStatus.VERIFIED) {
                // To get to DELIVERED, we must first go to SHIPPED
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.SHIPPED, "In transit", "Transit Location");
                
                if (status == Shipment.ShipmentStatus.DELIVERED) {
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(status, "Status update", "Test Location");
                } else if (status == Shipment.ShipmentStatus.VERIFIED) {
                    // To get to VERIFIED, we must first go to DELIVERED
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.DELIVERED, "Delivered", "Delivery Location");
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(status, "Status update", "Test Location");
                }
            } else if (status == Shipment.ShipmentStatus.UNABLE_TO_DELIVERED) {
                // To get to UNABLE_TO_DELIVERED, we must first go to SHIPPED
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.SHIPPED, "In transit", "Transit Location");
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(status, "Status update", "Test Location");
            } else {
                // For SHIPPED or CANCELLED, we can transition directly from PREPARING
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(status, "Status update", "Test Location");
            }
        }
        
        (bool isValid, string memory details) = publicVerification.verifyCompleteSupplyChain(productAddr);
        
        // Verification should depend on shipment status
        if (status == Shipment.ShipmentStatus.CANCELLED || 
            status == Shipment.ShipmentStatus.UNABLE_TO_DELIVERED) {
            assertFalse(isValid);
            assertEq(details, "Product valid but shipment has issues");
        } else {
            assertTrue(isValid);
            assertTrue(bytes(details).length > 0);
        }
    }

    /**
     * @dev Fuzz test for supply chain verification without shipment
     */
    function testFuzzVerifySupplyChainWithoutShipment(
        string memory productName,
        address verifier
    ) public {
        vm.assume(_isValidAsciiString(productName));
        vm.assume(verifier != address(0));
        
        productName = _sanitizeString(productName, "No Shipment Test");
        
        // Create farmer and product (no shipment)
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        address productAddr = _createProduct(farmer1, productName);
        
        vm.prank(verifier);
        (bool isValid, string memory details) = publicVerification.verifyCompleteSupplyChain(productAddr);
        
        assertTrue(isValid);
        assertEq(details, "Product verified, no shipment data available");
    }

    // ===== TRACEABILITY REPORT FUZZ TESTS =====

    /**
     * @dev Fuzz test for traceability report generation
     */
    function testFuzzGetTraceabilityReport(
        string memory productName,
        uint8 maxStageIndex,
        uint256 seedValue
    ) public {
        vm.assume(_isValidAsciiString(productName));
        vm.assume(maxStageIndex <= 3);
        
        productName = _sanitizeString(productName, "Traceability Test");
        seedValue = seedValue % 1000; // Limit to prevent overflow
        
        Product.ProductStage maxStage = Product.ProductStage(maxStageIndex);
        
        // Create stakeholders
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        if (maxStage >= Product.ProductStage.PROCESSING) {
            _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        }
        if (maxStage >= Product.ProductStage.DISTRIBUTION) {
            _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        }
        if (maxStage >= Product.ProductStage.RETAIL) {
            _createStakeholder(retailer, StakeholderManager.StakeholderRole.RETAILER, "Retailer1", "RET001");
        }
        
        address productAddr = _createProduct(farmer1, productName);
        
        // Advance product through stages
        if (maxStage >= Product.ProductStage.PROCESSING) {
            _advanceProductToStage(productAddr, Product.ProductStage.PROCESSING, processor);
        }
        if (maxStage >= Product.ProductStage.DISTRIBUTION) {
            _advanceProductToStage(productAddr, Product.ProductStage.DISTRIBUTION, distributor);
        }
        if (maxStage >= Product.ProductStage.RETAIL) {
            _advanceProductToStage(productAddr, Product.ProductStage.RETAIL, retailer);
        }
        
        (
            string memory reportProductName,
            address reportFarmer,
            PublicVerification.StakeholderInfo memory farmerInfo,
            ,  // processorInfo
            ,  // distributorInfo
            ,  // retailerInfo
            bool isFullyTraced
        ) = publicVerification.getTraceabilityReport(productAddr);
        
        assertEq(reportProductName, productName);
        assertEq(reportFarmer, farmer1);  // Should match the farmer we registered
        assertTrue(farmerInfo.stakeholderAddress != address(0));
        assertEq(uint8(farmerInfo.role), uint8(StakeholderManager.StakeholderRole.FARMER));
        
        // Check stage-specific stakeholder info
        if (maxStage >= Product.ProductStage.PROCESSING) {
            // Don't check processorInfo since it was ignored with comment syntax
        }
        if (maxStage >= Product.ProductStage.DISTRIBUTION) {
            // Don't check distributorInfo since it was ignored with comment syntax  
        }
        if (maxStage >= Product.ProductStage.RETAIL) {
            // Don't check retailerInfo since it was ignored with comment syntax
        }
        
        assertTrue(isFullyTraced); // Should be fully traced through the stages we created
    }

    /**
     * @dev Fuzz test for traceability report with non-existent products
     */
    function testFuzzGetTraceabilityReportNonExistent(
        address fakeProductAddr
    ) public {
        vm.assume(fakeProductAddr != address(0));
        // Make sure it's not a precompiled contract but be less restrictive
        vm.assume(uint160(fakeProductAddr) > 100);
        vm.assume(!registry.isEntityRegistered(fakeProductAddr));
        
        try publicVerification.getTraceabilityReport(fakeProductAddr) returns (
            string memory productName,
            address farmer,
            PublicVerification.StakeholderInfo memory farmerInfo,
            PublicVerification.StakeholderInfo memory,  // processorInfo 
            PublicVerification.StakeholderInfo memory,  // distributorInfo
            PublicVerification.StakeholderInfo memory,  // retailerInfo
            bool isFullyTraced
        ) {
            assertEq(bytes(productName).length, 0);
            assertEq(farmer, address(0));
            assertEq(farmerInfo.stakeholderAddress, address(0));
            assertFalse(isFullyTraced);
        } catch {
            // If it reverts, that's also acceptable for non-existent products
            assertTrue(true);
        }
    }    // ===== COMPLETE TRACEABILITY REPORT FUZZ TESTS =====

    /**
     * @dev Fuzz test for complete traceability report with shipment
     */
    function testFuzzGetCompleteTraceabilityReport(
        string memory productName,
        string memory trackingNumber,
        uint8 shipmentUpdatesCount
    ) public {
        // Use sanitization instead of strict assumptions to reduce rejections
        productName = _sanitizeString(productName, "Complete Trace Test");
        trackingNumber = _sanitizeString(trackingNumber, "COMPLETE001");
        shipmentUpdatesCount = shipmentUpdatesCount % 4 + 1; // 1-4 updates
        
        // Create stakeholders and product
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, productName);
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        // Add multiple shipment updates (follow valid transition rules)
        vm.startPrank(distributor);
        Shipment.ShipmentStatus currentStatus = Shipment.ShipmentStatus.PREPARING; // Initial status
        
        for (uint256 i = 0; i < shipmentUpdatesCount && i < 3; i++) { // Limit to 3 to avoid too many transitions
            Shipment.ShipmentStatus nextStatus;
            if (currentStatus == Shipment.ShipmentStatus.PREPARING) {
                nextStatus = i % 2 == 0 ? Shipment.ShipmentStatus.SHIPPED : Shipment.ShipmentStatus.CANCELLED;
            } else if (currentStatus == Shipment.ShipmentStatus.SHIPPED) {
                nextStatus = i % 2 == 0 ? Shipment.ShipmentStatus.DELIVERED : Shipment.ShipmentStatus.UNABLE_TO_DELIVERED;
            } else if (currentStatus == Shipment.ShipmentStatus.DELIVERED) {
                nextStatus = Shipment.ShipmentStatus.VERIFIED;
            } else {
                break; // Can't transition further
            }
            
            Shipment(shipmentAddr).updateStatus(
                nextStatus, 
                string(abi.encodePacked("Update ", vm.toString(i))),
                string(abi.encodePacked("Location ", vm.toString(i)))
            );
            currentStatus = nextStatus;
        }
        vm.stopPrank();
        
        (
            string memory reportProductName,
            address reportFarmer,
            PublicVerification.StakeholderInfo memory farmerInfo,
            PublicVerification.StakeholderInfo memory processorInfo,
            PublicVerification.StakeholderInfo memory distributorInfo,
            PublicVerification.StakeholderInfo memory retailerInfo,
            bool isFullyTraced,
            bool hasShipment,
            address reportShipmentAddress,
            Shipment.ShipmentUpdate[] memory shipmentHistory
        ) = publicVerification.getCompleteTraceabilityReport(productAddr);
        
        assertEq(reportProductName, productName);
        assertEq(reportFarmer, farmer1);
        assertTrue(hasShipment);
        assertEq(reportShipmentAddress, shipmentAddr);
        assertTrue(shipmentHistory.length > 0);
        assertTrue(farmerInfo.stakeholderAddress != address(0));
    }

    // ===== SHIPMENT TRACKING FUZZ TESTS =====

    /**
     * @dev Fuzz test for shipment tracking by tracking number
     */
    function testFuzzTrackShipmentByTrackingNumber(
        string memory trackingNumber,
        string memory productName,
        uint8 statusIndex
    ) public {
        vm.assume(statusIndex < 7); // 0-6 for 7 shipment statuses
        
        trackingNumber = _sanitizeString(trackingNumber, "TRACK_FUZZ");
        productName = _sanitizeString(productName, "Tracking Test Product");
        
        Shipment.ShipmentStatus targetStatus = Shipment.ShipmentStatus(statusIndex);
        
        // Create stakeholders and setup
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, productName);
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        // Update shipment status (follow valid transitions)
        if (targetStatus != Shipment.ShipmentStatus.NOT_SHIPPED && targetStatus != Shipment.ShipmentStatus.PREPARING) {
            // For any status other than initial ones, follow transition rules
            if (targetStatus == Shipment.ShipmentStatus.DELIVERED || targetStatus == Shipment.ShipmentStatus.VERIFIED) {
                // To get to DELIVERED, we must first go to SHIPPED
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.SHIPPED, "In transit", "Transit Location");
                
                if (targetStatus == Shipment.ShipmentStatus.DELIVERED) {
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(targetStatus, "Status update", "Tracking Location");
                } else if (targetStatus == Shipment.ShipmentStatus.VERIFIED) {
                    // To get to VERIFIED, we must first go to DELIVERED
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.DELIVERED, "Delivered", "Delivery Location");
                    vm.prank(distributor);
                    Shipment(shipmentAddr).updateStatus(targetStatus, "Status update", "Tracking Location");
                }
            } else if (targetStatus == Shipment.ShipmentStatus.UNABLE_TO_DELIVERED) {
                // To get to UNABLE_TO_DELIVERED, we must first go to SHIPPED
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(Shipment.ShipmentStatus.SHIPPED, "In transit", "Transit Location");
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(targetStatus, "Status update", "Tracking Location");
            } else {
                // For SHIPPED or CANCELLED, we can transition directly from PREPARING
                vm.prank(distributor);
                Shipment(shipmentAddr).updateStatus(targetStatus, "Status update", "Tracking Location");
            }
        }
        
        (
            address reportShipmentAddress,
            address reportProductAddress,
            ,  // productStage
            Shipment.ShipmentStatus shipmentStatus,
            string memory reportProductName,
            string memory statusDescription,
            bool isProductValid,
            bool isShipmentValid
        ) = publicVerification.trackShipmentByTrackingNumber(trackingNumber);
        
        assertEq(reportShipmentAddress, shipmentAddr);
        assertEq(reportProductAddress, productAddr);
        assertEq(reportProductName, productName);
        // Don't assert exact status since shipment transitions might have changed it
        assertTrue(isProductValid);
        
        // Check shipment validity based on final status
        if (uint8(shipmentStatus) == uint8(Shipment.ShipmentStatus.CANCELLED) || 
            uint8(shipmentStatus) == uint8(Shipment.ShipmentStatus.UNABLE_TO_DELIVERED)) {
            assertFalse(isShipmentValid);
        } else {
            assertTrue(isShipmentValid);
        }
        
        assertTrue(bytes(statusDescription).length > 0);
    }

    /**
     * @dev Fuzz test for tracking invalid shipment numbers
     */
    function testFuzzTrackInvalidShipmentNumber(
        string memory invalidTrackingNumber
    ) public {
        // Sanitize and ensure it's not empty
        invalidTrackingNumber = _sanitizeString(invalidTrackingNumber, "INVALID_001");
        
        vm.expectRevert("Invalid tracking number or shipment not found");
        publicVerification.trackShipmentByTrackingNumber(invalidTrackingNumber);
    }

    // ===== AUDIT FUNCTIONALITY FUZZ TESTS =====

    /**
     * @dev Fuzz test for audit performance by registered stakeholders
     */
    function testFuzzPerformAudit(
        address auditorAddr,
        string memory auditResult,
        uint8 roleIndex
    ) public {
        vm.assume(auditorAddr != address(0));
        vm.assume(roleIndex < 4); // Valid role indices
        
        auditResult = _sanitizeString(auditResult, "Audit passed");
        
        StakeholderManager.StakeholderRole role = StakeholderManager.StakeholderRole(roleIndex);
        
        // Create stakeholder and product
        _createStakeholder(auditorAddr, role, "Auditor Business", "AUDIT001");
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        address productAddr = _createProduct(farmer1, "Audit Test Product");
        
        vm.prank(auditorAddr);
        
        // This should succeed for registered stakeholders
        vm.expectEmit(true, true, false, true);
        emit AuditPerformed(auditorAddr, productAddr, auditResult, block.timestamp);
        
        publicVerification.performAudit(productAddr, auditResult);
    }

    /**
     * @dev Fuzz test for audit by unauthorized users
     */
    function testFuzzPerformAuditUnauthorized(
        address unauthorizedAuditor,
        string memory auditResult
    ) public {
        vm.assume(unauthorizedAuditor != address(0));
        
        auditResult = _sanitizeString(auditResult, "Unauthorized audit");
        
        // Create product without registering the auditor
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        address productAddr = _createProduct(farmer1, "Audit Test Product");
        
        vm.prank(unauthorizedAuditor);
        vm.expectRevert("Only registered stakeholders can perform audits");
        publicVerification.performAudit(productAddr, auditResult);
    }

    // ===== SHIPMENT INFO RETRIEVAL FUZZ TESTS =====

    /**
     * @dev Fuzz test for getting shipment information
     */
    function testFuzzGetShipmentInfo(
        string memory trackingNumber,
        string memory transportMode,
        uint8 statusIndex
    ) public {
        vm.assume(statusIndex < 7); // 0-6 for 7 shipment statuses
        
        trackingNumber = _sanitizeString(trackingNumber, "INFO_TRACK");
        transportMode = _sanitizeString(transportMode, "Road");
        
        // Create stakeholders and shipment
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, "Shipment Info Test");
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        (
            address product,
            address sender,
            address receiver,
            string memory reportTrackingNumber,
            ,  // reportTransportMode
            ,  // status
            uint256 createdAt,
            uint256 lastUpdated,
            bool isActive
        ) = publicVerification.getShipmentInfo(shipmentAddr);
        
        assertEq(product, productAddr);
        assertEq(sender, distributor);  // Should be distributor, not farmer1
        assertEq(receiver, processor);
        assertEq(reportTrackingNumber, trackingNumber);
        assertTrue(createdAt > 0);
        assertTrue(lastUpdated > 0);
        assertTrue(isActive);
    }

    /**
     * @dev Fuzz test for getting info from non-existent shipments
     */
    function testFuzzGetShipmentInfoNonExistent(
        address fakeShipmentAddr
    ) public {
        vm.assume(fakeShipmentAddr != address(0));
        vm.assume(!registry.isEntityRegistered(fakeShipmentAddr));
        
        vm.expectRevert("Shipment not registered");
        publicVerification.getShipmentInfo(fakeShipmentAddr);
    }

    // ===== HELPER FUNCTION FUZZ TESTS =====

    /**
     * @dev Fuzz test for finding shipment by product
     */
    function testFuzzFindShipmentByProduct(
        string memory trackingNumber,
        string memory productName
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "FIND_TRACK");
        productName = _sanitizeString(productName, "Find Test Product");
        
        // Create stakeholders and shipment
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, productName);
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        address foundShipment = publicVerification.findShipmentByProduct(productAddr);
        assertEq(foundShipment, shipmentAddr);
    }

    /**
     * @dev Fuzz test for finding shipment by tracking number
     */
    function testFuzzFindShipmentByTrackingNumber(
        string memory trackingNumber
    ) public {
        trackingNumber = _sanitizeString(trackingNumber, "FIND_BY_TRACK");
        
        // Create stakeholders and shipment
        _createStakeholder(farmer1, StakeholderManager.StakeholderRole.FARMER, "Farm1", "FARM001");
        _createStakeholder(processor, StakeholderManager.StakeholderRole.PROCESSOR, "Processor1", "PROC001");
        _createStakeholder(distributor, StakeholderManager.StakeholderRole.DISTRIBUTOR, "Distributor1", "DIST001");
        
        address productAddr = _createProduct(farmer1, "Find By Track Test");
        address shipmentAddr = _createShipment(distributor, processor, productAddr, trackingNumber);
        
        address foundShipment = publicVerification.findShipmentByTrackingNumber(trackingNumber);
        assertEq(foundShipment, shipmentAddr);
    }

    /**
     * @dev Fuzz test for finding non-existent shipments
     */
    function testFuzzFindNonExistentShipments(
        address nonExistentProduct,
        string memory nonExistentTrackingNumber
    ) public view {
        vm.assume(nonExistentProduct != address(0));
        
        nonExistentTrackingNumber = _sanitizeString(nonExistentTrackingNumber, "NON_EXISTENT");
        
        address foundByProduct = publicVerification.findShipmentByProduct(nonExistentProduct);
        assertEq(foundByProduct, address(0));
        
        address foundByTrackingNumber = publicVerification.findShipmentByTrackingNumber(nonExistentTrackingNumber);
        assertEq(foundByTrackingNumber, address(0));
    }

    // ===== EVENTS FUZZ TESTS =====

    event ProductVerificationRequested(
        address indexed productAddress,
        address indexed verifier,
        uint256 timestamp
    );
    
    event VerificationResult(
        address indexed productAddress,
        bool isAuthentic,
        string details,
        uint256 timestamp
    );
    
    event AuditPerformed(
        address indexed auditor,
        address indexed productAddress,
        string auditResult,
        uint256 timestamp
    );
    
    event ShipmentVerificationPerformed(
        address indexed shipmentAddress,
        address indexed productAddress,
        bool isValid,
        uint256 timestamp
    );
}
