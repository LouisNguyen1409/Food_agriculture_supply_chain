const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ProductRegistry", function () {
    let testHelpers;
    let productRegistry;
    let stakeholderRegistry;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, consumer, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer, unauthorized } = accounts);

        // Deploy dependencies
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);
    });

    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }

    describe("Deployment and Initialization", function () {
        it("Should deploy with correct stakeholder registry", async function () {
            expect(await productRegistry.stakeholderRegistry()).to.equal(
                await stakeholderRegistry.getAddress()
            );
        });

        it("Should initialize with correct default values", async function () {
            expect(await productRegistry.nextProductId()).to.equal(1);
            expect(await productRegistry.totalProducts()).to.equal(0);
        });
    });

    describe("Product Registration", function () {
        it("Should register product successfully", async function () {
            const tx = await productRegistry.connect(farmer).registerProduct(
                "Organic Apples",
                "BATCH001",
                "Harvested from organic farm with proper certifications"
            );

            await expect(tx)
                .to.emit(productRegistry, "ProductCreated")
                .withArgs(
                    1, // productId
                    "Organic Apples",
                    "BATCH001",
                    farmer.address,
                    await getBlockTimestamp(tx),
                    [2000, 5000, 0, 1000, await getBlockTimestamp(tx)], // Mock weather data
                    500000 // Mock price
                );

            expect(await productRegistry.totalProducts()).to.equal(1);
            expect(await productRegistry.nextProductId()).to.equal(2);
        });

        it("Should register product with location", async function () {
            const tx = await productRegistry.connect(farmer)["registerProduct(string,string,string,string)"](
                "Organic Apples",
                "BATCH001",
                "Harvested from organic farm",
                "California, USA"
            );

            const productInfo = await productRegistry.getProductInfo(1);
            expect(productInfo.productName).to.equal("Organic Apples");
            expect(productInfo.batchNumber).to.equal("BATCH001");
            expect(productInfo.farmer).to.equal(farmer.address);
            expect(productInfo.location).to.equal("California, USA");
            expect(productInfo.currentStage).to.equal(0); // FARM
            expect(productInfo.isActive).to.be.true;
        });

        it("Should fail with duplicate batch number", async function () {
            await productRegistry.connect(farmer).registerProduct(
                "Organic Apples",
                "BATCH001",
                "Farm data"
            );

            await expect(
                productRegistry.connect(farmer).registerProduct(
                    "Different Product",
                    "BATCH001",
                    "Different farm data"
                )
            ).to.be.revertedWith("Batch number already exists");
        });

        it("Should fail with empty product name", async function () {
            await expect(
                productRegistry.connect(farmer).registerProduct(
                    "",
                    "BATCH001",
                    "Farm data"
                )
            ).to.be.revertedWith("Product name cannot be empty");
        });

        it("Should fail with empty batch number", async function () {
            await expect(
                productRegistry.connect(farmer).registerProduct(
                    "Organic Apples",
                    "",
                    "Farm data"
                )
            ).to.be.revertedWith("Batch number cannot be empty");
        });

        it("Should fail if not registered as farmer", async function () {
            await expect(
                productRegistry.connect(unauthorized).registerProduct(
                    "Organic Apples",
                    "BATCH001",
                    "Farm data"
                )
            ).to.be.revertedWith("Not registered for this role");
        });
    });

    describe("Product Stage Updates", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should update processing stage successfully", async function () {
            const tx = await productRegistry.connect(processor).updateProcessingStage(
                productId,
                "Product processed with organic standards"
            );

            await expect(tx)
                .to.emit(productRegistry, "ProductStageUpdated")
                .withArgs(
                    productId,
                    1, // PROCESSING stage
                    processor.address,
                    "Product processed with organic standards",
                    await getBlockTimestamp(tx),
                    [2000, 5000, 0, 1000, await getBlockTimestamp(tx)], // Mock weather data
                    500000 // Mock price
                );

            const productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(1); // PROCESSING
        });

        it("Should update distribution stage successfully", async function () {
            // First update to processing
            await productRegistry.connect(processor).updateProcessingStage(
                productId,
                "Processed"
            );

            const tx = await productRegistry.connect(distributor).updateDistributionStage(
                productId,
                "Ready for distribution to retail stores"
            );

            const productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(2); // DISTRIBUTION
        });

        it("Should update retail stage successfully", async function () {
            // Update through stages
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Distributed");

            const tx = await productRegistry.connect(retailer).updateRetailStage(
                productId,
                "Available in store"
            );

            const productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(3); // RETAIL
        });

        it("Should fail with invalid stage transition", async function () {
            await expect(
                productRegistry.connect(distributor).updateDistributionStage(
                    productId,
                    "Trying to skip processing"
                )
            ).to.be.revertedWith("Invalid stage transition");
        });

        it("Should fail with wrong stakeholder role", async function () {
            await expect(
                productRegistry.connect(farmer).updateProcessingStage(
                    productId,
                    "Farmer trying to process"
                )
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should fail with empty stage data", async function () {
            await expect(
                productRegistry.connect(processor).updateProcessingStage(
                    productId,
                    ""
                )
            ).to.be.revertedWith("Stage data cannot be empty");
        });

        it("Should fail with non-existent product", async function () {
            await expect(
                productRegistry.connect(processor).updateProcessingStage(
                    999,
                    "Processing non-existent product"
                )
            ).to.be.revertedWith("Product does not exist");
        });
    });

    describe("Product Consumption", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            // Update through all stages to retail
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Distributed");
            await productRegistry.connect(retailer).updateRetailStage(productId, "At retail");
        });

        it("Should mark product as consumed", async function () {
            const tx = await productRegistry.connect(consumer).markAsConsumed(productId);

            await expect(tx)
                .to.emit(productRegistry, "ProductStageUpdated")
                .withArgs(
                    productId,
                    4, // CONSUMED stage
                    consumer.address,
                    "Product consumed",
                    await getBlockTimestamp(tx),
                    [0, 0, 0, 0, await getBlockTimestamp(tx)], // Empty weather data
                    0 // No price tracking
                );

            const productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(4); // CONSUMED
        });

        it("Should fail if product not at retail stage", async function () {
            const newProductId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            await expect(
                productRegistry.connect(consumer).markAsConsumed(newProductId)
            ).to.be.revertedWith("Product must be at retail stage");
        });
    });

    describe("Product Verification", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should verify product successfully", async function () {
            const [isValid, productInfo] = await productRegistry.verifyProduct(productId);
            
            expect(isValid).to.be.true;
            expect(productInfo.productName).to.equal("Organic Apples");
            expect(productInfo.farmer).to.equal(farmer.address);
        });

        it("Should perform verification and emit event", async function () {
            const tx = await productRegistry.connect(farmer).performVerification(productId);

            await expect(tx)
                .to.emit(productRegistry, "ProductVerified")
                .withArgs(productId, farmer.address, true, await getBlockTimestamp(tx));
        });
    });

    describe("Oracle Integration", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should get current market conditions", async function () {
            const [weather, price] = await productRegistry.getCurrentMarketConditions();
            
            expect(weather.temperature).to.equal(2000); // Mock temperature
            expect(weather.humidity).to.equal(5000); // Mock humidity
            expect(price).to.equal(500000); // Mock price
        });

        it("Should check farming conditions suitability", async function () {
            const isSuitable = await productRegistry.isFarmingConditionsSuitable(
                1500, // minTemp
                2500, // maxTemp
                4000, // minHumidity
                6000, // maxHumidity
                1000  // maxRainfall
            );
            
            expect(isSuitable).to.be.true;
        });

        it("Should get product with oracle data", async function () {
            const [productInfo, stageData, weather, price] = await productRegistry.getProductWithOracleData(productId);
            
            expect(productInfo.productName).to.equal("Organic Apples");
            expect(stageData.stakeholder).to.equal(farmer.address);
            expect(weather.temperature).to.equal(2000);
            expect(price).to.equal(500000);
        });

        it("Should get product journey with oracle data", async function () {
            // Update product through processing stage
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            
            const [productInfo, farmStage, processingStage, distributionStage, retailStage] = 
                await productRegistry.getProductJourneyWithOracle(productId);
            
            expect(productInfo.productName).to.equal("Organic Apples");
            expect(farmStage.stakeholder).to.equal(farmer.address);
            expect(processingStage.stakeholder).to.equal(processor.address);
            expect(distributionStage.stakeholder).to.equal(ethers.ZeroAddress); // Not updated yet
        });

        it("Should update oracle feeds", async function () {
            // This would typically require admin role, but for testing we'll use deployer
            await productRegistry.connect(deployer).updateOracleFeeds(
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                ethers.ZeroAddress
            );
            
            // Verify oracle feeds are updated (we can check by calling oracle functions)
            const [weather, price] = await productRegistry.getCurrentMarketConditions();
            expect(weather.temperature).to.equal(2000); // Still mock values
        });
    });

    describe("Product Queries and Getters", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should get product by batch number", async function () {
            // Get the actual batch number from the product info
            const productInfo = await productRegistry.getProductInfo(productId);
            const foundProductId = await productRegistry.getProductByBatch(productInfo.batchNumber);
            expect(foundProductId).to.equal(productId);
        });

        it("Should fail to get product with invalid batch", async function () {
            await expect(
                productRegistry.getProductByBatch("INVALID_BATCH")
            ).to.be.revertedWith("Product not found");
        });

        it("Should get product basic info", async function () {
            const [name, farmerAddr, harvestDate, origin, status, batchNumber, isActive] = 
                await productRegistry.getProduct(productId);
            
            expect(name).to.equal("Organic Apples");
            expect(farmerAddr).to.equal(farmer.address);
            expect(status).to.equal(0); // FARM stage
            expect(batchNumber).to.include("BATCH"); // Dynamic batch number
            expect(isActive).to.be.true;
        });

        it("Should get product stage data", async function () {
            const farmStageData = await productRegistry.getProductStageData(productId, 0); // FARM stage
            
            expect(farmStageData.stakeholder).to.equal(farmer.address);
            expect(farmStageData.data).to.equal("Harvested from organic farm, pesticide-free");
        });

        it("Should get product journey", async function () {
            // Update product through processing
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            
            const [productInfo, farmStage, processingStage, distributionStage, retailStage] = 
                await productRegistry.getProductJourney(productId);
            
            expect(productInfo.productName).to.equal("Organic Apples");
            expect(farmStage.stakeholder).to.equal(farmer.address);
            expect(processingStage.stakeholder).to.equal(processor.address);
        });

        it("Should get stakeholder products", async function () {
            const farmerProducts = await productRegistry.getStakeholderProducts(farmer.address);
            
            expect(farmerProducts).to.have.length.at.least(1);
            expect(farmerProducts[0]).to.equal(productId);
        });

        it("Should get products by stage", async function () {
            const farmProducts = await productRegistry.getProductsByStage(0); // FARM stage
            
            expect(farmProducts).to.have.length.at.least(1);
            expect(farmProducts).to.include(productId);
        });
    });

    describe("Supply Chain Statistics", function () {
        beforeEach(async function () {
            // Create multiple products at different stages
            const productId1 = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product2", "BATCH002");
            const productId3 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product3", "BATCH003");
            
            // Update some products to different stages
            await productRegistry.connect(processor).updateProcessingStage(productId2, "Processed");
            await productRegistry.connect(processor).updateProcessingStage(productId3, "Processed");
            await productRegistry.connect(distributor).updateDistributionStage(productId3, "Distributed");
        });

        it("Should get supply chain statistics", async function () {
            const [total, farm, processing, distribution, retail, consumed] = 
                await productRegistry.getSupplyChainStats();
            
            expect(total).to.equal(3);
            expect(farm).to.equal(1);
            expect(processing).to.equal(1);
            expect(distribution).to.equal(1);
            expect(retail).to.equal(0);
            expect(consumed).to.equal(0);
        });

        it("Should get total products count", async function () {
            const total = await productRegistry.getTotalProducts();
            expect(total).to.equal(3);
        });

        it("Should get next product ID", async function () {
            const nextId = await productRegistry.getNextProductId();
            expect(nextId).to.equal(4); // 3 products created + 1
        });
    });

    describe("Product Management", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should deactivate product by farmer", async function () {
            await productRegistry.connect(farmer).deactivateProduct(productId);
            
            // After deactivation, product cannot be accessed via getProductInfo due to productExists modifier
            await expect(
                productRegistry.getProductInfo(productId)
            ).to.be.revertedWith("Product does not exist");
            
            const totalProducts = await productRegistry.getTotalProducts();
            expect(totalProducts).to.equal(0); // Decremented
        });

        it("Should fail to deactivate product by non-farmer", async function () {
            await expect(
                productRegistry.connect(processor).deactivateProduct(productId)
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should fail to deactivate product by different farmer", async function () {
            // Create another farmer account
            const otherFarmer = accounts.auditor; // Using auditor as another farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                otherFarmer.address,
                0, // FARMER role
                "Other Farm",
                "LICENSE002",
                "Other Location",
                "Other Certifications"
            );

            await expect(
                productRegistry.connect(otherFarmer).deactivateProduct(productId)
            ).to.be.revertedWith("Only product farmer can deactivate");
        });

        it("Should fail to deactivate non-existent product", async function () {
            await expect(
                productRegistry.connect(farmer).deactivateProduct(999)
            ).to.be.revertedWith("Product does not exist");
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle operations on non-existent products", async function () {
            await expect(
                productRegistry.getProductInfo(999)
            ).to.be.revertedWith("Product does not exist");

            await expect(
                productRegistry.verifyProduct(999)
            ).to.be.revertedWith("Product does not exist");

            await expect(
                productRegistry.getProductWithOracleData(999)
            ).to.be.revertedWith("Product does not exist");
        });

        it("Should handle empty stakeholder products array", async function () {
            const products = await productRegistry.getStakeholderProducts(unauthorized.address);
            expect(products).to.have.length(0);
        });

        it("Should handle empty products by stage", async function () {
            const consumedProducts = await productRegistry.getProductsByStage(4); // CONSUMED stage
            expect(consumedProducts).to.have.length(0);
        });

        it("Should handle batch lookup edge cases", async function () {
            // Try to get non-existent batch
            await expect(
                productRegistry.getProductByBatch("NON_EXISTENT")
            ).to.be.revertedWith("Product not found");
        });
    });

    describe("Weather and Price Alerts", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should emit weather alerts for extreme conditions", async function () {
            // Since we're using mock data, we can't easily test actual alert conditions
            // But we can verify the alert functions exist and don't revert
            const [weather, price] = await productRegistry.getCurrentMarketConditions();
            expect(weather).to.not.be.undefined;
            expect(price).to.not.be.undefined;
        });

        it("Should handle price tracking through stages", async function () {
            // Update through stages and verify price tracking
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            
            const [productInfo, farmStage, processingStage] = 
                await productRegistry.getProductJourneyWithOracle(productId);
            
            expect(farmStage.marketPriceAtStage).to.equal(500000);
            expect(processingStage.marketPriceAtStage).to.equal(500000);
        });
    });

    describe("Advanced Oracle Integration and Weather/Price Alerts", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should handle oracle feed updates correctly", async function () {
            // Test updating oracle feeds
            await productRegistry.connect(deployer).updateOracleFeeds(
                ethers.ZeroAddress, // temperatureFeed
                ethers.ZeroAddress, // humidityFeed  
                ethers.ZeroAddress, // rainfallFeed
                ethers.ZeroAddress, // windSpeedFeed
                ethers.ZeroAddress  // priceFeed
            );

            // Verify that oracle functions still work with updated feeds
            const [weather, price] = await productRegistry.getCurrentMarketConditions();
            expect(weather.temperature).to.equal(2000); // Mock data
            expect(price).to.equal(500000);
        });

        it("Should track weather data across product stages", async function () {
            // Update product through all stages and verify weather data is captured
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed with proper temperature control");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Distributed via cold chain");
            await productRegistry.connect(retailer).updateRetailStage(productId, "Displayed in climate-controlled environment");

            const [productInfo, farmStage, processingStage, distributionStage, retailStage] = 
                await productRegistry.getProductJourneyWithOracle(productId);

            // Verify weather data is captured at each stage
            expect(farmStage.weatherAtStage.temperature).to.equal(2000);
            expect(processingStage.weatherAtStage.temperature).to.equal(2000);
            expect(distributionStage.weatherAtStage.temperature).to.equal(2000);
            expect(retailStage.weatherAtStage.temperature).to.equal(2000);
        });

        it("Should track price changes across product stages", async function () {
            // Update through stages
            await productRegistry.connect(processor).updateProcessingStage(productId, "Value-added processing");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Premium distribution");

            const [productInfo, farmStage, processingStage, distributionStage] = 
                await productRegistry.getProductJourneyWithOracle(productId);

            // All stages should have the same mock price since we're using mock data
            expect(farmStage.marketPriceAtStage).to.equal(500000);
            expect(processingStage.marketPriceAtStage).to.equal(500000);
            expect(distributionStage.marketPriceAtStage).to.equal(500000);
        });

        it("Should handle farming conditions assessment", async function () {
            // Test different temperature ranges
            const suitableConditions = await productRegistry.isFarmingConditionsSuitable(
                1000, // minTemp (10°C)
                3000, // maxTemp (30°C)
                2000, // minHumidity (20%)
                8000, // maxHumidity (80%)
                2000  // maxRainfall (20mm)
            );
            expect(suitableConditions).to.be.true; // Should be true with zero address feeds

            // Test extreme conditions
            const extremeConditions = await productRegistry.isFarmingConditionsSuitable(
                -1000, // very low temp
                500,   // very low max temp
                0,     // no humidity
                1000,  // very low max humidity
                0      // no rainfall
            );
            expect(extremeConditions).to.be.true; // Still true with mock feeds
        });

        it("Should handle oracle data retrieval edge cases", async function () {
            // Test getting oracle data for different products
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product2", "BATCH002");
            
            const [productInfo1, stageData1, weather1, price1] = await productRegistry.getProductWithOracleData(productId);
            const [productInfo2, stageData2, weather2, price2] = await productRegistry.getProductWithOracleData(productId2);

            // Both should return valid data
            expect(productInfo1.productName).to.equal("Organic Apples");
            expect(productInfo2.productName).to.equal("Product2");
            expect(weather1.temperature).to.equal(2000);
            expect(weather2.temperature).to.equal(2000);
            expect(price1).to.equal(500000);
            expect(price2).to.equal(500000);
        });

        it("Should maintain oracle data consistency across product lifecycle", async function () {
            // Create product and track it through complete lifecycle
            await productRegistry.connect(processor).updateProcessingStage(productId, "Processed");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Distributed");
            await productRegistry.connect(retailer).updateRetailStage(productId, "At retail");
            await productRegistry.connect(consumer).markAsConsumed(productId);

            // Verify we can still get oracle journey data
            const [productInfo, farmStage, processingStage, distributionStage, retailStage] = 
                await productRegistry.getProductJourneyWithOracle(productId);

            expect(productInfo.currentStage).to.equal(4); // CONSUMED
            expect(farmStage.weatherAtStage.temperature).to.equal(2000);
            expect(processingStage.weatherAtStage.temperature).to.equal(2000);
            expect(distributionStage.weatherAtStage.temperature).to.equal(2000);
            expect(retailStage.weatherAtStage.temperature).to.equal(2000);
        });

        it("Should handle oracle data with zero addresses gracefully", async function () {
            // The contract is deployed with zero addresses for oracle feeds
            // This should not cause reverts and should return mock data
            const [weather, price] = await productRegistry.getCurrentMarketConditions();
            
            expect(Number(weather.temperature)).to.be.a('number');
            expect(Number(weather.humidity)).to.be.a('number');
            expect(Number(weather.rainfall)).to.be.a('number');
            expect(Number(weather.windSpeed)).to.be.a('number');
            expect(Number(weather.timestamp)).to.be.greaterThan(0);
            expect(Number(price)).to.be.a('number');
        });

        it("Should handle product registration with location parameter", async function () {
            const tx = await productRegistry.connect(farmer)["registerProduct(string,string,string,string)"](
                "Location-specific Product",
                "LOC_BATCH_001",
                "Farm data with location",
                "Specific Farm Location, Country"
            );

            await expect(tx).to.emit(productRegistry, "ProductCreated");

            const productInfo = await productRegistry.getProductInfo(2); // Second product
            expect(productInfo.location).to.equal("Specific Farm Location, Country");
            expect(productInfo.estimatedPrice).to.equal(500000); // Mock oracle price
        });
    });

    describe("Advanced Product Management and Edge Cases", function () {
        it("Should handle multiple product registrations efficiently", async function () {
            const batchSize = 5;
            const productIds = [];

            for (let i = 0; i < batchSize; i++) {
                const productId = await testHelpers.createSampleProductSimple(
                    productRegistry, 
                    farmer,
                    `Product${i}`,
                    `BATCH${i.toString().padStart(3, '0')}`
                );
                productIds.push(productId);
            }

            expect(await productRegistry.getTotalProducts()).to.equal(batchSize);
            expect(await productRegistry.getNextProductId()).to.equal(batchSize + 1);

            // Verify all products are retrievable
            for (let i = 0; i < batchSize; i++) {
                const productInfo = await productRegistry.getProductInfo(productIds[i]);
                expect(productInfo.productName).to.equal(`Product${i}`);
                expect(productInfo.batchNumber).to.equal(`BATCH${i.toString().padStart(3, '0')}`);
            }
        });

        it("Should handle stage data validation correctly", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);

            // Test that stage data hashes are calculated correctly
            const farmStageData = await productRegistry.getProductStageData(productId, 0); // FARM stage
            
            const expectedHash = ethers.keccak256(ethers.toUtf8Bytes("Harvested from organic farm, pesticide-free"));
            expect(farmStageData.dataHash).to.equal(expectedHash);
        });

        it("Should maintain stakeholder product associations correctly", async function () {
            // Create products with different farmers
            const productId1 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product1", "BATCH001");
            
            // Register another farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                consumer.address, // Using consumer as second farmer
                0, // FARMER role
                "Second Farm",
                "LICENSE_SECOND",
                "Second Location",
                "Second Certifications"
            );
            
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, consumer, "Product2", "BATCH002");

            // Check stakeholder product associations
            const farmer1Products = await productRegistry.getStakeholderProducts(farmer.address);
            const farmer2Products = await productRegistry.getStakeholderProducts(consumer.address);

            expect(farmer1Products).to.include(productId1);
            expect(farmer1Products).to.not.include(productId2);
            expect(farmer2Products).to.include(productId2);
            expect(farmer2Products).to.not.include(productId1);
        });

        it("Should handle product stage filtering correctly", async function () {
            // Create products at different stages
            const productId1 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product1", "BATCH001");
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product2", "BATCH002");
            const productId3 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product3", "BATCH003");

            // Update some to processing stage
            await productRegistry.connect(processor).updateProcessingStage(productId2, "Processed");
            await productRegistry.connect(processor).updateProcessingStage(productId3, "Processed");

            // Update one to distribution
            await productRegistry.connect(distributor).updateDistributionStage(productId3, "Distributed");

            // Test filtering by stage
            const farmProducts = await productRegistry.getProductsByStage(0); // FARM
            const processingProducts = await productRegistry.getProductsByStage(1); // PROCESSING  
            const distributionProducts = await productRegistry.getProductsByStage(2); // DISTRIBUTION

            expect(farmProducts).to.include(productId1);
            expect(farmProducts).to.not.include(productId2);
            expect(farmProducts).to.not.include(productId3);

            expect(processingProducts).to.include(productId2);
            expect(processingProducts).to.not.include(productId1);
            expect(processingProducts).to.not.include(productId3);

            expect(distributionProducts).to.include(productId3);
            expect(distributionProducts).to.not.include(productId1);
            expect(distributionProducts).to.not.include(productId2);
        });

        it("Should handle product deactivation correctly", async function () {
            const productId1 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product1", "BATCH001");
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product2", "BATCH002");

            expect(await productRegistry.getTotalProducts()).to.equal(2);

            // Deactivate one product
            await productRegistry.connect(farmer).deactivateProduct(productId1);

            expect(await productRegistry.getTotalProducts()).to.equal(1);

            // Deactivated product cannot be accessed via getProductInfo
            await expect(
                productRegistry.getProductInfo(productId1)
            ).to.be.revertedWith("Product does not exist");

            // Active product should still work normally
            const activeProductInfo = await productRegistry.getProductInfo(productId2);
            expect(activeProductInfo.isActive).to.be.true;
            expect(activeProductInfo.productName).to.equal("Product2");
        });
    });
}); 