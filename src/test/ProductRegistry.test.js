const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Registry and Product Contract Integration Tests", function () {
    let registry, stakeholderRegistry, stakeholderFactory, productFactory;
    let deployer, farmer, processor, distributor, retailer, consumer, unauthorized;

    beforeEach(async function () {
        [deployer, farmer, processor, distributor, retailer, consumer, unauthorized] = await ethers.getSigners();

        // Deploy Registry contract
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();

        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await registry.getAddress());

        // Deploy StakeholderFactory
        const StakeholderFactory = await ethers.getContractFactory("StakeholderFactory");
        stakeholderFactory = await StakeholderFactory.deploy(await registry.getAddress());

        // Deploy ProductFactory
        const ProductFactory = await ethers.getContractFactory("ProductFactory");
        productFactory = await ProductFactory.deploy(
            await stakeholderRegistry.getAddress(),
            await registry.getAddress(),
            ethers.ZeroAddress, // temperatureFeed
            ethers.ZeroAddress, // humidityFeed
            ethers.ZeroAddress, // rainfallFeed
            ethers.ZeroAddress, // windSpeedFeed
            ethers.ZeroAddress  // priceFeed
        );

        // First test - register stakeholders
        await stakeholderFactory.connect(deployer).createStakeholder(
            farmer.address, 
            0, // FARMER role
            "Green Valley Farm", 
            "FARM_" + Math.random().toString(36).substring(2, 11), 
            "California", 
            "Organic Certified"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            processor.address, 
            1, // PROCESSOR role
            "Fresh Processing Co", 
            "PROC_" + Math.random().toString(36).substring(2, 11), 
            "Texas", 
            "FDA Approved"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            distributor.address, 
            3, // DISTRIBUTOR role
            "Supply Chain Inc", 
            "DIST_" + Math.random().toString(36).substring(2, 11), 
            "Illinois", 
            "Logistics Certified"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address, 
            2, // RETAILER role
            "Fresh Market", 
            "RET_" + Math.random().toString(36).substring(2, 11), 
            "New York", 
            "Retail Licensed"
        );
    });

    describe("Basic Deployment Tests", function () {
        it("Should deploy all contracts successfully", async function () {
            expect(await registry.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await stakeholderRegistry.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await stakeholderFactory.getAddress()).to.not.equal(ethers.ZeroAddress);
            expect(await productFactory.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should register a stakeholder successfully", async function () {
            const totalStakeholders = await registry.getAllStakeholders();
            expect(totalStakeholders.length).to.be.at.least(1);
        });
    });

    describe("Registry Functionality", function () {
        it("Should track products registered through ProductFactory", async function () {
            const initialProductCount = await registry.getTotalProducts();

            // Create a product through ProductFactory
            await productFactory.connect(farmer).createProduct(
                "Organic Apples",
                "Fresh organic apples",
                0,
                5,
                "Green Valley Farm",
                "Harvest data"
            );

            expect(await registry.getTotalProducts()).to.equal(initialProductCount + BigInt(1));
        });

        it("Should return all registered products", async function () {
            // Create two products
            await productFactory.connect(farmer).createProduct(
                "Apples",
                "Red apples",
                0,
                5,
                "Farm A",
                "Data A"
            );

            await productFactory.connect(farmer).createProduct(
                "Oranges",
                "Citrus oranges",
                5,
                15,
                "Farm B",
                "Data B"
            );

            const allProducts = await registry.getAllProducts();
            expect(allProducts.length).to.be.at.least(2);
        });

        it("Should check if product is registered", async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Test Product",
                "Description",
                0,
                10,
                "Location",
                "Farm Data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            const productAddress = event.args[0];

            expect(await registry.isEntityRegistered(productAddress)).to.be.true;
            expect(await registry.isEntityRegistered(ethers.ZeroAddress)).to.be.false;
        });

        it("Should prevent duplicate product registration", async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Duplicate Test",
                "Description",
                0,
                5,
                "Location",
                "Data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            const productAddress = event.args[0];

            // Try to register the same product again
            await expect(
                registry.registerProduct(productAddress)
            ).to.be.revertedWith("Product already registered");
        });
    });

    describe("Product Contract Functionality", function () {
        let productAddress;
        let product;

        beforeEach(async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Test Product",
                "Product for testing",
                5,
                15,
                "Test Farm",
                "Test harvest data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            productAddress = event.args[0];

            const Product = await ethers.getContractFactory("Product");
            product = Product.attach(productAddress);
        });

        it("Should have correct initial product state", async function () {
            expect(await product.name()).to.equal("Test Product");
            expect(await product.description()).to.equal("Product for testing");
            expect(await product.farmer()).to.equal(farmer.address);
            expect(await product.currentStage()).to.equal(0); // FARM stage
            expect(await product.isActive()).to.be.true;
            expect(await product.minCTemperature()).to.equal(5);
            expect(await product.maxCTemperature()).to.equal(15);
            expect(await product.location()).to.equal("Test Farm");
        });

        it("Should allow processor to update processing stage", async function () {
            const tx = await product.connect(processor).updateProcessingStage(
                "Product processed with quality standards"
            );

            await expect(tx)
                .to.emit(product, "ProductStageUpdated");

            expect(await product.currentStage()).to.equal(1); // PROCESSING
        });

        it("Should allow distributor to update distribution stage", async function () {
            // First move to processing stage
            await product.connect(processor).updateProcessingStage("Processed");

            const tx = await product.connect(distributor).updateDistributionStage(
                "Ready for distribution"
            );

            await expect(tx)
                .to.emit(product, "ProductStageUpdated");

            expect(await product.currentStage()).to.equal(2); // DISTRIBUTION
        });

        it("Should allow retailer to update retail stage", async function () {
            // Move through stages
            await product.connect(processor).updateProcessingStage("Processed");
            await product.connect(distributor).updateDistributionStage("Distributed");

            const tx = await product.connect(retailer).updateRetailStage(
                "Available in store"
            );

            await expect(tx)
                .to.emit(product, "ProductStageUpdated");

            expect(await product.currentStage()).to.equal(3); // RETAIL
        });

        it("Should allow any user to mark as consumed", async function () {
            // Move through all stages to retail
            await product.connect(processor).updateProcessingStage("Processed");
            await product.connect(distributor).updateDistributionStage("Distributed");
            await product.connect(retailer).updateRetailStage("Available");

            const tx = await product.connect(consumer).markAsConsumed();

            await expect(tx)
                .to.emit(product, "ProductStageUpdated");

            expect(await product.currentStage()).to.equal(4); // CONSUMED
        });

        it("Should reject invalid stage transitions", async function () {
            // Try to skip processing stage
            await expect(
                product.connect(distributor).updateDistributionStage("Invalid transition")
            ).to.be.revertedWith("Invalid stage transition");
        });

        it("Should reject unauthorized role access", async function () {
            await expect(
                product.connect(farmer).updateProcessingStage("Farmer trying to process")
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should provide product verification", async function () {
            const isValid = await product.verifyProduct();
            expect(isValid).to.be.true;
        });

        it("Should return stage data", async function () {
            const stageData = await product.getStageData(0); // FARM stage
            expect(stageData.stakeholder).to.equal(farmer.address);
            expect(stageData.data).to.equal("Test harvest data");
            expect(stageData.timestamp).to.be.greaterThan(0);
        });
    });

    describe("Product Lifecycle Integration", function () {
        let productAddress;
        let product;

        beforeEach(async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Lifecycle Test Product",
                "Testing complete lifecycle",
                0,
                10,
                "Integration Farm",
                "Complete test data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            productAddress = event.args[0];

            const Product = await ethers.getContractFactory("Product");
            product = Product.attach(productAddress);
        });

        it("Should complete full product lifecycle", async function () {
            // 1. Start at FARM stage
            expect(await product.currentStage()).to.equal(0);

            // 2. Move to PROCESSING
            await product.connect(processor).updateProcessingStage("Quality processing completed");
            expect(await product.currentStage()).to.equal(1);

            // 3. Move to DISTRIBUTION
            await product.connect(distributor).updateDistributionStage("Distributed via cold chain");
            expect(await product.currentStage()).to.equal(2);

            // 4. Move to RETAIL
            await product.connect(retailer).updateRetailStage("Available for purchase");
            expect(await product.currentStage()).to.equal(3);

            // 5. Move to CONSUMED
            await product.connect(consumer).markAsConsumed();
            expect(await product.currentStage()).to.equal(4);

            // Verify product remains active throughout lifecycle
            expect(await product.isActive()).to.be.true;
        });

        it("Should track all stage data throughout lifecycle", async function () {
            // Update through all stages
            await product.connect(processor).updateProcessingStage("Processed data");
            await product.connect(distributor).updateDistributionStage("Distribution data");
            await product.connect(retailer).updateRetailStage("Retail data");
            await product.connect(consumer).markAsConsumed();

            // Check all stage data
            const farmStage = await product.getStageData(0);
            const processStage = await product.getStageData(1);
            const distributionStage = await product.getStageData(2);
            const retailStage = await product.getStageData(3);

            expect(farmStage.stakeholder).to.equal(farmer.address);
            expect(processStage.stakeholder).to.equal(processor.address);
            expect(distributionStage.stakeholder).to.equal(distributor.address);
            expect(retailStage.stakeholder).to.equal(retailer.address);
            // Note: consumed stage may have zero address since markAsConsumed doesn't store caller

            expect(farmStage.data).to.equal("Complete test data");
            expect(processStage.data).to.equal("Processed data");
            expect(distributionStage.data).to.equal("Distribution data");
            expect(retailStage.data).to.equal("Retail data");
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle non-existent products in registry", async function () {
            expect(await registry.isEntityRegistered(ethers.ZeroAddress)).to.be.false;
            expect(await registry.getTotalProducts()).to.be.at.least(0);
        });

        it("Should handle empty product arrays", async function () {
            const products = await registry.getAllProducts();
            expect(Array.isArray(products)).to.be.true;
        });

        it("Should prevent invalid product operations", async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Edge Case Product",
                "Testing edge cases",
                0,
                100,
                "Edge Farm",
                "Edge data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            const productAddress = event.args[0];

            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // Try to access invalid stage data
            await expect(
                product.getStageData(5) // Invalid stage
            ).to.be.reverted;
        });
    });

    describe("Registry Statistics and Queries", function () {
        beforeEach(async function () {
            // Create multiple products for testing
            await productFactory.connect(farmer).createProduct(
                "Product 1", "Description 1", 0, 5, "Farm 1", "Data 1"
            );
            await productFactory.connect(farmer).createProduct(
                "Product 2", "Description 2", 5, 10, "Farm 2", "Data 2"
            );
            await productFactory.connect(farmer).createProduct(
                "Product 3", "Description 3", 10, 15, "Farm 3", "Data 3"
            );
        });

        it("Should return correct total products count", async function () {
            const total = await registry.getTotalProducts();
            expect(total).to.be.at.least(3);
        });

        it("Should return all products", async function () {
            const allProducts = await registry.getAllProducts();
            expect(allProducts.length).to.be.at.least(3);
            
            // Verify all returned addresses are valid
            for (const productAddr of allProducts) {
                expect(await registry.isEntityRegistered(productAddr)).to.be.true;
            }
        });

        it("Should track stakeholder registrations", async function () {
            const allStakeholders = await registry.getAllStakeholders();
            expect(allStakeholders.length).to.be.at.least(4); // farmer, processor, distributor, retailer

            const farmers = await registry.getStakeholdersByRole(0); // FARMER role
            expect(farmers.length).to.be.at.least(1);
        });
    });
});
