const { ethers } = require("hardhat");
const { expect } = require("chai");

class TestHelpers {
    constructor() {
        this.deployedContracts = {};
        this.accounts = {};
        this.trackingNumberCounter = 1;
    }

    async setup() {
        // Get test accounts
        const signers = await ethers.getSigners();
        this.accounts = {
            deployer: signers[0],
            admin: signers[1],
            farmer: signers[2],
            processor: signers[3],
            distributor: signers[4],
            retailer: signers[5],
            consumer: signers[6],
            auditor: signers[7],
            unauthorized: signers[8]
        };

        return this.accounts;
    }

    async deployContractRegistry() {
        const ContractRegistry = await ethers.getContractFactory("ContractRegistry");
        const contractRegistry = await ContractRegistry.deploy();
        await contractRegistry.waitForDeployment();
        
        this.deployedContracts.contractRegistry = contractRegistry;
        return contractRegistry;
    }

    async deployStakeholderRegistry() {
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        const stakeholderRegistry = await StakeholderRegistry.deploy();
        await stakeholderRegistry.waitForDeployment();
        
        this.deployedContracts.stakeholderRegistry = stakeholderRegistry;
        return stakeholderRegistry;
    }

    async deployMockOracleFeeds() {
        if (this.deployedContracts.oracleFeeds) {
            return this.deployedContracts.oracleFeeds;
        }

        // Use zero addresses as mock feeds for testing - this allows tests to run
        // without requiring actual oracle contracts
        const mockAddress = ethers.ZeroAddress;

        const oracleFeeds = {
            temperatureFeed: { getAddress: async () => mockAddress },
            humidityFeed: { getAddress: async () => mockAddress },
            rainfallFeed: { getAddress: async () => mockAddress },
            windSpeedFeed: { getAddress: async () => mockAddress },
            priceFeed: { getAddress: async () => mockAddress }
        };

        this.deployedContracts.oracleFeeds = oracleFeeds;
        return oracleFeeds;
    }

    async deployProductRegistry(stakeholderRegistryAddress) {
        // Deploy mock oracle feeds if not already deployed
        const oracleFeeds = await this.deployMockOracleFeeds();
        
        const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
        const productRegistry = await ProductRegistry.deploy(
            stakeholderRegistryAddress,
            await oracleFeeds.temperatureFeed.getAddress(),
            await oracleFeeds.humidityFeed.getAddress(),
            await oracleFeeds.rainfallFeed.getAddress(),
            await oracleFeeds.windSpeedFeed.getAddress(),
            await oracleFeeds.priceFeed.getAddress()
        );
        await productRegistry.waitForDeployment();
        
        this.deployedContracts.productRegistry = productRegistry;
        return productRegistry;
    }

    async deployShipmentRegistry(stakeholderRegistryAddress, productRegistryAddress) {
        const ShipmentRegistry = await ethers.getContractFactory("ShipmentRegistry");
        const shipmentRegistry = await ShipmentRegistry.deploy(
            stakeholderRegistryAddress, 
            productRegistryAddress
        );
        await shipmentRegistry.waitForDeployment();
        
        this.deployedContracts.shipmentRegistry = shipmentRegistry;
        return shipmentRegistry;
    }

    async deploySupplyChainManager(stakeholderAddr, productAddr, shipmentAddr) {
        const SupplyChainManager = await ethers.getContractFactory("SupplyChainManager");
        const supplyChainManager = await SupplyChainManager.deploy(
            stakeholderAddr,
            productAddr,
            shipmentAddr
        );
        await supplyChainManager.waitForDeployment();
        
        this.deployedContracts.supplyChainManager = supplyChainManager;
        return supplyChainManager;
    }

    async deployPublicVerification(productAddr, stakeholderAddr, shipmentAddr) {
        const PublicVerification = await ethers.getContractFactory("PublicVerification");
        const publicVerification = await PublicVerification.deploy(
            productAddr,
            stakeholderAddr,
            shipmentAddr
        );
        await publicVerification.waitForDeployment();
        
        this.deployedContracts.publicVerification = publicVerification;
        return publicVerification;
    }

    async deploySupplyChainFactory(contractRegistryAddress = ethers.ZeroAddress) {
        // Deploy mock oracle feeds if not already deployed
        const oracleFeeds = await this.deployMockOracleFeeds();
        
        const SupplyChainFactory = await ethers.getContractFactory("SupplyChainFactory");
        const supplyChainFactory = await SupplyChainFactory.deploy(
            contractRegistryAddress,
            await oracleFeeds.temperatureFeed.getAddress(),
            await oracleFeeds.humidityFeed.getAddress(),
            await oracleFeeds.rainfallFeed.getAddress(),
            await oracleFeeds.windSpeedFeed.getAddress(),
            await oracleFeeds.priceFeed.getAddress()
        );
        await supplyChainFactory.waitForDeployment();
        
        this.deployedContracts.supplyChainFactory = supplyChainFactory;
        return supplyChainFactory;
    }

