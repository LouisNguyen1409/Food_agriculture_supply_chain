const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProductBatch", function () {
    let productBatch, accessControl;
    let owner, farmer, processor, distributor, retailer, user1;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };
    const TRADING_MODE = { SPOT_MARKET: 0, CONTRACT_FARMING: 1, COOPERATIVE: 2, WEATHER_DEPENDENT: 3 };

    beforeEach(async function () {
        [owner, farmer, processor, distributor, retailer, user1] = await ethers.getSigners();

        // Deploy AccessControl
        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy();
        await accessControl.waitForDeployment();

        // Deploy ProductBatch
        const ProductBatch = await ethers.getContractFactory("ProductBatch");
        productBatch = await ProductBatch.deploy();
        await productBatch.waitForDeployment();

        // Setup roles
        await accessControl.connect(owner).grantRole(farmer.address, ROLE.FARMER);
        await accessControl.connect(owner).grantRole(processor.address, ROLE.PROCESSOR);
        await accessControl.connect(owner).grantRole(distributor.address, ROLE.DISTRIBUTOR);
        await accessControl.connect(owner).grantRole(retailer.address, ROLE.RETAILER);

        // Activate accounts
        await accessControl.connect(owner).activateAccount(farmer.address);
        await accessControl.connect(owner).activateAccount(processor.address);
        await accessControl.connect(owner).activateAccount(distributor.address);
        await accessControl.connect(owner).activateAccount(retailer.address);

        // Grant roles in ProductBatch
        await productBatch.connect(owner).grantRole(farmer.address, ROLE.FARMER);
        await productBatch.connect(owner).grantRole(processor.address, ROLE.PROCESSOR);
        await productBatch.connect(owner).grantRole(distributor.address, ROLE.DISTRIBUTOR);
        await productBatch.connect(owner).grantRole(retailer.address, ROLE.RETAILER);

        await productBatch.connect(owner).activateAccount(farmer.address);
        await productBatch.connect(owner).activateAccount(processor.address);
        await productBatch.connect(owner).activateAccount(distributor.address);
        await productBatch.connect(owner).activateAccount(retailer.address);
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await productBatch.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct owner", async function () {
            expect(await productBatch.owner()).to.equal(owner.address);
        });
    });

    describe("Batch Creation", function () {
        it("Should create batch successfully", async function () {
            await expect(productBatch.connect(farmer).createBatch(
                "Organic Mangoes",
                "Fresh organic mangoes from Costa Rica",
                100,
                ethers.parseEther("0.01"),
                "Costa Rica",
                "QmHash123"
            )).to.emit(productBatch, "BatchCreated");

            const batch = await productBatch.getBatchInfo(1);
            expect(batch.name).to.equal("Organic Mangoes");
            expect(batch.quantity).to.equal(100);
        });
        it("Should prevent non-farmer from creating batch", async function () {
            await expect(productBatch.connect(processor).createBatch(
                "Test Product", "Description", 100, ethers.parseEther("0.01"),
                "Location", "Hash"
            )).to.be.reverted;
        });

        it("Should create weather-dependent batch", async function () {
            await productBatch.connect(farmer).createBatch(
                "Weather Sensitive Crop", "Description", 100, ethers.parseEther("0.01"),
                "Location", "Hash"
            );

            const batch = await productBatch.getBatch(1);
            expect(batch.requiresWeatherVerification).to.equal(true);
        });
    });

    describe("Batch Listing", function () {
        beforeEach(async function () {
            await productBatch.connect(farmer).createBatch(
                "Mangoes", "Description", 100, ethers.parseEther("0.01"),
                "Costa Rica", "Hash"
            );
        });

        it("Should list batch for sale", async function () {
            await expect(productBatch.connect(farmer).listForSale(
                1, ethers.parseEther("0.012"), TRADING_MODE.SPOT_MARKET
            )).to.emit(productBatch, "BatchListed");

            const batch = await productBatch.getBatch(1);
            expect(batch.isAvailableForSale).to.equal(true);
        });

        it("Should prevent non-owner from listing", async function () {
            await expect(productBatch.connect(processor).listForSale(
                1, ethers.parseEther("0.012"), TRADING_MODE.SPOT_MARKET
            )).to.be.reverted;
        });

        it("Should update price when listing", async function () {
            const oldPrice = ethers.parseEther("0.01");
            const newPrice = ethers.parseEther("0.015");

            await expect(productBatch.connect(farmer).listForSale(1, newPrice, TRADING_MODE.SPOT_MARKET))
                .to.emit(productBatch, "PriceUpdated");
        });
    });

    describe("Batch Processing", function () {
        beforeEach(async function () {
            await productBatch.connect(farmer).createBatch(
                "Raw Mangoes", "Description", 100, ethers.parseEther("0.01"),
                "Costa Rica", "Hash"
            );

            // Transfer to processor
            await productBatch.connect(farmer)["transferOwnership(uint256,address)"](1, processor.address);
        });

        it("Should process batch successfully", async function () {
            await expect(productBatch.connect(processor).processBatch(
                1, "Juice Processing", "pH: 4.2, Sugar: 15%", 80
            )).to.emit(productBatch, "BatchProcessed");

            const batch = await productBatch.getBatch(1);
            expect(batch.status).to.equal(6); // PROCESSED
        });

        it("Should prevent non-owner from processing", async function () {
            await expect(productBatch.connect(farmer).processBatch(
                1, "Processing", "Metrics", 80
            )).to.be.reverted;
        });

        it("Should record processing data", async function () {
            await productBatch.connect(processor).processBatch(
                1, "Juice Processing", "Quality metrics", 80
            );

            const processingData = await productBatch.getProcessingData(1);
            expect(processingData.processor).to.equal(processor.address);
            expect(processingData.processingType).to.equal("Juice Processing");
        });
    });

    describe("Quality Checking", function () {
        beforeEach(async function () {
            await productBatch.connect(farmer).createBatch(
                "Mangoes", "Description", 100, ethers.parseEther("0.01"),
                "Costa Rica", "Hash"
            );
            await productBatch.connect(farmer)["transferOwnership(uint256,address)"](1, processor.address);
        });

        it("Should check quality successfully", async function () {
            await expect(productBatch.connect(processor).checkQuality(
                1, "Grade A", 12, 98, true, "Organic Cert Body"
            )).to.emit(productBatch, "QualityChecked");

            const batch = await productBatch.getBatch(1);
            expect(batch.status).to.equal(7); // QUALITY_CHECKED
        });

        it("Should store quality data", async function () {
            await productBatch.connect(processor).checkQuality(
                1, "Grade A", 12, 98, true, "Organic Cert Body"
            );

            const qualityData = await productBatch.getQualityData(1);
            expect(qualityData.qualityGrade).to.equal("Grade A");
            expect(qualityData.isOrganic).to.equal(true);
        });
    });

    describe("Ownership Transfer", function () {
        beforeEach(async function () {
            await productBatch.connect(farmer).createBatch(
                "Mangoes", "Description", 100, ethers.parseEther("0.01"),
                "Costa Rica", "Hash"
            );
        });

        it("Should transfer ownership successfully", async function () {
            await expect(productBatch.connect(farmer)["transferOwnership(uint256,address)"](1, processor.address))
                .to.emit(productBatch, "OwnershipTransferred");

            const batch = await productBatch.getBatch(1);
            expect(batch.currentOwner).to.equal(processor.address);
        });

        it("Should prevent non-owner from transferring", async function () {
            await expect(productBatch.connect(processor)["transferOwnership(uint256,address)"](1, distributor.address))
                .to.be.reverted;
        });

        it("Should update status on transfer", async function () {
            await productBatch.connect(farmer)["transferOwnership(uint256,address)"](1, processor.address);

            const batch = await productBatch.getBatch(1);
            expect(batch.status).to.equal(3); // SOLD
        });
    });

    describe("Batch Queries", function () {
        beforeEach(async function () {
            await productBatch.connect(farmer).createBatch(
                "Mangoes", "Description", 100, ethers.parseEther("0.01"),
                "Costa Rica", "Hash"
            );
            await productBatch.connect(farmer).createBatch(
                "Apples", "Description", 200, ethers.parseEther("0.02"),
                "USA", "Hash2"
            );
        });

        it("Should return farmer's batches", async function () {
            const farmerBatches = await productBatch.getFarmerBatches(farmer.address);
            expect(farmerBatches.length).to.equal(2);
        });

        it("Should return batches by status", async function () {
            const createdBatches = await productBatch.getBatchesByStatus(0); // CREATED
            expect(createdBatches.length).to.equal(2);
        });

        it("Should return batches by trading mode", async function () {
            const spotBatches = await productBatch.getBatchesByTradingMode(TRADING_MODE.SPOT_MARKET);
            expect(spotBatches.length).to.equal(1);

            const contractBatches = await productBatch.getBatchesByTradingMode(TRADING_MODE.CONTRACT_FARMING);
            expect(contractBatches.length).to.equal(1);
        });

        it("Should check batch existence", async function () {
            expect(await productBatch.batchExists(1)).to.equal(true);
            expect(await productBatch.batchExists(999)).to.equal(false);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle invalid batch ID", async function () {
            await expect(productBatch.getBatch(999)).to.be.reverted;
        });

        it("Should prevent zero quantity batch", async function () {
            await expect(productBatch.connect(farmer).createBatch(
                "Test", "Description", 0, ethers.parseEther("0.01"),
                "Location", "Hash"
            )).to.be.reverted;
        });

        it("Should prevent zero price batch", async function () {
            await expect(productBatch.connect(farmer).createBatch(
                "Test", "Description", 100, 0,
                "Location", "Hash"
            )).to.be.reverted;
        });
    });
});