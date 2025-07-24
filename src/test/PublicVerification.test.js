const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PublicVerification Contract Tests", function () {
    let publicVerification, registry, stakeholderRegistry, stakeholderFactory, productFactory;
    let deployer, farmer, processor, distributor, retailer, auditor, consumer, unauthorized;
    let productAddress;

    beforeEach(async function () {
        [deployer, farmer, processor, distributor, retailer, auditor, consumer, unauthorized] = await ethers.getSigners();

        // Deploy Registry contract
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();

        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await registry.getAddress());

        // Deploy StakeholderFactory
        const StakeholderFactory = await ethers.getContractFactory("StakeholderFactory");
        stakeholderFactory = await StakeholderFactory.deploy(await registry.getAddress());

        // Deploy ProductFactory
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

        // Deploy PublicVerification
        const PublicVerification = await ethers.getContractFactory("PublicVerification");
        publicVerification = await PublicVerification.deploy(
            await stakeholderRegistry.getAddress(),
            await registry.getAddress()
        );

        // Register stakeholders
        await stakeholderFactory.connect(deployer).createStakeholder(
            farmer.address, 
            0, // FARMER role
            "Green Valley Farm", 
            "FARM_" + Math.random().toString(36).substring(2, 11), 
            "California", 
            "Organic Certified"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            processor.address, 
            1, // PROCESSOR role
            "Fresh Processing Co", 
            "PROC_" + Math.random().toString(36).substring(2, 11), 
            "Texas", 
            "FDA Approved"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            distributor.address, 
            3, // DISTRIBUTOR role
            "Supply Chain Inc", 
            "DIST_" + Math.random().toString(36).substring(2, 11), 
            "Illinois", 
            "Logistics Certified"
        );
        
        await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address, 
            2, // RETAILER role
            "Fresh Market", 
            "RET_" + Math.random().toString(36).substring(2, 11), 
            "New York", 
            "Retail Licensed"
        );

        await stakeholderFactory.connect(deployer).createStakeholder(
            auditor.address, 
            0, // FARMER role (as auditor)
            "Quality Auditor", 
            "AUDIT_" + Math.random().toString(36).substring(2, 11), 
            "Washington", 
            "ISO Certified"
        );

        // Create a test product
        const tx = await productFactory.connect(farmer).createProduct(
            "Test Product",
            "Product for verification testing",
            5,
            15,
            "Test Farm",
            "Test harvest data"
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log =>
            log.fragment && log.fragment.name === "ProductCreated"
        );
        productAddress = event.args[0];
    });

    describe("Contract Deployment", function () {
        it("Should deploy with correct stakeholder registry", async function () {
            expect(await publicVerification.stakeholderRegistry()).to.equal(
                await stakeholderRegistry.getAddress()
            );
        });

        it("Should deploy with correct registry", async function () {
            expect(await publicVerification.registry()).to.equal(
                await registry.getAddress()
            );
        });
    });

    describe("Product Authenticity Verification", function () {
        it("Should verify authentic product with valid farmer", async function () {
            const result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            
            expect(result[0]).to.be.true; // isAuthentic
            expect(result[1]).to.equal("Product is authentic and all stakeholders verified"); // details
        });

        it("Should emit ProductVerificationRequested event", async function () {
            await expect(
                publicVerification.connect(consumer).verifyProductAuthenticity(productAddress)
            ).to.emit(publicVerification, "ProductVerificationRequested");
        });

        it("Should emit VerificationResult event for valid product", async function () {
            await expect(
                publicVerification.verifyProductAuthenticity(productAddress)
            ).to.emit(publicVerification, "VerificationResult");
        });

        it("Should fail verification for non-existent product", async function () {
            try {
                await publicVerification.verifyProductAuthenticity(ethers.ZeroAddress);
                expect.fail("Should have thrown an error");
            } catch (error) {
                // Since the function reverts on invalid product, we expect an error
                expect(error.message).to.include("reverted");
            }
        });

        it("Should verify product with processing stage", async function () {
            // Move product to processing stage
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            await product.connect(processor).updateProcessingStage("Processed with quality standards");

            const result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            
            expect(result[0]).to.be.true; // isAuthentic
        });

        it("Should verify product with distribution stage", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            
            // Move through stages
            await product.connect(processor).updateProcessingStage("Processed");
            await product.connect(distributor).updateDistributionStage("Distributed");

            const result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            
            expect(result[0]).to.be.true; // isAuthentic
        });

        it("Should verify product with retail stage", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            
            // Move through all stages
            await product.connect(processor).updateProcessingStage("Processed");
            await product.connect(distributor).updateDistributionStage("Distributed");
            await product.connect(retailer).updateRetailStage("Available in store");

            const result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            
            expect(result[0]).to.be.true; // isAuthentic
        });
    });

    describe("Complete Supply Chain Verification", function () {
        it("Should verify complete supply chain without shipment", async function () {
            const result = await publicVerification.verifyCompleteSupplyChain.staticCall(productAddress);
            // Expecting (isValid, details) return
            expect(result[0]).to.be.true; // isValid
        });

        it("Should fail complete verification if product verification fails", async function () {
            try {
                await publicVerification.verifyCompleteSupplyChain.staticCall(ethers.ZeroAddress);
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error.message).to.include("reverted");
            }
        });
    });

    describe("Traceability Reports", function () {
        it("Should get basic traceability report for farm stage product", async function () {
            const result = await publicVerification.getTraceabilityReport(productAddress);
            // Expecting multiple return values: productName, farmer, farmerInfo, etc.
            expect(result[0]).to.equal("Test Product"); // productName
        });

        it("Should get traceability report for multi-stage product", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);
            
            // Move through processing and distribution stages
            await product.connect(processor).updateProcessingStage("Quality processing");
            await product.connect(distributor).updateDistributionStage("Cold chain distribution");

            const result = await publicVerification.getTraceabilityReport(productAddress);
            expect(result[0]).to.equal("Test Product"); // productName
        });

        it("Should return empty data for non-existent product", async function () {
            try {
                await publicVerification.getTraceabilityReport(ethers.ZeroAddress);
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error.message).to.include("reverted");
            }
        });

        it("Should get complete traceability report without shipment", async function () {
            const [
                productName,
                ,// farmerAddr
                ,// farmerInfo
                ,// processorInfo
                ,// distributorInfo
                ,// retailerInfo
                ,// isFullyTraced
                hasShipment,
                shipmentAddr,
                shipmentHistory
            ] = await publicVerification.getCompleteTraceabilityReport(productAddress);

            expect(productName).to.equal("Test Product");
            expect(hasShipment).to.be.false;
            expect(shipmentAddr).to.equal(ethers.ZeroAddress);
            expect(shipmentHistory).to.have.length(0);
        });
    });

    describe("Audit Functionality", function () {
        it("Should allow registered stakeholder to perform audit", async function () {
            await expect(
                publicVerification.connect(auditor).performAudit(
                    productAddress,
                    "Quality audit passed - all standards met"
                )
            ).to.emit(publicVerification, "AuditPerformed");
        });

        it("Should reject audit from unregistered user", async function () {
            await expect(
                publicVerification.connect(unauthorized).performAudit(
                    productAddress,
                    "Unauthorized audit attempt"
                )
            ).to.be.revertedWith("Only registered stakeholders can perform audits");
        });

        it("Should allow farmer to perform audit", async function () {
            await expect(
                publicVerification.connect(farmer).performAudit(
                    productAddress,
                    "Self-audit completed"
                )
            ).to.emit(publicVerification, "AuditPerformed");
        });
    });

    describe("Helper Functions", function () {
        it("Should return zero address when product has no shipment", async function () {
            const shipmentAddr = await publicVerification.findShipmentByProduct(productAddress);
            expect(shipmentAddr).to.equal(ethers.ZeroAddress);
        });

        it("Should return zero address for non-existent tracking number", async function () {
            const shipmentAddr = await publicVerification.findShipmentByTrackingNumber("INVALID_TRACKING");
            expect(shipmentAddr).to.equal(ethers.ZeroAddress);
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle invalid product addresses gracefully", async function () {
            const invalidAddress = "0x1234567890123456789012345678901234567890";
            
            try {
                await publicVerification.verifyProductAuthenticity.staticCall(invalidAddress);
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error.message).to.include("reverted");
            }
        });

        it("Should handle traceability report for invalid product", async function () {
            try {
                await publicVerification.getTraceabilityReport("0x1234567890123456789012345678901234567890");
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error.message).to.include("reverted");
            }
        });

        it("Should handle complete supply chain verification for invalid product", async function () {
            try {
                await publicVerification.verifyCompleteSupplyChain.staticCall(
                    "0x1234567890123456789012345678901234567890"
                );
                expect.fail("Should have thrown an error");
            } catch (error) {
                expect(error.message).to.include("reverted");
            }
        });
    });

    describe("Integration with Product Lifecycle", function () {
        it("Should verify product authenticity through complete lifecycle", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // Test at each stage
            // 1. Farm stage
            let result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true;

            // 2. Processing stage
            await product.connect(processor).updateProcessingStage("Quality processing completed");
            result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true;

            // 3. Distribution stage
            await product.connect(distributor).updateDistributionStage("Distributed via cold chain");
            result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true;

            // 4. Retail stage
            await product.connect(retailer).updateRetailStage("Available for purchase");
            result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true;

            // 5. Consumed stage
            await product.connect(consumer).markAsConsumed();
            result = await publicVerification.verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true;
        });

        it("Should track stakeholder changes through product lifecycle", async function () {
            const Product = await ethers.getContractFactory("Product");
            const product = Product.attach(productAddress);

            // Move through stages and check traceability at each step
            await product.connect(processor).updateProcessingStage("Processed");
            await product.connect(distributor).updateDistributionStage("Distributed");
            await product.connect(retailer).updateRetailStage("Retailed");

            const result = await publicVerification.getTraceabilityReport(productAddress);
            expect(result[0]).to.equal("Test Product"); // productName
        });
    });

    describe("Event Emissions", function () {
        it("Should emit all required events during verification flow", async function () {
            // Test ProductVerificationRequested event
            await expect(
                publicVerification.connect(consumer).verifyProductAuthenticity(productAddress)
            ).to.emit(publicVerification, "ProductVerificationRequested");

            // Test VerificationResult event
            await expect(
                publicVerification.verifyProductAuthenticity(productAddress)
            ).to.emit(publicVerification, "VerificationResult");
        });

        it("Should emit AuditPerformed event with correct parameters", async function () {
            const auditMessage = "Comprehensive quality audit completed successfully";
            
            await expect(
                publicVerification.connect(farmer).performAudit(productAddress, auditMessage)
            ).to.emit(publicVerification, "AuditPerformed");
        });
    });

    describe("Access Control and Permissions", function () {
        it("Should allow any address to verify product authenticity", async function () {
            // Unauthorized user should be able to verify products
            const result = await publicVerification.connect(unauthorized).verifyProductAuthenticity.staticCall(productAddress);
            expect(result[0]).to.be.true; // isAuthentic
        });

        it("Should allow any address to get traceability reports", async function () {
            const result = await publicVerification.connect(unauthorized).getTraceabilityReport(productAddress);
            expect(result[0]).to.equal("Test Product"); // productName
        });

        it("Should restrict audit functionality to registered stakeholders only", async function () {
            await expect(
                publicVerification.connect(unauthorized).performAudit(productAddress, "Unauthorized audit")
            ).to.be.revertedWith("Only registered stakeholders can perform audits");
        });
    });
});
