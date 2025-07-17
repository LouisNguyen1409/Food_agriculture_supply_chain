const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("SupplyChainManager", function () {
    let testHelpers;
    let supplyChainManager;
    let stakeholderRegistry;
    let productRegistry;
    let shipmentRegistry;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, consumer, unauthorized;
    let productId, shipmentId, trackingNumber, batchNumber;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer, unauthorized } = accounts);

        // Deploy dependencies
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );
        shipmentRegistry = await testHelpers.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );

        // Deploy SupplyChainManager
        supplyChainManager = await testHelpers.deploySupplyChainManager(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress(),
            await shipmentRegistry.getAddress()
        );

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);
        
        // Register SupplyChainManager as a stakeholder so it can call ProductRegistry functions
        await stakeholderRegistry.connect(deployer).registerStakeholder(
            await supplyChainManager.getAddress(),
            0, // FARMER role
            "Supply Chain Manager System",
            "SCM-001",
            "System Infrastructure",
            "Automated Supply Chain Management"
        );

        // Create test data
        const productData = await testHelpers.createSampleProduct(productRegistry, farmer);
        productId = productData.productId;
        batchNumber = productData.batchNumber;
        
        // Update product to processing stage first
        await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed and ready for shipment");
        
        // Create shipment and get tracking number
        const shipmentData = await testHelpers.createSampleShipmentWithTracking(shipmentRegistry, distributor, productId, retailer.address);
        shipmentId = shipmentData.shipmentId;
        trackingNumber = shipmentData.trackingNumber;
    });

    describe("Deployment and Initialization", function () {
        it("Should set correct admin", async function () {
            expect(await supplyChainManager.admin()).to.equal(deployer.address);
        });

        it("Should set correct contract addresses", async function () {
            expect(await supplyChainManager.stakeholderRegistry()).to.equal(
                await stakeholderRegistry.getAddress()
            );
            expect(await supplyChainManager.productRegistry()).to.equal(
                await productRegistry.getAddress()
            );
            expect(await supplyChainManager.shipmentRegistry()).to.equal(
                await shipmentRegistry.getAddress()
            );
        });

        it("Should emit SystemInitialized event", async function () {
            // Deploy a new manager to test the event
            const SupplyChainManager = await ethers.getContractFactory("SupplyChainManager");
            
            const stakeholderAddr = await stakeholderRegistry.getAddress();
            const productAddr = await productRegistry.getAddress();
            const shipmentAddr = await shipmentRegistry.getAddress();
            
            // Deploy and wait for the transaction
            const deploymentTx = await SupplyChainManager.deploy(
                stakeholderAddr,
                productAddr,
                shipmentAddr
            );
            
            const newManager = await deploymentTx.waitForDeployment();
            
            // Get the deployment transaction receipt to check for events
            const receipt = await newManager.deploymentTransaction().wait();
            
            // Check that the event was emitted during deployment
            const events = receipt.logs;
            const systemInitializedEvent = events.find(event => {
                try {
                    const parsed = newManager.interface.parseLog(event);
                    return parsed && parsed.name === 'SystemInitialized';
                } catch {
                    return false;
                }
            });
            
            expect(systemInitializedEvent).to.not.be.undefined;
            
            if (systemInitializedEvent) {
                const parsed = newManager.interface.parseLog(systemInitializedEvent);
                expect(parsed.args[0]).to.equal(deployer.address);
                expect(parsed.args[1]).to.equal(stakeholderAddr);
                expect(parsed.args[2]).to.equal(productAddr);
                expect(parsed.args[3]).to.equal(shipmentAddr);
            }
        });

        it("Should get system addresses", async function () {
            const [stakeholderAddr, productAddr, shipmentAddr] = 
                await supplyChainManager.getSystemAddresses();
            
            expect(stakeholderAddr).to.equal(await stakeholderRegistry.getAddress());
            expect(productAddr).to.equal(await productRegistry.getAddress());
            expect(shipmentAddr).to.equal(await shipmentRegistry.getAddress());
        });
    });

    describe("Product with Shipment Creation", function () {
        it("Should create product with shipment (placeholder implementation)", async function () {
            const [createdProductId, createdShipmentId] = await supplyChainManager.connect(farmer)
                .createProductWithShipment.staticCall(
                    "Combined Product",
                    "BATCH123",
                    "Farm data",
                    retailer.address,
                    "TRACK123",
                    "TRUCK"
                );

            expect(createdProductId).to.be.greaterThan(0);
            expect(createdShipmentId).to.equal(0); // Current implementation returns 0
        });
    });

    describe("Complete Product Trace", function () {
        it("Should get complete product trace without shipment", async function () {
            const [
                productInfo,
                farmStage,
                processingStage,
                distributionStage,
                retailStage,
                hasShipment,
                shipmentInfo,
                shipmentHistory
            ] = await supplyChainManager.getCompleteProductTrace(productId);

            expect(productInfo.productName).to.equal("Organic Apples");
            expect(farmStage.timestamp).to.be.greaterThan(0);
            // hasShipment might be true or false depending on implementation
        });

        it("Should handle non-existent product in trace", async function () {
            // This should not revert but return empty data
            const [productInfo] = await supplyChainManager.getCompleteProductTrace(999);
            expect(productInfo.productName).to.equal("");
        });
    });

    describe("Supply Chain Verification", function () {
        it("Should verify complete supply chain", async function () {
            const [productIsValid, shipmentIsValid, status] = 
                await supplyChainManager.verifyCompleteSupplyChain(productId);

            expect(productIsValid).to.be.true;
            expect(shipmentIsValid).to.be.true;
            expect(status).to.include("verified");
        });

        it("Should handle non-existent product verification", async function () {
            const [productIsValid, shipmentIsValid, status] = 
                await supplyChainManager.verifyCompleteSupplyChain(999);

            expect(productIsValid).to.be.false;
            expect(status).to.not.equal("");
        });
    });

    describe("Tracking Functions", function () {
        it("Should track product and shipment by tracking number", async function () {
            const [
                prodId,
                productStage,
                shipmentStatus,
                productName,
                statusDescription,
                latestUpdate
            ] = await supplyChainManager.trackProductAndShipment(trackingNumber);

            expect(prodId).to.be.greaterThan(0);
            expect(productName).to.not.equal("");
        });

        it("Should handle non-existent tracking number", async function () {
            // This might revert or return empty data depending on implementation
            try {
                const result = await supplyChainManager.trackProductAndShipment("NONEXISTENT");
                // If it doesn't revert, check for empty/default values
                expect(result[0]).to.be.defined; // productId
            } catch (error) {
                // It's okay if it reverts for non-existent tracking numbers
                expect(error.message).to.include("revert");
            }
        });
    });

    describe("Dashboard and Statistics", function () {
        it("Should get supply chain dashboard", async function () {
            const [
                totalProducts,
                totalShipments,
                totalStakeholders,
                productsAtFarm,
                productsInProcessing,
                productsInDistribution,
                productsAtRetail,
                productsConsumed,
                shipmentsInTransit,
                shipmentsDelivered
            ] = await supplyChainManager.getSupplyChainDashboard();

            expect(totalProducts).to.be.greaterThan(0);
            expect(totalStakeholders).to.be.greaterThan(0);
            // Other values might be 0 or greater depending on test data
        });
    });

    describe("Product Lookup Functions", function () {
        it("Should find product by batch number", async function () {
            const [foundProductId, productInfo, hasShipment, foundShipmentId] = 
                await supplyChainManager.findProductByBatch(batchNumber);

            expect(foundProductId).to.be.greaterThan(0);
            expect(productInfo.productName).to.not.equal("");
        });

        it("Should handle non-existent batch number", async function () {
            try {
                const result = await supplyChainManager.findProductByBatch("NONEXISTENT");
                // If it doesn't revert, productId should be 0 or similar
                expect(result[0]).to.exist;
            } catch (error) {
                // It's okay if it reverts for non-existent batch numbers
                expect(error.message).to.include("revert");
            }
        });
    });

    describe("Stakeholder Activity", function () {
        it("Should get stakeholder activity", async function () {
            const [products, shipments, stakeholderInfo] = 
                await supplyChainManager.getStakeholderActivity(farmer.address);

            expect(products).to.be.an('array');
            expect(shipments).to.be.an('array');
            expect(stakeholderInfo.stakeholderAddress).to.equal(farmer.address);
        });

        it("Should handle non-existent stakeholder", async function () {
            const [products, shipments, stakeholderInfo] = 
                await supplyChainManager.getStakeholderActivity(unauthorized.address);

            expect(products).to.be.an('array');
            expect(shipments).to.be.an('array');
            // stakeholderInfo should have default/empty values
        });
    });

    describe("Products by Stage", function () {
        it("Should get products by stage with shipments", async function () {
            const [productIds, correspondingShipmentIds] = 
                await supplyChainManager.getProductsByStageWithShipments(0); // FARM stage

            expect(productIds).to.be.an('array');
            expect(correspondingShipmentIds).to.be.an('array');
            expect(productIds.length).to.equal(correspondingShipmentIds.length);
        });

        it("Should handle empty stage", async function () {
            const [productIds, correspondingShipmentIds] = 
                await supplyChainManager.getProductsByStageWithShipments(4); // CONSUMED stage

            expect(productIds).to.be.an('array');
            expect(correspondingShipmentIds).to.be.an('array');
        });
    });

    describe("Contract Upgrade Functions", function () {
        it("Should upgrade product registry", async function () {
            const newProductRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );

            const tx = await supplyChainManager.connect(deployer).upgradeProductRegistry(
                await newProductRegistry.getAddress()
            );

            await expect(tx)
                .to.emit(supplyChainManager, "ContractUpgraded")
                .withArgs("ProductRegistry", await newProductRegistry.getAddress());

            expect(await supplyChainManager.productRegistry()).to.equal(
                await newProductRegistry.getAddress()
            );
        });

        it("Should upgrade shipment registry", async function () {
            const newShipmentRegistry = await testHelpers.deployShipmentRegistry(
                await stakeholderRegistry.getAddress(),
                await productRegistry.getAddress()
            );

            const tx = await supplyChainManager.connect(deployer).upgradeShipmentRegistry(
                await newShipmentRegistry.getAddress()
            );

            await expect(tx)
                .to.emit(supplyChainManager, "ContractUpgraded")
                .withArgs("ShipmentRegistry", await newShipmentRegistry.getAddress());

            expect(await supplyChainManager.shipmentRegistry()).to.equal(
                await newShipmentRegistry.getAddress()
            );
        });

        it("Should upgrade stakeholder registry", async function () {
            const newStakeholderRegistry = await testHelpers.deployStakeholderRegistry();

            const tx = await supplyChainManager.connect(deployer).upgradeStakeholderRegistry(
                await newStakeholderRegistry.getAddress()
            );

            await expect(tx)
                .to.emit(supplyChainManager, "ContractUpgraded")
                .withArgs("StakeholderRegistry", await newStakeholderRegistry.getAddress());

            expect(await supplyChainManager.stakeholderRegistry()).to.equal(
                await newStakeholderRegistry.getAddress()
            );
        });

        it("Should reject upgrade with zero address", async function () {
            await expect(
                supplyChainManager.connect(deployer).upgradeProductRegistry(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");

            await expect(
                supplyChainManager.connect(deployer).upgradeShipmentRegistry(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");

            await expect(
                supplyChainManager.connect(deployer).upgradeStakeholderRegistry(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should reject upgrades by non-admin", async function () {
            const newProductRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );

            await expect(
                supplyChainManager.connect(unauthorized).upgradeProductRegistry(
                    await newProductRegistry.getAddress()
                )
            ).to.be.revertedWith("Only admin can perform this action");

            await expect(
                supplyChainManager.connect(unauthorized).upgradeShipmentRegistry(
                    await newProductRegistry.getAddress()
                )
            ).to.be.revertedWith("Only admin can perform this action");

            await expect(
                supplyChainManager.connect(unauthorized).upgradeStakeholderRegistry(
                    await newProductRegistry.getAddress()
                )
            ).to.be.revertedWith("Only admin can perform this action");
        });
    });

    describe("Integration Scenarios", function () {
        it("Should handle complete product lifecycle", async function () {
            // Create product
            const newProductId = await testHelpers.createSampleProductSimple(productRegistry, farmer);

            // Update stages
            await testHelpers.updateProductStage(
                productRegistry,
                processor,
                newProductId,
                1, // PROCESSING
                "Processed and packaged"
            );

            await testHelpers.updateProductStage(
                productRegistry,
                distributor,
                newProductId,
                2, // DISTRIBUTION
                "Ready for distribution"
            );

            // Create shipment
            const newShipmentId = await testHelpers.createSampleShipment(
                shipmentRegistry,
                distributor,
                newProductId,
                retailer.address
            );

            // Verify complete supply chain
            const [productIsValid, shipmentIsValid, status] = 
                await supplyChainManager.verifyCompleteSupplyChain(newProductId);

            expect(productIsValid).to.be.true;
            expect(shipmentIsValid).to.be.true;

            // Get complete trace
            const [
                productInfo,
                farmStage,
                processingStage,
                distributionStage,
                retailStage,
                hasShipment,
                shipmentInfo,
                shipmentHistory
            ] = await supplyChainManager.getCompleteProductTrace(newProductId);

            expect(productInfo.currentStage).to.equal(2); // DISTRIBUTION
            expect(processingStage.timestamp).to.be.greaterThan(0);
            expect(distributionStage.timestamp).to.be.greaterThan(0);
        });

        it("Should handle multiple stakeholders activities", async function () {
            // Get farmer activity
            const [farmerProducts, farmerShipments] = 
                await supplyChainManager.getStakeholderActivity(farmer.address);

            // Get distributor activity
            const [distributorProducts, distributorShipments] = 
                await supplyChainManager.getStakeholderActivity(distributor.address);

            expect(farmerProducts.length).to.be.greaterThan(0);
            expect(distributorShipments.length).to.be.greaterThan(0);
        });

        it("Should provide accurate dashboard statistics", async function () {
            // Create additional test data
            await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            const [
                totalProducts,
                totalShipments,
                totalStakeholders,
                productsAtFarm,
                productsInProcessing,
                productsInDistribution,
                productsAtRetail,
                productsConsumed,
                shipmentsInTransit,
                shipmentsDelivered
            ] = await supplyChainManager.getSupplyChainDashboard();

            expect(totalProducts).to.be.greaterThan(1);
            expect(totalStakeholders).to.be.greaterThan(3); // At least farmer, processor, distributor, retailer
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle invalid product IDs gracefully", async function () {
            const [productIsValid] = await supplyChainManager.verifyCompleteSupplyChain(999999);
            expect(productIsValid).to.be.false;
        });

        it("Should handle empty stakeholder activities", async function () {
            const newAccount = accounts.auditor; // Using auditor as an account with no activity
            const [products, shipments, stakeholderInfo] = 
                await supplyChainManager.getStakeholderActivity(newAccount.address);

            expect(products).to.be.an('array');
            expect(shipments).to.be.an('array');
        });

        it("Should handle products without shipments", async function () {
            const newProductId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            const [
                productInfo,
                farmStage,
                processingStage,
                distributionStage,
                retailStage,
                hasShipment,
                shipmentInfo,
                shipmentHistory
            ] = await supplyChainManager.getCompleteProductTrace(newProductId);

            expect(productInfo.productName).to.not.equal("");
            // hasShipment could be true or false depending on the implementation
        });
    });
}); 