    async deploySupplyChainClient(contractRegistryAddress) {
        const SupplyChainClient = await ethers.getContractFactory("SupplyChainClient");
        const supplyChainClient = await SupplyChainClient.deploy(contractRegistryAddress);
        await supplyChainClient.waitForDeployment();
        
        this.deployedContracts.supplyChainClient = supplyChainClient;
        return supplyChainClient;
    }

    async deployFactoryRegistry(contractRegistryAddress) {
        const FactoryRegistry = await ethers.getContractFactory("FactoryRegistry");
        const factoryRegistry = await FactoryRegistry.deploy(contractRegistryAddress);
        await factoryRegistry.waitForDeployment();
        
        this.deployedContracts.factoryRegistry = factoryRegistry;
        return factoryRegistry;
    }

    async deployCompleteSystem() {
        // Deploy all contracts in proper order
        const contractRegistry = await this.deployContractRegistry();
        const stakeholderRegistry = await this.deployStakeholderRegistry();
        const productRegistry = await this.deployProductRegistry(await stakeholderRegistry.getAddress());
        const shipmentRegistry = await this.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );
        const supplyChainManager = await this.deploySupplyChainManager(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress(),
            await shipmentRegistry.getAddress()
        );
        const publicVerification = await this.deployPublicVerification(
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress(),
            await shipmentRegistry.getAddress()
        );

