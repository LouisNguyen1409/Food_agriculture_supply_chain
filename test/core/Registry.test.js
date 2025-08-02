const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Registry", function () {
    let registry, productBatch;
    let owner, farmer, processor, distributor, retailer;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };
    const TRADING_MODE = { SPOT_MARKET: 0, CONTRACT_FARMING: 1, COOPERATIVE: 2 };

    beforeEach(async function () {
        [owner, farmer, processor, distributor, retailer] = await ethers.getSigners();

        // Deploy ProductBatch first
        const ProductBatch = await ethers.getContractFactory("ProductBatch");
        productBatch = await ProductBatch.deploy();
        await productBatch.waitForDeployment();

        // Deploy Registry
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        // Setup roles
        for (const contract of [productBatch, registry]) {
            await contract.connect(owner).grantRole(farmer.address, ROLE.FARMER);
            await contract.connect(owner).grantRole(processor.address, ROLE.PROCESSOR);
            await contract.connect(owner).grantRole(distributor.address, ROLE.DISTRIBUTOR);
            await contract.connect(owner).grantRole(retailer.address, ROLE.RETAILER);

            await contract.connect(owner).activateAccount(farmer.address);
            await contract.connect(owner).activateAccount(processor.address);
            await contract.connect(owner).activateAccount(distributor.address);
            await contract.connect(owner).activateAccount(retailer.address);
        }
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await registry.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should initialize with zero metrics", async function () {
            const overview = await registry.getMarketplaceOverview();
            expect(overview[0]).to.equal(0); // totalProducts
            expect(overview[1]).to.equal(0); // availableProducts
            expect(overview[2]).to.equal(0); // totalTransactions
        });
    });

    describe("Product Registration", function () {
        it("Should register product successfully", async function () {
            await expect(registry.connect(farmer).registerProduct(
                1, // batchId
                "Organic Mangoes",
                "Fruits",
                farmer.address,
                100, // quantity
                ethers.parseEther("0.01"), // price
                "Costa Rica",
                "QmHash123",
                TRADING_MODE.SPOT_MARKET,
                false // weatherDependent
            )).to.emit(registry, "ProductRegistered");

            const overview = await registry.getMarketplaceOverview();
            expect(overview[0]).to.equal(1); // totalProducts
        });

        it("Should prevent duplicate registration", async function () {
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.01"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            );

            await expect(registry.connect(farmer).registerProduct(
                1, "Mangoes2", "Fruits", farmer.address, 100,
                ethers.parseEther("0.01"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            )).to.be.revertedWith("Product already registered");
        });

        it("Should update availability on registration", async function () {
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.01"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            );

            const overview = await registry.getMarketplaceOverview();
            expect(overview[1]).to.equal(1); // availableProducts
        });
    });

    describe("Transaction Recording", function () {
        beforeEach(async function () {
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.01"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            );
        });

        it("Should record transaction successfully", async function () {
            await expect(registry.connect(farmer).recordTransaction(
                1, // batchId
                farmer.address,
                processor.address,
                ethers.parseEther("1.0"), // total value
                100, // quantity
                "SPOT_MARKET"
            )).to.emit(registry, "TransactionRecorded");

            const overview = await registry.getMarketplaceOverview();
            expect(overview[2]).to.equal(1); // totalTransactions
            expect(overview[4]).to.equal(ethers.parseEther("1.0")); // totalUSDValue
        });

        it("Should update user statistics", async function () {
            await registry.connect(farmer).recordTransaction(
                1, farmer.address, processor.address,
                ethers.parseEther("1.0"), 100, "SPOT_MARKET"
            );

            const farmerDashboard = await registry.getUserDashboard(farmer.address);
            expect(farmerDashboard[2]).to.equal(1); // transactionCount
            expect(farmerDashboard[3]).to.equal(ethers.parseEther("1.0")); // totalUSDValue

            const processorDashboard = await registry.getUserDashboard(processor.address);
            expect(processorDashboard[2]).to.equal(1); // transactionCount
        });

        it("Should track transaction history for batch", async function () {
            await registry.connect(farmer).recordTransaction(
                1, farmer.address, processor.address,
                ethers.parseEther("1.0"), 100, "SPOT_MARKET"
            );

            const batchTransactions = await registry.getBatchTransactions(1);
            expect(batchTransactions.length).to.equal(1);
            expect(batchTransactions[0]).to.equal(1); // transactionId
        });
    });

    describe("Analytics Functions", function () {
        beforeEach(async function () {
            // Register multiple products
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.015"), "Costa Rica", "Hash1",
                TRADING_MODE.SPOT_MARKET, false
            );

            await registry.connect(farmer).registerProduct(
                2, "Apples", "Fruits", farmer.address, 200,
                ethers.parseEther("0.010"), "USA", "Hash2",
                TRADING_MODE.CONTRACT_FARMING, true
            );

            await registry.connect(processor).registerProduct(
                3, "Rice", "Grains", processor.address, 500,
                ethers.parseEther("0.005"), "Thailand", "Hash3",
                TRADING_MODE.COOPERATIVE, false
            );
        });

        it("Should return marketplace overview", async function () {
            const overview = await registry.getMarketplaceOverview();
            expect(overview[0]).to.equal(3); // totalProducts
            expect(overview[1]).to.equal(3); // availableProducts
            expect(overview[2]).to.equal(0); // totalTransactions initially
        });

        it("Should return category analytics", async function () {
            const fruitsAnalytics = await registry.getCategoryAnalytics("Fruits");
            expect(fruitsAnalytics[1]).to.equal(2); // productCount
            expect(fruitsAnalytics[5]).to.equal(2); // availableCount
            expect(fruitsAnalytics[6]).to.equal(1); // weatherDependentCount
        });

        it("Should return trading mode analytics", async function () {
            const spotMarketProducts = await registry.getProductsByTradingMode(TRADING_MODE.SPOT_MARKET);
            expect(spotMarketProducts.length).to.equal(1);
            expect(spotMarketProducts[0]).to.equal(1);

            const contractProducts = await registry.getProductsByTradingMode(TRADING_MODE.CONTRACT_FARMING);
            expect(contractProducts.length).to.equal(1);
            expect(contractProducts[0]).to.equal(2);
        });

        it("Should return products by category", async function () {
            const fruitProducts = await registry.getAvailableProductsByCategory("Fruits");
            expect(fruitProducts.length).to.equal(2);
            expect(fruitProducts).to.include.members([BigInt(1), BigInt(2)]);

            const grainProducts = await registry.getAvailableProductsByCategory("Grains");
            expect(grainProducts.length).to.equal(1);
            expect(grainProducts[0]).to.equal(3);
        });

        it("Should search products correctly", async function () {
            const appleResults = await registry.searchProducts(
                "Apples", "Fruits", TRADING_MODE.CONTRACT_FARMING, false
            );
            expect(appleResults.length).to.equal(1);
            expect(appleResults[0]).to.equal(2);

            const weatherDependentResults = await registry.searchProducts(
                "", "", TRADING_MODE.SPOT_MARKET, true
            );
            expect(weatherDependentResults.length).to.equal(0); // No weather-dependent spot market products
        });
    });

    describe("User Dashboard", function () {
        beforeEach(async function () {
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.015"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, true
            );

            await registry.connect(farmer).recordTransaction(
                1, farmer.address, processor.address,
                ethers.parseEther("1.5"), 100, "SPOT_MARKET"
            );
        });

        it("Should return correct farmer dashboard", async function () {
            const dashboard = await registry.getUserDashboard(farmer.address);
            expect(dashboard[0]).to.equal(1); // totalProducts
            expect(dashboard[1]).to.equal(1); // availableProducts
            expect(dashboard[2]).to.equal(1); // transactionCount
            expect(dashboard[3]).to.equal(ethers.parseEther("1.5")); // totalUSDValue
            expect(dashboard[4]).to.equal(100); // totalVolume
            expect(dashboard[5]).to.equal(1); // weatherDependentProducts
        });

        it("Should return correct processor dashboard", async function () {
            const dashboard = await registry.getUserDashboard(processor.address);
            expect(dashboard[0]).to.equal(0); // totalProducts (processor hasn't created any)
            expect(dashboard[2]).to.equal(1); // transactionCount (involved in 1 transaction)
            expect(dashboard[3]).to.equal(ethers.parseEther("1.5")); // totalUSDValue
        });
    });

    describe("System Statistics", function () {
        beforeEach(async function () {
            await registry.connect(farmer).registerProduct(
                1, "Mangoes", "Fruits", farmer.address, 100,
                ethers.parseEther("0.015"), "Costa Rica", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            );

            await registry.connect(farmer).recordTransaction(
                1, farmer.address, processor.address,
                ethers.parseEther("1.5"), 100, "SPOT_MARKET"
            );
        });

        it("Should return system stats", async function () {
            const stats = await registry.getSystemStats();
            expect(stats[0]).to.equal(1); // totalProducts
            expect(stats[1]).to.equal(1); // totalTransactions
            expect(stats[2]).to.equal(100); // totalVolume
            expect(stats[3]).to.equal(ethers.parseEther("1.5")); // totalValue
            expect(stats[4]).to.equal(1); // availableProducts
        });
    });

    describe("Access Control", function () {
        it("Should only allow authorized users to register products", async function () {
            await expect(registry.connect(owner).registerProduct(
                1, "Unauthorized", "Test", owner.address, 100,
                ethers.parseEther("0.01"), "Nowhere", "Hash",
                TRADING_MODE.SPOT_MARKET, false
            )).to.be.revertedWith("AccessControl: account not active");
        });

        it("Should only allow authorized users to record transactions", async function () {
            await expect(registry.connect(owner).recordTransaction(
                1, farmer.address, processor.address,
                ethers.parseEther("1.0"), 100, "SPOT_MARKET"
            )).to.be.revertedWith("AccessControl: account not active");
        });

        it("Should allow public access to view functions", async function () {
            // These should not revert even for non-authorized users
            await registry.connect(owner).getMarketplaceOverview();
            await registry.connect(owner).getCategoryAnalytics("Fruits");
            await registry.connect(owner).getUserDashboard(farmer.address);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle empty category analytics", async function () {
            const emptyAnalytics = await registry.getCategoryAnalytics("NonExistent");
            expect(emptyAnalytics[1]).to.equal(0); // productCount should be 0
            expect(emptyAnalytics[5]).to.equal(0); // availableCount should be 0
        });

        it("Should handle empty search results", async function () {
            const emptyResults = await registry.searchProducts(
                "NonExistent", "NonExistent", TRADING_MODE.SPOT_MARKET, false
            );
            expect(emptyResults.length).to.equal(0);
        });

        it("Should handle user with no activity", async function () {
            const emptyDashboard = await registry.getUserDashboard(distributor.address);
            expect(emptyDashboard[0]).to.equal(0); // totalProducts
            expect(emptyDashboard[2]).to.equal(0); // transactionCount
            expect(emptyDashboard[3]).to.equal(0); // totalUSDValue
        });
    });
});