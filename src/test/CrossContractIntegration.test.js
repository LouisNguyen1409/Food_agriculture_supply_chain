const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("Cross-Contract Integration Tests", function () {
    let testHelpers;
    let productRegistry;
    let stakeholderRegistry;
    let shipmentRegistry;
    let accounts;
    let deployer, farmer, processor, distributor, retailer, consumer, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer, unauthorized } = accounts);

        // Deploy all contracts
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );
        shipmentRegistry = await testHelpers.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);
    });

    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }

    describe("Stakeholder Registry Integration", function () {
        it("Should enforce stakeholder validation across all contracts", async function () {
            // Test ProductRegistry enforcement
            await expect(
                productRegistry.connect(unauthorized).registerProduct(
                    "Unauthorized Product",
                    "UNAUTH_BATCH",
                    "Farm data"
                )
            ).to.be.revertedWith("Not registered for this role");

            // Test ShipmentRegistry enforcement
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            await expect(
                shipmentRegistry.connect(unauthorized).createShipment(
                    productId,
                    retailer.address,
                    "UNAUTH_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });

        it("Should allow proper role-based operations across contracts", async function () {
            // Farmer can register product
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            expect(productId).to.be.greaterThan(0);

            // Processor can update product
            await expect(
                productRegistry.connect(processor).updateProcessingStage(
                    productId,
                    "Processed successfully"
                )
            ).to.not.be.reverted;

            // Distributor can create shipment
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "DIST_TRACK",
                    "TRUCK"
                )
            ).to.not.be.reverted;
        });

        it("Should update last activity across contracts", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            const initialInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const initialActivity = initialInfo.lastActivity;

            // Wait and perform operations that should update activity
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await productRegistry.connect(processor).updateProcessingStage(
                productId,
                "Processing updates activity"
            );

            const updatedInfo = await stakeholderRegistry.getStakeholderInfo(processor.address);
            const updatedActivity = updatedInfo.lastActivity;

            expect(updatedActivity).to.be.greaterThan(initialActivity);
        });

        it("Should handle stakeholder deactivation across contracts", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);

            // Deactivate farmer
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Farmer should no longer be able to register products
            await expect(
                productRegistry.connect(farmer).registerProduct(
                    "New Product",
                    "NEW_BATCH",
                    "Farm data"
                )
            ).to.be.revertedWith("Not registered for this role");

            // But existing products should still be manageable by farmer for deactivation
            await expect(
                productRegistry.connect(farmer).deactivateProduct(productId)
            ).to.be.revertedWith("Not registered for this role");
        });
    });

    describe("Product-Shipment Integration", function () {
        let productId;

        beforeEach(async function () {
            productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
        });

        it("Should enforce product stage requirements for shipment creation", async function () {
            // Product at FARM stage should not be shippable
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "FARM_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Product not ready for shipment");

            // Update to PROCESSING stage
            await productRegistry.connect(processor).updateProcessingStage(
                productId,
                "Now ready for shipment"
            );

            // Now shipment should be possible
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "PROC_TRACK",
                    "TRUCK"
                )
            ).to.not.be.reverted;
        });

        it("Should prevent multiple active shipments for same product", async function () {
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            // Create first shipment
            await shipmentRegistry.connect(distributor).createShipment(
                productId,
                retailer.address,
                "TRACK001",
                "TRUCK"
            );

            // Attempt second shipment should fail
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    consumer.address,
                    "TRACK002",
                    "VAN"
                )
            ).to.be.revertedWith("Product already has an active shipment");
        });

        it("Should verify product validity for shipment", async function () {
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            // Deactivate product
            await productRegistry.connect(farmer).deactivateProduct(productId);

            // Should not be able to ship deactivated product
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "DEACT_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Product does not exist");
        });

        it("Should handle shipment-product relationship correctly", async function () {
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            const shipmentId = await testHelpers.createSampleShipment(
                shipmentRegistry,
                distributor,
                productId,
                retailer.address
            );

            // Verify relationship mappings
            const foundShipmentId = await shipmentRegistry.getShipmentByProduct(productId);
            expect(foundShipmentId).to.equal(shipmentId);

            const shipmentInfo = await shipmentRegistry.getShipmentInfo(shipmentId);
            expect(shipmentInfo.productId).to.equal(productId);
        });
    });

    describe("Complete Supply Chain Workflow Integration", function () {
        it("Should handle end-to-end product lifecycle with shipments", async function () {
            // 1. Register product (FARM stage)
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            let productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(0); // FARM

            // 2. Process product (PROCESSING stage)
            await productRegistry.connect(processor).updateProcessingStage(
                productId,
                "Organic processing with quality controls"
            );
            productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(1); // PROCESSING

            // 3. Create shipment for distribution
            const shipmentId = await testHelpers.createSampleShipment(
                shipmentRegistry,
                distributor,
                productId,
                retailer.address
            );

            // 4. Update product to distribution stage
            await productRegistry.connect(distributor).updateDistributionStage(
                productId,
                "Distributed through cold chain network"
            );
            productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(2); // DISTRIBUTION

            // 5. Ship the product
            await shipmentRegistry.connect(distributor).updateShipmentStatus(
                shipmentId,
                2, // SHIPPED
                "En route to retail location",
                "Distribution Center"
            );

            // 6. Deliver product and update to retail stage
            await shipmentRegistry.connect(retailer).updateShipmentStatus(
                shipmentId,
                3, // DELIVERED
                "Received at retail store",
                "Store Inventory"
            );

            await productRegistry.connect(retailer).updateRetailStage(
                productId,
                "Available for purchase in produce section"
            );
            productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(3); // RETAIL

            // 7. Verify shipment delivery
            await shipmentRegistry.connect(retailer).updateShipmentStatus(
                shipmentId,
                6, // VERIFIED
                "Delivery confirmed and inventory updated",
                "Store System"
            );

            // 8. Consumer purchase
            await productRegistry.connect(consumer).markAsConsumed(productId);
            productInfo = await productRegistry.getProductInfo(productId);
            expect(productInfo.currentStage).to.equal(4); // CONSUMED

            // 9. Verify complete traceability
            const [isValid, verifiedProductInfo] = await productRegistry.verifyProduct(productId);
            expect(isValid).to.be.true;
            expect(verifiedProductInfo.currentStage).to.equal(4);

            const shipmentInfo = await shipmentRegistry.getShipmentInfo(shipmentId);
            expect(shipmentInfo.status).to.equal(6); // VERIFIED
        });

        it("Should handle multiple products with different shipment patterns", async function () {
            // Create multiple products
            const productId1 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product1", "BATCH001");
            const productId2 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product2", "BATCH002");
            const productId3 = await testHelpers.createSampleProductSimple(productRegistry, farmer, "Product3", "BATCH003");

            // Process all products
            await productRegistry.connect(processor).updateProcessingStage(productId1, "Processed1");
            await productRegistry.connect(processor).updateProcessingStage(productId2, "Processed2");
            await productRegistry.connect(processor).updateProcessingStage(productId3, "Processed3");

            // Create shipments for first two products
            const shipmentId1 = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId1, retailer.address);
            const shipmentId2 = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId2, consumer.address);

            // Third product goes to distribution without shipment initially
            await productRegistry.connect(distributor).updateDistributionStage(productId3, "Distributed");

            // Verify shipment-product mappings
            expect(await shipmentRegistry.getShipmentByProduct(productId1)).to.equal(shipmentId1);
            expect(await shipmentRegistry.getShipmentByProduct(productId2)).to.equal(shipmentId2);
            expect(await shipmentRegistry.getShipmentByProduct(productId3)).to.equal(0); // No shipment yet

            // Update shipment statuses differently
            await shipmentRegistry.connect(distributor).updateShipmentStatus(shipmentId1, 2, "Shipped", "Transit");
            await shipmentRegistry.connect(distributor).cancelShipment(shipmentId2, "Customer cancellation");

            // Create late shipment for third product
            const shipmentId3 = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId3, retailer.address);

            // Verify final states
            const shipment1Info = await shipmentRegistry.getShipmentInfo(shipmentId1);
            const shipment2Info = await shipmentRegistry.getShipmentInfo(shipmentId2);
            const shipment3Info = await shipmentRegistry.getShipmentInfo(shipmentId3);

            expect(shipment1Info.status).to.equal(2); // SHIPPED
            expect(shipment2Info.status).to.equal(4); // CANCELLED
            expect(shipment3Info.status).to.equal(1); // PREPARING
        });
    });

    describe("Data Consistency and Validation", function () {
        it("Should maintain data consistency across contract interactions", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            const shipmentId = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId, retailer.address);

            // Verify consistent stakeholder information
            const farmerInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const distributorInfo = await stakeholderRegistry.getStakeholderInfo(distributor.address);
            const retailerInfo = await stakeholderRegistry.getStakeholderInfo(retailer.address);

            expect(farmerInfo.role).to.equal(0); // FARMER
            expect(distributorInfo.role).to.equal(3); // DISTRIBUTOR
            expect(retailerInfo.role).to.equal(2); // RETAILER

            // Verify product data consistency
            const productInfo = await productRegistry.getProductInfo(productId);
            const [isValid, verifiedProductInfo] = await productRegistry.verifyProduct(productId);

            expect(isValid).to.be.true;
            expect(productInfo.farmer).to.equal(farmer.address);
            expect(verifiedProductInfo.farmer).to.equal(farmer.address);

            // Verify shipment data consistency
            const shipmentInfo = await shipmentRegistry.getShipmentInfo(shipmentId);
            const [productIds, sender, receiver] = await shipmentRegistry.getShipment(shipmentId);

            expect(shipmentInfo.productId).to.equal(productId);
            expect(productIds[0]).to.equal(productId);
            expect(sender).to.equal(distributor.address);
            expect(receiver).to.equal(retailer.address);
        });

        it("Should handle contract interaction edge cases", async function () {
            // Test with non-existent product
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    999, // non-existent product
                    retailer.address,
                    "NONEXIST_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Product does not exist");

            // Test stakeholder validation edge cases
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            // Processor trying to register product (wrong role)
            await expect(
                productRegistry.connect(processor).registerProduct(
                    "Wrong Role Product",
                    "WRONG_BATCH",
                    "Farm data"
                )
            ).to.be.revertedWith("Not registered for this role");

            // Farmer trying to create shipment (wrong role)
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");
            await expect(
                shipmentRegistry.connect(farmer).createShipment(
                    productId,
                    retailer.address,
                    "WRONG_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });
    });

    describe("Performance and Scalability Integration", function () {
        it("Should handle multiple stakeholders and products efficiently", async function () {
            // Register additional stakeholders
            const extraStakeholders = [accounts.auditor];
            for (let i = 0; i < extraStakeholders.length; i++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    extraStakeholders[i].address,
                    0, // FARMER role
                    `Extra Farm ${i}`,
                    `EXTRA_LICENSE_${i}`,
                    `Extra Location ${i}`,
                    `Extra Cert ${i}`
                );
            }

            // Create multiple products
            const numProducts = 3;
            const productIds = [];
            
            for (let i = 0; i < numProducts; i++) {
                const stakeholder = i < extraStakeholders.length ? extraStakeholders[i] : farmer;
                const productId = await testHelpers.createSampleProductSimple(
                    productRegistry,
                    stakeholder,
                    `ScaleProduct${i}`,
                    `SCALE_BATCH_${i.toString().padStart(3, '0')}`
                );
                productIds.push(productId);
            }

            // Process all products
            for (const productId of productIds) {
                await productRegistry.connect(processor).updateProcessingStage(
                    productId,
                    `Batch processing for product ${productId}`
                );
            }

            // Create shipments for all products
            const shipmentIds = [];
            for (const productId of productIds) {
                const shipmentId = await testHelpers.createSampleShipment(
                    shipmentRegistry,
                    distributor,
                    productId,
                    retailer.address
                );
                shipmentIds.push(shipmentId);
            }

            // Verify all were created successfully
            expect(productIds).to.have.length(numProducts);
            expect(shipmentIds).to.have.length(numProducts);

            // Verify stakeholder product associations
            const farmerProducts = await productRegistry.getStakeholderProducts(farmer.address);
            expect(farmerProducts.length).to.be.greaterThan(0);

            // Verify shipment statistics
            const [totalShipments] = await shipmentRegistry.getShipmentStats();
            expect(totalShipments).to.equal(numProducts);
        });

        it("Should maintain performance with complex state transitions", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            
            // Rapid state transitions
            await productRegistry.connect(processor).updateProcessingStage(productId, "Quick process");
            await productRegistry.connect(distributor).updateDistributionStage(productId, "Quick distribution");
            await productRegistry.connect(retailer).updateRetailStage(productId, "Quick retail");

            const shipmentId = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId, retailer.address);

            // Rapid shipment transitions
            await shipmentRegistry.connect(distributor).updateShipmentStatus(shipmentId, 2, "Quick ship", "Transit");
            await shipmentRegistry.connect(retailer).updateShipmentStatus(shipmentId, 3, "Quick deliver", "Store");
            await shipmentRegistry.connect(retailer).updateShipmentStatus(shipmentId, 6, "Quick verify", "Inventory");

            // Final consumption
            await productRegistry.connect(consumer).markAsConsumed(productId);

            // Verify final states are correct
            const productInfo = await productRegistry.getProductInfo(productId);
            const shipmentInfo = await shipmentRegistry.getShipmentInfo(shipmentId);

            expect(productInfo.currentStage).to.equal(4); // CONSUMED
            expect(shipmentInfo.status).to.equal(6); // VERIFIED

            // Verify traceability is maintained
            const [isValid] = await productRegistry.verifyProduct(productId);
            expect(isValid).to.be.true;

            const history = await shipmentRegistry.getShipmentHistory(shipmentId);
            expect(history.length).to.equal(4); // Create + 3 updates
        });
    });

    describe("Error Handling and Recovery", function () {
        it("Should handle contract interaction failures gracefully", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);

            // Try operations in wrong order
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "PREMATURE_TRACK",
                    "TRUCK"
                )
            ).to.be.revertedWith("Product not ready for shipment");

            // Fix the order
            await productRegistry.connect(processor).updateProcessingStage(productId, "Now ready");
            
            // Should work now
            await expect(
                shipmentRegistry.connect(distributor).createShipment(
                    productId,
                    retailer.address,
                    "CORRECT_TRACK",
                    "TRUCK"
                )
            ).to.not.be.reverted;
        });

        it("Should handle stakeholder state changes during operations", async function () {
            const productId = await testHelpers.createSampleProductSimple(productRegistry, farmer);
            await testHelpers.updateProductStage(productRegistry, processor, productId, 1, "Processed");

            const shipmentId = await testHelpers.createSampleShipment(shipmentRegistry, distributor, productId, retailer.address);

            // Deactivate distributor mid-process
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(distributor.address);

            // Distributor should not be able to update shipment anymore
            await expect(
                shipmentRegistry.connect(distributor).updateShipmentStatus(
                    shipmentId,
                    2,
                    "Trying to update after deactivation",
                    "Location"
                )
            ).to.be.revertedWith("Stakeholder is not active");

            // But receiver should still be able to update through valid transitions
            // Retailer (as receiver) can still update the shipment even though sender is deactivated
            await expect(
                shipmentRegistry.connect(retailer).updateShipmentStatus(
                    shipmentId,
                    2, // SHIPPED
                    "Retailer updating shipment status",
                    "Store"
                )
            ).to.not.be.reverted;

            // Verify the status was updated
            const shipmentInfo = await shipmentRegistry.getShipmentInfo(shipmentId);
            expect(shipmentInfo.status).to.equal(2); // SHIPPED
        });
    });
}); 