const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { TestHelpers } = require("./helpers/testHelpers");

describe("Shipment Contract Tests", function () {
    let testHelpers;
    let registry;
    let stakeholderRegistry;
    let stakeholderFactory;
    let productFactory;
    let shipmentFactory;
    let shipment;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, unauthorized;
    let oracleFeeds;
    let productAddress;
    let shipmentAddress;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, unauthorized } = accounts);

        // Deploy core contracts
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

        const ShipmentFactory = await ethers.getContractFactory("ShipmentFactory");
        shipmentFactory = await ShipmentFactory.deploy(
            await registry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await shipmentFactory.waitForDeployment();

        // Register stakeholders
        await stakeholderFactory.connect(deployer).createStakeholder(
            farmer.address, 0, "Test Farm", "FARM123", "Location", "Certs"
        );
        await stakeholderFactory.connect(deployer).createStakeholder(
            processor.address, 1, "Test Processor", "PROC123", "Location", "Certs"
        );
        await stakeholderFactory.connect(deployer).createStakeholder(
            distributor.address, 3, "Test Distributor", "DIST123", "Location", "Certs"
        );
        await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address, 2, "Test Retailer", "RET123", "Location", "Certs"
        );

        // Create and advance product
        const productTx = await productFactory.connect(farmer).createProduct(
            "Test Product", "Description", 2, 8, "Location", "Farm data"
        );
        const productReceipt = await productTx.wait();
        const productEvent = productReceipt.logs.find(log => {
            try {
                return productFactory.interface.parseLog(log).name === "ProductCreated";
            } catch { return false; }
        });
        productAddress = productFactory.interface.parseLog(productEvent).args.productAddress;

        const product = await ethers.getContractAt("Product", productAddress);
        await product.connect(processor).updateProcessingStage("Processed");

        // Create shipment
        const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
            productAddress, retailer.address, "TRACK001", "Truck"
        );
        const shipmentReceipt = await shipmentTx.wait();
        const shipmentEvent = shipmentReceipt.logs.find(log => {
            try {
                return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
            } catch { return false; }
        });
        shipmentAddress = shipmentFactory.interface.parseLog(shipmentEvent).args.shipmentAddress;
        shipment = await ethers.getContractAt("Shipment", shipmentAddress);
    });

    describe("Shipment Creation", function () {
        it("Should initialize with correct parameters", async function () {
            expect(await shipment.productAddress()).to.equal(productAddress);
            expect(await shipment.sender()).to.equal(distributor.address);
            expect(await shipment.receiver()).to.equal(retailer.address);
            expect(await shipment.trackingNumber()).to.equal("TRACK001");
            expect(await shipment.transportMode()).to.equal("Truck");
            expect(await shipment.status()).to.equal(1); // PREPARING
            expect(await shipment.isActive()).to.be.true;
        });

        it("Should have valid creation timestamp", async function () {
            const createdAt = await shipment.createdAt();
            const lastUpdated = await shipment.lastUpdated();
            expect(createdAt).to.be.greaterThan(0);
            expect(lastUpdated).to.be.greaterThan(0);
            expect(lastUpdated).to.equal(createdAt);
        });

        it("Should create initial history entry", async function () {
            const history = await shipment.getShipmentHistory();
            expect(history.length).to.equal(1);
            expect(history[0].status).to.equal(1); // PREPARING
            expect(history[0].updater).to.equal(distributor.address);
            expect(history[0].trackingInfo).to.equal("Shipment created and preparing");
        });
    });

    describe("Status Transitions", function () {
        it("Should allow valid status transition PREPARING -> SHIPPED", async function () {
            await expect(
                shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse")
            ).to.emit(shipment, "ShipmentStatusUpdated")
            .withArgs(2, distributor.address, "Shipped", "Warehouse", anyValue);

            expect(await shipment.status()).to.equal(2);
        });

        it("Should allow valid status transition SHIPPED -> DELIVERED", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            await expect(
                shipment.connect(retailer).updateStatus(3, "Delivered", "Store")
            ).to.emit(shipment, "ShipmentDelivered")
            .withArgs(retailer.address, anyValue);

            expect(await shipment.status()).to.equal(3);
        });

        it("Should allow valid status transition DELIVERED -> VERIFIED", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
            
            await expect(
                shipment.connect(retailer).verifyDelivery()
            ).to.emit(shipment, "ShipmentStatusUpdated")
            .withArgs(6, retailer.address, "Delivery verified by receiver", "", anyValue);

            expect(await shipment.status()).to.equal(6); // VERIFIED
        });

        it("Should allow status transition SHIPPED -> UNABLE_TO_DELIVERED", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            await expect(
                shipment.connect(distributor).updateStatus(5, "Delivery failed", "Customer unavailable")
            ).to.emit(shipment, "ShipmentStatusUpdated");

            expect(await shipment.status()).to.equal(5);
        });

        it("Should reject invalid status transitions", async function () {
            // Try to jump from PREPARING to DELIVERED
            await expect(
                shipment.connect(distributor).updateStatus(3, "Invalid", "Invalid")
            ).to.be.revertedWith("Invalid shipment status transition");

            // Try to go backwards
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await expect(
                shipment.connect(distributor).updateStatus(1, "Back to preparing", "Invalid")
            ).to.be.revertedWith("Invalid shipment status transition");
        });

        it("Should update lastUpdated timestamp on status change", async function () {
            const initialLastUpdated = await shipment.lastUpdated();
            
            // Wait a moment to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            const newLastUpdated = await shipment.lastUpdated();
            
            expect(newLastUpdated).to.be.greaterThan(initialLastUpdated);
        });
    });

    describe("Access Control", function () {
        it("Should allow sender to update status", async function () {
            await expect(
                shipment.connect(distributor).updateStatus(2, "Shipped by sender", "Warehouse")
            ).to.not.be.reverted;
        });

        it("Should allow receiver to update status", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            await expect(
                shipment.connect(retailer).updateStatus(3, "Received by receiver", "Store")
            ).to.not.be.reverted;
        });

        it("Should allow registered distributor to update status", async function () {
            // Create another distributor
            await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.auditor.address, 3, "Another Distributor", "DIST456", "Location", "Certs"
            );
            
            await expect(
                shipment.connect(accounts.auditor).updateStatus(2, "Updated by distributor", "Hub")
            ).to.not.be.reverted;
        });

        it("Should reject unauthorized users", async function () {
            await expect(
                shipment.connect(unauthorized).updateStatus(2, "Unauthorized", "Invalid")
            ).to.be.revertedWith("Not authorized for this shipment");
        });

        it("Should reject updates from farmer", async function () {
            await expect(
                shipment.connect(farmer).updateStatus(2, "Farmer update", "Farm")
            ).to.be.revertedWith("Not authorized for this shipment");
        });
    });

    describe("Shipment Cancellation", function () {
        it("Should allow cancellation from PREPARING status", async function () {
            await expect(
                shipment.connect(distributor).cancel("Order cancelled")
            ).to.emit(shipment, "ShipmentCancelled")
            .withArgs("Order cancelled", anyValue);

            expect(await shipment.status()).to.equal(4); // CANCELLED
        });

        it("Should not allow cancellation from SHIPPED status due to transition rules", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            await expect(
                shipment.connect(distributor).cancel("Vehicle breakdown")
            ).to.be.revertedWith("Invalid shipment status transition");
        });

        it("Should not allow cancellation after delivery", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
            
            await expect(
                shipment.connect(distributor).cancel("Too late")
            ).to.be.revertedWith("Cannot cancel shipment in current status");
        });

        it("Should only allow authorized users to cancel", async function () {
            await expect(
                shipment.connect(unauthorized).cancel("Unauthorized cancellation")
            ).to.be.revertedWith("Not authorized for this shipment");
        });
    });

    describe("Delivery Verification", function () {
        beforeEach(async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
        });

        it("Should only allow receiver to verify delivery", async function () {
            await expect(
                shipment.connect(retailer).verifyDelivery()
            ).to.emit(shipment, "ShipmentStatusUpdated");

            expect(await shipment.status()).to.equal(6); // VERIFIED
        });

        it("Should reject verification from non-receiver", async function () {
            await expect(
                shipment.connect(distributor).verifyDelivery()
            ).to.be.revertedWith("Only receiver can verify delivery");
        });

        it("Should reject verification before delivery", async function () {
            // Create new shipment that's only shipped
            const newShipmentTx = await shipmentFactory.connect(distributor).createShipment(
                productAddress, retailer.address, "TRACK002", "Air"
            );
            const newShipmentReceipt = await newShipmentTx.wait();
            const newShipmentEvent = newShipmentReceipt.logs.find(log => {
                try {
                    return shipmentFactory.interface.parseLog(log).name === "ShipmentCreated";
                } catch { return false; }
            });
            const newShipmentAddress = shipmentFactory.interface.parseLog(newShipmentEvent).args.shipmentAddress;
            const newShipment = await ethers.getContractAt("Shipment", newShipmentAddress);

            await newShipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            await expect(
                newShipment.connect(retailer).verifyDelivery()
            ).to.be.revertedWith("Shipment must be delivered first");
        });
    });

    describe("Status Descriptions", function () {
        it("Should return correct status descriptions", async function () {
            expect(await shipment.getStatusDescription()).to.equal("Preparing for shipment");

            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            expect(await shipment.getStatusDescription()).to.equal("In transit");

            await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
            expect(await shipment.getStatusDescription()).to.equal("Delivered");

            await shipment.connect(retailer).verifyDelivery();
            expect(await shipment.getStatusDescription()).to.equal("Delivery confirmed");
        });

        it("Should return correct description for cancelled status", async function () {
            await shipment.connect(distributor).cancel("Test cancellation");
            expect(await shipment.getStatusDescription()).to.equal("Shipment cancelled");
        });

        it("Should return correct description for unable to deliver status", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await shipment.connect(distributor).updateStatus(5, "Delivery failed", "Address not found");
            expect(await shipment.getStatusDescription()).to.equal("Delivery failed");
        });
    });

    describe("History Tracking", function () {
        it("Should maintain complete shipment history", async function () {
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            await shipment.connect(retailer).updateStatus(3, "Delivered", "Store");
            await shipment.connect(retailer).verifyDelivery();

            const history = await shipment.getShipmentHistory();
            expect(history.length).to.equal(4);

            // Check progression
            expect(history[0].status).to.equal(1); // PREPARING
            expect(history[1].status).to.equal(2); // SHIPPED
            expect(history[2].status).to.equal(3); // DELIVERED
            expect(history[3].status).to.equal(6); // VERIFIED

            // Check updaters
            expect(history[0].updater).to.equal(distributor.address);
            expect(history[1].updater).to.equal(distributor.address);
            expect(history[2].updater).to.equal(retailer.address);
            expect(history[3].updater).to.equal(retailer.address);
        });

        it("Should return latest update correctly", async function () {
            await shipment.connect(distributor).updateStatus(2, "Latest update", "Current location");

            const latest = await shipment.getLatestUpdate();
            expect(latest.status).to.equal(2);
            expect(latest.trackingInfo).to.equal("Latest update");
            expect(latest.location).to.equal("Current location");
            expect(latest.updater).to.equal(distributor.address);
        });

        it("Should store timestamps in history", async function () {
            const initialTime = await shipment.createdAt();
            
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            const history = await shipment.getShipmentHistory();
            expect(history[1].timestamp).to.be.greaterThanOrEqual(initialTime);
        });
    });

    describe("Information Retrieval", function () {
        it("Should return complete shipment information", async function () {
            const [
                product, sender, receiver, tracking, transport, 
                status, created, updated, active
            ] = await shipment.getShipmentInfo();

            expect(product).to.equal(productAddress);
            expect(sender).to.equal(distributor.address);
            expect(receiver).to.equal(retailer.address);
            expect(tracking).to.equal("TRACK001");
            expect(transport).to.equal("Truck");
            expect(status).to.equal(1); // PREPARING
            expect(created).to.be.greaterThan(0);
            expect(updated).to.be.greaterThan(0);
            expect(active).to.be.true;
        });

        it("Should update information after status changes", async function () {
            const initialUpdated = (await shipment.getShipmentInfo())[7];
            
            await shipment.connect(distributor).updateStatus(2, "Shipped", "Warehouse");
            
            const [,,,,,status,, updated,] = await shipment.getShipmentInfo();
            expect(status).to.equal(2);
            expect(updated).to.be.greaterThan(initialUpdated);
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle empty tracking info gracefully", async function () {
            await expect(
                shipment.connect(distributor).updateStatus(2, "", "")
            ).to.not.be.reverted;

            const latest = await shipment.getLatestUpdate();
            expect(latest.trackingInfo).to.equal("");
            expect(latest.location).to.equal("");
        });

        it("Should handle very long tracking info", async function () {
            const longInfo = "A".repeat(1000);
            
            await expect(
                shipment.connect(distributor).updateStatus(2, longInfo, "Location")
            ).to.not.be.reverted;

            const latest = await shipment.getLatestUpdate();
            expect(latest.trackingInfo).to.equal(longInfo);
        });

        it("Should maintain state consistency across multiple operations", async function () {
            // Perform multiple operations
            await shipment.connect(distributor).updateStatus(2, "Step 1", "Location 1");
            await shipment.connect(retailer).updateStatus(3, "Step 2", "Location 2");
            
            // Verify consistency
            const [,,,,,status,,updated,] = await shipment.getShipmentInfo();
            const latest = await shipment.getLatestUpdate();
            const history = await shipment.getShipmentHistory();
            
            expect(status).to.equal(3);
            expect(latest.status).to.equal(3);
            expect(history[history.length - 1].status).to.equal(3);
            expect(latest.timestamp).to.equal(updated);
        });

        it("Should reject status transition to NOT_SHIPPED", async function () {
            await expect(
                shipment.connect(distributor).updateStatus(0, "Invalid", "Invalid")
            ).to.be.revertedWith("Invalid shipment status transition");
        });
    });

    describe("Integration with StakeholderRegistry", function () {
        it("Should validate distributor registration through stakeholder registry", async function () {
            // This is tested implicitly through the modifier, but we can verify the integration
            const isDistributorRegistered = await stakeholderRegistry.isRegisteredStakeholder(
                distributor.address, 3 // DISTRIBUTOR
            );
            expect(isDistributorRegistered).to.be.true;

            // Verify shipment operations work with registered distributor
            await expect(
                shipment.connect(distributor).updateStatus(2, "Verified distributor", "Hub")
            ).to.not.be.reverted;
        });

        it("Should work with multiple registered distributors", async function () {
            // Register another distributor
            await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.auditor.address, 3, "Second Distributor", "DIST789", "Location", "Certs"
            );

            // Both should be able to update the shipment
            await expect(
                shipment.connect(distributor).updateStatus(2, "First distributor", "Hub1")
            ).to.not.be.reverted;

            // Create new shipment to test second distributor
            const newShipmentTx = await shipmentFactory.connect(accounts.auditor).createShipment(
                productAddress, retailer.address, "TRACK003", "Rail"
            );
            
            await expect(newShipmentTx).to.not.be.reverted;
        });
    });

    describe("Product Validation", function () {
        it("Should validate product eligibility for shipment", async function () {
            // This test verifies the validProductForShipment modifier worked during creation
            const product = await ethers.getContractAt("Product", productAddress);
            expect(await product.currentStage()).to.be.greaterThanOrEqual(1); // At least PROCESSING
            expect(await product.isActive()).to.be.true;
        });

        it("Should reject shipment creation for inactive product", async function () {
            // Create another product but don't advance it
            const newProductTx = await productFactory.connect(farmer).createProduct(
                "Inactive Product", "Description", 2, 8, "Location", "Farm data"
            );
            const newProductReceipt = await newProductTx.wait();
            const newProductEvent = newProductReceipt.logs.find(log => {
                try {
                    return productFactory.interface.parseLog(log).name === "ProductCreated";
                } catch { return false; }
            });
            const newProductAddress = productFactory.interface.parseLog(newProductEvent).args.productAddress;

            // Try to create shipment with product still in FARM stage
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    newProductAddress, retailer.address, "TRACK004", "Air"
                )
            ).to.be.revertedWith("Product not ready for shipment");
        });
    });
});
