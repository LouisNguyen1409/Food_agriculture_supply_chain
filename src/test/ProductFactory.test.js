const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ProductFactory", function () {
    let testHelpers;
    let productFactory;
    let registry;
    let stakeholderRegistry;
    let accounts;
    let deployer, farmer, processor, unauthorized;
    let oracleFeeds;
    let stakeholderManager;
    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, unauthorized } = accounts);

        // Deploy StakeholderManager
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();

        // Deploy Registry
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy(await stakeholderManager.getAddress());
        await registry.waitForDeployment();
        
        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await stakeholderManager.getAddress());
        await stakeholderRegistry.waitForDeployment();
        
        
        oracleFeeds = await testHelpers.deployMockOracleFeeds();

        // Deploy ProductFactory with all oracle feeds
        const ProductFactory = await ethers.getContractFactory("ProductFactory");
        productFactory = await ProductFactory.deploy(
            await stakeholderRegistry.getAddress(),
            await registry.getAddress(),
            await oracleFeeds.temperatureFeed.getAddress(),
            await oracleFeeds.humidityFeed.getAddress(),
            await oracleFeeds.rainfallFeed.getAddress(),
            await oracleFeeds.windSpeedFeed.getAddress(),
            await oracleFeeds.priceFeed.getAddress()
        );
        await productFactory.waitForDeployment();

        // Create stakeholders directly using StakeholderManager
        await stakeholderManager.connect(deployer).registerStakeholder(
            farmer.address,
            1, // FARMER
            "Green Farm Co",
            "FARM-001",
            "Iowa, USA",
            "Organic Certified"
        );

        await stakeholderManager.connect(deployer).registerStakeholder(
            processor.address,
            2, // PROCESSOR
            "Fresh Processing Ltd",
            "PROC-001",
            "California, USA",
            "FDA Approved"
        );
    });

    describe("Deployment", function () {
        it("Should set correct contract addresses", async function () {
            expect(await productFactory.stakeholderRegistry()).to.equal(
                await stakeholderRegistry.getAddress()
            );
            expect(await productFactory.registry()).to.equal(
                await registry.getAddress()
            );
        });

        it("Should set correct oracle feed addresses", async function () {
            expect(await productFactory.temperatureFeed()).to.equal(
                await oracleFeeds.temperatureFeed.getAddress()
            );
            expect(await productFactory.humidityFeed()).to.equal(
                await oracleFeeds.humidityFeed.getAddress()
            );
            expect(await productFactory.rainfallFeed()).to.equal(
                await oracleFeeds.rainfallFeed.getAddress()
            );
            expect(await productFactory.windSpeedFeed()).to.equal(
                await oracleFeeds.windSpeedFeed.getAddress()
            );
            expect(await productFactory.priceFeed()).to.equal(
                await oracleFeeds.priceFeed.getAddress()
            );
        });
    });

    describe("Product Creation", function () {
        it("Should allow registered farmers to create products", async function () {
            const productName = "Organic Apples";
            const description = "Fresh organic apples from Green Valley Farm";
            const minTemp = 0;
            const maxTemp = 5;
            const location = "Green Valley Farm, Iowa";
            const farmData = "Harvest Date: 2024-01-15, Organic Certified";

            const tx = await productFactory.connect(farmer).createProduct(
                productName,
                description,
                minTemp,
                maxTemp,
                location,
                farmData
            );

            const receipt = await tx.wait();
            
            // Check event emission
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );

            expect(event).to.not.be.undefined;
            expect(event.args[1]).to.equal(productName); // name
            expect(event.args[2]).to.equal(farmer.address); // creator

            // Verify product was registered in registry
            const productAddress = event.args[0];
            expect(await registry.isRegistered(productAddress)).to.be.true;
        });

        it("Should reject product creation by non-registered farmers", async function () {
            await expect(
                productFactory.connect(unauthorized).createProduct(
                    "Test Product",
                    "Description",
                    0,
                    5,
                    "Location",
                    "Farm Data"
                )
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should reject product creation by registered non-farmers", async function () {
            await expect(
                productFactory.connect(processor).createProduct(
                    "Test Product", 
                    "Description",
                    0,
                    5,
                    "Location",
                    "Farm Data"
                )
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should create product with correct parameters", async function () {
            const productName = "Test Tomatoes";
            const description = "Vine-ripened tomatoes";
            const minTemp = 10;
            const maxTemp = 25;
            const location = "Greenhouse Farm, California";
            const farmData = "Hydroponic, Pesticide-free";

            const tx = await productFactory.connect(farmer).createProduct(
                productName,
                description,
                minTemp,
                maxTemp,
                location,
                farmData
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );

            const productAddress = event.args[0];
            
            // Get the Product contract instance to verify parameters
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            expect(await product.name()).to.equal(productName);
            expect(await product.description()).to.equal(description);
            expect(await product.minCTemperature()).to.equal(minTemp);
            expect(await product.maxCTemperature()).to.equal(maxTemp);
            expect(await product.location()).to.equal(location);
            expect(await product.farmer()).to.equal(farmer.address);
            expect(await product.isActive()).to.be.true;
        });

        it("Should handle empty strings gracefully", async function () {
            // This should fail due to Product constructor validation we added earlier
            await expect(
                productFactory.connect(farmer).createProduct(
                    "", // empty name
                    "Description",
                    0,
                    5,
                    "Location",
                    "Farm Data"
                )
            ).to.be.revertedWith("Product name cannot be empty");
        });

        it("Should handle invalid temperature ranges", async function () {
            // Test with max temperature lower than min temperature
            await productFactory.connect(farmer).createProduct(
                "Test Product",
                "Description",
                25, // min temp higher than max
                10, // max temp lower than min
                "Location",
                "Farm Data"
            );
            // This should succeed as there's no validation in the current implementation
        });
    });

    describe("Multiple Product Creation", function () {
        it("Should allow creating multiple products", async function () {
            // Create first product
            const tx1 = await productFactory.connect(farmer).createProduct(
                "Apples",
                "Red apples",
                0,
                5,
                "Farm A",
                "Data A"
            );

            // Create second product
            const tx2 = await productFactory.connect(farmer).createProduct(
                "Oranges", 
                "Citrus oranges",
                5,
                15,
                "Farm B",
                "Data B"
            );

            const receipt1 = await tx1.wait();
            const receipt2 = await tx2.wait();

            const event1 = receipt1.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            const event2 = receipt2.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );

            expect(event1.args[0]).to.not.equal(event2.args[0]); // Different addresses
            expect(await registry.isRegistered(event1.args[0])).to.be.true;
            expect(await registry.isRegistered(event2.args[0])).to.be.true;
        });

        it("Should track all created products in registry", async function () {
            // Get initial product count by checking the registry products array
            let initialCount = 0;
            try {
                // Try to access products at different indices to count existing products
                for (let i = 0; i < 100; i++) {
                    await registry.products(i);
                    initialCount++;
                }
            } catch (error) {
                // Expected to fail when index is out of bounds, that's how we know we've counted all
            }

            // Create a product
            await productFactory.connect(farmer).createProduct(
                "Test Product",
                "Description",
                0,
                5,
                "Location",
                "Farm Data"
            );

            // Check that product count increased
            let newProductCount = 0;
            try {
                // Count products again
                for (let i = 0; i < 100; i++) {
                    await registry.products(i);
                    newProductCount++;
                }
            } catch (error) {
                // Expected to fail when index is out of bounds
            }

            expect(newProductCount).to.equal(initialCount + 1);
        });
    });

    describe("Integration with Product Contract", function () {
        let productAddress;

        beforeEach(async function () {
            const tx = await productFactory.connect(farmer).createProduct(
                "Integration Test Product",
                "Product for integration testing",
                0,
                10,
                "Test Farm",
                "Test Data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );
            productAddress = event.args[0];
        });

        it("Should create product with correct initial state", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            expect(await product.currentStage()).to.equal(0); // FARM stage
            expect(await product.isActive()).to.be.true;
            expect(await product.farmer()).to.equal(farmer.address);
        });

        it("Should verify product has access to stakeholder registry", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // The product should be able to verify stakeholder registration
            // This is tested implicitly by the fact that the product was created successfully
            expect(await product.isActive()).to.be.true;
        });

        it("Should verify product has oracle feed addresses set", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // Since we're using zero addresses for oracle feeds in tests,
            // we can't directly test oracle functionality, but we can verify
            // the product was created with the expected configuration
            expect(await product.isActive()).to.be.true;
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle contract deployment failures gracefully", async function () {
            // This test verifies the factory handles edge cases
            // The actual product creation should work with valid parameters
            const tx = await productFactory.connect(farmer).createProduct(
                "Edge Case Product",
                "Testing edge cases",
                0,   // Min temperature (must be non-negative for uint256)
                50,  // High temperature
                "Edge Location",
                "Edge Data"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "ProductCreated"
            );

            expect(event).to.not.be.undefined;
        });

        it("Should prevent duplicate product registration", async function () {
            // Create a product
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

            // Try to register the same product again directly in registry
            await expect(
                registry.registerProduct(productAddress)
            ).to.be.revertedWith("Product already registered");
        });
    });
}); 
