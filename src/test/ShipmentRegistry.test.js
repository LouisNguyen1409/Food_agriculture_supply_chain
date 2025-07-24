const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ShipmentRegistry Contract Tests", function () {
    let testHelpers;
    let registry;
    let stakeholderRegistry;
    let stakeholderFactory;
    let productFactory;
    let shipmentFactory;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, consumer, unauthorized;
    let oracleFeeds;
    let productAddress;
    let shipmentAddress;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer, unauthorized } = accounts);

        // Deploy core registry first
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        // Deploy stakeholder registry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await registry.getAddress());
        await stakeholderRegistry.waitForDeployment();

        // Deploy stakeholder factory
        const StakeholderFactory = await ethers.getContractFactory("StakeholderFactory");
        stakeholderFactory = await StakeholderFactory.deploy(await registry.getAddress());
        await stakeholderFactory.waitForDeployment();

        // Deploy mock oracle feeds
        oracleFeeds = await testHelpers.deployMockOracleFeeds();

        // Deploy product factory
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

        // Deploy shipment factory
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
            3, // DISTRIBUTOR
            "Supply Chain Inc",
            "DIST456",
            "Los Angeles, USA",
            "ISO 9001 Certified"
        );

        await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address,
            2, // RETAILER
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
            "Organic farming practices: Planting, Watering, Harvesting"
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try {
                return productFactory.interface.parseLog(log).name === "ProductCreated";
            } catch {
                return false;
            }
        });
        
        if (event) {
            const parsedEvent = productFactory.interface.parseLog(event);
            productAddress = parsedEvent.args.productAddress;
        }

        // Advance product to PROCESSING stage to make it eligible for shipment
        const product = await ethers.getContractAt("Product", productAddress);
        await product.connect(processor).updateProcessingStage("Processed and packaged");

        // Create a test shipment for use in tests
        const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
            productAddress,
            retailer.address,
            "TRACK123",
            "Road Transport"
        );

        const shipmentReceipt = await shipmentTx.wait();
        const shipmentEvent = shipmentReceipt.logs.find(log => {
            try {
                return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
            } catch {
                return false;
            }
        });
        
        if (shipmentEvent) {
            const parsedShipmentEvent = shipmentFactory.interface.parseLog(shipmentEvent);
            shipmentAddress = parsedShipmentEvent.args.shipmentAddress;
        }
    });

    describe("Registry Deployment", function () {
        it("Should deploy registry successfully", async function () {
            expect(await registry.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should initialize with empty arrays", async function () {
            const products = await registry.getAllProducts();
            const shipments = await registry.getAllShipments();
            const stakeholders = await registry.getAllStakeholders();

            expect(products.length).to.equal(1); // One product created in beforeEach
            expect(shipments.length).to.equal(1); // One shipment created in beforeEach
            expect(stakeholders.length).to.equal(4); // Four stakeholders created in beforeEach
        });
    });

    describe("Shipment Registration", function () {
        it("Should register shipment successfully", async function () {
            const trackingNumber = "TRACK456";
            const sender = distributor.address;
            const receiver = retailer.address;

            // Create another product and advance to processing stage
            const productTx = await productFactory.connect(farmer).createProduct(
                "Test Product 2",
                "Premium organic carrots",
                2,
                8,
                "Green Valley Farm, California",
                "Organic farming practices"
            );
            
            const productReceipt = await productTx.wait();
            const productEvent = productReceipt.logs.find(log => {
                try {
                    return productFactory.interface.parseLog(log).name === "ProductCreated";
                } catch {
                    return false;
                }
            });
            
            const newProductAddress = productFactory.interface.parseLog(productEvent).args.productAddress;
            const newProduct = await ethers.getContractAt("Product", newProductAddress);
            await newProduct.connect(processor).updateProcessingStage("Processed and packaged");

            // Create another shipment to test registration
            const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
                newProductAddress,
                receiver,
                trackingNumber,
                "Air Transport"
            );

            const receipt = await shipmentTx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
            const parsedEvent = shipmentFactory.interface.parseLog(event);
            const newShipmentAddress = parsedEvent.args.shipmentAddress;

            // Verify registration
            expect(await registry.isRegistered(newShipmentAddress)).to.be.true;
        });

        it("Should emit ShipmentRegistered event", async function () {
            const trackingNumber = "TRACK789";
            
            // Create another product and advance to processing stage
            const productTx = await productFactory.connect(farmer).createProduct(
                "Test Product 3",
                "Premium organic lettuce",
                2,
                8,
                "Green Valley Farm, California",
                "Organic farming practices"
            );
            
            const productReceipt = await productTx.wait();
            const productEvent = productReceipt.logs.find(log => {
                try {
                    return productFactory.interface.parseLog(log).name === "ProductCreated";
                } catch {
                    return false;
                }
            });
            
            const newProductAddress = productFactory.interface.parseLog(productEvent).args.productAddress;
            const newProduct = await ethers.getContractAt("Product", newProductAddress);
            await newProduct.connect(processor).updateProcessingStage("Processed and packaged");
            
            const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
                newProductAddress,
                retailer.address,
                trackingNumber,
                "Sea Transport"
            );

            // Check for ShipmentRegistered event from registry
            await expect(shipmentTx)
                .to.emit(registry, "ShipmentRegistered");
        });

        it("Should not allow duplicate shipment registration", async function () {
            // Try to register the same shipment address again directly (this would fail at contract level)
            await expect(
                registry.registerShipment(
                    shipmentAddress,
                    "TRACK123",
                    productAddress,
                    distributor.address,
                    retailer.address
                )
            ).to.be.revertedWith("Shipment already registered");
        });

        it("Should increment shipment count", async function () {
            const initialCount = await registry.getTotalShipments();
            
            // Create another product and advance to processing stage
            const productTx = await productFactory.connect(farmer).createProduct(
                "Test Product 4",
                "Premium organic spinach",
                2,
                8,
                "Green Valley Farm, California",
                "Organic farming practices"
            );
            
            const productReceipt = await productTx.wait();
            const productEvent = productReceipt.logs.find(log => {
                try {
                    return productFactory.interface.parseLog(log).name === "ProductCreated";
                } catch {
                    return false;
                }
            });
            
            const newProductAddress = productFactory.interface.parseLog(productEvent).args.productAddress;
            const newProduct = await ethers.getContractAt("Product", newProductAddress);
            await newProduct.connect(processor).updateProcessingStage("Processed and packaged");
            
            await shipmentFactory.connect(distributor).createShipment(
                newProductAddress,
                retailer.address,
                "TRACK999",
                "Rail Transport"
            );

            const finalCount = await registry.getTotalShipments();
            expect(finalCount).to.equal(initialCount + 1n);
        });
    });

    describe("Shipment Retrieval", function () {
        it("Should return all shipments", async function () {
            const shipments = await registry.getAllShipments();
            expect(shipments.length).to.be.greaterThan(0);
            expect(shipments).to.include(shipmentAddress);
        });

        it("Should return correct total shipments count", async function () {
            const count = await registry.getTotalShipments();
            const shipments = await registry.getAllShipments();
            expect(count).to.equal(BigInt(shipments.length));
        });

        it("Should check shipment registration status", async function () {
            expect(await registry.isEntityRegistered(shipmentAddress)).to.be.true;
            expect(await registry.isEntityRegistered(ethers.ZeroAddress)).to.be.false;
        });
    });

    describe("Individual Shipment Contract Tests", function () {
        let shipment;

        beforeEach(async function () {
            shipment = await ethers.getContractAt("Shipment", shipmentAddress);
        });

        describe("Shipment Information", function () {
            it("Should return correct shipment info", async function () {
                const [
                    product,
                    shipmentSender,
                    shipmentReceiver,
                    tracking,
                    transport,
                    currentStatus,
                    created,
                    updated,
                    active
                ] = await shipment.getShipmentInfo();

                expect(product).to.equal(productAddress);
                expect(shipmentSender).to.equal(distributor.address);
                expect(shipmentReceiver).to.equal(retailer.address);
                expect(tracking).to.equal("TRACK123");
                expect(transport).to.equal("Road Transport");
                expect(currentStatus).to.equal(1); // PREPARING
                expect(active).to.be.true;
            });

            it("Should return status description", async function () {
                const description = await shipment.getStatusDescription();
                expect(description).to.equal("Preparing for shipment");
            });

            it("Should have initial history entry", async function () {
                const history = await shipment.getShipmentHistory();
                expect(history.length).to.equal(1);
                expect(history[0].status).to.equal(1); // PREPARING
                expect(history[0].updater).to.equal(distributor.address);
            });
        });

        describe("Status Updates", function () {
            it("Should allow distributor to update status to SHIPPED", async function () {
                await expect(
                    shipment.connect(distributor).updateStatus(
                        2, // SHIPPED
                        "Package dispatched",
                        "Distribution Center"
                    )
                ).to.emit(shipment, "ShipmentStatusUpdated")
                .withArgs(2, distributor.address, "Package dispatched", "Distribution Center", anyValue);

                expect(await shipment.status()).to.equal(2); // SHIPPED
            });

            it("Should allow receiver to update status to DELIVERED", async function () {
                // First update to SHIPPED
                await shipment.connect(distributor).updateStatus(
                    2, // SHIPPED
                    "In transit",
                    "Highway"
                );

                // Then update to DELIVERED
                await expect(
                    shipment.connect(retailer).updateStatus(
                        3, // DELIVERED
                        "Package delivered",
                        "Retail Store"
                    )
                ).to.emit(shipment, "ShipmentDelivered")
                .withArgs(retailer.address, anyValue);

                expect(await shipment.status()).to.equal(3); // DELIVERED
            });

            it("Should not allow invalid status transitions", async function () {
                // Try to jump from PREPARING to DELIVERED
                await expect(
                    shipment.connect(distributor).updateStatus(
                        3, // DELIVERED
                        "Invalid transition",
                        "Nowhere"
                    )
                ).to.be.revertedWith("Invalid shipment status transition");
            });

            it("Should not allow unauthorized users to update status", async function () {
                await expect(
                    shipment.connect(unauthorized).updateStatus(
                        2, // SHIPPED
                        "Unauthorized update",
                        "Unknown"
                    )
                ).to.be.revertedWith("Not authorized for this shipment");
            });
        });

        describe("Shipment Cancellation", function () {
            it("Should allow cancellation during PREPARING status", async function () {
                // Create a new shipment for this test
                const newShipmentTx = await shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    "CANCEL_TEST_1",
                    "Test Transport"
                );

                const receipt = await newShipmentTx.wait();
                const event = receipt.logs.find(log => {
                    try {
                        return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                    } catch {
                        return false;
                    }
                });

                const newShipmentAddress = shipmentFactory.interface.parseLog(event).args.shipmentAddress;
                const newShipment = await ethers.getContractAt("Shipment", newShipmentAddress);

                await expect(
                    newShipment.connect(distributor).cancel("Order cancelled by customer")
                ).to.emit(newShipment, "ShipmentCancelled")
                .withArgs("Order cancelled by customer", anyValue);

                expect(await newShipment.status()).to.equal(4); // CANCELLED
            });

            it("Should not allow cancellation during SHIPPED status due to transition validation", async function () {
                // Create a new shipment for this test
                const newShipmentTx = await shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    "CANCEL_TEST_2",
                    "Test Transport"
                );

                const receipt = await newShipmentTx.wait();
                const event = receipt.logs.find(log => {
                    try {
                        return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                    } catch {
                        return false;
                    }
                });

                const newShipmentAddress = shipmentFactory.interface.parseLog(event).args.shipmentAddress;
                const newShipment = await ethers.getContractAt("Shipment", newShipmentAddress);

                // First update to SHIPPED
                await newShipment.connect(distributor).updateStatus(
                    2, // SHIPPED
                    "In transit",
                    "Highway"
                );

                // Try to cancel - this should fail due to transition validation
                await expect(
                    newShipment.connect(distributor).cancel("Transport vehicle breakdown")
                ).to.be.revertedWith("Invalid shipment status transition");
            });

            it("Should not allow cancellation after delivery", async function () {
                // Create a new shipment for this test
                const newShipmentTx = await shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    "CANCEL_TEST_3",
                    "Test Transport"
                );

                const receipt = await newShipmentTx.wait();
                const event = receipt.logs.find(log => {
                    try {
                        return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                    } catch {
                        return false;
                    }
                });

                const newShipmentAddress = shipmentFactory.interface.parseLog(event).args.shipmentAddress;
                const newShipment = await ethers.getContractAt("Shipment", newShipmentAddress);

                // Update to SHIPPED then DELIVERED
                await newShipment.connect(distributor).updateStatus(2, "In transit", "Highway");
                await newShipment.connect(retailer).updateStatus(3, "Delivered", "Store");

                await expect(
                    newShipment.connect(distributor).cancel("Too late to cancel")
                ).to.be.revertedWith("Cannot cancel shipment in current status");
            });
        });

        describe("Delivery Verification", function () {
            it("Should allow receiver to verify delivery", async function () {
                // Update to SHIPPED then DELIVERED
                await shipment.connect(distributor).updateStatus(2, "In transit", "Highway");
                await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");

                await expect(
                    shipment.connect(retailer).verifyDelivery()
                ).to.emit(shipment, "ShipmentStatusUpdated")
                .withArgs(6, retailer.address, "Delivery verified by receiver", "", anyValue);

                expect(await shipment.status()).to.equal(6); // VERIFIED
            });

            it("Should not allow verification before delivery", async function () {
                await expect(
                    shipment.connect(retailer).verifyDelivery()
                ).to.be.revertedWith("Shipment must be delivered first");
            });

            it("Should not allow non-receiver to verify delivery", async function () {
                // Update to DELIVERED
                await shipment.connect(distributor).updateStatus(2, "In transit", "Highway");
                await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");

                await expect(
                    shipment.connect(distributor).verifyDelivery()
                ).to.be.revertedWith("Only receiver can verify delivery");
            });
        });

        describe("Shipment History", function () {
            it("Should maintain complete history", async function () {
                // Add multiple status updates
                await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
                await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
                await shipment.connect(retailer).verifyDelivery();

                const history = await shipment.getShipmentHistory();
                expect(history.length).to.equal(4); // Initial + 3 updates

                // Check progression
                expect(history[0].status).to.equal(1); // PREPARING
                expect(history[1].status).to.equal(2); // SHIPPED
                expect(history[2].status).to.equal(3); // DELIVERED
                expect(history[3].status).to.equal(6); // VERIFIED
            });

            it("Should return latest update", async function () {
                await shipment.connect(distributor).updateStatus(
                    2, 
                    "Latest update", 
                    "Current location"
                );

                const latest = await shipment.getLatestUpdate();
                expect(latest.status).to.equal(2);
                expect(latest.trackingInfo).to.equal("Latest update");
                expect(latest.location).to.equal("Current location");
                expect(latest.updater).to.equal(distributor.address);
            });
        });
    });

    describe("Error Handling", function () {
        it("Should handle empty tracking numbers", async function () {
            // This would be validated at the Shipment contract level
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    productAddress,
                    retailer.address,
                    "", // Empty tracking number
                    "Transport"
                )
            ).to.be.revertedWith("Tracking number cannot be empty");
        });
    });

    describe("Integration Tests", function () {
        it("Should handle multiple shipments for same product", async function () {
            const initialCount = await registry.getTotalShipments();

            // Create multiple shipments for the same product (already at processing stage)
            await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "TRACK001",
                "Air"
            );

            await shipmentFactory.connect(distributor).createShipment(
                productAddress,
                retailer.address,
                "TRACK002",
                "Sea"
            );

            const finalCount = await registry.getTotalShipments();
            expect(finalCount).to.equal(initialCount + 2n);

            const allShipments = await registry.getAllShipments();
            expect(allShipments.length).to.equal(Number(finalCount));
        });

        it("Should handle shipment lifecycle end-to-end", async function () {
            // Create new product and advance to processing stage
            const productTx = await productFactory.connect(farmer).createProduct(
                "E2E Test Product",
                "End-to-end test product",
                2,
                8,
                "Green Valley Farm, California",
                "E2E test farming practices"
            );
            
            const productReceipt = await productTx.wait();
            const productEvent = productReceipt.logs.find(log => {
                try {
                    return productFactory.interface.parseLog(log).name === "ProductCreated";
                } catch {
                    return false;
                }
            });
            
            const e2eProductAddress = productFactory.interface.parseLog(productEvent).args.productAddress;
            const e2eProduct = await ethers.getContractAt("Product", e2eProductAddress);
            await e2eProduct.connect(processor).updateProcessingStage("Processed for E2E test");

            // Create new shipment
            const tx = await shipmentFactory.connect(distributor).createShipment(
                e2eProductAddress,
                retailer.address,
                "E2E_TRACK",
                "End-to-End Test"
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                } catch {
                    return false;
                }
            });

            const e2eShipmentAddress = shipmentFactory.interface.parseLog(event).args.shipmentAddress;
            const e2eShipment = await ethers.getContractAt("Shipment", e2eShipmentAddress);

            // Complete lifecycle
            await e2eShipment.connect(distributor).updateStatus(2, "Shipped out", "Warehouse");
            await e2eShipment.connect(retailer).updateStatus(3, "Received", "Store");
            await e2eShipment.connect(retailer).verifyDelivery();

            // Verify final state
            expect(await e2eShipment.status()).to.equal(6); // VERIFIED
            const history = await e2eShipment.getShipmentHistory();
            expect(history.length).to.equal(4);
            
            // Verify registration
            expect(await registry.isRegistered(e2eShipmentAddress)).to.be.true;
        });
    });
});