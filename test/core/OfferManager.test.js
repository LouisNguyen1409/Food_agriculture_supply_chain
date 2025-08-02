const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OfferManager", function () {
    let offerManager, productBatch;
    let owner, farmer, processor, distributor, retailer, user1;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };
    const TRADING_MODE = { SPOT_MARKET: 0, CONTRACT_FARMING: 1, COOPERATIVE: 2 };

    beforeEach(async function () {
        [owner, farmer, processor, distributor, retailer, user1] = await ethers.getSigners();

        // Deploy ProductBatch first
        const ProductBatch = await ethers.getContractFactory("ProductBatch");
        productBatch = await ProductBatch.deploy();
        await productBatch.waitForDeployment();

        // Deploy OfferManager
        const OfferManager = await ethers.getContractFactory("OfferManager");
        offerManager = await OfferManager.deploy();
        await offerManager.waitForDeployment();

        // Setup roles in both contracts
        for (const contract of [productBatch, offerManager]) {
            await contract.connect(owner).grantRole(farmer.address, ROLE.FARMER);
            await contract.connect(owner).grantRole(processor.address, ROLE.PROCESSOR);
            await contract.connect(owner).grantRole(distributor.address, ROLE.DISTRIBUTOR);
            await contract.connect(owner).grantRole(retailer.address, ROLE.RETAILER);

            await contract.connect(owner).activateAccount(farmer.address);
            await contract.connect(owner).activateAccount(processor.address);
            await contract.connect(owner).activateAccount(distributor.address);
            await contract.connect(owner).activateAccount(retailer.address);
        }

        // Create a test batch
        await productBatch.connect(farmer).createBatch(
            "Test Mangoes", "Description", 100, ethers.parseEther("0.01"),
            "Costa Rica", "QmHash", TRADING_MODE.SPOT_MARKET, false
        );

        await productBatch.connect(farmer).listForSale(
            1, ethers.parseEther("0.012"), TRADING_MODE.SPOT_MARKET
        );
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await offerManager.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct owner", async function () {
            expect(await offerManager.owner()).to.equal(owner.address);
        });
    });

    describe("Buy Offers", function () {
        it("Should create buy offer successfully", async function () {
            await expect(offerManager.connect(processor).createBuyOffer(
                1, // batchId
                ethers.parseEther("0.013"), // offered price
                100, // quantity
                "QmBuyTerms", // terms
                3600, // duration (1 hour)
                farmer.address // seller
            )).to.emit(offerManager, "OfferCreated");

            const offer = await offerManager.getOffer(1);
            expect(offer.creator).to.equal(processor.address);
            expect(offer.batchId).to.equal(1);
            expect(offer.offerType).to.equal(0); // BUY_OFFER
        });

        it("Should prevent invalid buy offer", async function () {
            // Zero price
            await expect(offerManager.connect(processor).createBuyOffer(
                1, 0, 100, "Terms", 3600, farmer.address
            )).to.be.reverted;

            // Zero quantity
            await expect(offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.01"), 0, "Terms", 3600, farmer.address
            )).to.be.reverted;
        });

        it("Should accept buy offer successfully", async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms", 3600, farmer.address
            );

            await expect(offerManager.connect(farmer).acceptOffer(1))
                .to.emit(offerManager, "OfferAccepted");

            const offer = await offerManager.getOffer(1);
            expect(offer.status).to.equal(1); // ACCEPTED
        });
    });

    describe("Sell Offers", function () {
        it("Should create sell offer successfully", async function () {
            await expect(offerManager.connect(farmer).createSellOffer(
                1, // batchId
                ethers.parseEther("0.014"), // asking price
                100, // quantity
                "QmSellTerms", // terms
                7200, // duration (2 hours)
                processor.address // buyer
            )).to.emit(offerManager, "OfferCreated");

            const offer = await offerManager.getOffer(1);
            expect(offer.creator).to.equal(farmer.address);
            expect(offer.offerType).to.equal(1); // SELL_OFFER
        });

        it("Should accept sell offer successfully", async function () {
            await offerManager.connect(farmer).createSellOffer(
                1, ethers.parseEther("0.014"), 100, "Terms", 7200, processor.address
            );

            await expect(offerManager.connect(processor).acceptOffer(1))
                .to.emit(offerManager, "OfferAccepted");
        });
    });

    describe("Contract Offers", function () {
        it("Should create contract offer successfully", async function () {
            await expect(offerManager.connect(processor).createContractOffer(
                "Mangoes", // crop type
                1000, // expected quantity
                ethers.parseEther("0.015"), // price per unit
                "Organic farming required", // farming instructions
                30 * 24 * 3600, // 30 days duration
                farmer.address // farmer
            )).to.emit(offerManager, "OfferCreated");

            const offer = await offerManager.getOffer(1);
            expect(offer.offerType).to.equal(2); // CONTRACT_OFFER
        });

        it("Should accept contract offer successfully", async function () {
            await offerManager.connect(processor).createContractOffer(
                "Mangoes", 1000, ethers.parseEther("0.015"), "Instructions",
                30 * 24 * 3600, farmer.address
            );

            await expect(offerManager.connect(farmer).acceptOffer(1))
                .to.emit(offerManager, "OfferAccepted");
        });
    });

    describe("Offer Management", function () {
        beforeEach(async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms", 3600, farmer.address
            );
        });

        it("Should cancel offer successfully", async function () {
            await expect(offerManager.connect(processor).cancelOffer(1))
                .to.emit(offerManager, "OfferCancelled");

            const offer = await offerManager.getOffer(1);
            expect(offer.status).to.equal(2); // CANCELLED
        });

        it("Should prevent non-creator from cancelling", async function () {
            await expect(offerManager.connect(farmer).cancelOffer(1))
                .to.be.reverted;
        });

        it("Should reject offer successfully", async function () {
            await expect(offerManager.connect(farmer).rejectOffer(1))
                .to.emit(offerManager, "OfferRejected");

            const offer = await offerManager.getOffer(1);
            expect(offer.status).to.equal(3); // REJECTED
        });

        it("Should handle offer expiry", async function () {
            // Fast forward time beyond expiry
            await ethers.provider.send("evm_increaseTime", [3700]); // 1 hour + 100 seconds
            await ethers.provider.send("evm_mine");

            expect(await offerManager.isOfferExpired(1)).to.equal(true);
        });
    });

    describe("Offer Queries", function () {
        beforeEach(async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms1", 3600, farmer.address
            );
            await offerManager.connect(distributor).createBuyOffer(
                1, ethers.parseEther("0.014"), 50, "Terms2", 7200, farmer.address
            );
        });

        it("Should return offers for batch", async function () {
            const batchOffers = await offerManager.getOffersForBatch(1);
            expect(batchOffers.length).to.equal(2);
        });

        it("Should return offers by creator", async function () {
            const processorOffers = await offerManager.getOffersByCreator(processor.address);
            expect(processorOffers.length).to.equal(1);
            expect(processorOffers[0]).to.equal(1);
        });

        it("Should return offers by status", async function () {
            const pendingOffers = await offerManager.getOffersByStatus(0); // PENDING
            expect(pendingOffers.length).to.equal(2);
        });

        it("Should return available offers for user", async function () {
            const availableOffers = await offerManager.getAvailableOffersForUser(farmer.address);
            expect(availableOffers.length).to.equal(2); // Both buy offers available to farmer
        });
    });

    describe("Market Analytics", function () {
        beforeEach(async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms", 3600, farmer.address
            );
            await offerManager.connect(farmer).acceptOffer(1);
        });

        it("Should return market statistics", async function () {
            const stats = await offerManager.getMarketStatistics();
            expect(stats.totalOffers).to.equal(1);
            expect(stats.acceptedOffers).to.equal(1);
        });

        it("Should return trading volume", async function () {
            const volume = await offerManager.getTotalTradingVolume();
            expect(volume).to.equal(ethers.parseEther("1.3")); // 0.013 * 100
        });
    });

    describe("Edge Cases", function () {
        it("Should handle invalid offer ID", async function () {
            await expect(offerManager.getOffer(999)).to.be.reverted;
        });

        it("Should prevent accepting expired offer", async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms", 1, farmer.address
            );

            // Wait for expiry
            await ethers.provider.send("evm_increaseTime", [2]);
            await ethers.provider.send("evm_mine");

            await expect(offerManager.connect(farmer).acceptOffer(1)).to.be.reverted;
        });

        it("Should prevent duplicate acceptance", async function () {
            await offerManager.connect(processor).createBuyOffer(
                1, ethers.parseEther("0.013"), 100, "Terms", 3600, farmer.address
            );

            await offerManager.connect(farmer).acceptOffer(1);
            await expect(offerManager.connect(farmer).acceptOffer(1)).to.be.reverted;
        });
    });
});