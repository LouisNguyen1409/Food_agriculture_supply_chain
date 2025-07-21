// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/PublicVerification.sol";
import "../src/SmartContracts/ProductRegistry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";
import "../src/SmartContracts/ShipmentRegistry.sol";

contract PublicVerificationFuzz is Test {
    PublicVerification public publicVerification;
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    ShipmentRegistry public shipmentRegistry;
    
    address public deployer;
    address public farmer;
    address public processor;
    address public distributor;
    address public retailer;
    address public consumer;
    address public auditor;
    
    uint256 public testProductId;
    uint256 public testShipmentId;
    
    function setUp() public {
        deployer = makeAddr("deployer");
        farmer = makeAddr("farmer");
        processor = makeAddr("processor");
        distributor = makeAddr("distributor");
        retailer = makeAddr("retailer");
        consumer = makeAddr("consumer");
        auditor = makeAddr("auditor");
        
        vm.startPrank(deployer);
        
        // Deploy registries
        stakeholderRegistry = new StakeholderRegistry();
        
        productRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            address(0), // temperatureFeed
            address(0), // humidityFeed
            address(0), // rainfallFeed
            address(0), // windSpeedFeed
            address(0)  // priceFeed
        );
        
        shipmentRegistry = new ShipmentRegistry(
            address(stakeholderRegistry),
            address(productRegistry)
        );
        
        // Deploy PublicVerification
        publicVerification = new PublicVerification(
            address(productRegistry),
            address(stakeholderRegistry),
            address(shipmentRegistry)
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
        
        // Create test product and progress through stages
        vm.prank(farmer);
        testProductId = productRegistry.registerProduct(
            "Test Product",
            "BATCH_001",
            "Test product data"
        );
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(testProductId, "Processed successfully");
        
        vm.prank(distributor);
        productRegistry.updateDistributionStage(testProductId, "Ready for distribution");
        
        vm.prank(retailer);
        productRegistry.updateRetailStage(testProductId, "Available in store");
        
        // Create test shipment
        vm.prank(distributor);
        testShipmentId = shipmentRegistry.createShipment(
            testProductId,
            retailer,
            "TRACK_001",
            "TRUCK"
        );
    }

    // ===== CONSTRUCTOR TESTS =====
    
    /**
     * @dev Test valid constructor
     */
    function testFuzzConstructorValid() public {
        PublicVerification newVerification = new PublicVerification(
            address(productRegistry),
            address(stakeholderRegistry),
            address(shipmentRegistry)
        );
        
        assertEq(address(newVerification.productRegistry()), address(productRegistry));
        assertEq(address(newVerification.stakeholderRegistry()), address(stakeholderRegistry));
        assertEq(address(newVerification.shipmentRegistry()), address(shipmentRegistry));
    }
    
    /**
     * @dev Test constructor with zero addresses
     */
    function testFuzzConstructorZeroAddresses() public {
        PublicVerification newVerification = new PublicVerification(
            address(0),
            address(0),
            address(0)
        );
        
        // Contract deploys but operations will fail
        vm.expectRevert();
        newVerification.verifyProductAuthenticity(1);
    }

    // ===== PRODUCT AUTHENTICITY VERIFICATION TESTS =====
    
    /**
     * @dev Test verifying authentic product
     */
    function testFuzzVerifyProductAuthenticity() public {
        vm.expectEmit(true, true, false, true);
        emit ProductVerificationRequested(testProductId, consumer, block.timestamp);
        
        vm.expectEmit(true, false, false, true);
        emit VerificationResult(testProductId, true, "Product is authentic and all stakeholders verified", block.timestamp);
        
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(testProductId);
        
        assertTrue(isAuthentic);
        assertEq(details, "Product is authentic and all stakeholders verified");
    }
    
    /**
     * @dev Test verifying non-existent product
     */
    function testFuzzVerifyNonExistentProduct(uint256 productId) public {
        vm.assume(productId > 1000); // Assume non-existent
        
        vm.expectEmit(true, true, false, true);
        emit ProductVerificationRequested(productId, consumer, block.timestamp);
        
        vm.expectEmit(true, false, false, true);
        emit VerificationResult(productId, false, "Product not found or verification failed", block.timestamp);
        
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productId);
        
        assertFalse(isAuthentic);
        assertEq(details, "Product not found or verification failed");
    }
    
    /**
     * @dev Test verification with invalid farmer
     */
    function testFuzzVerifyProductInvalidFarmer(
        string memory productName,
        string memory batchNumber,
        string memory productData
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        vm.assume(bytes(productData).length > 0 && bytes(productData).length <= 100);
        
        address invalidFarmer = makeAddr("invalidFarmer");
        
        // Register farmer first
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            invalidFarmer, 
            StakeholderRegistry.StakeholderRole.FARMER, 
            "Invalid Farmer",
            "INVALID_LIC_001",
            "Invalid Location",
            "No Certification"
        );
        
        vm.prank(invalidFarmer);
        uint256 productId = productRegistry.registerProduct(productName, batchNumber, productData, "Farm Location");
        
        // Deactivate farmer after product creation
        vm.prank(deployer);
        stakeholderRegistry.deactivateStakeholder(invalidFarmer);
        
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productId);
        
        assertFalse(isAuthentic);
        assertTrue(bytes(details).length > 0);
    }
    
    /**
     * @dev Test verification with invalid processor
     */
    function testFuzzVerifyProductInvalidProcessor() public {
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct(
            "Test Product",
            "BATCH_002",
            "Test data"
        );
        
        address invalidProcessor = makeAddr("invalidProcessor");
        
        // Register and then deactivate processor
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            invalidProcessor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            "Invalid Processor",
            "PROC_002",
            "Location",
            "Cert"
        );
        
        vm.prank(invalidProcessor);
        productRegistry.updateProcessingStage(productId, "Processed");
        
        vm.prank(deployer);
        stakeholderRegistry.deactivateStakeholder(invalidProcessor);
        
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productId);
        
        assertFalse(isAuthentic);
        assertTrue(bytes(details).length > 0);
    }

    // ===== COMPLETE SUPPLY CHAIN VERIFICATION TESTS =====
    
    /**
     * @dev Test complete supply chain verification with valid product and shipment
     */
    function testFuzzVerifyCompleteSupplyChain() public {
        vm.prank(consumer);
        (bool isValid, string memory details) = publicVerification.verifyCompleteSupplyChain(testProductId);
        
        assertTrue(isValid);
        assertEq(details, "Product and shipment both verified successfully");
    }
    
    /**
     * @dev Test complete supply chain verification with cancelled shipment
     */
    function testFuzzVerifyCompleteSupplyChainCancelledShipment() public {
        // Cancel the shipment
        vm.prank(distributor);
        shipmentRegistry.cancelShipment(testShipmentId, "Cancelled for testing");
        
        vm.prank(consumer);
        (bool isValid, string memory details) = publicVerification.verifyCompleteSupplyChain(testProductId);
        
        assertFalse(isValid);
        assertEq(details, "Product valid but shipment has issues");
    }
    
    /**
     * @dev Test complete supply chain verification with no shipment
     */
    function testFuzzVerifyCompleteSupplyChainNoShipment(
        string memory productName,
        string memory batchNumber
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct(productName, batchNumber, "Data");
        
        vm.prank(consumer);
        (bool isValid, string memory details) = publicVerification.verifyCompleteSupplyChain(productId);
        
        assertTrue(isValid);
        assertEq(details, "Product verified, no shipment data available");
    }

    // ===== TRACEABILITY REPORT TESTS =====
    
    /**
     * @dev Test getting traceability report for complete product journey
     */
    function testFuzzGetTraceabilityReport() public {
        (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced
        ) = publicVerification.getTraceabilityReport(testProductId);
        
        assertEq(productInfo.productId, testProductId);
        assertEq(productInfo.productName, "Test Product");
        assertEq(farmerInfo.stakeholderAddress, farmer);
        assertEq(processorInfo.stakeholderAddress, processor);
        assertEq(distributorInfo.stakeholderAddress, distributor);
        assertEq(retailerInfo.stakeholderAddress, retailer);
        assertTrue(isFullyTraced);
    }
    
    /**
     * @dev Test traceability report for non-existent product
     */
    function testFuzzGetTraceabilityReportNonExistent(uint256 productId) public {
        vm.assume(productId > 1000); // Assume non-existent
        
        (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced
        ) = publicVerification.getTraceabilityReport(productId);
        
        assertEq(productInfo.productId, 0);
        assertEq(farmerInfo.stakeholderAddress, address(0));
        assertEq(processorInfo.stakeholderAddress, address(0));
        assertEq(distributorInfo.stakeholderAddress, address(0));
        assertEq(retailerInfo.stakeholderAddress, address(0));
        assertFalse(isFullyTraced);
    }
    
    /**
     * @dev Test traceability report for product only in farm stage
     */
    function testFuzzGetTraceabilityReportFarmStageOnly(
        string memory productName,
        string memory batchNumber
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct(productName, batchNumber, "Data");
        
        (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced
        ) = publicVerification.getTraceabilityReport(productId);
        
        assertEq(productInfo.productId, productId);
        assertEq(farmerInfo.stakeholderAddress, farmer);
        assertEq(processorInfo.stakeholderAddress, address(0));
        assertEq(distributorInfo.stakeholderAddress, address(0));
        assertEq(retailerInfo.stakeholderAddress, address(0));
        assertTrue(isFullyTraced); // Farm stage only is considered fully traced
    }

    // ===== COMPLETE TRACEABILITY REPORT TESTS =====
    
    /**
     * @dev Test complete traceability report with shipment
     */
    function testFuzzGetCompleteTraceabilityReport() public {
        (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced,
            bool hasShipment,
            ShipmentRegistry.ShipmentInfo memory shipmentInfo,
            ShipmentRegistry.ShipmentUpdate[] memory shipmentHistory
        ) = publicVerification.getCompleteTraceabilityReport(testProductId);
        
        assertEq(productInfo.productId, testProductId);
        assertTrue(isFullyTraced);
        assertTrue(hasShipment);
        assertEq(shipmentInfo.shipmentId, testShipmentId);
        assertEq(shipmentInfo.productId, testProductId);
        assertTrue(shipmentHistory.length > 0);
    }
    
    /**
     * @dev Test complete traceability report without shipment
     */
    function testFuzzGetCompleteTraceabilityReportNoShipment(
        string memory productName,
        string memory batchNumber
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct(productName, batchNumber, "Data");
        
        (
            ProductRegistry.ProductInfo memory productInfo,
            StakeholderRegistry.StakeholderInfo memory farmerInfo,
            StakeholderRegistry.StakeholderInfo memory processorInfo,
            StakeholderRegistry.StakeholderInfo memory distributorInfo,
            StakeholderRegistry.StakeholderInfo memory retailerInfo,
            bool isFullyTraced,
            bool hasShipment,
            ShipmentRegistry.ShipmentInfo memory shipmentInfo,
            ShipmentRegistry.ShipmentUpdate[] memory shipmentHistory
        ) = publicVerification.getCompleteTraceabilityReport(productId);
        
        assertEq(productInfo.productId, productId);
        assertTrue(isFullyTraced);
        assertFalse(hasShipment);
        assertEq(shipmentInfo.shipmentId, 0);
        assertEq(shipmentHistory.length, 0);
    }

    // ===== SIMPLE PRODUCT VERIFICATION TESTS =====
    
    /**
     * @dev Test simple product verification (view function)
     */
    function testFuzzVerifyProduct() public {
        bool isValid = publicVerification.verifyProduct(testProductId);
        assertTrue(isValid);
    }
    
    /**
     * @dev Test simple verification for non-existent product
     */
    function testFuzzVerifyProductNonExistent(uint256 productId) public {
        vm.assume(productId > 1000); // Assume non-existent
        
        bool isValid = publicVerification.verifyProduct(productId);
        assertFalse(isValid);
    }
    
    /**
     * @dev Test simple verification with invalid farmer
     */
    function testFuzzVerifyProductSimpleInvalidFarmer() public {
        address invalidFarmer = makeAddr("invalidFarmer");
        
        // Register farmer first
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            invalidFarmer, 
            StakeholderRegistry.StakeholderRole.FARMER, 
            "Invalid Farmer",
            "INVALID_LIC_002",
            "Invalid Location",
            "No Certification"
        );
        
        vm.prank(invalidFarmer);
        uint256 productId = productRegistry.registerProduct("Product", "BATCH", "Data", "Farm Location");
        
        // Deactivate farmer after product creation
        vm.prank(deployer);
        stakeholderRegistry.deactivateStakeholder(invalidFarmer);
        
        bool isValid = publicVerification.verifyProduct(productId);
        assertFalse(isValid);
    }

    // ===== AUDIT FUNCTIONALITY TESTS =====
    
    /**
     * @dev Test performing audit
     */
    function testFuzzPerformAudit(
        string memory auditResult
    ) public {
        vm.assume(bytes(auditResult).length > 0 && bytes(auditResult).length <= 200);
        
        vm.expectEmit(true, true, false, true);
        emit AuditPerformed(auditor, testProductId, auditResult, block.timestamp);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, auditResult);
    }
    
    /**
     * @dev Test audit with empty result
     */
    function testFuzzPerformAuditEmptyResult() public {
        vm.expectEmit(true, true, false, true);
        emit AuditPerformed(auditor, testProductId, "", block.timestamp);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, "");
    }
    
    /**
     * @dev Test multiple audits for same product
     */
    function testFuzzMultipleAudits(
        string memory audit1,
        string memory audit2,
        string memory audit3
    ) public {
        vm.assume(bytes(audit1).length > 0 && bytes(audit1).length <= 100);
        vm.assume(bytes(audit2).length > 0 && bytes(audit2).length <= 100);
        vm.assume(bytes(audit3).length > 0 && bytes(audit3).length <= 100);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, audit1);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, audit2);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, audit3);
        
        // Should emit all three events
    }

    // ===== TRANSPARENCY METRICS TESTS =====
    
    /**
     * @dev Test getting transparency metrics
     */
    function testFuzzGetTransparencyMetrics() public {
        (
            uint256 totalProducts,
            uint256 totalStakeholders,
            uint256 totalFarmers,
            uint256 totalProcessors,
            uint256 totalDistributors,
            uint256 totalRetailers,
            uint256 totalShipments
        ) = publicVerification.getTransparencyMetrics();
        
        assertTrue(totalProducts >= 1); // At least our test product
        assertTrue(totalStakeholders >= 4); // Our 4 stakeholders
        assertTrue(totalFarmers >= 1);
        assertTrue(totalProcessors >= 1);
        assertTrue(totalDistributors >= 1);
        assertTrue(totalRetailers >= 1);
        assertTrue(totalShipments >= 1); // At least our test shipment
        
        assertEq(totalFarmers + totalProcessors + totalDistributors + totalRetailers, totalStakeholders);
    }
    
    /**
     * @dev Test transparency metrics with additional stakeholders
     */
    function testFuzzTransparencyMetricsWithAdditionalStakeholders() public {
        address newFarmer = makeAddr("newFarmer");
        address newProcessor = makeAddr("newProcessor");
        
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            newFarmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            "New Farmer",
            "FARM_002",
            "Location",
            "Cert"
        );
        
        vm.prank(deployer);
        stakeholderRegistry.registerStakeholder(
            newProcessor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            "New Processor",
            "PROC_003",
            "Location",
            "Cert"
        );
        
        (
            uint256 totalProducts,
            uint256 totalStakeholders,
            uint256 totalFarmers,
            uint256 totalProcessors,
            uint256 totalDistributors,
            uint256 totalRetailers,
            uint256 totalShipments
        ) = publicVerification.getTransparencyMetrics();
        
        assertEq(totalStakeholders, 6); // 4 original + 2 new
        assertEq(totalFarmers, 2);
        assertEq(totalProcessors, 2);
        assertEq(totalDistributors, 1);
        assertEq(totalRetailers, 1);
    }

    // ===== TRACKING WITH SHIPMENT TESTS =====
    
    /**
     * @dev Test tracking product with shipment
     */
    function testFuzzTrackProductWithShipment() public {
        (
            uint256 productId,
            ProductRegistry.ProductStage productStage,
            ShipmentRegistry.ShipmentStatus shipmentStatus,
            string memory productName,
            string memory statusDescription,
            bool isProductValid,
            bool isShipmentValid
        ) = publicVerification.trackProductWithShipment("TRACK_001");
        
        assertEq(productId, testProductId);
        assertEq(uint8(productStage), uint8(ProductRegistry.ProductStage.RETAIL));
        assertEq(uint8(shipmentStatus), uint8(ShipmentRegistry.ShipmentStatus.PREPARING));
        assertEq(productName, "Test Product");
        assertTrue(bytes(statusDescription).length > 0);
        assertTrue(isProductValid);
        assertTrue(isShipmentValid);
    }
    
    /**
     * @dev Test tracking with invalid tracking number
     */
    function testFuzzTrackProductInvalidTracking(
        string memory trackingNumber
    ) public {
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 50);
        vm.assume(keccak256(bytes(trackingNumber)) != keccak256(bytes("TRACK_001")));
        
        vm.expectRevert("Invalid tracking number or shipment not found");
        publicVerification.trackProductWithShipment(trackingNumber);
    }
    
    /**
     * @dev Test tracking with cancelled shipment
     */
    function testFuzzTrackProductCancelledShipment() public {
        vm.prank(distributor);
        shipmentRegistry.cancelShipment(testShipmentId, "Cancelled for testing");
        
        (
            uint256 productId,
            ProductRegistry.ProductStage productStage,
            ShipmentRegistry.ShipmentStatus shipmentStatus,
            string memory productName,
            string memory statusDescription,
            bool isProductValid,
            bool isShipmentValid
        ) = publicVerification.trackProductWithShipment("TRACK_001");
        
        assertEq(productId, testProductId);
        assertEq(uint8(shipmentStatus), uint8(ShipmentRegistry.ShipmentStatus.CANCELLED));
        assertTrue(isProductValid);
        assertFalse(isShipmentValid); // Cancelled shipment is not valid
    }

    // ===== SYSTEM OVERVIEW TESTS =====
    
    /**
     * @dev Test getting system overview
     */
    function testFuzzGetSystemOverview() public {
        (
            uint256 totalProducts,
            uint256 totalShipments,
            uint256 totalStakeholders,
            uint256 activeProducts,
            uint256 shipmentsInTransit,
            string memory systemStatus
        ) = publicVerification.getSystemOverview();
        
        assertTrue(totalProducts >= 1);
        assertTrue(totalShipments >= 1);
        assertTrue(totalStakeholders >= 4);
        assertEq(activeProducts, totalProducts);
        assertTrue(shipmentsInTransit >= 0);
        assertEq(systemStatus, "Operational - Public verification available");
    }
    
    /**
     * @dev Test system overview with multiple products and shipments
     */
    function testFuzzSystemOverviewMultipleItems() public {
        // Create additional products
        vm.prank(farmer);
        uint256 productId2 = productRegistry.registerProduct("Product 2", "BATCH_002", "Data");
        
        vm.prank(farmer);
        uint256 productId3 = productRegistry.registerProduct("Product 3", "BATCH_003", "Data");
        
        // Process the products
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId2, "Processed");
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId3, "Processed");
        
        // Create additional shipments
        vm.prank(distributor);
        shipmentRegistry.createShipment(productId2, retailer, "TRACK_002", "AIR");
        
        vm.prank(distributor);
        shipmentRegistry.createShipment(productId3, retailer, "TRACK_003", "SEA");
        
        (
            uint256 totalProducts,
            uint256 totalShipments,
            uint256 totalStakeholders,
            uint256 activeProducts,
            uint256 shipmentsInTransit,
            string memory systemStatus
        ) = publicVerification.getSystemOverview();
        
        assertEq(totalProducts, 3); // Original + 2 new
        assertEq(totalShipments, 3); // Original + 2 new
        assertEq(activeProducts, totalProducts);
        assertEq(systemStatus, "Operational - Public verification available");
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====
    
    /**
     * @dev Test verification with product at different stages
     */
    function testFuzzVerificationAtDifferentStages(
        string memory productName,
        string memory batchNumber
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        
        // Test at farm stage only
        vm.prank(farmer);
        uint256 farmProduct = productRegistry.registerProduct(productName, batchNumber, "Data");
        
        vm.prank(consumer);
        (bool isAuthentic, ) = publicVerification.verifyProductAuthenticity(farmProduct);
        assertTrue(isAuthentic);
        
        // Test after processing
        vm.prank(processor);
        productRegistry.updateProcessingStage(farmProduct, "Processed");
        
        vm.prank(consumer);
        (isAuthentic, ) = publicVerification.verifyProductAuthenticity(farmProduct);
        assertTrue(isAuthentic);
    }
    
    /**
     * @dev Test verification with deactivated stakeholders at different stages
     */
    function testFuzzVerificationDeactivatedStakeholders() public {
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct("Test Product", "BATCH_TEST", "Data");
        
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId, "Processed");
        
        // Deactivate processor
        vm.prank(deployer);
        stakeholderRegistry.deactivateStakeholder(processor);
        
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productId);
        
        assertFalse(isAuthentic);
        assertTrue(bytes(details).length > 0);
    }
    
    /**
     * @dev Test audit with extremely long result
     */
    function testFuzzAuditLongResult() public {
        string memory longResult = "This is a very long audit result that contains detailed information about the product verification process, including multiple checks, validations, and comprehensive analysis of the entire supply chain from farm to retail stage, covering all stakeholders and their respective roles in ensuring product quality and authenticity";
        
        vm.expectEmit(true, true, false, true);
        emit AuditPerformed(auditor, testProductId, longResult, block.timestamp);
        
        vm.prank(auditor);
        publicVerification.performAudit(testProductId, longResult);
    }
    
    /**
     * @dev Test zero product ID scenarios
     */
    function testFuzzZeroProductId() public {
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(0);
        
        assertFalse(isAuthentic);
        assertEq(details, "Product not found or verification failed");
        
        bool isValid = publicVerification.verifyProduct(0);
        assertFalse(isValid);
    }

    // ===== INTEGRATION TESTS =====
    
    /**
     * @dev Test complete flow from product creation to verification
     */
    function testFuzzCompleteVerificationFlow(
        string memory productName,
        string memory batchNumber,
        string memory trackingNumber
    ) public {
        vm.assume(bytes(productName).length > 0 && bytes(productName).length <= 50);
        vm.assume(bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 20);
        vm.assume(bytes(trackingNumber).length > 0 && bytes(trackingNumber).length <= 20);
        vm.assume(keccak256(bytes(trackingNumber)) != keccak256(bytes("TRACK_001")));
        
        // 1. Create product
        vm.prank(farmer);
        uint256 productId = productRegistry.registerProduct(productName, batchNumber, "Product data");
        
        // 2. Progress through stages
        vm.prank(processor);
        productRegistry.updateProcessingStage(productId, "Processing complete");
        
        vm.prank(distributor);
        productRegistry.updateDistributionStage(productId, "Ready for distribution");
        
        vm.prank(retailer);
        productRegistry.updateRetailStage(productId, "In store");
        
        // 3. Create shipment
        vm.prank(distributor);
        uint256 shipmentId = shipmentRegistry.createShipment(productId, retailer, trackingNumber, "TRUCK");
        
        // 4. Verify authenticity
        vm.prank(consumer);
        (bool isAuthentic, string memory details) = publicVerification.verifyProductAuthenticity(productId);
        assertTrue(isAuthentic);
        
        // 5. Verify complete supply chain
        vm.prank(consumer);
        (bool isValid, ) = publicVerification.verifyCompleteSupplyChain(productId);
        assertTrue(isValid);
        
        // 6. Get traceability report
        (, , , , , bool isFullyTraced) = publicVerification.getTraceabilityReport(productId);
        assertTrue(isFullyTraced);
        
        // 7. Track with shipment
        (uint256 trackedProductId, , , , , bool isProductValid, bool isShipmentValid) = 
            publicVerification.trackProductWithShipment(trackingNumber);
        
        assertEq(trackedProductId, productId);
        assertTrue(isProductValid);
        assertTrue(isShipmentValid);
        
        // 8. Perform audit
        vm.prank(auditor);
        publicVerification.performAudit(productId, "Comprehensive audit completed successfully");
    }

    // ===== EVENT DEFINITIONS =====
    
    event ProductVerificationRequested(
        uint256 indexed productId,
        address indexed verifier,
        uint256 timestamp
    );
    
    event VerificationResult(
        uint256 indexed productId,
        bool isAuthentic,
        string details,
        uint256 timestamp
    );
    
    event AuditPerformed(
        address indexed auditor,
        uint256 indexed productId,
        string auditResult,
        uint256 timestamp
    );
    
    event ShipmentVerificationPerformed(
        uint256 indexed shipmentId,
        uint256 indexed productId,
        bool isValid,
        uint256 timestamp
    );
}
