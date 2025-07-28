const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { TestHelpers } = require("./helpers/testHelpers");

describe("StakeholderRegistry Contract Tests", function () {
    let testHelpers;
    let registry;
    let stakeholderRegistry;
    let accounts;
    let deployer, admin, farmer, processor, distributor, retailer, unauthorized;
    let farmerStakeholderContract, processorStakeholderContract, distributorStakeholderContract, retailerStakeholderContract;
    let stakeholderManager;
    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, farmer, processor, distributor, retailer, unauthorized } = accounts);

        // Deploy StakeholderManager
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();

        // Deploy stakeholder registry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await stakeholderManager.getAddress());
        await stakeholderRegistry.waitForDeployment();

        // Deploy Registry contract
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy(await stakeholderManager.getAddress());
        await registry.waitForDeployment();

        // Create test stakeholders
        const farmerTx = await stakeholderManager.connect(deployer).registerStakeholder(
            farmer.address,
            1, // FARMER
            "Green Valley Farm",
            "FARM123",
            "California, USA",
            "Organic Certified, USDA Approved"
        );
        const farmerReceipt = await farmerTx.wait();
        const farmerEvent = farmerReceipt.logs.find(log => {
            try {
                return stakeholderManager.interface.parseLog(log).name === "StakeholderRegistered";
            } catch {
                return false;
            }
        });
        const farmerRegistrationArgs = stakeholderManager.interface.parseLog(farmerEvent).args;
        farmerStakeholderContract = farmerRegistrationArgs.stakeholderAddress;

        const processorTx = await stakeholderManager.connect(deployer).registerStakeholder(
            processor.address,
            2, // PROCESSOR
            "Fresh Processing Co",
            "PROC123",
            "Texas, USA",
            "FDA Approved, HACCP Certified"
        );
        const processorReceipt = await processorTx.wait();
        const processorEvent = processorReceipt.logs.find(log => {
            try {
                return stakeholderManager.interface.parseLog(log).name === "StakeholderRegistered";
            } catch {
                return false;
            }
        });
        const processorRegistrationArgs = stakeholderManager.interface.parseLog(processorEvent).args;
        processorStakeholderContract = processorRegistrationArgs.stakeholderAddress;

        const distributorTx = await stakeholderManager.connect(deployer).registerStakeholder(
            distributor.address,
            4, // DISTRIBUTOR
            "Supply Chain Inc",
            "DIST456",
            "Los Angeles, USA",
            "ISO 9001 Certified"
        );
        const distributorReceipt = await distributorTx.wait();
        const distributorEvent = distributorReceipt.logs.find(log => {
            try {
                return stakeholderManager.interface.parseLog(log).name === "StakeholderRegistered";
            } catch {
                return false;
            }
        });
        const distributorRegistrationArgs = stakeholderManager.interface.parseLog(distributorEvent).args;
        distributorStakeholderContract = distributorRegistrationArgs.stakeholderAddress;

        const retailerTx = await stakeholderManager.connect(deployer).registerStakeholder(
            retailer.address,
            3, // RETAILER
            "Fresh Market",
            "RET789",
            "New York, USA",
            "Quality Assured"
        );
        const retailerReceipt = await retailerTx.wait();
        const retailerEvent = retailerReceipt.logs.find(log => {
            try {
                return stakeholderManager.interface.parseLog(log).name === "StakeholderRegistered";
            } catch {
                return false;
            }
        });
        const retailerRegistrationArgs = stakeholderManager.interface.parseLog(retailerEvent).args;
        retailerStakeholderContract = retailerRegistrationArgs.stakeholderAddress;
    });

    describe("StakeholderRegistry Deployment", function () {
        it("Should deploy stakeholder registry successfully", async function () {
            expect(await stakeholderRegistry.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct registry address", async function () {
            expect(await stakeholderRegistry.stakeholderManager()).to.equal(await stakeholderManager.getAddress());
        });

        it("Should set deployer as admin", async function () {
            expect(await stakeholderRegistry.admin()).to.equal(deployer.address);
        });
    });

    describe("Stakeholder Role Verification", function () {
        it("Should verify registered stakeholder with correct role", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.true; // FARMER
            expect(await stakeholderRegistry.isRegisteredStakeholder(processor.address, 2)).to.be.true; // PROCESSOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(distributor.address, 4)).to.be.true; // DISTRIBUTOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(retailer.address, 3)).to.be.true; // RETAILER
        });

        it("Should return false for stakeholder with wrong role", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 2)).to.be.false; // Farmer as PROCESSOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(processor.address, 1)).to.be.false; // Processor as FARMER
            expect(await stakeholderRegistry.isRegisteredStakeholder(distributor.address, 3)).to.be.false; // Distributor as RETAILER
            expect(await stakeholderRegistry.isRegisteredStakeholder(retailer.address, 4)).to.be.false; // Retailer as DISTRIBUTOR
        });

        it("Should return false for unregistered address", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(unauthorized.address, 0)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(unauthorized.address, 1)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(unauthorized.address, 2)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(unauthorized.address, 3)).to.be.false;
        });
    });

    describe("Active Stakeholder Verification", function () {
        it("Should verify active stakeholders", async function () {
            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(processor.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(distributor.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(retailer.address)).to.be.true;
        });

        it("Should return false for inactive stakeholder", async function () {
            // Deactivate farmer using StakeholderManager
            await stakeholderManager.connect(deployer).deactivateStakeholder(farmer.address);

            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.false;
        });

        it("Should return false for unregistered address", async function () {
            expect(await stakeholderRegistry.isActiveStakeholder(unauthorized.address)).to.be.false;
        });
    });

    describe("Stakeholder Contract Retrieval", function () {
        it("Should return correct stakeholder address", async function () {
            // In the new architecture, we check if stakeholders are registered directly
            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(processor.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(distributor.address)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(retailer.address)).to.be.true;
        });

        it("Should return false for unregistered stakeholder", async function () {
            expect(await stakeholderRegistry.isActiveStakeholder(unauthorized.address)).to.be.false;
        });
    });

    describe("Stakeholder Information Retrieval", function () {
        it("Should return complete stakeholder information", async function () {
            const [
                addr,
                role,
                businessName,
                businessLicense,
                location,
                certifications,
                isActive,
                registeredAt,
                lastActivity
            ] = await stakeholderRegistry.getStakeholderInfo(farmer.address);

            expect(addr).to.equal(farmer.address);
            expect(role).to.equal(1); // FARMER
            expect(businessName).to.equal("Green Valley Farm");
            expect(businessLicense).to.equal("FARM123");
            expect(location).to.equal("California, USA");
            expect(certifications).to.equal("Organic Certified, USDA Approved");
            expect(isActive).to.be.true;
            expect(registeredAt).to.be.greaterThan(0);
            expect(lastActivity).to.be.greaterThan(0);
        });

        it("Should return default values for unregistered stakeholder", async function () {
            const [
                addr,
                role,
                businessName,
                businessLicense,
                location,
                certifications,
                isActive,
                registeredAt,
                lastActivity
            ] = await stakeholderRegistry.getStakeholderInfo(unauthorized.address);

            expect(addr).to.equal(ethers.ZeroAddress);
            expect(role).to.equal(0); // Default FARMER
            expect(businessName).to.equal("");
            expect(businessLicense).to.equal("");
            expect(location).to.equal("");
            expect(certifications).to.equal("");
            expect(isActive).to.be.false;
            expect(registeredAt).to.equal(0);
            expect(lastActivity).to.equal(0);
        });
    });

    describe("Stakeholders by Role", function () {
        it("Should return stakeholders by role correctly", async function () {
            const farmers = await stakeholderRegistry.getStakeholdersByRole(1); // FARMER
            const processors = await stakeholderRegistry.getStakeholdersByRole(2); // PROCESSOR
            const retailers = await stakeholderRegistry.getStakeholdersByRole(3); // RETAILER
            const distributors = await stakeholderRegistry.getStakeholdersByRole(4); // DISTRIBUTOR

            expect(farmers).to.include(farmer.address);
            expect(processors).to.include(processor.address);
            expect(retailers).to.include(retailer.address);
            expect(distributors).to.include(distributor.address);

            expect(farmers.length).to.equal(1);
            expect(processors.length).to.equal(1);
            expect(retailers.length).to.equal(1);
            expect(distributors.length).to.equal(1);
        });


        it("Should return empty array for role with no stakeholders", async function () {
            // Test with a new stakeholder manager that has no stakeholders yet
            const newStakeholderManager = await (await ethers.getContractFactory("StakeholderManager")).deploy();
            const newStakeholderRegistry = await (await ethers.getContractFactory("StakeholderRegistry")).deploy(await newStakeholderManager.getAddress());
            
            const farmers = await newStakeholderRegistry.getStakeholdersByRole(1); // FARMER role
            expect(farmers.length).to.equal(0);
        });
    });

    describe("Stakeholder by License", function () {
        it("Should return stakeholder by business license", async function () {
            expect(await stakeholderRegistry.getStakeholderByLicense("FARM123")).to.equal(farmer.address);
            expect(await stakeholderRegistry.getStakeholderByLicense("PROC123")).to.equal(processor.address);
            expect(await stakeholderRegistry.getStakeholderByLicense("DIST456")).to.equal(distributor.address);
            expect(await stakeholderRegistry.getStakeholderByLicense("RET789")).to.equal(retailer.address);
        });

        it("Should return zero address for non-existent license", async function () {
            expect(await stakeholderRegistry.getStakeholderByLicense("NONEXISTENT")).to.equal(ethers.ZeroAddress);
        });
    });

    describe("Find Stakeholders by Business Name", function () {
        it("Should find stakeholders by partial business name", async function () {
            const farmResults = await stakeholderRegistry.findStakeholdersByBusinessName("Farm");
            expect(farmResults).to.include(farmer.address);
            expect(farmResults.length).to.equal(1);

            const marketResults = await stakeholderRegistry.findStakeholdersByBusinessName("Market");
            expect(marketResults).to.include(retailer.address);
            expect(marketResults.length).to.equal(1);

            const processingResults = await stakeholderRegistry.findStakeholdersByBusinessName("Processing");
            expect(processingResults).to.include(processor.address);
            expect(processingResults.length).to.equal(1);
        });

        it("Should return multiple matches for common terms", async function () {
            // Create another stakeholder with "Fresh" in name
            await stakeholderManager.connect(deployer).registerStakeholder(
                accounts.consumer.address, // Using consumer account
                1, // FARMER
                "Fresh Valley Farm",
                "FRESH123",
                "Oregon, USA",
                "Organic"
            );

            const freshResults = await stakeholderRegistry.findStakeholdersByBusinessName("Fresh");
            expect(freshResults.length).to.equal(3); // "Fresh Processing Co", "Fresh Market", "Fresh Valley Farm"
            expect(freshResults).to.include(processor.address); // "Fresh Processing Co"
            expect(freshResults).to.include(retailer.address); // "Fresh Market"
            expect(freshResults).to.include(accounts.consumer.address); // "Fresh Valley Farm"
        });

        it("Should return empty array for non-matching name", async function () {
            const results = await stakeholderRegistry.findStakeholdersByBusinessName("NonExistentBusiness");
            expect(results.length).to.equal(0);
        });

        it("Should be case sensitive", async function () {
            const lowerResults = await stakeholderRegistry.findStakeholdersByBusinessName("farm");
            expect(lowerResults.length).to.equal(0);

            const upperResults = await stakeholderRegistry.findStakeholdersByBusinessName("FARM");
            expect(upperResults.length).to.equal(0);

            const correctResults = await stakeholderRegistry.findStakeholdersByBusinessName("Farm");
            expect(correctResults.length).to.equal(1);
        });
    });
});
