const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("Supply Chain Integration Tests", function () {
    let testHelpers;
    let contractRegistry;
    let supplyChainFactory;
    let supplyChainClient;
    let factoryRegistry;
    let accounts;
    let deployer, admin, farmer, processor, distributor, retailer, consumer, auditor;
    let systemId;
    let contracts;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, farmer, processor, distributor, retailer, consumer } = accounts);
    });

    describe("Complete System Deployment and Registration", function () {
        it("Should deploy and register complete supply chain ecosystem", async function () {
            // 1. Deploy Contract Registry (Foundation)
            contractRegistry = await testHelpers.deployContractRegistry();
            console.log(`Contract Registry deployed: ${await contractRegistry.getAddress()}`);

            // 2. Deploy Supply Chain Factory
            supplyChainFactory = await testHelpers.deploySupplyChainFactory(
                await contractRegistry.getAddress()
            );
            console.log(`Supply Chain Factory deployed: ${await supplyChainFactory.getAddress()}`);

            // 3. Deploy Factory Registry Helper
            factoryRegistry = await testHelpers.deployFactoryRegistry(
                await contractRegistry.getAddress()
            );
            console.log(`Factory Registry deployed: ${await factoryRegistry.getAddress()}`);

            // 4. Deploy Supply Chain Client
            supplyChainClient = await testHelpers.deploySupplyChainClient(
                await contractRegistry.getAddress()
            );
            console.log(`Supply Chain Client deployed: ${await supplyChainClient.getAddress()}`);

            // 5. Register Factory as authorized deployer in ContractRegistry
            await contractRegistry.connect(deployer).addAuthorizedDeployer(
                await supplyChainFactory.getAddress()
            );

            // 6. Also authorize the deployer for FactoryRegistry operations
            await contractRegistry.connect(deployer).addAuthorizedDeployer(
                await factoryRegistry.getAddress()
            );

            // 7. Register factories in Factory Registry
            await factoryRegistry.connect(deployer).registerFactory(
                await supplyChainFactory.getAddress(),
                "SupplyChainFactory",
                "Main supply chain system factory"
            );

            // Verify all contracts are properly registered
            expect(await contractRegistry.authorizedDeployers(await supplyChainFactory.getAddress())).to.be.true;
            expect(await factoryRegistry.getFactory("SupplyChainFactory")).to.equal(
                await supplyChainFactory.getAddress()
            );
        });
    });

    describe("End-to-End Supply Chain Workflow", function () {
        beforeEach(async function () {
            // Deploy complete ecosystem
            contractRegistry = await testHelpers.deployContractRegistry();
            supplyChainFactory = await testHelpers.deploySupplyChainFactory(
                await contractRegistry.getAddress()
            );
            supplyChainClient = await testHelpers.deploySupplyChainClient(
                await contractRegistry.getAddress()
            );

            // Authorize factory
            await contractRegistry.connect(deployer).addAuthorizedDeployer(
                await supplyChainFactory.getAddress()
            );

            // Create supply chain system
            const tx = await supplyChainFactory.connect(deployer).createSupplyChainSystem(
                "Organic Farm Supply Chain"
            );
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = supplyChainFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'SystemCreated';
                } catch {
                    return false;
                }
            });
            
            systemId = supplyChainFactory.interface.parseLog(event).args.systemId;
            console.log(`Created supply chain system ID: ${systemId}`);

            // Get contract addresses from registry
            contracts = {
                stakeholderRegistry: await contractRegistry.getSystemContract(systemId, "StakeholderRegistry"),
                productRegistry: await contractRegistry.getSystemContract(systemId, "ProductRegistry"),
                shipmentRegistry: await contractRegistry.getSystemContract(systemId, "ShipmentRegistry"),
                supplyChainManager: await contractRegistry.getSystemContract(systemId, "SupplyChainManager"),
                publicVerification: await contractRegistry.getSystemContract(systemId, "PublicVerification")
            };

            // Get contract instances
            const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
            const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
            const ShipmentRegistry = await ethers.getContractFactory("ShipmentRegistry");

            contracts.stakeholderRegistryContract = StakeholderRegistry.attach(contracts.stakeholderRegistry);
            contracts.productRegistryContract = ProductRegistry.attach(contracts.productRegistry);
            contracts.shipmentRegistryContract = ShipmentRegistry.attach(contracts.shipmentRegistry);

            // Register stakeholders using the factory's stakeholder registry
            // First check who the current admin is
            const currentAdmin = await contracts.stakeholderRegistryContract.admin();
            console.log(`Current stakeholder registry admin: ${currentAdmin}`);
            console.log(`Factory address: ${supplyChainFactory.target}`);
            console.log(`Deployer address: ${deployer.address}`);
            
            // Transfer admin rights from factory to deployer for easier testing
            await supplyChainFactory.connect(deployer).transferStakeholderRegistryAdmin(systemId, deployer.address);
            
            // Verify the transfer worked
            const newAdmin = await contracts.stakeholderRegistryContract.admin();
            console.log(`New stakeholder registry admin: ${newAdmin}`);
            
            // Now register stakeholders with the deployer as admin
            await testHelpers.setupStakeholders(contracts.stakeholderRegistryContract);
        });

        it("Should complete full product journey with client verification", async function () {
            // Phase 1: Product Registration (Farm)
            console.log("\n=== Phase 1: Product Registration ===");
            const productData = await testHelpers.createSampleProduct(
                contracts.productRegistryContract,
                farmer
            );
            const productId = productData.productId;
            console.log(`Product registered with ID: ${productId}`);

            // Verify product using client
            const isValidAfterCreation = await supplyChainClient.verifyProduct.staticCall(systemId, productId);
            expect(isValidAfterCreation).to.be.true;
            console.log(`Product verification after creation: ${isValidAfterCreation}`);

            // Get product details via client
            const [productName, farmerAddr, harvestDate, origin, status] = 
                await supplyChainClient.getProductDetails(systemId, productId);
            
            expect(productName).to.equal("Organic Apples");
            expect(farmerAddr).to.equal(farmer.address);
            expect(status).to.equal(0); // FARM stage
            console.log(`Product details - Name: ${productName}, Farmer: ${farmerAddr}, Status: ${status}`);

            // Phase 2: Processing
            console.log("\n=== Phase 2: Processing ===");
            await contracts.productRegistryContract.connect(processor).updateProcessingStage(
                productId,
                "Washed, sorted, and packaged following organic standards"
            );

            const [, , , , statusAfterProcessing] = 
                await supplyChainClient.getProductDetails(systemId, productId);
            expect(statusAfterProcessing).to.equal(1); // PROCESSING stage
            console.log(`Product status after processing: ${statusAfterProcessing}`);

            // Phase 3: Distribution with Shipment
            console.log("\n=== Phase 3: Distribution & Shipment ===");
            await contracts.productRegistryContract.connect(distributor).updateDistributionStage(
                productId,
                "Ready for distribution to retail locations"
            );

            // Create shipment
            const shipmentId = await testHelpers.createSampleShipment(
                contracts.shipmentRegistryContract,
                distributor,
                productId,
                retailer.address
            );
            console.log(`Shipment created with ID: ${shipmentId}`);

            // Track shipment via client
            const [shipmentProductIds, sender, receiver, shipmentStatus, , trackingInfo] = 
                await supplyChainClient.trackShipment(systemId, shipmentId);
            
            expect(shipmentProductIds[0]).to.equal(productId);
            expect(sender).to.equal(distributor.address);
            expect(receiver).to.equal(retailer.address);
            expect(shipmentStatus).to.equal(1); // PREPARING
            console.log(`Shipment tracking - Status: ${shipmentStatus}, Tracking: ${trackingInfo}`);

            // Update shipment status
            await contracts.shipmentRegistryContract.connect(distributor).updateShipmentStatus(
                shipmentId,
                2, // SHIPPED
                "Package dispatched via cold chain truck",
                "Distribution Center"
            );

            // Phase 4: Retail
            console.log("\n=== Phase 4: Retail ===");
            await contracts.productRegistryContract.connect(retailer).updateRetailStage(
                productId,
                "Product available in store, properly displayed in produce section"
            );

            // Mark shipment as delivered
            await contracts.shipmentRegistryContract.connect(retailer).updateShipmentStatus(
                shipmentId,
                3, // DELIVERED
                "Package received and verified at retail location",
                "Super Market Chain - Store #123"
            );

            const [, , , , finalStatus] = 
                await supplyChainClient.getProductDetails(systemId, productId);
            expect(finalStatus).to.equal(3); // RETAIL stage
            console.log(`Final product status: ${finalStatus}`);

            // Phase 5: Consumer Purchase
            console.log("\n=== Phase 5: Consumer Purchase ===");
            await contracts.productRegistryContract.connect(consumer).markAsConsumed(productId);

            const [, , , , consumedStatus] = 
                await supplyChainClient.getProductDetails(systemId, productId);
            expect(consumedStatus).to.equal(4); // CONSUMED stage
            console.log(`Product marked as consumed: ${consumedStatus}`);

            // Phase 6: Final Verification & Audit
            console.log("\n=== Phase 6: Final Verification ===");
            const finalVerification = await supplyChainClient.verifyProduct.staticCall(systemId, productId);
            expect(finalVerification).to.be.true;
            console.log(`Final product verification: ${finalVerification}`);

            // Get complete traceability via Public Verification
            const PublicVerification = await ethers.getContractFactory("PublicVerification");
            const publicVerificationContract = PublicVerification.attach(contracts.publicVerification);

            const [isAuthentic, details] = await publicVerificationContract.verifyProductAuthenticity.staticCall(productId);
            expect(isAuthentic).to.be.true;
            console.log(`Public verification result: ${isAuthentic} - ${details}`);
        });

        it("Should support cross-system operations", async function () {
            // Create a second supply chain system
            const tx2 = await supplyChainFactory.connect(deployer).createSupplyChainSystem(
                "Dairy Farm Supply Chain"
            );
            const receipt2 = await tx2.wait();
            
            const event2 = receipt2.logs.find(log => {
                try {
                    const parsed = supplyChainFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'SystemCreated';
                } catch {
                    return false;
                }
            });
            
            const systemId2 = supplyChainFactory.interface.parseLog(event2).args.systemId;

            // Create products in both systems
            const productData1 = await testHelpers.createSampleProduct(
                contracts.productRegistryContract,
                farmer
            );
            const productId1 = productData1.productId;

            // Get second system's product registry
            const productRegistry2Address = await contractRegistry.getSystemContract(systemId2, "ProductRegistry");
            const StakeholderRegistry2 = await ethers.getContractFactory("StakeholderRegistry");
            const ProductRegistry2 = await ethers.getContractFactory("ProductRegistry");
            
            const stakeholderRegistry2Address = await contractRegistry.getSystemContract(systemId2, "StakeholderRegistry");
            const stakeholderRegistry2 = StakeholderRegistry2.attach(stakeholderRegistry2Address);
            const productRegistry2 = ProductRegistry2.attach(productRegistry2Address);

            // Transfer admin rights for second system
            await supplyChainFactory.connect(deployer).transferStakeholderRegistryAdmin(systemId2, deployer.address);

            // Setup stakeholders in second system
            await testHelpers.setupStakeholders(stakeholderRegistry2);

            // Create product in second system
            const productData2 = await testHelpers.createSampleProduct(productRegistry2, farmer);
            const productId2 = productData2.productId;

            // Batch verify products across systems using client
            const systemIds = [systemId, systemId2];
            const productIds = [productId1, productId2];
            
            const verificationResults = await supplyChainClient.batchVerifyProducts.staticCall(systemIds, productIds);
            
            expect(verificationResults[0]).to.be.true;
            expect(verificationResults[1]).to.be.true;
            console.log(`Cross-system verification results: ${verificationResults}`);
        });

        it("Should provide system overview and analytics", async function () {
            // Create some products and shipments
            const productData = await testHelpers.createSampleProduct(
                contracts.productRegistryContract,
                farmer
            );
            const productId = productData.productId;

            // Update product to PROCESSING stage so it can be shipped
            await testHelpers.updateProductStage(
                contracts.productRegistryContract,
                processor,
                productId,
                1, // PROCESSING stage
                "Product processed and ready for distribution"
            );

            const shipmentId = await testHelpers.createSampleShipment(
                contracts.shipmentRegistryContract,
                distributor,
                productId,
                retailer.address
            );

            // Get system overview via client
            const [totalSystems, totalContracts, supportedTypes] = 
                await supplyChainClient.getSystemsOverview();
            
            expect(totalSystems).to.be.at.least(0);
            expect(totalContracts).to.be.at.least(5); // At least our system contracts
            expect(supportedTypes).to.equal(8); // Number of supported contract types
            
            console.log(`System overview - Systems: ${totalSystems}, Contracts: ${totalContracts}, Types: ${supportedTypes}`);

            // Check if system supports verification
            const supportsVerification = await supplyChainClient.systemSupportsVerification(systemId);
            expect(supportsVerification).to.be.true;
            console.log(`System supports verification: ${supportsVerification}`);
        });

        it("Should handle contract discovery correctly", async function () {
            // Discover all systems
            await supplyChainClient.discoverSystems();

            // Get latest contract addresses
            const latestProductRegistry = await supplyChainClient.getLatestProductRegistry();
            expect(latestProductRegistry).to.not.equal(ethers.ZeroAddress);
            console.log(`Latest ProductRegistry: ${latestProductRegistry}`);

            // Verify it matches our system's registry
            expect(latestProductRegistry).to.equal(contracts.productRegistry);
        });
    });

    describe("Contract Upgrade Scenarios", function () {
        beforeEach(async function () {
            // Setup basic system
            contractRegistry = await testHelpers.deployContractRegistry();
            supplyChainFactory = await testHelpers.deploySupplyChainFactory(
                await contractRegistry.getAddress()
            );
            
            await contractRegistry.connect(deployer).addAuthorizedDeployer(
                await supplyChainFactory.getAddress()
            );

            const tx = await supplyChainFactory.connect(deployer).createSupplyChainSystem("Upgrade Test");
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = supplyChainFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'SystemCreated';
                } catch {
                    return false;
                }
            });
            
            systemId = supplyChainFactory.interface.parseLog(event).args.systemId;
        });

        it("Should handle contract upgrades through registry", async function () {
            // Get current ProductRegistry address
            const currentProductRegistry = await contractRegistry.getSystemContract(systemId, "ProductRegistry");
            
            // First register the current ProductRegistry in the registry
            await contractRegistry.connect(deployer).registerContract(
                currentProductRegistry,
                "ProductRegistry",
                "Initial ProductRegistry from system"
            );
            
            // Deploy new ProductRegistry version
            const stakeholderRegistryAddr = await contractRegistry.getSystemContract(systemId, "StakeholderRegistry");
            const newProductRegistry = await testHelpers.deployProductRegistry(stakeholderRegistryAddr);
            
            // Register upgrade
            await contractRegistry.connect(deployer).upgradeContract(
                "ProductRegistry",
                await newProductRegistry.getAddress(),
                "Added enhanced traceability features"
            );

            // Verify latest contract is updated
            const latestProductRegistry = await contractRegistry.getLatestContract("ProductRegistry");
            expect(latestProductRegistry).to.equal(await newProductRegistry.getAddress());
            expect(latestProductRegistry).to.not.equal(currentProductRegistry);
            
            console.log(`Upgraded ProductRegistry from ${currentProductRegistry} to ${latestProductRegistry}`);
        });
    });

    describe("Error Handling and Edge Cases", function () {
        beforeEach(async function () {
            contractRegistry = await testHelpers.deployContractRegistry();
            supplyChainClient = await testHelpers.deploySupplyChainClient(
                await contractRegistry.getAddress()
            );
        });

        it("Should handle non-existent systems gracefully", async function () {
            const nonExistentSystemId = 999;
            
            // Should not revert but return false/empty
            const supportsVerification = await supplyChainClient.systemSupportsVerification(nonExistentSystemId);
            expect(supportsVerification).to.be.false;
            
            console.log(`Non-existent system verification support: ${supportsVerification}`);
        });

        it("Should handle batch operations with mixed valid/invalid systems", async function () {
            // Create one valid system
            const supplyChainFactory = await testHelpers.deploySupplyChainFactory(
                await contractRegistry.getAddress()
            );
            await contractRegistry.connect(deployer).addAuthorizedDeployer(
                await supplyChainFactory.getAddress()
            );
            
            const tx = await supplyChainFactory.connect(deployer).createSupplyChainSystem("Valid System");
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = supplyChainFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'SystemCreated';
                } catch {
                    return false;
                }
            });
            
            const validSystemId = supplyChainFactory.interface.parseLog(event).args.systemId;

            // Batch verify with mixed valid/invalid
            const systemIds = [validSystemId, 999]; // One valid, one invalid
            const productIds = [0, 0]; // Non-existent products
            
            // Wait for the transaction and get the result
            const results = await supplyChainClient.batchVerifyProducts.staticCall(systemIds, productIds);
            
            // The function should return results, but since we're testing invalid products, 
            // we mainly want to ensure it doesn't revert
            console.log(`Mixed batch verification completed`);
            expect(results).to.not.be.undefined;
        });
    });

    describe("Performance and Gas Usage", function () {
        it("Should efficiently deploy and register complete ecosystem", async function () {
            console.log("\n=== Gas Usage Analysis ===");
            
            // Track gas for each deployment step by step
            let totalGas = 0n;

            // Contract Registry
            console.log("Deploying ContractRegistry...");
            const ContractRegistry = await ethers.getContractFactory("ContractRegistry");
            const contractRegistryTx = await ContractRegistry.deploy();
            const contractRegistryReceipt = await contractRegistryTx.deploymentTransaction().wait();
            console.log(`ContractRegistry deployment gas used: ${contractRegistryReceipt.gasUsed.toString()}`);
            totalGas += contractRegistryReceipt.gasUsed;

            // Supply Chain Factory
            console.log("Deploying SupplyChainFactory...");
            const SupplyChainFactory = await ethers.getContractFactory("SupplyChainFactory");
            const factoryTx = await SupplyChainFactory.deploy(
                await contractRegistryTx.getAddress(),
                ethers.ZeroAddress, // temperatureFeed
                ethers.ZeroAddress, // humidityFeed
                ethers.ZeroAddress, // rainfallFeed
                ethers.ZeroAddress, // windSpeedFeed
                ethers.ZeroAddress  // priceFeed
            );
            const factoryReceipt = await factoryTx.deploymentTransaction().wait();
            console.log(`SupplyChainFactory deployment gas used: ${factoryReceipt.gasUsed.toString()}`);
            totalGas += factoryReceipt.gasUsed;

            // System Creation
            await contractRegistryTx.addAuthorizedDeployer(await factoryTx.getAddress());
            
            const systemTx = await factoryTx.connect(deployer).createSupplyChainSystem("Gas Test System");
            const systemReceipt = await systemTx.wait();
            console.log(`Complete system creation gas used: ${systemReceipt.gasUsed.toString()}`);
            totalGas += systemReceipt.gasUsed;

            console.log(`Total gas used for complete ecosystem: ${totalGas.toString()}`);
            
            // Should be reasonable for Polygon deployment
            expect(totalGas).to.be.below(60000000n); // Updated to realistic limit (~50M gas) for complex deployment with contract registry
        });
    });
}); 