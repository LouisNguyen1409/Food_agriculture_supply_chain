const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ProductFactory", function () {
    let testHelpers;
    let productFactory;
    let productRegistry;
    let stakeholderRegistry;
    let accounts;
    let deployer, farmer, processor, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, unauthorized } = accounts);

        // Deploy dependencies
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );

        // Deploy ProductFactory
        const ProductFactory = await ethers.getContractFactory("ProductFactory");
        productFactory = await ProductFactory.deploy(
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await productFactory.waitForDeployment();

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);
        
        // Register factories as stakeholders to allow them to call registry functions
        await testHelpers.registerFactoriesAsStakeholders(stakeholderRegistry, productFactory, null);
    });

    describe("Deployment", function () {
        it("Should set correct factory owner", async function () {
            expect(await productFactory.factoryOwner()).to.equal(deployer.address);
        });

        it("Should set correct contract addresses", async function () {
            expect(await productFactory.productRegistry()).to.equal(await productRegistry.getAddress());
            expect(await productFactory.stakeholderRegistry()).to.equal(await stakeholderRegistry.getAddress());
        });

        it("Should initialize with correct default values", async function () {
            expect(await productFactory.nextTemplateId()).to.equal(1);
            expect(await productFactory.nextBatchId()).to.equal(1);
            expect(await productFactory.totalProductsCreated()).to.equal(0);
        });
    });

    describe("Product Template Management", function () {
        it("Should create a product template successfully", async function () {
            const templateName = "Organic Fruit Template";
            const productType = "Fruit";
            const requiredFields = ["Origin", "Harvest Date"];
            const certificationTypes = ["Organic", "Fair Trade"];
            const expirationDays = 30;

            const tx = await productFactory.createProductTemplate(
                templateName,
                productType,
                requiredFields,
                certificationTypes,
                expirationDays
            );

            await expect(tx)
                .to.emit(productFactory, "ProductTemplateCreated")
                .withArgs(1, templateName, deployer.address, await getBlockTimestamp(tx));

            const template = await productFactory.getProductTemplate(1);
            expect(template.templateId).to.equal(1);
            expect(template.templateName).to.equal(templateName);
            expect(template.productType).to.equal(productType);
            expect(template.isActive).to.be.true;
            expect(template.creator).to.equal(deployer.address);
        });

        it("Should reject empty template name", async function () {
            await expect(
                productFactory.createProductTemplate("", "Fruit", [], [], 30)
            ).to.be.revertedWith("Template name cannot be empty");
        });

        it("Should reject duplicate template names", async function () {
            const templateName = "Duplicate Template";
            
            await productFactory.createProductTemplate(templateName, "Fruit", [], [], 30);
            
            await expect(
                productFactory.createProductTemplate(templateName, "Vegetable", [], [], 30)
            ).to.be.revertedWith("Template name already exists");
        });

        it("Should get template by name", async function () {
            const templateName = "Test Template";
            await productFactory.createProductTemplate(templateName, "Fruit", [], [], 30);

            const template = await productFactory.getTemplateByName(templateName);
            expect(template.templateName).to.equal(templateName);
        });

        it("Should reject getting non-existent template by name", async function () {
            await expect(
                productFactory.getTemplateByName("Non-existent")
            ).to.be.revertedWith("Template not found");
        });

        it("Should update product template", async function () {
            // Create template
            await productFactory.createProductTemplate("Original", "Fruit", [], [], 30);
            
            // Update template
            const tx = await productFactory.updateProductTemplate(
                1,
                "Updated Template",
                "Vegetable",
                60
            );

            await expect(tx)
                .to.emit(productFactory, "ProductTemplateUpdated")
                .withArgs(1, "templateName", await getBlockTimestamp(tx));

            const template = await productFactory.getProductTemplate(1);
            expect(template.templateName).to.equal("Updated Template");
            expect(template.productType).to.equal("Vegetable");
            expect(template.expirationDays).to.equal(60);
        });

        it("Should reject unauthorized template updates", async function () {
            await productFactory.createProductTemplate("Test", "Fruit", [], [], 30);
            
            await expect(
                productFactory.connect(unauthorized).updateProductTemplate(1, "Updated", "Vegetable", 60)
            ).to.be.revertedWith("Not authorized to update template");
        });

        it("Should deactivate template", async function () {
            await productFactory.createProductTemplate("Test", "Fruit", [], [], 30);
            
            // First verify template is active
            let template = await productFactory.getProductTemplate(1);
            expect(template.isActive).to.be.true;
            
            // Deactivate template
            await productFactory.deactivateTemplate(1);
            
            // After deactivation, trying to get the template should fail due to templateExists modifier
            await expect(
                productFactory.getProductTemplate(1)
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should reject deactivating non-existent template", async function () {
            await expect(
                productFactory.deactivateTemplate(999)
            ).to.be.revertedWith("Template does not exist or is inactive");
        });
    });

    describe("Product Creation from Templates", function () {
        beforeEach(async function () {
            // Create a template for testing
            await productFactory.createProductTemplate(
                "Fruit Template",
                "Fruit",
                ["Origin", "Harvest Date"],
                ["Organic"],
                30
            );
        });

        it("Should create product from template", async function () {
            const tx = await productFactory.connect(farmer).createProductFromTemplate(
                1,
                "Organic Apples",
                "BATCH001",
                "Farm: Green Valley, Date: 2024-01-01"
            );

            await expect(tx)
                .to.emit(productFactory, "ProductCreatedFromTemplate");

            expect(await productFactory.totalProductsCreated()).to.equal(1);
            
            const farmerProducts = await productFactory.getFarmerProducts(farmer.address);
            expect(farmerProducts.length).to.equal(1);
        });

        it("Should reject product creation by non-registered farmer", async function () {
            await expect(
                productFactory.connect(unauthorized).createProductFromTemplate(
                    1,
                    "Apples",
                    "BATCH001",
                    "Farm data"
                )
            ).to.be.revertedWith("Only registered farmers can create products");
        });

        it("Should reject product creation with non-existent template", async function () {
            await expect(
                productFactory.connect(farmer).createProductFromTemplate(
                    999,
                    "Apples",
                    "BATCH001",
                    "Farm data"
                )
            ).to.be.revertedWith("Template does not exist or is inactive");
        });
    });

    describe("Batch Product Creation", function () {
        beforeEach(async function () {
            await productFactory.createProductTemplate("Batch Template", "Fruit", [], [], 30);
        });

        it("Should request batch product creation", async function () {
            const productNames = ["Apple 1", "Apple 2", "Apple 3"];
            const batchNumbers = ["B001", "B002", "B003"];
            const farmDataArray = ["Data 1", "Data 2", "Data 3"];

            const tx = await productFactory.connect(farmer).requestBatchProductCreation(
                1,
                productNames,
                batchNumbers,
                farmDataArray
            );

            await expect(tx)
                .to.emit(productFactory, "BatchProductCreationRequested")
                .withArgs(1, farmer.address, 3, await getBlockTimestamp(tx));

            const batchRequest = await productFactory.getBatchRequest(1);
            expect(batchRequest.farmer).to.equal(farmer.address);
            expect(batchRequest.isProcessed).to.be.false;
        });

        it("Should reject batch creation with empty product list", async function () {
            await expect(
                productFactory.connect(farmer).requestBatchProductCreation(1, [], [], [])
            ).to.be.revertedWith("Must specify at least one product");
        });

        it("Should reject batch creation with mismatched array lengths", async function () {
            await expect(
                productFactory.connect(farmer).requestBatchProductCreation(
                    1,
                    ["Apple 1", "Apple 2"],
                    ["B001"],
                    ["Data 1", "Data 2"]
                )
            ).to.be.revertedWith("Array lengths must match");
        });

        it("Should process batch creation by farmer", async function () {
            // Request batch
            await productFactory.connect(farmer).requestBatchProductCreation(
                1,
                ["Apple 1", "Apple 2"],
                ["B001", "B002"],
                ["Data 1", "Data 2"]
            );

            // Process batch
            const tx = await productFactory.connect(farmer).processBatchCreation(1);

            await expect(tx)
                .to.emit(productFactory, "BatchProductCreationCompleted");

            const batchRequest = await productFactory.getBatchRequest(1);
            expect(batchRequest.isProcessed).to.be.true;
            expect(batchRequest.createdProductIds.length).to.equal(2);
            expect(await productFactory.totalProductsCreated()).to.equal(2);
        });

        it("Should process batch creation by factory owner", async function () {
            // Request batch
            await productFactory.connect(farmer).requestBatchProductCreation(
                1,
                ["Apple 1"],
                ["B001"],
                ["Data 1"]
            );

            // Process batch as factory owner
            await productFactory.connect(deployer).processBatchCreation(1);

            const batchRequest = await productFactory.getBatchRequest(1);
            expect(batchRequest.isProcessed).to.be.true;
        });

        it("Should reject processing already processed batch", async function () {
            // Request and process batch
            await productFactory.connect(farmer).requestBatchProductCreation(
                1,
                ["Apple 1"],
                ["B001"],
                ["Data 1"]
            );
            await productFactory.connect(farmer).processBatchCreation(1);

            // Try to process again
            await expect(
                productFactory.connect(farmer).processBatchCreation(1)
            ).to.be.revertedWith("Batch already processed");
        });

        it("Should reject processing by unauthorized user", async function () {
            await productFactory.connect(farmer).requestBatchProductCreation(
                1,
                ["Apple 1"],
                ["B001"],
                ["Data 1"]
            );

            await expect(
                productFactory.connect(unauthorized).processBatchCreation(1)
            ).to.be.revertedWith("Only farmer or factory owner can process batch");
        });
    });

    describe("Standard Product Creation", function () {
        it("Should create standard product", async function () {
            const tx = await productFactory.connect(farmer).createStandardProduct(
                "Organic Bananas",
                "STD001",
                "Farm: Tropical Valley",
                "ORGANIC"
            );

            await expect(tx)
                .to.emit(productFactory, "ProductCreatedFromTemplate")
                .withArgs(
                    1, // productId (first product gets ID 1 since nextProductId starts at 1)
                    0, // templateId (0 for standard products)
                    farmer.address,
                    "Organic Bananas",
                    await getBlockTimestamp(tx)
                );

            expect(await productFactory.totalProductsCreated()).to.equal(1);
        });

        it("Should reject standard product creation by non-farmer", async function () {
            await expect(
                productFactory.connect(unauthorized).createStandardProduct(
                    "Bananas",
                    "STD001",
                    "Farm data",
                    "ORGANIC"
                )
            ).to.be.revertedWith("Only registered farmers can create products");
        });
    });

    describe("Bulk Product Creation", function () {
        it("Should create bulk similar products", async function () {
            const productIds = await productFactory.connect(farmer).bulkCreateSimilarProducts.staticCall(
                "Organic Apple",
                "BULK",
                "Farm: Valley Green",
                5
            );

            expect(productIds.length).to.equal(5);

            // Execute the transaction
            await productFactory.connect(farmer).bulkCreateSimilarProducts(
                "Organic Apple",
                "BULK",
                "Farm: Valley Green",
                5
            );

            expect(await productFactory.totalProductsCreated()).to.equal(5);
        });

        it("Should reject bulk creation with zero quantity", async function () {
            await expect(
                productFactory.connect(farmer).bulkCreateSimilarProducts(
                    "Apple",
                    "BULK",
                    "Farm data",
                    0
                )
            ).to.be.revertedWith("Quantity must be between 1 and 100");
        });

        it("Should reject bulk creation with quantity over 100", async function () {
            await expect(
                productFactory.connect(farmer).bulkCreateSimilarProducts(
                    "Apple",
                    "BULK",
                    "Farm data",
                    101
                )
            ).to.be.revertedWith("Quantity must be between 1 and 100");
        });
    });

    describe("Query Functions", function () {
        beforeEach(async function () {
            await productFactory.createProductTemplate("Test Template", "Fruit", [], [], 30);
            await productFactory.connect(farmer).createProductFromTemplate(
                1,
                "Test Product",
                "BATCH001",
                "Farm data"
            );
        });

        it("Should get farmer products", async function () {
            const products = await productFactory.getFarmerProducts(farmer.address);
            expect(products.length).to.equal(1);
        });

        it("Should get farmer templates", async function () {
            const templates = await productFactory.getFarmerTemplates(deployer.address);
            expect(templates.length).to.equal(1);
            expect(templates[0]).to.equal(1);
        });

        it("Should get factory stats", async function () {
            const [totalTemplates, totalProducts, totalBatches, activeFarmers] = 
                await productFactory.getFactoryStats();
            
            expect(totalTemplates).to.equal(1);
            expect(totalProducts).to.equal(1);
            expect(totalBatches).to.equal(0);
            expect(activeFarmers).to.equal(0); // Placeholder value
        });
    });

    describe("Admin Functions", function () {
        it("Should update product registry", async function () {
            const newProductRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );

            await productFactory.connect(deployer).updateProductRegistry(
                await newProductRegistry.getAddress()
            );

            expect(await productFactory.productRegistry()).to.equal(
                await newProductRegistry.getAddress()
            );
        });

        it("Should reject updating product registry with zero address", async function () {
            await expect(
                productFactory.connect(deployer).updateProductRegistry(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should reject updating product registry by non-owner", async function () {
            const newProductRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );

            await expect(
                productFactory.connect(unauthorized).updateProductRegistry(
                    await newProductRegistry.getAddress()
                )
            ).to.be.revertedWith("Only factory owner can perform this action");
        });

        it("Should update stakeholder registry", async function () {
            const newStakeholderRegistry = await testHelpers.deployStakeholderRegistry();

            await productFactory.connect(deployer).updateStakeholderRegistry(
                await newStakeholderRegistry.getAddress()
            );

            expect(await productFactory.stakeholderRegistry()).to.equal(
                await newStakeholderRegistry.getAddress()
            );
        });

        it("Should transfer ownership", async function () {
            await productFactory.connect(deployer).transferOwnership(farmer.address);
            expect(await productFactory.factoryOwner()).to.equal(farmer.address);
        });

        it("Should reject ownership transfer to zero address", async function () {
            await expect(
                productFactory.connect(deployer).transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle template existence checks", async function () {
            await expect(
                productFactory.getProductTemplate(999)
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should handle deactivated templates", async function () {
            await productFactory.createProductTemplate("Test", "Fruit", [], [], 30);
            await productFactory.deactivateTemplate(1);

            await expect(
                productFactory.connect(farmer).createProductFromTemplate(1, "Product", "Batch", "Data")
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should handle batch request for non-existent batch", async function () {
            const batchRequest = await productFactory.getBatchRequest(999);
            expect(batchRequest.farmer).to.equal(ethers.ZeroAddress);
        });
    });

    // Helper function to get block timestamp
    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }
}); 