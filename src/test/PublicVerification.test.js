const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("PublicVerification", function () {
    let testHelpers;
    let publicVerification;
    let productRegistry;
    let stakeholderRegistry;
    let shipmentRegistry;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, consumer, auditor, unauthorized;
    let productId, shipmentId, trackingNumber;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer, auditor, unauthorized } = accounts);

        // Deploy dependencies
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );
        shipmentRegistry = await testHelpers.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );

        // Deploy PublicVerification
        publicVerification = await testHelpers.deployPublicVerification(
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress(),
            await shipmentRegistry.getAddress()
        );

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);

        // Create test data
        const productData = await testHelpers.createSampleProduct(productRegistry, farmer);
        productId = productData.productId;
        
        // Update product to processing stage first
        await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed and ready for shipment");
        
        // Create shipment and get tracking number
        const shipmentData = await testHelpers.createSampleShipmentWithTracking(shipmentRegistry, distributor, productId, retailer.address);
        shipmentId = shipmentData.shipmentId;
        trackingNumber = shipmentData.trackingNumber;
    });

    describe("Deployment", function () {
        it("Should set correct contract addresses", async function () {
            expect(await publicVerification.productRegistry()).to.equal(await productRegistry.getAddress());
            expect(await publicVerification.stakeholderRegistry()).to.equal(await stakeholderRegistry.getAddress());
            expect(await publicVerification.shipmentRegistry()).to.equal(await shipmentRegistry.getAddress());
        });
    });

    describe("Product Authenticity Verification", function () {
        it("Should verify authentic product at farm stage", async function () {
            const tx = await publicVerification.verifyProductAuthenticity(productId);
            
            await expect(tx)
                .to.emit(publicVerification, "ProductVerificationRequested")
                .withArgs(productId, deployer.address, await getBlockTimestamp(tx));

            await expect(tx)
                .to.emit(publicVerification, "VerificationResult")
                .withArgs(productId, true, "Product is authentic and all stakeholders verified", await getBlockTimestamp(tx));

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'VerificationResult';
                } catch {
                    return false;
                }
            });
            
            const parsedEvent = publicVerification.interface.parseLog(event);
            expect(parsedEvent.args.isAuthentic).to.be.true;
            expect(parsedEvent.args.details).to.include("authentic");
        });

        it("Should verify product with all stages completed", async function () {
            // Product is already at PROCESSING stage (1) from setup, so continue from DISTRIBUTION
            await testHelpers.updateProductStage(productRegistry, distributor, productId, 2, "Distributed");
            await testHelpers.updateProductStage(productRegistry, retailer, productId, 3, "At retail");

            const tx = await publicVerification.verifyProductAuthenticity(productId);
            
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult")
                .withArgs(productId, true, "Product is authentic and all stakeholders verified", await getBlockTimestamp(tx));
        });

        it("Should detect invalid farmer registration", async function () {
            // Create product with authorized farmer first
            const testProductData = await testHelpers.createSampleProduct(productRegistry, farmer);
            const testProductId = testProductData.productId;
            
            // Now deactivate the farmer to simulate invalid registration
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            const tx = await publicVerification.verifyProductAuthenticity(testProductId);
            
            const receipt = await tx.wait();
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult");
            
            // Check the event details separately
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'VerificationResult';
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = publicVerification.interface.parseLog(event);
                expect(parsedEvent.args.productId).to.equal(testProductId);
                expect(parsedEvent.args.isAuthentic).to.be.false;
                expect(parsedEvent.args.details).to.include("Farmer registration invalid");
            }
        });

        it("Should handle non-existent product", async function () {
            const tx = await publicVerification.verifyProductAuthenticity(999);
            
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult")
                .withArgs(999, false, "Product not found or verification failed", await getBlockTimestamp(tx));
        });

        it("Should detect invalid processor registration", async function () {
            // Product is already at PROCESSING stage from setup, deactivate the processor
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(processor.address);

            const tx = await publicVerification.verifyProductAuthenticity(productId);
            
            const receipt = await tx.wait();
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult");
            
            // Check the event details separately
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'VerificationResult';
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = publicVerification.interface.parseLog(event);
                expect(parsedEvent.args.productId).to.equal(productId);
                expect(parsedEvent.args.isAuthentic).to.be.false;
                expect(parsedEvent.args.details).to.include("Processor registration invalid");
            }
        });

        it("Should detect invalid distributor registration", async function () {
            // Move product to distribution stage, then deactivate distributor
            await testHelpers.updateProductStage(productRegistry, distributor, productId, 2, "Distributed");
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(distributor.address);

            const tx = await publicVerification.verifyProductAuthenticity(productId);
            
            const receipt = await tx.wait();
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult");
            
            // Check the event details separately
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'VerificationResult';
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = publicVerification.interface.parseLog(event);
                expect(parsedEvent.args.productId).to.equal(productId);
                expect(parsedEvent.args.isAuthentic).to.be.false;
                expect(parsedEvent.args.details).to.include("Distributor registration invalid");
            }
        });

        it("Should detect invalid retailer registration", async function () {
            // Move product through stages to retail, then deactivate retailer
            await testHelpers.updateProductStage(productRegistry, distributor, productId, 2, "Distributed");
            await testHelpers.updateProductStage(productRegistry, retailer, productId, 3, "At retail");
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(retailer.address);

            const tx = await publicVerification.verifyProductAuthenticity(productId);
            
            const receipt = await tx.wait();
            await expect(tx)
                .to.emit(publicVerification, "VerificationResult");
            
            // Check the event details separately
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'VerificationResult';
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = publicVerification.interface.parseLog(event);
                expect(parsedEvent.args.productId).to.equal(productId);
                expect(parsedEvent.args.isAuthentic).to.be.false;
                expect(parsedEvent.args.details).to.include("Retailer registration invalid");
            }
        });
    });

    describe("Complete Supply Chain Verification", function () {
        it("Should verify complete supply chain with valid shipment", async function () {
            const [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(productId);
            
            expect(isValid).to.be.true;
            // Should include either shipment verification or no shipment message
            expect(details).to.satisfy((msg) => 
                msg.includes("verified successfully") || 
                msg.includes("no shipment data available")
            );
        });

        it("Should handle product with cancelled shipment", async function () {
            // Cancel the shipment
            await shipmentRegistry.connect(distributor).updateShipmentStatus(
                shipmentId,
                4, // CANCELLED
                "Shipment cancelled",
                "Cancelled location"
            );

            const tx = await publicVerification.verifyCompleteSupplyChain(productId);
            
            await expect(tx)
                .to.emit(publicVerification, "ShipmentVerificationPerformed")
                .withArgs(shipmentId, productId, false, await getBlockTimestamp(tx));

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    const parsed = publicVerification.interface.parseLog(log);
                    return parsed && parsed.name === 'ShipmentVerificationPerformed';
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsedEvent = publicVerification.interface.parseLog(event);
                expect(parsedEvent.args.isValid).to.be.false;
            }
        });

        it("Should handle product without shipment", async function () {
            const newProductData = await testHelpers.createSampleProduct(productRegistry, farmer);
            const newProductId = newProductData.productId;
            
            const [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(newProductId);
            
            expect(isValid).to.be.true;
            expect(details).to.include("no shipment data available");
        });

        it("Should fail verification for invalid product", async function () {
            const [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(999);
            
            expect(isValid).to.be.false;
            expect(details).to.include("not found");
        });
    });

    describe("Traceability Reports", function () {
        it("Should get basic traceability report", async function () {
            const [
                productInfo,
                farmerInfo,
                processorInfo,
                distributorInfo,
                retailerInfo,
                isFullyTraced
            ] = await publicVerification.getTraceabilityReport(productId);

            expect(productInfo.productName).to.equal("Organic Apples");
            expect(farmerInfo.stakeholderAddress).to.equal(farmer.address);
            expect(isFullyTraced).to.be.true; // Should be true at farm stage
        });

        it("Should get complete traceability report with shipment", async function () {
            const [
                productInfo,
                farmerInfo,
                processorInfo,
                distributorInfo,
                retailerInfo,
                isFullyTraced,
                hasShipment,
                shipmentInfo,
                shipmentHistory
            ] = await publicVerification.getCompleteTraceabilityReport(productId);

            expect(productInfo.productName).to.equal("Organic Apples");
            expect(farmerInfo.stakeholderAddress).to.equal(farmer.address);
            expect(hasShipment).to.be.true;
            expect(shipmentInfo.productId).to.equal(productId);
        });

        it("Should get traceability report for product without shipment", async function () {
            const newProductData = await testHelpers.createSampleProduct(productRegistry, farmer);
            const newProductId = newProductData.productId;
            
            const [
                productInfo,
                farmerInfo,
                processorInfo,
                distributorInfo,
                retailerInfo,
                isFullyTraced,
                hasShipment,
                shipmentInfo,
                shipmentHistory
            ] = await publicVerification.getCompleteTraceabilityReport(newProductId);

            expect(productInfo.productName).to.not.equal("");
            expect(hasShipment).to.be.false;
        });

        it("Should track traceability through multiple stages", async function () {
            // Product is already at PROCESSING stage (1) from setup, continue to distribution
            await testHelpers.updateProductStage(productRegistry, distributor, productId, 2, "Distributed");

            const [
                productInfo,
                farmerInfo,
                processorInfo,
                distributorInfo,
                retailerInfo,
                isFullyTraced
            ] = await publicVerification.getTraceabilityReport(productId);

            expect(productInfo.currentStage).to.equal(2); // DISTRIBUTION
            expect(processorInfo.stakeholderAddress).to.equal(processor.address);
            expect(distributorInfo.stakeholderAddress).to.equal(distributor.address);
            expect(isFullyTraced).to.be.true;
        });
    });

    describe("Simple Product Verification", function () {
        it("Should verify valid product", async function () {
            const isValid = await publicVerification.verifyProduct(productId);
            expect(isValid).to.be.true;
        });

        it("Should reject invalid product", async function () {
            const isValid = await publicVerification.verifyProduct(999);
            expect(isValid).to.be.false;
        });

        it("Should reject product with unregistered farmer", async function () {
            // Create product with authorized farmer first
            const testProductData = await testHelpers.createSampleProduct(productRegistry, farmer);
            const testProductId = testProductData.productId;
            
            // Now deactivate the farmer to simulate invalid registration
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            const isValid = await publicVerification.verifyProduct(testProductId);
            expect(isValid).to.be.false;
        });
    });

    describe("Audit Functions", function () {
        it("Should perform audit and emit event", async function () {
            const auditResult = "Product quality verified - Grade A";
            
            const tx = await publicVerification.connect(auditor).performAudit(productId, auditResult);
            
            await expect(tx)
                .to.emit(publicVerification, "AuditPerformed")
                .withArgs(auditor.address, productId, auditResult, await getBlockTimestamp(tx));
        });

        it("Should allow any address to perform audit", async function () {
            const auditResult = "Consumer feedback - excellent quality";
            
            const tx = await publicVerification.connect(consumer).performAudit(productId, auditResult);
            
            await expect(tx)
                .to.emit(publicVerification, "AuditPerformed")
                .withArgs(consumer.address, productId, auditResult, await getBlockTimestamp(tx));
        });
    });

    describe("Transparency Metrics", function () {
        it("Should get transparency metrics", async function () {
            const [
                totalProducts,
                totalStakeholders,
                totalFarmers,
                totalProcessors,
                totalDistributors,
                totalRetailers,
                totalShipments
            ] = await publicVerification.getTransparencyMetrics();

            expect(totalProducts).to.be.greaterThan(0);
            expect(totalStakeholders).to.be.greaterThan(0);
            expect(totalFarmers).to.be.greaterThan(0);
            expect(totalProcessors).to.be.greaterThan(0);
            expect(totalDistributors).to.be.greaterThan(0);
            expect(totalRetailers).to.be.greaterThan(0);
            expect(totalShipments).to.be.greaterThan(0);
        });
    });

    describe("Tracking Functions", function () {
        it("Should track product with shipment by tracking number", async function () {
            const [
                prodId,
                productStage,
                shipmentStatus,
                productName,
                statusDescription,
                isProductValid,
                isShipmentValid
            ] = await publicVerification.trackProductWithShipment(trackingNumber);

            expect(prodId).to.equal(productId);
            expect(productName).to.equal("Organic Apples");
            expect(isProductValid).to.be.true;
            expect(isShipmentValid).to.be.true;
        });

        it("Should handle invalid tracking number", async function () {
            await expect(
                publicVerification.trackProductWithShipment("INVALID")
            ).to.be.revertedWith("Invalid tracking number or shipment not found");
        });

        it("Should detect invalid shipment status", async function () {
            // Update shipment to cancelled status
            await shipmentRegistry.connect(distributor).updateShipmentStatus(
                shipmentId,
                4, // CANCELLED
                "Shipment cancelled",
                "Cancelled location"
            );

            const [
                prodId,
                productStage,
                shipmentStatus,
                productName,
                statusDescription,
                isProductValid,
                isShipmentValid
            ] = await publicVerification.trackProductWithShipment(trackingNumber);

            expect(isProductValid).to.be.true;
            expect(isShipmentValid).to.be.false; // Should be false for cancelled shipment
        });
    });

    describe("System Overview", function () {
        it("Should get system overview", async function () {
            const [
                totalProducts,
                totalShipments,
                totalStakeholders,
                activeProducts,
                shipmentsInTransit,
                systemStatus
            ] = await publicVerification.getSystemOverview();

            expect(totalProducts).to.be.greaterThan(0);
            expect(totalShipments).to.be.greaterThan(0);
            expect(totalStakeholders).to.be.greaterThan(0);
            expect(activeProducts).to.equal(totalProducts);
            expect(systemStatus).to.include("Operational");
        });
    });

    describe("Integration Scenarios", function () {
        it("Should verify complete product lifecycle", async function () {
            // Create new product for lifecycle test
            const newProductData = await testHelpers.createSampleProduct(productRegistry, farmer);
            const newProductId = newProductData.productId;

            // Initial verification
            let [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(newProductId);
            expect(isValid).to.be.true;

            // Move through stages
            await testHelpers.updateProductStage(productRegistry, processor, newProductId, 1, "Processed");
            [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(newProductId);
            expect(isValid).to.be.true;

            await testHelpers.updateProductStage(productRegistry, distributor, newProductId, 2, "Distributed");
            [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(newProductId);
            expect(isValid).to.be.true;

            // Create shipment
            const newShipmentId = await testHelpers.createSampleShipment(
                shipmentRegistry,
                distributor,
                newProductId,
                retailer.address
            );

            [isValid, details] = await publicVerification.verifyCompleteSupplyChain.staticCall(newProductId);
            expect(isValid).to.be.true;
            expect(details).to.include("verified successfully");
        });

        it("Should handle multiple audits on same product", async function () {
            // Multiple audits by different stakeholders
            await publicVerification.connect(auditor).performAudit(productId, "Initial audit - good quality");
            await publicVerification.connect(retailer).performAudit(productId, "Retail inspection - approved");
            await publicVerification.connect(consumer).performAudit(productId, "Consumer feedback - satisfied");

            // Verification should still work
            const isValid = await publicVerification.verifyProduct(productId);
            expect(isValid).to.be.true;
        });

        it("Should provide accurate metrics with multiple products", async function () {
            // Create additional products
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            const productId3 = await testHelpers.createSampleProductSimple(productRegistry, farmer);

            const [
                totalProducts,
                totalStakeholders,
                totalFarmers,
                totalProcessors,
                totalDistributors,
                totalRetailers,
                totalShipments
            ] = await publicVerification.getTransparencyMetrics();

            expect(totalProducts).to.be.greaterThan(2); // At least 3 products created
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle empty tracking for non-existent product", async function () {
            const [
                productInfo,
                farmerInfo,
                processorInfo,
                distributorInfo,
                retailerInfo,
                isFullyTraced
            ] = await publicVerification.getTraceabilityReport(999);

            expect(productInfo.productName).to.equal("");
            expect(isFullyTraced).to.be.false;
        });

        it("Should handle verification of product at different stages", async function () {
            // Test verification at current stage (already at PROCESSING from setup)
            let tx = await publicVerification.verifyProductAuthenticity(productId);
            await expect(tx).to.emit(publicVerification, "VerificationResult");

            // Distribution stage
            await testHelpers.updateProductStage(productRegistry, distributor, productId, 2, "Distributed");
            tx = await publicVerification.verifyProductAuthenticity(productId);
            await expect(tx).to.emit(publicVerification, "VerificationResult");

            // Retail stage
            await testHelpers.updateProductStage(productRegistry, retailer, productId, 3, "At retail");
            tx = await publicVerification.verifyProductAuthenticity(productId);
            await expect(tx).to.emit(publicVerification, "VerificationResult");
        });
    });

    // Helper function to get block timestamp
    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }
}); 