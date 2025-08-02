const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShipmentTracker", function () {
    let shipmentTracker, productBatch, offerManager;
    let owner, farmer, processor, distributor, shipper;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };

    beforeEach(async function () {
        [owner, farmer, processor, distributor, shipper] = await ethers.getSigners();

        // Deploy dependencies
        const ProductBatch = await ethers.getContractFactory("ProductBatch");
        productBatch = await ProductBatch.deploy();
        await productBatch.waitForDeployment();

        const OfferManager = await ethers.getContractFactory("OfferManager");
        offerManager = await OfferManager.deploy();
        await offerManager.waitForDeployment();

        const ShipmentTracker = await ethers.getContractFactory("ShipmentTracker");
        shipmentTracker = await ShipmentTracker.deploy();
        await shipmentTracker.waitForDeployment();

        // Setup roles
        for (const contract of [productBatch, offerManager, shipmentTracker]) {
            await contract.connect(owner).grantRole(farmer.address, ROLE.FARMER);
            await contract.connect(owner).grantRole(processor.address, ROLE.PROCESSOR);
            await contract.connect(owner).grantRole(distributor.address, ROLE.DISTRIBUTOR);
            await contract.connect(owner).grantRole(shipper.address, ROLE.SHIPPER);

            await contract.connect(owner).activateAccount(farmer.address);
            await contract.connect(owner).activateAccount(processor.address);
            await contract.connect(owner).activateAccount(distributor.address);
            await contract.connect(owner).activateAccount(shipper.address);
        }

        // Create test batch and offer
        await productBatch.connect(farmer).createBatch(
            "Test Mangoes", "Description", 100, ethers.parseEther("0.01"),
            "Costa Rica", "QmHash", 0, false
        );

        await offerManager.connect(processor).createBuyOffer(
            1, ethers.parseEther("0.012"), 100, "Terms", 3600, farmer.address
        );
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await shipmentTracker.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct owner", async function () {
            expect(await shipmentTracker.owner()).to.equal(owner.address);
        });
    });

    describe("Shipment Creation", function () {
        it("Should create shipment successfully", async function () {
            await expect(shipmentTracker.connect(farmer).createShipment(
                1, // batchId
                1, // offerId
                processor.address, // receiver
                farmer.address, // shipper
                "TRACK-001", // trackingId
                "Costa Rica Farm", // fromLocation
                "Processing Facility", // toLocation
                "QmShipmentMeta" // metadataHash
            )).to.emit(shipmentTracker, "ShipmentCreated");

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.batchId).to.equal(1);
            expect(shipment.receiver).to.equal(processor.address);
            expect(shipment.status).to.equal(0); // CREATED
        });

        it("Should prevent unauthorized shipment creation", async function () {
            await expect(shipmentTracker.connect(processor).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From", "To", "Meta"
            )).to.be.reverted; // Only batch owner can create
        });

        it("Should auto-assign shipper if zero address", async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, ethers.ZeroAddress, "TRACK-001",
                "From", "To", "Meta"
            );

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.shipper).to.equal(farmer.address); // Auto-assigned to sender
        });
    });

    describe("Shipment Tracking", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "Costa Rica Farm", "Processing Facility", "Meta"
            );
        });

        it("Should pickup shipment successfully", async function () {
            await expect(shipmentTracker.connect(farmer).pickupShipment(1))
                .to.emit(shipmentTracker, "ShipmentPickedUp");

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.status).to.equal(1); // PICKED_UP
        });

        it("Should update location successfully", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);

            await expect(shipmentTracker.connect(farmer).updateLocation(1, "Highway 101"))
                .to.emit(shipmentTracker, "LocationUpdated");

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.status).to.equal(2); // IN_TRANSIT
        });

        it("Should mark delivered successfully", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);
            await shipmentTracker.connect(farmer).updateLocation(1, "Highway 101");

            await expect(shipmentTracker.connect(farmer).markDelivered(1))
                .to.emit(shipmentTracker, "ShipmentDelivered");

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.status).to.equal(3); // DELIVERED
        });

        it("Should confirm delivery successfully", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);
            await shipmentTracker.connect(farmer).updateLocation(1, "Highway 101");
            await shipmentTracker.connect(farmer).markDelivered(1);

            await expect(shipmentTracker.connect(processor).confirmDelivery(1))
                .to.emit(shipmentTracker, "DeliveryConfirmed");

            const shipment = await shipmentTracker.getShipment(1);
            expect(shipment.status).to.equal(4); // CONFIRMED
        });
    });

    describe("Access Control", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From", "To", "Meta"
            );
        });

        it("Should prevent non-shipper from pickup", async function () {
            await expect(shipmentTracker.connect(processor).pickupShipment(1))
                .to.be.reverted;
        });

        it("Should prevent non-shipper from location update", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);

            await expect(shipmentTracker.connect(processor).updateLocation(1, "Location"))
                .to.be.reverted;
        });

        it("Should prevent non-receiver from confirming delivery", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);
            await shipmentTracker.connect(farmer).markDelivered(1);

            await expect(shipmentTracker.connect(farmer).confirmDelivery(1))
                .to.be.reverted; // Only receiver can confirm
        });
    });

    describe("Status Validation", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From", "To", "Meta"
            );
        });

        it("Should prevent skipping status steps", async function () {
            // Can't update location without pickup
            await expect(shipmentTracker.connect(farmer).updateLocation(1, "Location"))
                .to.be.reverted;

            // Can't mark delivered without being in transit
            await expect(shipmentTracker.connect(farmer).markDelivered(1))
                .to.be.reverted;
        });

        it("Should prevent backward status changes", async function () {
            await shipmentTracker.connect(farmer).pickupShipment(1);

            // Can't pickup again
            await expect(shipmentTracker.connect(farmer).pickupShipment(1))
                .to.be.reverted;
        });
    });

    describe("Shipment Queries", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From1", "To1", "Meta1"
            );
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, distributor.address, processor.address, "TRACK-002",
                "From2", "To2", "Meta2"
            );
        });

        it("Should return shipments by batch", async function () {
            const batchShipments = await shipmentTracker.getShipmentsByBatch(1);
            expect(batchShipments.length).to.equal(2);
        });

        it("Should return shipments by status", async function () {
            const createdShipments = await shipmentTracker.getShipmentsByStatus(0); // CREATED
            expect(createdShipments.length).to.equal(2);
        });

        it("Should return shipments by receiver", async function () {
            const processorShipments = await shipmentTracker.getShipmentsByReceiver(processor.address);
            expect(processorShipments.length).to.equal(1);
        });

        it("Should return shipments by shipper", async function () {
            const farmerShipments = await shipmentTracker.getShipmentsByShipper(farmer.address);
            expect(farmerShipments.length).to.equal(1);
        });
    });

    describe("Location History", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "Farm", "Facility", "Meta"
            );
            await shipmentTracker.connect(farmer).pickupShipment(1);
        });

        it("Should track location history", async function () {
            await shipmentTracker.connect(farmer).updateLocation(1, "Highway 1");
            await shipmentTracker.connect(farmer).updateLocation(1, "Highway 2");
            await shipmentTracker.connect(farmer).updateLocation(1, "City Center");

            const history = await shipmentTracker.getLocationHistory(1);
            expect(history.length).to.equal(3);
            expect(history[0]).to.equal("Highway 1");
            expect(history[2]).to.equal("City Center");
        });

        it("Should track timestamps", async function () {
            const beforeTime = Math.floor(Date.now() / 1000);
            await shipmentTracker.connect(farmer).updateLocation(1, "Highway 1");
            const afterTime = Math.floor(Date.now() / 1000);

            const timestamps = await shipmentTracker.getLocationTimestamps(1);
            expect(timestamps.length).to.equal(1);
            expect(Number(timestamps[0])).to.be.at.least(beforeTime);
            expect(Number(timestamps[0])).to.be.at.most(afterTime + 10); // Allow for block time
        });
    });

    describe("Analytics", function () {
        beforeEach(async function () {
            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From", "To", "Meta"
            );
            await shipmentTracker.connect(farmer).pickupShipment(1);
            await shipmentTracker.connect(farmer).markDelivered(1);
            await shipmentTracker.connect(processor).confirmDelivery(1);
        });

        it("Should return shipment statistics", async function () {
            const stats = await shipmentTracker.getShipmentStatistics();
            expect(stats.totalShipments).to.equal(1);
            expect(stats.deliveredShipments).to.equal(1);
            expect(stats.confirmedShipments).to.equal(1);
        });

        it("Should calculate delivery performance", async function () {
            const performance = await shipmentTracker.getDeliveryPerformance();
            expect(performance.deliveryRate).to.equal(100); // 100% delivery rate
            expect(performance.confirmationRate).to.equal(100); // 100% confirmation rate
        });
    });

    describe("Edge Cases", function () {
        it("Should handle invalid shipment ID", async function () {
            await expect(shipmentTracker.getShipment(999)).to.be.reverted;
        });

        it("Should prevent empty tracking ID", async function () {
            await expect(shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "",
                "From", "To", "Meta"
            )).to.be.reverted;
        });

        it("Should handle shipment existence check", async function () {
            expect(await shipmentTracker.shipmentExists(1)).to.equal(false);

            await shipmentTracker.connect(farmer).createShipment(
                1, 1, processor.address, farmer.address, "TRACK-001",
                "From", "To", "Meta"
            );

            expect(await shipmentTracker.shipmentExists(1)).to.equal(true);
        });
    });
});