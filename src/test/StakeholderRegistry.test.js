const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { TestHelpers } = require("./helpers/testHelpers");

describe("StakeholderRegistry Contract Tests", function () {
    let testHelpers;
    let registry;
    let stakeholderRegistry;
    let stakeholderFactory;
    let accounts;
    let deployer, admin, farmer, processor, distributor, retailer, unauthorized;
    let farmerStakeholderContract, processorStakeholderContract, distributorStakeholderContract, retailerStakeholderContract;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, farmer, processor, distributor, retailer, unauthorized } = accounts);

        // Deploy core registry first
        const Registry = await ethers.getContractFactory("Registry");
        registry = await Registry.deploy();
        await registry.waitForDeployment();

        // Deploy stakeholder registry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await registry.getAddress());
        await stakeholderRegistry.waitForDeployment();

        // Deploy stakeholder factory
        const StakeholderFactory = await ethers.getContractFactory("StakeholderFactory");
        stakeholderFactory = await StakeholderFactory.deploy(await registry.getAddress());
        await stakeholderFactory.waitForDeployment();

        // Create test stakeholders
        const farmerTx = await stakeholderFactory.connect(deployer).createStakeholder(
            farmer.address,
            0, // FARMER
            "Green Valley Farm",
            "FARM123",
            "California, USA",
            "Organic Certified, USDA Approved"
        );
        const farmerReceipt = await farmerTx.wait();
        const farmerEvent = farmerReceipt.logs.find(log => {
            try {
                return stakeholderFactory.interface.parseLog(log).name === "StakeholderCreated";
            } catch {
                return false;
            }
        });
        farmerStakeholderContract = stakeholderFactory.interface.parseLog(farmerEvent).args.stakeholderContractAddress;

        const processorTx = await stakeholderFactory.connect(deployer).createStakeholder(
            processor.address,
            1, // PROCESSOR
            "Fresh Processing Co",
            "PROC123",
            "Texas, USA",
            "FDA Approved, HACCP Certified"
        );
        const processorReceipt = await processorTx.wait();
        const processorEvent = processorReceipt.logs.find(log => {
            try {
                return stakeholderFactory.interface.parseLog(log).name === "StakeholderCreated";
            } catch {
                return false;
            }
        });
        processorStakeholderContract = stakeholderFactory.interface.parseLog(processorEvent).args.stakeholderContractAddress;

        const distributorTx = await stakeholderFactory.connect(deployer).createStakeholder(
            distributor.address,
            3, // DISTRIBUTOR
            "Supply Chain Inc",
            "DIST456",
            "Los Angeles, USA",
            "ISO 9001 Certified"
        );
        const distributorReceipt = await distributorTx.wait();
        const distributorEvent = distributorReceipt.logs.find(log => {
            try {
                return stakeholderFactory.interface.parseLog(log).name === "StakeholderCreated";
            } catch {
                return false;
            }
        });
        distributorStakeholderContract = stakeholderFactory.interface.parseLog(distributorEvent).args.stakeholderContractAddress;

        const retailerTx = await stakeholderFactory.connect(deployer).createStakeholder(
            retailer.address,
            2, // RETAILER
            "Fresh Market",
            "RET789",
            "New York, USA",
            "Quality Assured"
        );
        const retailerReceipt = await retailerTx.wait();
        const retailerEvent = retailerReceipt.logs.find(log => {
            try {
                return stakeholderFactory.interface.parseLog(log).name === "StakeholderCreated";
            } catch {
                return false;
            }
        });
        retailerStakeholderContract = stakeholderFactory.interface.parseLog(retailerEvent).args.stakeholderContractAddress;
    });

    describe("StakeholderRegistry Deployment", function () {
        it("Should deploy stakeholder registry successfully", async function () {
            expect(await stakeholderRegistry.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct registry address", async function () {
            expect(await stakeholderRegistry.registry()).to.equal(await registry.getAddress());
        });

        it("Should set deployer as admin", async function () {
            expect(await stakeholderRegistry.admin()).to.equal(deployer.address);
        });
    });

    describe("Stakeholder Role Verification", function () {
        it("Should verify registered stakeholder with correct role", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true; // FARMER
            expect(await stakeholderRegistry.isRegisteredStakeholder(processor.address, 1)).to.be.true; // PROCESSOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(distributor.address, 3)).to.be.true; // DISTRIBUTOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(retailer.address, 2)).to.be.true; // RETAILER
        });

        it("Should return false for stakeholder with wrong role", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.false; // Farmer as PROCESSOR
            expect(await stakeholderRegistry.isRegisteredStakeholder(processor.address, 0)).to.be.false; // Processor as FARMER
            expect(await stakeholderRegistry.isRegisteredStakeholder(distributor.address, 2)).to.be.false; // Distributor as RETAILER
            expect(await stakeholderRegistry.isRegisteredStakeholder(retailer.address, 3)).to.be.false; // Retailer as DISTRIBUTOR
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
            // Deactivate farmer
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            await farmerContract.connect(deployer).deactivate();

            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.false;
        });

        it("Should return false for unregistered address", async function () {
            expect(await stakeholderRegistry.isActiveStakeholder(unauthorized.address)).to.be.false;
        });
    });

    describe("Stakeholder Contract Retrieval", function () {
        it("Should return correct stakeholder contract address", async function () {
            expect(await stakeholderRegistry.getStakeholderContract(farmer.address)).to.equal(farmerStakeholderContract);
            expect(await stakeholderRegistry.getStakeholderContract(processor.address)).to.equal(processorStakeholderContract);
            expect(await stakeholderRegistry.getStakeholderContract(distributor.address)).to.equal(distributorStakeholderContract);
            expect(await stakeholderRegistry.getStakeholderContract(retailer.address)).to.equal(retailerStakeholderContract);
        });

        it("Should return zero address for unregistered stakeholder", async function () {
            expect(await stakeholderRegistry.getStakeholderContract(unauthorized.address)).to.equal(ethers.ZeroAddress);
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
            expect(role).to.equal(0); // FARMER
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
            const farmers = await stakeholderRegistry.getStakeholdersByRole(0); // FARMER
            const processors = await stakeholderRegistry.getStakeholdersByRole(1); // PROCESSOR
            const retailers = await stakeholderRegistry.getStakeholdersByRole(2); // RETAILER
            const distributors = await stakeholderRegistry.getStakeholdersByRole(3); // DISTRIBUTOR

            expect(farmers).to.include(farmer.address);
            expect(processors).to.include(processor.address);
            expect(retailers).to.include(retailer.address);
            expect(distributors).to.include(distributor.address);

            expect(farmers.length).to.equal(1);
            expect(processors.length).to.equal(1);
            expect(retailers.length).to.equal(1);
            expect(distributors.length).to.equal(1);
        });

        it("Should not include inactive stakeholders", async function () {
            // Deactivate farmer
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            await farmerContract.connect(deployer).deactivate();

            const farmers = await stakeholderRegistry.getStakeholdersByRole(0); // FARMER
            expect(farmers).to.not.include(farmer.address);
            expect(farmers.length).to.equal(0);
        });

        it("Should return empty array for role with no stakeholders", async function () {
            // Test with a new registry that has no stakeholders yet
            const newRegistry = await (await ethers.getContractFactory("Registry")).deploy();
            const newStakeholderRegistry = await (await ethers.getContractFactory("StakeholderRegistry")).deploy(await newRegistry.getAddress());
            
            const farmers = await newStakeholderRegistry.getStakeholdersByRole(0);
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
            await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.consumer.address, // Using consumer account
                0, // FARMER
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

        it("Should not include inactive stakeholders in search", async function () {
            // Deactivate farmer
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            await farmerContract.connect(deployer).deactivate();

            const farmResults = await stakeholderRegistry.findStakeholdersByBusinessName("Farm");
            expect(farmResults).to.not.include(farmer.address);
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

    describe("Stakeholder State Changes", function () {
        it("Should handle stakeholder reactivation", async function () {
            // Deactivate farmer
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            await farmerContract.connect(deployer).deactivate();

            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;

            // Reactivate farmer
            await farmerContract.connect(deployer).reactivate();

            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.be.true;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
        });

        it("Should handle stakeholder information updates", async function () {
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            
            // Update farmer information
            await farmerContract.connect(deployer).updateInfo(
                "Updated Green Valley Farm",
                "Updated California, USA",
                "Updated Organic Certified"
            );

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

            expect(businessName).to.equal("Updated Green Valley Farm");
            expect(location).to.equal("Updated California, USA");
            expect(certifications).to.equal("Updated Organic Certified");
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle invalid contract calls gracefully", async function () {
            // This test ensures the try-catch blocks work correctly
            // by checking behavior with edge cases
            
            // Check with zero address
            expect(await stakeholderRegistry.isRegisteredStakeholder(ethers.ZeroAddress, 0)).to.be.false;
            expect(await stakeholderRegistry.isActiveStakeholder(ethers.ZeroAddress)).to.be.false;
        });

        it("Should return consistent results after multiple operations", async function () {
            // Perform multiple operations and ensure consistency
            const initialActive = await stakeholderRegistry.isActiveStakeholder(farmer.address);
            const initialRegistered = await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0);

            // Update activity
            const farmerContract = await ethers.getContractAt("Stakeholder", farmerStakeholderContract);
            await farmerContract.connect(farmer).updateActivity();

            // Check that status remains consistent
            expect(await stakeholderRegistry.isActiveStakeholder(farmer.address)).to.equal(initialActive);
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.equal(initialRegistered);
        });
    });

    describe("Integration Tests", function () {
        it("Should work with full stakeholder lifecycle", async function () {
            // Create new stakeholder
            const newStakeholderTx = await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.auditor.address,
                0, // FARMER
                "Integration Test Farm",
                "INT123",
                "Test Location",
                "Test Certifications"
            );

            const receipt = await newStakeholderTx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return stakeholderFactory.interface.parseLog(log).name === "StakeholderCreated";
                } catch {
                    return false;
                }
            });

            const newStakeholderContract = stakeholderFactory.interface.parseLog(event).args.stakeholderContractAddress;

            // Verify registration
            expect(await stakeholderRegistry.isRegisteredStakeholder(accounts.auditor.address, 0)).to.be.true;
            expect(await stakeholderRegistry.isActiveStakeholder(accounts.auditor.address)).to.be.true;

            // Verify in role list
            const farmers = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmers).to.include(accounts.auditor.address);

            // Verify searchable
            const searchResults = await stakeholderRegistry.findStakeholdersByBusinessName("Integration");
            expect(searchResults).to.include(accounts.auditor.address);

            // Deactivate and verify removal from searches
            const stakeholderContract = await ethers.getContractAt("Stakeholder", newStakeholderContract);
            await stakeholderContract.connect(deployer).deactivate();

            expect(await stakeholderRegistry.isActiveStakeholder(accounts.auditor.address)).to.be.false;
            
            const farmersAfterDeactivation = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmersAfterDeactivation).to.not.include(accounts.auditor.address);

            const searchAfterDeactivation = await stakeholderRegistry.findStakeholdersByBusinessName("Integration");
            expect(searchAfterDeactivation).to.not.include(accounts.auditor.address);
        });

        it("Should handle multiple stakeholders with same role", async function () {
            // Create additional farmers
            await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.consumer.address,
                0, // FARMER
                "Second Farm",
                "FARM456",
                "Second Location",
                "Second Certifications"
            );

            await stakeholderFactory.connect(deployer).createStakeholder(
                accounts.auditor.address,
                0, // FARMER
                "Third Farm",
                "FARM789",
                "Third Location",
                "Third Certifications"
            );

            const farmers = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmers.length).to.equal(3);
            expect(farmers).to.include(farmer.address);
            expect(farmers).to.include(accounts.consumer.address);
            expect(farmers).to.include(accounts.auditor.address);
        });
    });
});