const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper to get block timestamp
async function getBlockTimestamp(tx) {
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    return block.timestamp;
}

describe("Cross-Contract Integration Tests (Factory/Registry Architecture)", function () {
    let registry, productFactory, shipmentFactory, stakeholderRegistry, stakeholderManager;
    let accounts;
    let deployer, admin, farmer, processor, distributor, retailer, consumer, auditor, unauthorized;

    beforeEach(async function () {
        accounts = await ethers.getSigners();
        [deployer, admin, farmer, processor, distributor, retailer, consumer, auditor, unauthorized] = accounts;

        // Deploy StakeholderManager
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();

        // Deploy Registry
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy(await stakeholderManager.getAddress());
        await registry.waitForDeployment();

        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await stakeholderManager.getAddress());
        await stakeholderRegistry.waitForDeployment();

        // Deploy ProductFactory (mock oracle feeds as zero address)
        const ProductFactory = await ethers.getContractFactory("ProductFactory");
        productFactory = await ProductFactory.deploy(
            await stakeholderRegistry.getAddress(),
            await registry.getAddress(),
            ethers.ZeroAddress, // temperatureFeed
            ethers.ZeroAddress, // humidityFeed
            ethers.ZeroAddress, // rainfallFeed
            ethers.ZeroAddress, // windSpeedFeed
            ethers.ZeroAddress  // priceFeed
        );
        await productFactory.waitForDeployment();

        // Deploy ShipmentFactory
        const ShipmentFactory = await ethers.getContractFactory("ShipmentFactory");
        shipmentFactory = await ShipmentFactory.deploy(
            await registry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await shipmentFactory.waitForDeployment();

        // Register stakeholders directly using StakeholderManager (admin only)
        await stakeholderManager.connect(deployer).registerStakeholder(
            farmer.address, 1, "Green Farm Co", "FARM-001", "Iowa, USA", "Organic Certified"
        );
        await stakeholderManager.connect(deployer).registerStakeholder(
            processor.address, 2, "Fresh Processing Ltd", "PROC-001", "California, USA", "FDA Approved"
        );
        await stakeholderManager.connect(deployer).registerStakeholder(
            retailer.address, 3, "Super Market Chain", "RETAIL-001", "New York, USA", "Food Safety Certified"
        );
        await stakeholderManager.connect(deployer).registerStakeholder(
            distributor.address, 4, "Quick Distribution", "DIST-001", "Texas, USA", "Cold Chain Certified"
        );
    });

    describe("Stakeholder Registry Integration", function () {
        it("Should enforce stakeholder validation across all contracts", async function () {
            // Unauthorized should not be able to create product
            await expect(
                productFactory.connect(unauthorized).createProduct(
                    "Unauthorized Product", 
                    "Fresh produce", 
                    0, 
                    25, 
                    "Unknown Location", 
                    "Farm data"
                )
            ).to.be.revertedWith("Not registered for this role");
        });

        it("Should allow proper role-based operations across contracts", async function () {
            // Farmer creates product
            const tx = await productFactory.connect(farmer).createProduct(
                "Organic Apples", 
                "Fresh organic apples from the farm", 
                2, 
                8, 
                "Green Farm, Iowa", 
                "Organic certification data"
            );
            const receipt = await tx.wait();
            
            // Extract product address from event
            const productCreatedEvent = receipt.logs.find(log => {
                try { 
                    const parsed = productFactory.interface.parseLog(log);
                    return parsed.name === 'ProductCreated'; 
                } catch { 
                    return false; 
                }
            });
            
            expect(productCreatedEvent).to.not.be.null;
            const productAddress = productFactory.interface.parseLog(productCreatedEvent).args.productAddress;
            expect(productAddress).to.not.equal(ethers.ZeroAddress);

            // Processor can update product to PROCESSING stage
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            
            await expect(
                product.connect(processor).updateProcessingStage("Processed successfully")
            ).to.not.be.reverted;
            
            // Verify the product stage changed
            expect(await product.currentStage()).to.equal(1); // PROCESSING stage
        });

        it("Should verify stakeholder registration works correctly", async function () {
            // Check farmer is registered with correct role
            const isFarmerRegistered = await stakeholderRegistry.isRegisteredStakeholder(
                farmer.address, 
                1 // FARMER role
            );
            expect(isFarmerRegistered).to.be.true;

            // Check unauthorized is not registered
            const isUnauthorizedRegistered = await stakeholderRegistry.isRegisteredStakeholder(
                unauthorized.address, 
                1 // FARMER role
            );
            expect(isUnauthorizedRegistered).to.be.false;
        });
    });

    describe("Product-Shipment Integration", function () {
        let productAddress;
        
        beforeEach(async function () {
            // Farmer creates product
            const tx = await productFactory.connect(farmer).createProduct(
                "Fresh Apples", 
                "Premium quality apples", 
                2, 
                8, 
                "Organic Farm, Iowa", 
                "Harvest date: 2025-07-24"
            );
            const receipt = await tx.wait();
            
            const productCreatedEvent = receipt.logs.find(log => {
                try { 
                    return productFactory.interface.parseLog(log).name === 'ProductCreated'; 
                } catch { 
                    return false; 
                }
            });
            productAddress = productFactory.interface.parseLog(productCreatedEvent).args.productAddress;
            
            // Processor updates product to PROCESSING stage
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            await product.connect(processor).updateProcessingStage("Quality checked and processed");
        });

        it("Should allow distributors to create shipments for processed products", async function () {
            // Distributor creates shipment
            const tx = await shipmentFactory.connect(distributor).createShipment(
                productAddress, 
                retailer.address, 
                "TRACK001", 
                "REFRIGERATED_TRUCK"
            );
            
            const receipt = await tx.wait();
            const shipmentCreatedEvent = receipt.logs.find(log => {
                try { 
                    return shipmentFactory.interface.parseLog(log).name === 'ShipmentCreated'; 
                } catch { 
                    return false; 
                }
            });
            
            expect(shipmentCreatedEvent).to.not.be.null;
            const shipmentAddress = shipmentFactory.interface.parseLog(shipmentCreatedEvent).args.shipmentAddress;
            expect(shipmentAddress).to.not.equal(ethers.ZeroAddress);
        });

        it("Should prevent non-distributors from creating shipments", async function () {
            // Farmer tries to create shipment (should fail)
            await expect(
                shipmentFactory.connect(farmer).createShipment(
                    productAddress, 
                    retailer.address, 
                    "TRACK002", 
                    "TRUCK"
                )
            ).to.be.revertedWith("Not registered as distributor");

            // Processor tries to create shipment (should fail)
            await expect(
                shipmentFactory.connect(processor).createShipment(
                    productAddress, 
                    retailer.address, 
                    "TRACK003", 
                    "VAN"
                )
            ).to.be.revertedWith("Not registered as distributor");
        });
    });

    describe("Complete Supply Chain Workflow Integration", function () {
        it("Should handle end-to-end product lifecycle with shipments", async function () {
            // 1. Farmer creates product
            const productTx = await productFactory.connect(farmer).createProduct(
                "Premium Organic Apples", 
                "Grade A organic apples", 
                2, 
                8, 
                "Sustainable Farm, Iowa", 
                "Certified organic, pesticide-free"
            );
            const productReceipt = await productTx.wait();
            
            const productCreatedEvent = productReceipt.logs.find(log => {
                try { 
                    return productFactory.interface.parseLog(log).name === 'ProductCreated'; 
                } catch { 
                    return false; 
                }
            });
            const productAddress = productFactory.interface.parseLog(productCreatedEvent).args.productAddress;
            
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // Verify initial stage is FARM
            expect(await product.currentStage()).to.equal(0); // FARM stage

            // 2. Processor updates to PROCESSING stage
            await product.connect(processor).updateProcessingStage("Washed, sorted, and packaged");
            expect(await product.currentStage()).to.equal(1); // PROCESSING stage

            // 3. Distributor creates shipment
            const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
                productAddress, 
                retailer.address, 
                "TRACK_E2E_001", 
                "REFRIGERATED_TRUCK"
            );
            const shipmentReceipt = await shipmentTx.wait();
            
            const shipmentCreatedEvent = shipmentReceipt.logs.find(log => {
                try { 
                    return shipmentFactory.interface.parseLog(log).name === 'ShipmentCreated'; 
                } catch { 
                    return false; 
                }
            });
            const shipmentAddress = shipmentFactory.interface.parseLog(shipmentCreatedEvent).args.shipmentAddress;
            
            const Shipment = await ethers.getContractFactory("Shipment");
            const shipment = Shipment.attach(shipmentAddress);

            // Verify initial shipment status
            expect(await shipment.status()).to.equal(1); // PREPARING

            // 4. Distributor updates product to DISTRIBUTION stage
            await product.connect(distributor).updateDistributionStage("In transit to retail store");
            expect(await product.currentStage()).to.equal(2); // DISTRIBUTION stage

            // 5. Distributor updates shipment to SHIPPED
            await shipment.connect(distributor).updateStatus(2, "En route to destination", "Distribution Center");
            expect(await shipment.status()).to.equal(2); // SHIPPED

            // 6. Retailer updates shipment to DELIVERED
            await shipment.connect(retailer).updateStatus(3, "Received at store", "Retail Store Dock");
            expect(await shipment.status()).to.equal(3); // DELIVERED

            // 7. Retailer verifies delivery
            await shipment.connect(retailer).verifyDelivery();
            expect(await shipment.status()).to.equal(6); // VERIFIED

            // 8. Retailer updates product to RETAIL stage
            await product.connect(retailer).updateRetailStage("Available for sale in produce section");
            expect(await product.currentStage()).to.equal(3); // RETAIL stage

            // 9. Consumer marks product as consumed
            await product.connect(consumer).markAsConsumed();
            expect(await product.currentStage()).to.equal(4); // CONSUMED stage

            // 10. Verify complete traceability
            const isValid = await product.verifyProduct();
            expect(isValid).to.be.true;
        });

        it("Should maintain data integrity across contract interactions", async function () {
            // Create product and shipment
            const productTx = await productFactory.connect(farmer).createProduct(
                "Test Apples", 
                "Test description", 
                0, 
                10, 
                "Test Farm", 
                "Test data"
            );
            const productReceipt = await productTx.wait();
            const productAddress = productFactory.interface.parseLog(
                productReceipt.logs.find(log => {
                    try { return productFactory.interface.parseLog(log).name === 'ProductCreated'; } catch { return false; }
                })
            ).args.productAddress;

            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            await product.connect(processor).updateProcessingStage("Processed");

            const shipmentTx = await shipmentFactory.connect(distributor).createShipment(
                productAddress, 
                retailer.address, 
                "DATA_INTEGRITY_001", 
                "TRUCK"
            );
            const shipmentReceipt = await shipmentTx.wait();
            const shipmentAddress = shipmentFactory.interface.parseLog(
                shipmentReceipt.logs.find(log => {
                    try { return shipmentFactory.interface.parseLog(log).name === 'ShipmentCreated'; } catch { return false; }
                })
            ).args.shipmentAddress;

            // Verify data consistency
            const Shipment = await ethers.getContractFactory("Shipment");
            const shipment = Shipment.attach(shipmentAddress);
            
            expect(await shipment.productAddress()).to.equal(productAddress);
            expect(await shipment.sender()).to.equal(distributor.address);
            expect(await shipment.receiver()).to.equal(retailer.address);
            expect(await shipment.trackingNumber()).to.equal("DATA_INTEGRITY_001");
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle invalid operations gracefully", async function () {
            // Try to create shipment with invalid addresses
            await expect(
                shipmentFactory.connect(distributor).createShipment(
                    ethers.ZeroAddress, // invalid product
                    retailer.address, 
                    "INVALID_001", 
                    "TRUCK"
                )
            ).to.be.reverted; // Should fail due to invalid product

            // Try to create product with invalid parameters
            await expect(
                productFactory.connect(farmer).createProduct(
                    "", // empty name
                    "Description", 
                    0, 
                    10, 
                    "Location", 
                    "Data"
                )
            ).to.be.reverted; // Should fail due to empty name
        });

        it("Should prevent unauthorized access to contract functions", async function () {
            // Unauthorized user tries to use admin functions
            await expect(
                stakeholderManager.connect(unauthorized).registerStakeholder(
                    unauthorized.address, 
                    0, 
                    "Unauthorized Biz", 
                    "UNAUTH-001", 
                    "Unknown", 
                    "None"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });
    });
}); 