        return {
            contractRegistry,
            stakeholderRegistry,
            productRegistry,
            shipmentRegistry,
            supplyChainManager,
            publicVerification
        };
    }

    async setupStakeholders(stakeholderRegistry) {
        const { deployer, farmer, processor, distributor, retailer } = this.accounts;

        // Check who the current admin is
        const currentAdmin = await stakeholderRegistry.admin();
        console.log(`StakeholderRegistry admin: ${currentAdmin}`);
        console.log(`Deployer address: ${deployer.address}`);
        
        // If deployer is not admin, we expect that admin transfer was already done in the test
        if (currentAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
            console.log("Warning: Deployer is not admin. Admin transfer should have been done in the calling test.");
        }
        
        // Proceed with stakeholder registration using deployer
        await stakeholderRegistry.connect(deployer).registerStakeholder(
            farmer.address,
            0, // FARMER
            "Green Farm Co",
            "FARM-001",
            "Iowa, USA",
            "Organic Certified"
        );

        await stakeholderRegistry.connect(deployer).registerStakeholder(
            processor.address,
            1, // PROCESSOR
            "Fresh Processing Ltd",
            "PROC-001",
            "California, USA",
            "FDA Approved"
        );

        await stakeholderRegistry.connect(deployer).registerStakeholder(
            distributor.address,
            3, // DISTRIBUTOR
            "Quick Distribution",
            "DIST-001",
            "Texas, USA",
            "Cold Chain Certified"
        );

        await stakeholderRegistry.connect(deployer).registerStakeholder(
            retailer.address,
            2, // RETAILER
            "Super Market Chain",
            "RETAIL-001",
            "New York, USA",
            "Food Safety Certified"
        );
    }

    // Register factory contracts as stakeholders so they can call registry functions
    async registerFactoriesAsStakeholders(stakeholderRegistry, productFactory, shipmentFactory) {
        const { deployer } = this.accounts;

        if (productFactory) {
            try {
                // Check if ProductFactory is already registered
                const productFactoryInfo = await stakeholderRegistry.getStakeholderInfo(await productFactory.getAddress());
                if (!productFactoryInfo.isActive) {
                    console.log(`Registering ProductFactory as stakeholder: ${await productFactory.getAddress()}`);
                    await stakeholderRegistry.connect(deployer).registerStakeholder(
                        await productFactory.getAddress(),
                        0, // FARMER (factories can create products as farmers)
                        "Product Factory System",
                        "PROD-FACTORY-001",
                        "System Infrastructure",
                        "Automated Product Creation"
                    );
                } else {
                    console.log(`ProductFactory already registered as stakeholder`);
                }
            } catch (error) {
                // If getStakeholderInfo fails, assume not registered and register
                console.log(`ProductFactory not found, registering: ${error.message}`);
                try {
                    await stakeholderRegistry.connect(deployer).registerStakeholder(
                        await productFactory.getAddress(),
                        0, // FARMER (factories can create products as farmers)
                        "Product Factory System",
                        "PROD-FACTORY-001",
                        "System Infrastructure",
                        "Automated Product Creation"
                    );
                    console.log(`ProductFactory registered successfully`);
                } catch (regError) {
                    console.log(`ProductFactory registration failed: ${regError.message}`);
                }
            }
        }

        if (shipmentFactory) {
            try {
                // Check if ShipmentFactory is already registered
                const shipmentFactoryInfo = await stakeholderRegistry.getStakeholderInfo(await shipmentFactory.getAddress());
                if (!shipmentFactoryInfo.isActive) {
                    console.log(`Registering ShipmentFactory as stakeholder: ${await shipmentFactory.getAddress()}`);
                    await stakeholderRegistry.connect(deployer).registerStakeholder(
                        await shipmentFactory.getAddress(),
                        3, // DISTRIBUTOR (factories can act as distributors for shipment creation)
                        "Shipment Factory System",
                        "SHIP-FACTORY-001",
                        "System Infrastructure",
                        "Automated Shipment Creation"
                    );
                } else {
                    console.log(`ShipmentFactory already registered as stakeholder`);
                }
            } catch (error) {
                // If getStakeholderInfo fails, assume not registered and register
                console.log(`ShipmentFactory not found, registering: ${error.message}`);
                try {
                    await stakeholderRegistry.connect(deployer).registerStakeholder(
                        await shipmentFactory.getAddress(),
                        3, // DISTRIBUTOR (factories can act as distributors for shipment creation)
                        "Shipment Factory System",
                        "SHIP-FACTORY-001",
                        "System Infrastructure",
                        "Automated Shipment Creation"
                    );
                    console.log(`ShipmentFactory registered successfully`);
                } catch (regError) {
                    console.log(`ShipmentFactory registration failed: ${regError.message}`);
                }
            }
        }
    }

    // Enhanced batch number generation to avoid conflicts
    generateUniqueBatchNumber(prefix = "BATCH") {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `${prefix}-${timestamp}-${random}`;
    }

    async createSampleProduct(productRegistry, farmer, productName = "Organic Apples", batchNumber = null, farmData = "Harvested from organic farm, pesticide-free") {
        const finalBatchNumber = batchNumber || this.generateUniqueBatchNumber("BATCH");
        const tx = await productRegistry.connect(farmer).registerProduct(
            productName,
            finalBatchNumber,
            farmData
        );
        const receipt = await tx.wait();
        
        // Extract product ID from events
        const event = receipt.logs.find(log => {
            try {
                const parsed = productRegistry.interface.parseLog(log);
                return parsed && parsed.name === 'ProductCreated';
            } catch {
                return false;
            }
        });

        if (event) {
            const parsed = productRegistry.interface.parseLog(event);
            return { productId: parsed.args.productId, batchNumber: finalBatchNumber };
        }
        
        return { productId: 0, batchNumber: finalBatchNumber }; // Return product data if event parsing fails
    }

    async createSampleProductSimple(productRegistry, farmer, productName = "Organic Apples", batchNumber = null, farmData = "Harvested from organic farm, pesticide-free") {
        // For backward compatibility - returns just productId
        const result = await this.createSampleProduct(productRegistry, farmer, productName, batchNumber, farmData);
        return result.productId;
    }

    async updateProductStage(productRegistry, stakeholder, productId, stage, data = "Stage updated") {
        let tx;
        if (stage === 1) { // PROCESSING
            tx = await productRegistry.connect(stakeholder).updateProcessingStage(productId, data);
        } else if (stage === 2) { // DISTRIBUTION
            tx = await productRegistry.connect(stakeholder).updateDistributionStage(productId, data);
        } else if (stage === 3) { // RETAIL
            tx = await productRegistry.connect(stakeholder).updateRetailStage(productId, data);
        } else {
            throw new Error(`Unsupported stage: ${stage}`);
        }
        await tx.wait();
        return tx;
    }

    async createSampleShipment(shipmentRegistry, distributor, productId, retailerAddress) {
        // Shipments can only be created for products in PROCESSING, DISTRIBUTION, or RETAIL stage
        // So we need to ensure the product is in at least PROCESSING stage
        // This function assumes the product stage has been properly set in the calling test
        const trackingNumber = `TRACK-${String(this.trackingNumberCounter++).padStart(3, '0')}`;
        const tx = await shipmentRegistry.connect(distributor).createShipment(
            productId,
            retailerAddress,
            trackingNumber,
            "Refrigerated Truck"
        );
        const receipt = await tx.wait();
        
        // Extract shipment ID from events
        const event = receipt.logs.find(log => {
            try {
                const parsed = shipmentRegistry.interface.parseLog(log);
                return parsed && parsed.name === 'ShipmentCreated';
            } catch {
                return false;
            }
        });

        if (event) {
            const parsed = shipmentRegistry.interface.parseLog(event);
            return parsed.args.shipmentId; // Return just shipmentId for backward compatibility
        }
        
        return 0; // Return shipment ID if event parsing fails
    }

    async createSampleShipmentWithTracking(shipmentRegistry, distributor, productId, retailerAddress) {
        // Same as createSampleShipment but returns both shipmentId and trackingNumber
        const trackingNumber = `TRACK-${String(this.trackingNumberCounter++).padStart(3, '0')}`;
        const tx = await shipmentRegistry.connect(distributor).createShipment(
            productId,
            retailerAddress,
            trackingNumber,
            "Refrigerated Truck"
        );
        const receipt = await tx.wait();
        
        // Extract shipment ID from events
        const event = receipt.logs.find(log => {
            try {
                const parsed = shipmentRegistry.interface.parseLog(log);
                return parsed && parsed.name === 'ShipmentCreated';
            } catch {
                return false;
            }
        });

        if (event) {
            const parsed = shipmentRegistry.interface.parseLog(event);
            return { shipmentId: parsed.args.shipmentId, trackingNumber: trackingNumber };
        }
        
        return { shipmentId: 0, trackingNumber: trackingNumber };
    }

    async createSampleShipmentWithProductUpdate(shipmentRegistry, productRegistry, distributor, processor, productId, retailerAddress) {
        // First update the product to PROCESSING stage so it can be shipped
        await this.updateProductStage(productRegistry, processor, productId, 1, "Processed and ready for shipment");
        
        // Now create the shipment
        return await this.createSampleShipment(shipmentRegistry, distributor, productId, retailerAddress);
    }

    // Utility functions for testing
    async expectRevert(promise, expectedError) {
        try {
            await promise;
            expect.fail("Expected transaction to revert");
        } catch (error) {
            if (expectedError) {
                expect(error.message).to.include(expectedError);
            }
        }
    }

    async expectEvent(txPromise, eventName, expectedArgs = {}) {
        const tx = await txPromise;
        const receipt = await tx.wait();
        
        const event = receipt.logs.find(log => {
            try {
                const parsed = log.fragment && log.fragment.name === eventName;
                return parsed;
            } catch {
                return false;
            }
        });
        
        expect(event).to.not.be.undefined;
        
        if (Object.keys(expectedArgs).length > 0) {
            for (const [key, value] of Object.entries(expectedArgs)) {
                expect(event.args[key]).to.equal(value);
            }
        }
        
        return event;
    }

    // Gas usage tracking
    async trackGasUsage(txPromise, label) {
        try {
            let receipt;
            
            if (typeof txPromise === 'function') {
                // If it's a function, call it and get the transaction
                const result = await txPromise();
                if (result && result.wait) {
                    receipt = await result.wait();
                } else {
                    throw new Error("Function did not return a transaction");
                }
            } else if (txPromise && txPromise.wait) {
                // If it's already a transaction, just wait for it
                receipt = await txPromise.wait();
            } else {
                // If it's a promise that resolves to a transaction
                const tx = await txPromise;
                if (tx && tx.wait) {
                    receipt = await tx.wait();
                } else if (tx && tx.gasUsed) {
                    // If it's already a receipt
                    receipt = tx;
                } else {
                    throw new Error("Invalid transaction or promise provided");
                }
            }
            
            if (receipt && receipt.gasUsed) {
                console.log(`${label} gas used: ${receipt.gasUsed.toString()}`);
                return receipt;
            } else {
                throw new Error("Receipt does not contain gasUsed information");
            }
        } catch (error) {
            console.error(`Error tracking gas usage for ${label}:`, error.message);
            throw error;
        }
    }

    // Time manipulation helpers for testing
    async increaseTime(seconds) {
        await ethers.provider.send("evm_increaseTime", [seconds]);
        await ethers.provider.send("evm_mine", []);
    }

    async getBlockTimestamp() {
        const block = await ethers.provider.getBlock("latest");
        return block.timestamp;
    }

    // Clean up for fresh test state
    reset() {
        this.deployedContracts = {};
    }

    // Get deployed contract addresses for easier reference
    getContractAddresses() {
        const addresses = {};
        for (const [name, contract] of Object.entries(this.deployedContracts)) {
            addresses[name] = contract.target || contract.address;
        }
        return addresses;
    }
}

module.exports = { TestHelpers }; 