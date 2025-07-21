// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/ProductFactory.sol";
import "../src/SmartContracts/ProductRegistry.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";

contract ProductFactoryFuzz is Test {
    ProductFactory public productFactory;
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;

    address public deployer;
    address public farmer;
    address public processor;
    address public distributor;
    address public retailer;
    address public unauthorized;

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

        // Deploy ProductRegistry (use address(0) for oracle feeds like in other tests)
        productRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            address(0), // temperatureFeed
            address(0), // humidityFeed
            address(0), // rainfallFeed
            address(0), // windSpeedFeed
            address(0) // priceFeed
        );

        // Deploy ProductFactory
        productFactory = new ProductFactory(
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

        // Register ProductFactory as a farmer so it can create products in ProductRegistry
        stakeholderRegistry.registerStakeholder(
            address(productFactory),
            StakeholderRegistry.StakeholderRole.FARMER,
            "ProductFactory",
            "FACTORY_LIC_001",
            "Factory Location",
            "Factory Certified"
        );

        vm.stopPrank();
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test valid constructor
     */
    function testFuzzConstructorValid() public {
        ProductFactory factory = new ProductFactory(
            address(productRegistry),
            address(stakeholderRegistry)
        );

        assertEq(address(factory.productRegistry()), address(productRegistry));
        assertEq(
            address(factory.stakeholderRegistry()),
            address(stakeholderRegistry)
        );
        assertEq(factory.factoryOwner(), address(this));
        assertEq(factory.nextTemplateId(), 1);
        assertEq(factory.nextBatchId(), 1);
        assertEq(factory.totalProductsCreated(), 0);
    }

    // ===== PRODUCT TEMPLATE TESTS =====

    /**
     * @dev Test creating a product template
     */
    function testFuzzCreateProductTemplate(
        string memory templateName,
        string memory productType,
        uint256 expirationDays
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(
            bytes(productType).length > 0 && bytes(productType).length <= 50
        );
        vm.assume(expirationDays > 0 && expirationDays <= 3650);

        string[] memory requiredFields = new string[](2);
        requiredFields[0] = "field1";
        requiredFields[1] = "field2";

        string[] memory certificationTypes = new string[](1);
        certificationTypes[0] = "organic";

        vm.expectEmit(true, true, false, true);
        emit ProductTemplateCreated(1, templateName, farmer, block.timestamp);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            productType,
            requiredFields,
            certificationTypes,
            expirationDays
        );

        assertEq(templateId, 1);
        assertEq(productFactory.nextTemplateId(), 2);
        assertEq(productFactory.templateNameToId(templateName), templateId);

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.templateId, templateId);
        assertEq(template.templateName, templateName);
        assertEq(template.productType, productType);
        assertEq(template.expirationDays, expirationDays);
        assertTrue(template.isActive);
        assertEq(template.creator, farmer);
    }

    /**
     * @dev Test creating template with empty name fails
     */
    function testFuzzCreateTemplateEmptyName() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.expectRevert("Template name cannot be empty");
        vm.prank(farmer);
        productFactory.createProductTemplate(
            "",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );
    }

    /**
     * @dev Test creating template with duplicate name fails
     */
    function testFuzzCreateTemplateDuplicateName(
        string memory templateName
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.expectRevert("Template name already exists");
        vm.prank(processor);
        productFactory.createProductTemplate(
            templateName,
            "Vegetables",
            requiredFields,
            certificationTypes,
            180
        );
    }

    /**
     * @dev Test updating product template
     */
    function testFuzzUpdateProductTemplate(
        string memory templateName,
        string memory newTemplateName,
        string memory newProductType,
        uint256 newExpirationDays
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(
            bytes(newTemplateName).length > 0 &&
                bytes(newTemplateName).length <= 50
        );
        vm.assume(
            bytes(newProductType).length > 0 &&
                bytes(newProductType).length <= 50
        );
        vm.assume(newExpirationDays > 0 && newExpirationDays <= 3650);
        vm.assume(
            keccak256(bytes(templateName)) != keccak256(bytes(newTemplateName))
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Original Type",
            requiredFields,
            certificationTypes,
            365
        );

        vm.expectEmit(true, false, false, true);
        emit ProductTemplateUpdated(
            templateId,
            "templateName",
            block.timestamp
        );

        vm.prank(farmer);
        productFactory.updateProductTemplate(
            templateId,
            newTemplateName,
            newProductType,
            newExpirationDays
        );

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.templateName, newTemplateName);
        assertEq(template.productType, newProductType);
        assertEq(template.expirationDays, newExpirationDays);
    }

    /**
     * @dev Test updating template by unauthorized user fails
     */
    function testFuzzUpdateTemplateUnauthorized(
        string memory templateName
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.expectRevert("Not authorized to update template");
        vm.prank(unauthorized);
        productFactory.updateProductTemplate(
            templateId,
            "New Name",
            "New Type",
            180
        );
    }

    /**
     * @dev Test deactivating template
     */
    function testFuzzDeactivateTemplate(string memory templateName) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.prank(farmer);
        productFactory.deactivateTemplate(templateId);

        vm.expectRevert("Template does not exist or is inactive");
        productFactory.getProductTemplate(templateId);
    }

    /**
     * @dev Test getting template by name
     */
    function testFuzzGetTemplateByName(string memory templateName) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        ProductFactory.ProductTemplate memory template = productFactory
            .getTemplateByName(templateName);
        assertEq(template.templateId, templateId);
        assertEq(template.templateName, templateName);
    }

    /**
     * @dev Test getting non-existent template by name fails
     */
    function testFuzzGetTemplateByNameNonExistent(
        string memory templateName
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );

        vm.expectRevert("Template not found");
        productFactory.getTemplateByName(templateName);
    }

    // ===== PRODUCT CREATION FROM TEMPLATE TESTS =====

    /**
     * @dev Test creating product from template
     */
    function testFuzzCreateProductFromTemplate(
        string memory templateName,
        string memory productName,
        string memory batchNumber,
        string memory farmData
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.expectEmit(true, true, true, true);
        emit ProductCreatedFromTemplate(
            1,
            templateId,
            farmer,
            productName,
            block.timestamp
        );

        vm.prank(farmer);
        uint256 productId = productFactory.createProductFromTemplate(
            templateId,
            productName,
            batchNumber,
            farmData
        );

        assertEq(productId, 1);
        assertEq(productFactory.totalProductsCreated(), 1);

        uint256[] memory farmerProducts = productFactory.getFarmerProducts(
            farmer
        );
        assertEq(farmerProducts.length, 1);
        assertEq(farmerProducts[0], productId);
    }

    /**
     * @dev Test creating product from template by non-farmer fails
     */
    function testFuzzCreateProductFromTemplateNonFarmer(
        string memory templateName,
        string memory productName,
        string memory batchNumber,
        string memory farmData
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.expectRevert("Only registered farmers can create products");
        vm.prank(unauthorized);
        productFactory.createProductFromTemplate(
            templateId,
            productName,
            batchNumber,
            farmData
        );
    }

    /**
     * @dev Test creating product from non-existent template fails
     */
    function testFuzzCreateProductFromNonExistentTemplate(
        string memory productName,
        string memory batchNumber,
        string memory farmData
    ) public {
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);

        vm.expectRevert("Template does not exist or is inactive");
        vm.prank(farmer);
        productFactory.createProductFromTemplate(
            999, // Non-existent template
            productName,
            batchNumber,
            farmData
        );
    }

    // ===== BATCH CREATION TESTS =====

    /**
     * @dev Test requesting batch product creation
     */
    function testFuzzRequestBatchProductCreation(
        string memory templateName,
        uint256 productCount
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(productCount > 0 && productCount <= 10);

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](productCount);
        string[] memory batchNumbers = new string[](productCount);
        string[] memory farmDataArray = new string[](productCount);

        for (uint256 i = 0; i < productCount; i++) {
            productNames[i] = string(
                abi.encodePacked("Product", vm.toString(i + 1))
            );
            batchNumbers[i] = string(
                abi.encodePacked("BATCH", vm.toString(i + 1))
            );
            farmDataArray[i] = string(
                abi.encodePacked("Farm data for product ", vm.toString(i + 1))
            );
        }

        vm.expectEmit(true, true, false, true);
        emit BatchProductCreationRequested(
            1,
            farmer,
            productCount,
            block.timestamp
        );

        vm.prank(farmer);
        uint256 batchId = productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );

        assertEq(batchId, 1);
        assertEq(productFactory.nextBatchId(), 2);

        ProductFactory.BatchCreateRequest memory batchRequest = productFactory
            .getBatchRequest(batchId);
        assertEq(batchRequest.batchId, batchId);
        assertEq(batchRequest.farmer, farmer);
        assertEq(batchRequest.templateId, templateId);
        assertFalse(batchRequest.isProcessed);
        assertEq(batchRequest.productNames.length, productCount);
    }

    /**
     * @dev Test batch creation with empty arrays fails
     */
    function testFuzzBatchCreationEmptyArrays() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "TestTemplate",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory emptyProductNames = new string[](0);
        string[] memory emptyBatchNumbers = new string[](0);
        string[] memory emptyFarmDataArray = new string[](0);

        vm.expectRevert("Must specify at least one product");
        vm.prank(farmer);
        productFactory.requestBatchProductCreation(
            templateId,
            emptyProductNames,
            emptyBatchNumbers,
            emptyFarmDataArray
        );
    }

    /**
     * @dev Test batch creation with mismatched array lengths fails
     */
    function testFuzzBatchCreationMismatchedArrays() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "TestTemplate",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](2);
        productNames[0] = "Product1";
        productNames[1] = "Product2";

        string[] memory batchNumbers = new string[](1);
        batchNumbers[0] = "BATCH1";

        string[] memory farmDataArray = new string[](2);
        farmDataArray[0] = "Data1";
        farmDataArray[1] = "Data2";

        vm.expectRevert("Array lengths must match");
        vm.prank(farmer);
        productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );
    }

    /**
     * @dev Test processing batch creation
     */
    function testFuzzProcessBatchCreation(
        string memory templateName,
        uint256 productCount
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(productCount > 0 && productCount <= 5);

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](productCount);
        string[] memory batchNumbers = new string[](productCount);
        string[] memory farmDataArray = new string[](productCount);

        for (uint256 i = 0; i < productCount; i++) {
            productNames[i] = string(
                abi.encodePacked("Product", vm.toString(i + 1))
            );
            batchNumbers[i] = string(
                abi.encodePacked("BATCH", vm.toString(i + 1))
            );
            farmDataArray[i] = string(
                abi.encodePacked("Farm data for product ", vm.toString(i + 1))
            );
        }

        vm.prank(farmer);
        uint256 batchId = productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );

        vm.prank(farmer);
        productFactory.processBatchCreation(batchId);

        ProductFactory.BatchCreateRequest memory batchRequest = productFactory
            .getBatchRequest(batchId);
        assertTrue(batchRequest.isProcessed);
        assertEq(batchRequest.createdProductIds.length, productCount);
        assertEq(productFactory.totalProductsCreated(), productCount);
    }

    /**
     * @dev Test processing already processed batch fails
     */
    function testFuzzProcessAlreadyProcessedBatch() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "TestTemplate",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](1);
        productNames[0] = "Product1";
        string[] memory batchNumbers = new string[](1);
        batchNumbers[0] = "BATCH1";
        string[] memory farmDataArray = new string[](1);
        farmDataArray[0] = "Data1";

        vm.prank(farmer);
        uint256 batchId = productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );

        vm.prank(farmer);
        productFactory.processBatchCreation(batchId);

        vm.expectRevert("Batch already processed");
        vm.prank(farmer);
        productFactory.processBatchCreation(batchId);
    }

    /**
     * @dev Test processing batch by unauthorized user fails
     */
    function testFuzzProcessBatchUnauthorized() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "TestTemplate",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](1);
        productNames[0] = "Product1";
        string[] memory batchNumbers = new string[](1);
        batchNumbers[0] = "BATCH1";
        string[] memory farmDataArray = new string[](1);
        farmDataArray[0] = "Data1";

        vm.prank(farmer);
        uint256 batchId = productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );

        vm.expectRevert("Only farmer or factory owner can process batch");
        vm.prank(unauthorized);
        productFactory.processBatchCreation(batchId);
    }

    // ===== STANDARD PRODUCT CREATION TESTS =====

    /**
     * @dev Test creating standard product
     */
    function testFuzzCreateStandardProduct(
        string memory productName,
        string memory batchNumber,
        string memory farmData,
        string memory standardType
    ) public {
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);
        vm.assume(
            bytes(standardType).length > 0 && bytes(standardType).length <= 50
        );

        vm.expectEmit(true, true, true, true);
        emit ProductCreatedFromTemplate(
            1,
            0,
            farmer,
            productName,
            block.timestamp
        );

        vm.prank(farmer);
        uint256 productId = productFactory.createStandardProduct(
            productName,
            batchNumber,
            farmData,
            standardType
        );

        assertEq(productId, 1);
        assertEq(productFactory.totalProductsCreated(), 1);

        uint256[] memory farmerProducts = productFactory.getFarmerProducts(
            farmer
        );
        assertEq(farmerProducts.length, 1);
        assertEq(farmerProducts[0], productId);
    }

    /**
     * @dev Test creating standard product by non-farmer fails
     */
    function testFuzzCreateStandardProductNonFarmer(
        string memory productName,
        string memory batchNumber,
        string memory farmData,
        string memory standardType
    ) public {
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);
        vm.assume(
            bytes(standardType).length > 0 && bytes(standardType).length <= 50
        );

        vm.expectRevert("Only registered farmers can create products");
        vm.prank(unauthorized);
        productFactory.createStandardProduct(
            productName,
            batchNumber,
            farmData,
            standardType
        );
    }

    // ===== BULK CREATION TESTS =====

    /**
     * @dev Test bulk creating similar products
     */
    function testFuzzBulkCreateSimilarProducts(
        string memory baseProductName,
        string memory baseBatchPrefix,
        string memory farmData,
        uint256 quantity
    ) public {
        vm.assume(
            bytes(baseProductName).length > 0 &&
                bytes(baseProductName).length <= 80
        );
        vm.assume(
            bytes(baseBatchPrefix).length > 0 &&
                bytes(baseBatchPrefix).length <= 40
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);
        vm.assume(quantity > 0 && quantity <= 100);

        vm.prank(farmer);
        uint256[] memory productIds = productFactory.bulkCreateSimilarProducts(
            baseProductName,
            baseBatchPrefix,
            farmData,
            quantity
        );

        assertEq(productIds.length, quantity);
        assertEq(productFactory.totalProductsCreated(), quantity);

        uint256[] memory farmerProducts = productFactory.getFarmerProducts(
            farmer
        );
        assertEq(farmerProducts.length, quantity);

        for (uint256 i = 0; i < quantity; i++) {
            assertEq(productIds[i], i + 1);
            assertEq(farmerProducts[i], i + 1);
        }
    }

    /**
     * @dev Test bulk creation with invalid quantity fails
     */
    function testFuzzBulkCreateInvalidQuantity(
        string memory baseProductName,
        string memory baseBatchPrefix,
        string memory farmData,
        uint256 quantity
    ) public {
        vm.assume(
            bytes(baseProductName).length > 0 &&
                bytes(baseProductName).length <= 80
        );
        vm.assume(
            bytes(baseBatchPrefix).length > 0 &&
                bytes(baseBatchPrefix).length <= 40
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);
        vm.assume(quantity == 0 || quantity > 100);

        vm.expectRevert("Quantity must be between 1 and 100");
        vm.prank(farmer);
        productFactory.bulkCreateSimilarProducts(
            baseProductName,
            baseBatchPrefix,
            farmData,
            quantity
        );
    }

    /**
     * @dev Test bulk creation by non-farmer fails
     */
    function testFuzzBulkCreateNonFarmer(
        string memory baseProductName,
        string memory baseBatchPrefix,
        string memory farmData
    ) public {
        vm.assume(
            bytes(baseProductName).length > 0 &&
                bytes(baseProductName).length <= 80
        );
        vm.assume(
            bytes(baseBatchPrefix).length > 0 &&
                bytes(baseBatchPrefix).length <= 40
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);

        vm.expectRevert("Only registered farmers can create products");
        vm.prank(unauthorized);
        productFactory.bulkCreateSimilarProducts(
            baseProductName,
            baseBatchPrefix,
            farmData,
            5
        );
    }

    // ===== QUERY FUNCTION TESTS =====

    /**
     * @dev Test getting farmer templates
     */
    function testFuzzGetFarmerTemplates(
        string memory templateName1,
        string memory templateName2
    ) public {
        vm.assume(
            bytes(templateName1).length > 0 && bytes(templateName1).length <= 50
        );
        vm.assume(
            bytes(templateName2).length > 0 && bytes(templateName2).length <= 50
        );
        vm.assume(
            keccak256(bytes(templateName1)) != keccak256(bytes(templateName2))
        );

        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId1 = productFactory.createProductTemplate(
            templateName1,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.prank(farmer);
        uint256 templateId2 = productFactory.createProductTemplate(
            templateName2,
            "Vegetables",
            requiredFields,
            certificationTypes,
            180
        );

        uint256[] memory farmerTemplates = productFactory.getFarmerTemplates(
            farmer
        );
        assertEq(farmerTemplates.length, 2);
        assertEq(farmerTemplates[0], templateId1);
        assertEq(farmerTemplates[1], templateId2);
    }

    /**
     * @dev Test getting factory statistics
     */
    function testFuzzGetFactoryStats() public {
        // Create templates
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        productFactory.createProductTemplate(
            "Template1",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        vm.prank(farmer);
        productFactory.createProductTemplate(
            "Template2",
            "Vegetables",
            requiredFields,
            certificationTypes,
            180
        );

        // Create products
        vm.prank(farmer);
        productFactory.createStandardProduct(
            "Product1",
            "BATCH1",
            "Data1",
            "ORGANIC"
        );

        vm.prank(farmer);
        productFactory.createStandardProduct(
            "Product2",
            "BATCH2",
            "Data2",
            "CONVENTIONAL"
        );

        // Create batch
        string[] memory productNames = new string[](1);
        productNames[0] = "BatchProduct";
        string[] memory batchNumbers = new string[](1);
        batchNumbers[0] = "BATCHNUM";
        string[] memory farmDataArray = new string[](1);
        farmDataArray[0] = "BatchData";

        vm.prank(farmer);
        productFactory.requestBatchProductCreation(
            1,
            productNames,
            batchNumbers,
            farmDataArray
        );

        (
            uint256 totalTemplates,
            uint256 totalProductsFromFactory,
            uint256 totalBatches,
            uint256 activeFarmers
        ) = productFactory.getFactoryStats();

        assertEq(totalTemplates, 2);
        assertEq(totalProductsFromFactory, 2);
        assertEq(totalBatches, 1);
        assertEq(activeFarmers, 0); // Placeholder implementation
    }

    // ===== ADMIN FUNCTION TESTS =====

    /**
     * @dev Test updating product registry
     */
    function testFuzzUpdateProductRegistry() public {
        ProductRegistry newRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            address(0), // temperatureFeed
            address(0), // humidityFeed
            address(0), // rainfallFeed
            address(0), // windSpeedFeed
            address(0) // priceFeed
        );

        vm.prank(deployer);
        productFactory.updateProductRegistry(address(newRegistry));

        assertEq(
            address(productFactory.productRegistry()),
            address(newRegistry)
        );
    }

    /**
     * @dev Test updating product registry with zero address fails
     */
    function testFuzzUpdateProductRegistryZeroAddress() public {
        vm.expectRevert("Invalid address");
        vm.prank(deployer);
        productFactory.updateProductRegistry(address(0));
    }

    /**
     * @dev Test updating product registry by non-owner fails
     */
    function testFuzzUpdateProductRegistryNonOwner() public {
        ProductRegistry newRegistry = new ProductRegistry(
            address(stakeholderRegistry),
            address(0), // temperatureFeed
            address(0), // humidityFeed
            address(0), // rainfallFeed
            address(0), // windSpeedFeed
            address(0) // priceFeed
        );

        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        productFactory.updateProductRegistry(address(newRegistry));
    }

    /**
     * @dev Test updating stakeholder registry
     */
    function testFuzzUpdateStakeholderRegistry() public {
        StakeholderRegistry newRegistry = new StakeholderRegistry();

        vm.prank(deployer);
        productFactory.updateStakeholderRegistry(address(newRegistry));

        assertEq(
            address(productFactory.stakeholderRegistry()),
            address(newRegistry)
        );
    }

    /**
     * @dev Test updating stakeholder registry with zero address fails
     */
    function testFuzzUpdateStakeholderRegistryZeroAddress() public {
        vm.expectRevert("Invalid address");
        vm.prank(deployer);
        productFactory.updateStakeholderRegistry(address(0));
    }

    /**
     * @dev Test updating stakeholder registry by non-owner fails
     */
    function testFuzzUpdateStakeholderRegistryNonOwner() public {
        StakeholderRegistry newRegistry = new StakeholderRegistry();

        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        productFactory.updateStakeholderRegistry(address(newRegistry));
    }

    /**
     * @dev Test transferring ownership
     */
    function testFuzzTransferOwnership(address newOwner) public {
        vm.assume(newOwner != address(0));
        vm.assume(newOwner != deployer);

        vm.prank(deployer);
        productFactory.transferOwnership(newOwner);

        assertEq(productFactory.factoryOwner(), newOwner);
    }

    /**
     * @dev Test transferring ownership to zero address fails
     */
    function testFuzzTransferOwnershipZeroAddress() public {
        vm.expectRevert("Invalid address");
        vm.prank(deployer);
        productFactory.transferOwnership(address(0));
    }

    /**
     * @dev Test transferring ownership by non-owner fails
     */
    function testFuzzTransferOwnershipNonOwner(address newOwner) public {
        vm.assume(newOwner != address(0));

        vm.expectRevert("Only factory owner can perform this action");
        vm.prank(unauthorized);
        productFactory.transferOwnership(newOwner);
    }

    // ===== COMPLEX INTEGRATION TESTS =====

    /**
     * @dev Test complete factory workflow
     */
    function testFuzzCompleteFactoryWorkflow(
        string memory templateName,
        string memory productName,
        string memory batchNumber,
        string memory farmData
    ) public {
        vm.assume(
            bytes(templateName).length > 0 && bytes(templateName).length <= 50
        );
        vm.assume(
            bytes(productName).length > 0 && bytes(productName).length <= 100
        );
        vm.assume(
            bytes(batchNumber).length > 0 && bytes(batchNumber).length <= 50
        );
        vm.assume(bytes(farmData).length > 0 && bytes(farmData).length <= 200);

        // 1. Create template
        string[] memory requiredFields = new string[](1);
        requiredFields[0] = "certification";
        string[] memory certificationTypes = new string[](1);
        certificationTypes[0] = "organic";

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            templateName,
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        // 2. Create product from template
        vm.prank(farmer);
        uint256 productId = productFactory.createProductFromTemplate(
            templateId,
            productName,
            batchNumber,
            farmData
        );

        // 3. Update template
        vm.prank(farmer);
        productFactory.updateProductTemplate(
            templateId,
            "Updated Template",
            "Updated Type",
            180
        );

        // 4. Create standard product
        vm.prank(farmer);
        uint256 standardProductId = productFactory.createStandardProduct(
            "Standard Product",
            "STD_BATCH",
            "Standard Farm Data",
            "ORGANIC"
        );

        // 5. Verify state
        assertEq(productFactory.totalProductsCreated(), 2);

        uint256[] memory farmerProducts = productFactory.getFarmerProducts(
            farmer
        );
        assertEq(farmerProducts.length, 2);
        assertEq(farmerProducts[0], productId);
        assertEq(farmerProducts[1], standardProductId);

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.templateName, "Updated Template");
        assertEq(template.expirationDays, 180);
    }

    /**
     * @dev Test factory owner processing batches
     */
    function testFuzzFactoryOwnerProcessingBatch() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "Test Template",
            "Fruits",
            requiredFields,
            certificationTypes,
            365
        );

        string[] memory productNames = new string[](2);
        productNames[0] = "Product1";
        productNames[1] = "Product2";
        string[] memory batchNumbers = new string[](2);
        batchNumbers[0] = "BATCH1";
        batchNumbers[1] = "BATCH2";
        string[] memory farmDataArray = new string[](2);
        farmDataArray[0] = "Data1";
        farmDataArray[1] = "Data2";

        vm.prank(farmer);
        uint256 batchId = productFactory.requestBatchProductCreation(
            templateId,
            productNames,
            batchNumbers,
            farmDataArray
        );

        // Factory owner processes the batch instead of farmer
        vm.prank(deployer);
        productFactory.processBatchCreation(batchId);

        ProductFactory.BatchCreateRequest memory batchRequest = productFactory
            .getBatchRequest(batchId);
        assertTrue(batchRequest.isProcessed);
        assertEq(batchRequest.createdProductIds.length, 2);
        assertEq(productFactory.totalProductsCreated(), 2);
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====

    /**
     * @dev Test maximum template fields
     */
    function testFuzzMaximumTemplateFields() public {
        string[] memory requiredFields = new string[](10);
        string[] memory certificationTypes = new string[](5);

        for (uint256 i = 0; i < 10; i++) {
            requiredFields[i] = string(
                abi.encodePacked("field", vm.toString(i))
            );
        }

        for (uint256 i = 0; i < 5; i++) {
            certificationTypes[i] = string(
                abi.encodePacked("cert", vm.toString(i))
            );
        }

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "Max Fields Template",
            "Complex Product",
            requiredFields,
            certificationTypes,
            365
        );

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.requiredFields.length, 10);
        assertEq(template.certificationTypes.length, 5);
    }

    /**
     * @dev Test template with zero expiration days
     */
    function testFuzzZeroExpirationTemplate() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "Zero Expiration Template",
            "Non-perishable",
            requiredFields,
            certificationTypes,
            0
        );

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.expirationDays, 0);
    }

    /**
     * @dev Test updating template with empty values
     */
    function testFuzzUpdateTemplateEmptyValues() public {
        string[] memory requiredFields = new string[](0);
        string[] memory certificationTypes = new string[](0);

        vm.prank(farmer);
        uint256 templateId = productFactory.createProductTemplate(
            "Original Template",
            "Original Type",
            requiredFields,
            certificationTypes,
            365
        );

        // Update with empty strings (should not change existing values)
        vm.prank(farmer);
        productFactory.updateProductTemplate(templateId, "", "", 0);

        ProductFactory.ProductTemplate memory template = productFactory
            .getProductTemplate(templateId);
        assertEq(template.templateName, "Original Template");
        assertEq(template.productType, "Original Type");
        assertEq(template.expirationDays, 365);
    }

    // ===== EVENT TESTING =====

    event ProductTemplateCreated(
        uint256 indexed templateId,
        string templateName,
        address indexed creator,
        uint256 timestamp
    );

    event ProductCreatedFromTemplate(
        uint256 indexed productId,
        uint256 indexed templateId,
        address indexed farmer,
        string productName,
        uint256 timestamp
    );

    event BatchProductCreationRequested(
        uint256 indexed batchId,
        address indexed farmer,
        uint256 productCount,
        uint256 timestamp
    );

    event BatchProductCreationCompleted(
        uint256 indexed batchId,
        uint256[] productIds,
        uint256 timestamp
    );

    event ProductTemplateUpdated(
        uint256 indexed templateId,
        string field,
        uint256 timestamp
    );
}
