const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ShipmentFactory Contract Tests", function () {
    let testHelpers;
    let shipmentFactory;
    let productFactory;
    let stakeholderFactory;
    let registry;
    let stakeholderRegistry;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, unauthorized;
    let oracleFeeds;
    let productAddress;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, unauthorized } = accounts);

        // Deploy dependencies in correct order
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();
        
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await registry.getAddress());
        await stakeholderRegistry.waitForDeployment();
        
        const StakeholderFactory = await ethers.getContractFactory("StakeholderFactory");
        stakeholderFactory = await StakeholderFactory.deploy(await registry.getAddress());
        await stakeholderFactory.waitForDeployment();
        
        oracleFeeds = await testHelpers.deployMockOracleFeeds();

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

        // Deploy ShipmentFactory
        const ShipmentFactory = await ethers.getContractFactory("ShipmentFactory");
        shipmentFactory = await ShipmentFactory.deploy(
            await registry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await shipmentFactory.waitForDeployment();

        // Register stakeholders
        await stakeholderFactory.connect(deployer).createStakeholder(
            farmer.address,
            0, // FARMER
            "Green Valley Farm",
            "FARM123",
            "California, USA",
            "Organic Certified"
        );

        await stakeholderFactory.connect(deployer).createStakeholder(
            processor.address,
            1, // PROCESSOR
            "Fresh Processing Co",
            "PROC123",
            "Texas, USA",
            "FDA Approved"
        );

        await stakeholderFactory.connect(deployer).createStakeholder(
            distributor.address,
            3, // DISTRIBUTOR (corrected from 2 to 3)
            "Supply Chain Inc",
            "DIST456",
            "Los Angeles, USA",
            "ISO 9001 Certified"
        );

        await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address,
            2, // RETAILER (corrected from 3 to 2)
            "Fresh Market",
            "RET789",
            "New York, USA",
            "Quality Assured"
        );

        // Create a test product
        const tx = await productFactory.connect(farmer).createProduct(
            "Test Product",
            "Premium organic tomatoes",
            2,  // minCTemperature
            8,  // maxCTemperature
            "Green Valley Farm, California",
            "Harvest Date: 2024-01-15, Organic Certified"
        );
        const receipt = await tx.wait();
        
        // Extract product address from event
        const productCreatedEvent = receipt.logs.find(
            log => log.fragment && log.fragment.name === 'ProductCreated'
        );
        productAddress = productCreatedEvent.args.productAddress;

        // Advance product to processing stage so it can be shipped
        const Product = await ethers.getContractFactory("Product");
        const product = Product.attach(productAddress);
        await product.connect(processor).updateProcessingStage("Quality processing completed");
    });

    describe("Contract Deployment", function () {
        it("Should deploy with correct registry address", async function () {
            expect(await shipmentFactory.registry()).to.equal(await registry.getAddress());
        });

        it("Should deploy with correct stakeholder registry address", async function () {
            expect(await shipmentFactory.stakeholderRegistry()).to.equal(await stakeholderRegistry.getAddress());
        });

        it("Should verify stakeholder registration", async function () {
            const isDistributorRegistered = await stakeholderRegistry.isRegisteredStakeholder(
                distributor.address,
                3 // DISTRIBUTOR role (corrected from 2 to 3)
            );
            expect(isDistributorRegistered).to.be.true;

            // Also check the stakeholder contract exists
            const stakeholderContract = await registry.getStakeholderByWallet(distributor.address);
            expect(stakeholderContract).to.not.equal(ethers.ZeroAddress);
            
            // Check that the ShipmentFactory's stakeholderRegistry is the same
            const shipmentFactoryStakeholderRegistry = await shipmentFactory.stakeholderRegistry();
            expect(shipmentFactoryStakeholderRegistry).to.equal(await stakeholderRegistry.getAddress());
            
            // Check if the ShipmentFactory's stakeholder registry sees the distributor as registered
            const stakeholderRegistryFromFactory = await ethers.getContractAt("StakeholderRegistry", shipmentFactoryStakeholderRegistry);
            const isDistributorRegisteredViaFactory = await stakeholderRegistryFromFactory.isRegisteredStakeholder(
                distributor.address,
                3 // DISTRIBUTOR role (corrected from 2 to 3)
            );
            expect(isDistributorRegisteredViaFactory).to.be.true;
        });
    });

    describe("Shipment Creation", function () {
        it("Should allow registered distributor to create shipment", async function () {
            const trackingNumber = "SHIP001";
            const transportMode = "Refrigerated Truck";
            
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                trackingNumber,
                transportMode
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentCreated")
                .withArgs(
                    (value) => ethers.isAddress(value), // shipmentAddress
                    distributor.address,                // distributor
                    productAddress,                     // productAddress
                    retailer.address,                   // receiver
                    trackingNumber,                     // trackingNumber
                    transportMode                       // transportMode
                );
        });

        it("Should return valid shipment address", async function () {
            const shipmentAddress = await shipmentFactory.connect(distributor).createShipment.staticCall(
                productAddress,
                retailer.address,
                "SHIP002",
                "Air Freight"
            );

            expect(ethers.isAddress(shipmentAddress)).to.be.true;
            expect(shipmentAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should create shipment with correct parameters", async function () {
            const trackingNumber = "SHIP003";
            const transportMode = "Sea Freight";
            
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                trackingNumber,
                transportMode
            );
            const receipt = await tx.wait();
            
            const shipmentCreatedEvent = receipt.logs.find(
                log => log.fragment && log.fragment.name === 'ShipmentCreated'
            );
            const shipmentAddress = shipmentCreatedEvent.args.shipmentAddress;

            const Shipment = await ethers.getContractFactory("Shipment");
            const shipment = Shipment.attach(shipmentAddress);

            expect(await shipment.productAddress()).to.equal(productAddress);
            expect(await shipment.sender()).to.equal(distributor.address);
            expect(await shipment.receiver()).to.equal(retailer.address);
            expect(await shipment.trackingNumber()).to.equal(trackingNumber);
            expect(await shipment.transportMode()).to.equal(transportMode);
        });

        it("Should register shipment in registry", async function () {
            const trackingNumber = "SHIP004";
            
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                trackingNumber,
                "Ground Transport"
            );
            const receipt = await tx.wait();
            
            const shipmentCreatedEvent = receipt.logs.find(
                log => log.fragment && log.fragment.name === 'ShipmentCreated'
            );
            const shipmentAddress = shipmentCreatedEvent.args.shipmentAddress;

            // Check if shipment was registered in registry
            expect(await registry.isRegistered(shipmentAddress)).to.be.true;
        });

        it("Should emit ShipmentRegistered event from registry", async function () {
            const trackingNumber = "SHIP005";
            
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    trackingNumber,
                    "Express Delivery"
                )
            ).to.emit(registry, "ShipmentRegistered");
        });
    });

    describe("Access Control", function () {
        it("Should reject shipment creation from non-distributor", async function () {
            await expect(
                shipmentFactory.connect(farmer).createShipment(
                    productAddress,
                    retailer.address,
                    "SHIP006",
                    "Standard Delivery"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });

        it("Should reject shipment creation from unauthorized user", async function () {
            await expect(
                shipmentFactory.connect(unauthorized).createShipment(
                    productAddress,
                    retailer.address,
                    "SHIP007",
                    "Priority Mail"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });

        it("Should reject shipment creation from processor", async function () {
            // Processor is already registered in beforeEach, so they should be rejected for wrong role
            await expect(
                shipmentFactory.connect(processor).createShipment(
                    productAddress,
                    retailer.address,
                    "SHIP008",
                    "Cold Chain"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });
    });

    describe("Parameter Validation", function () {
        it("Should handle zero address product", async function () {
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    ethers.ZeroAddress,
                    retailer.address,
                    "SHIP009",
                    "Standard Delivery"
                )
            ).to.be.reverted; // Shipment constructor will revert
        });

        it("Should handle zero address receiver", async function () {
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    ethers.ZeroAddress,
                    "SHIP010",
                    "Express Delivery"
                )
            ).to.be.reverted; // Shipment constructor will revert
        });

        it("Should handle empty tracking number", async function () {
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    "",
                    "Ground Transport"
                )
            ).to.be.reverted; // Shipment constructor will revert
        });

        it("Should allow empty transport mode", async function () {
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP011",
                ""
            );

            await expect(tx).to.emit(shipmentFactory, "ShipmentCreated");
        });
    });

    describe("Multiple Shipments", function () {
        it("Should allow creating multiple shipments for same product", async function () {
            const tx1 = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP012",
                "Truck"
            );
            
            const tx2 = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP013",
                "Air"
            );

            await expect(tx1).to.emit(shipmentFactory, "ShipmentCreated");
            await expect(tx2).to.emit(shipmentFactory, "ShipmentCreated");
        });

        it("Should create unique shipment addresses", async function () {
            const address1 = await shipmentFactory.connect(distributor).createShipment.staticCall(
                productAddress,
                retailer.address,
                "SHIP014",
                "Sea"
            );
            
            // Create first shipment to change state
            await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP014",
                "Sea"
            );
            
            const address2 = await shipmentFactory.connect(distributor).createShipment.staticCall(
                productAddress,
                retailer.address,
                "SHIP015",
                "Rail"
            );

            expect(address1).to.not.equal(address2);
        });

        it("Should allow same tracking number for different products", async function () {
            // Create second product
            const tx = await productFactory.connect(farmer).createProduct(
                "Second Product",
                "Another test product - fresh fruits",
                1,  // minCTemperature
                5,  // maxCTemperature
                "Green Valley Farm, California",
                "Harvest Date: 2024-01-16, Quality Assured"
            );
            const receipt = await tx.wait();
            
            const productCreatedEvent = receipt.logs.find(
                log => log.fragment && log.fragment.name === 'ProductCreated'
            );
            const secondProductAddress = productCreatedEvent.args.productAddress;

            // Advance second product to processing stage so it can be shipped
            const Product = await ethers.getContractFactory("Product");
            const secondProduct = Product.attach(secondProductAddress);
            await secondProduct.connect(processor).updateProcessingStage("Second product processing completed");

            const trackingNumber = "SHIP016";
            
            const tx1 = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                trackingNumber,
                "Truck"
            );
            
            const tx2 = await shipmentFactory.connect(distributor).createShipment(
                secondProductAddress,
                retailer.address,
                trackingNumber,
                "Truck"
            );

            await expect(tx1).to.emit(shipmentFactory, "ShipmentCreated");
            await expect(tx2).to.emit(shipmentFactory, "ShipmentCreated");
        });
    });

    describe("Event Emissions", function () {
        it("Should emit ShipmentCreated with all correct parameters", async function () {
            const trackingNumber = "SHIP017";
            const transportMode = "Hybrid Transport";
            
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    trackingNumber,
                    transportMode
                )
            ).to.emit(shipmentFactory, "ShipmentCreated")
            .withArgs(
                (value) => ethers.isAddress(value), // shipmentAddress
                distributor.address,                // distributor
                productAddress,                     // productAddress
                retailer.address,                   // receiver
                trackingNumber,                     // trackingNumber
                transportMode                       // transportMode
            );
        });

        it("Should emit both ShipmentCreated and ShipmentRegistered events", async function () {
            const tx = shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP018",
                "Multi-Modal"
            );

            await expect(tx).to.emit(shipmentFactory, "ShipmentCreated");
            await expect(tx).to.emit(registry, "ShipmentRegistered");
        });
    });

    describe("Integration Tests", function () {
        it("Should create functional shipment that can be updated", async function () {
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP019",
                "Integration Test Transport"
            );
            const receipt = await tx.wait();
            
            const shipmentCreatedEvent = receipt.logs.find(
                log => log.fragment && log.fragment.name === 'ShipmentCreated'
            );
            const shipmentAddress = shipmentCreatedEvent.args.shipmentAddress;

            const Shipment = await ethers.getContractFactory("Shipment");
            const shipment = Shipment.attach(shipmentAddress);

            // Verify initial status is PREPARING (1)
            expect(await shipment.status()).to.equal(1);
            
            // Verify shipment can be updated by distributor
            await expect(
                shipment.connect(distributor).updateStatus(
                    2, // SHIPPED
                    "Package shipped from warehouse",
                    "Distribution Center A"
                )
            ).to.emit(shipment, "ShipmentStatusUpdated");
        });

        it("Should work with product lifecycle", async function () {
            // Product is already in processing stage from beforeEach
            // Move to distribution stage
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            
            await product.connect(distributor).updateDistributionStage("Distributed via cold chain");
            
            // Now create shipment
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "SHIP020",
                "Lifecycle Integration"
            );

            await expect(tx).to.emit(shipmentFactory, "ShipmentCreated");
        });
    });

    describe("Error Handling", function () {
        it("Should handle invalid product address gracefully", async function () {
            const invalidAddress = "0x1234567890123456789012345678901234567890";
            
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    invalidAddress,
                    retailer.address,
                    "SHIP021",
                    "Error Test"
                )
            ).to.be.reverted;
        });
    });
});
