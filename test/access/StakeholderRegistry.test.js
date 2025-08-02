const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeholderRegistry", function () {
    let stakeholderRegistry, stakeholderManager;
    let owner, farmer1, farmer2, processor1, distributor1, retailer1;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };

    beforeEach(async function () {
        [owner, farmer1, farmer2, processor1, distributor1, retailer1] = await ethers.getSigners();

        // Deploy StakeholderManager first
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();

        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy(await stakeholderManager.getAddress());
        await stakeholderRegistry.waitForDeployment();

        // Register stakeholders using the correct functions
        await stakeholderManager.connect(owner).registerStakeholder(
            farmer1.address, ROLE.FARMER, "Farm A", "LIC001", "Costa Rica", "Organic cert"
        );
        await stakeholderManager.connect(owner).registerStakeholder(
            farmer2.address, ROLE.FARMER, "Farm B", "LIC002", "Mexico", "Traditional cert"
        );
        await stakeholderManager.connect(owner).registerStakeholder(
            processor1.address, ROLE.PROCESSOR, "Processor X", "PROC001", "USA", "Food processing cert"
        );
        await stakeholderManager.connect(owner).registerStakeholder(
            distributor1.address, ROLE.DISTRIBUTOR, "Distributor Y", "DIST001", "Canada", "Distribution cert"
        );
        await stakeholderManager.connect(owner).registerStakeholder(
            retailer1.address, ROLE.RETAILER, "Retailer Z", "RET001", "UK", "Retail cert"
        );
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await stakeholderRegistry.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct stakeholder manager", async function () {
            expect(await stakeholderRegistry.stakeholderManager()).to.equal(await stakeholderManager.getAddress());
        });
    });

    describe("Basic Queries", function () {
        it("Should return total stakeholders", async function () {
            const total = await stakeholderRegistry.totalStakeholders();
            expect(total).to.equal(5); // 5 registered stakeholders
        });

        it("Should check if stakeholder is registered", async function () {
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer1.address)).to.equal(true);
            expect(await stakeholderRegistry.isRegisteredStakeholder(owner.address)).to.equal(false);
        });

        it("Should get stakeholder info", async function () {
            const info = await stakeholderRegistry.getStakeholderInfo(farmer1.address);
            expect(info[1]).to.equal("Farm A"); // name
            expect(info[0]).to.equal(ROLE.FARMER); // role
            expect(info[5]).to.equal(true); // isActive
        });

        it("Should get stakeholder role", async function () {
            expect(await stakeholderRegistry.getStakeholderRole(farmer1.address)).to.equal(ROLE.FARMER);
            expect(await stakeholderRegistry.getStakeholderRole(processor1.address)).to.equal(ROLE.PROCESSOR);
        });
    });

    describe("Role-based Queries", function () {
        it("Should return stakeholders by role", async function () {
            const farmers = await stakeholderRegistry.getStakeholdersByRole(ROLE.FARMER);
            expect(farmers.length).to.equal(2);
            expect(farmers).to.include(farmer1.address);
            expect(farmers).to.include(farmer2.address);
        });

        it("Should return stakeholder count by role", async function () {
            expect(await stakeholderRegistry.getStakeholderCountByRole(ROLE.FARMER)).to.equal(2);
            expect(await stakeholderRegistry.getStakeholderCountByRole(ROLE.PROCESSOR)).to.equal(1);
            expect(await stakeholderRegistry.getStakeholderCountByRole(ROLE.DISTRIBUTOR)).to.equal(1);
        });

        it("Should return all farmers", async function () {
            const farmers = await stakeholderRegistry.getAllFarmers();
            expect(farmers.length).to.equal(2);
            expect(farmers).to.include(farmer1.address);
            expect(farmers).to.include(farmer2.address);
        });

        it("Should return all processors", async function () {
            const processors = await stakeholderRegistry.getAllProcessors();
            expect(processors.length).to.equal(1);
            expect(processors[0]).to.equal(processor1.address);
        });

        it("Should return all distributors", async function () {
            const distributors = await stakeholderRegistry.getAllDistributors();
            expect(distributors.length).to.equal(1);
            expect(distributors[0]).to.equal(distributor1.address);
        });

        it("Should return all retailers", async function () {
            const retailers = await stakeholderRegistry.getAllRetailers();
            expect(retailers.length).to.equal(1);
            expect(retailers[0]).to.equal(retailer1.address);
        });
    });

    describe("Active Stakeholder Queries", function () {
        beforeEach(async function () {
            // Deactivate one farmer
            await stakeholderManager.connect(owner).deactivateStakeholder(farmer2.address);
        });

        it("Should return only active stakeholders by role", async function () {
            const activeStakeholders = await stakeholderRegistry.getActiveStakeholdersByRole(ROLE.FARMER);
            expect(activeStakeholders.length).to.equal(1);
            expect(activeStakeholders[0]).to.equal(farmer1.address);
        });

        it("Should return correct active stakeholder count", async function () {
            const activeCount = await stakeholderRegistry.getActiveStakeholderCountByRole(ROLE.FARMER);
            expect(activeCount).to.equal(1);
        });

        it("Should check if stakeholder is active", async function () {
            expect(await stakeholderRegistry.isActiveStakeholder(farmer1.address)).to.equal(true);
            expect(await stakeholderRegistry.isActiveStakeholder(farmer2.address)).to.equal(false);
        });
    });

    describe("Statistics", function () {
        it("Should return correct role statistics", async function () {
            const stats = await stakeholderRegistry.getRoleStatistics();
            expect(stats[0]).to.equal(2); // totalFarmers
            expect(stats[1]).to.equal(1); // totalProcessors
            expect(stats[2]).to.equal(1); // totalDistributors
            expect(stats[4]).to.equal(1); // totalRetailers
        });

        it("Should return correct active role statistics", async function () {
            // Deactivate one farmer first
            await stakeholderManager.connect(owner).deactivateStakeholder(farmer2.address);

            const activeStats = await stakeholderRegistry.getActiveRoleStatistics();
            expect(activeStats[0]).to.equal(1); // active farmers
            expect(activeStats[1]).to.equal(1); // active processors
        });
    });

    describe("Bulk Operations", function () {
        it("Should return all stakeholders", async function () {
            const allStakeholders = await stakeholderRegistry.getAllStakeholders();
            expect(allStakeholders.length).to.equal(5);
            expect(allStakeholders).to.include(farmer1.address);
            expect(allStakeholders).to.include(processor1.address);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle requests for non-existent stakeholders", async function () {
            await expect(stakeholderRegistry.getStakeholderInfo(owner.address))
                .to.be.revertedWith("Not found");
        });

        it("Should return empty arrays for non-existent roles", async function () {
            // Use a valid role number that has no stakeholders
            try {
                const emptyRole = await stakeholderRegistry.getStakeholdersByRole(ROLE.SHIPPER);
                expect(emptyRole.length).to.equal(0);
            } catch (error) {
                // If function doesn't handle invalid roles, expect revert
                expect(error.message).to.include("revert");
            }
        });

        it("Should handle zero counts correctly", async function () {
            try {
                expect(await stakeholderRegistry.getStakeholderCountByRole(ROLE.SHIPPER)).to.equal(0);
            } catch (error) {
                // If function doesn't handle invalid roles, expect revert
                expect(error.message).to.include("revert");
            }
        });
    });

    describe("Access Control Integration", function () {
        it("Should correctly identify stakeholder roles", async function () {
            // Use the single-parameter version to avoid ambiguous function call
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer1.address)).to.equal(true);

            // Test role checking differently
            expect(await stakeholderRegistry.getStakeholderRole(farmer1.address)).to.equal(ROLE.FARMER);
            expect(await stakeholderRegistry.getStakeholderRole(processor1.address)).to.equal(ROLE.PROCESSOR);
        });

        it("Should handle inactive stakeholders properly", async function () {
            await stakeholderManager.connect(owner).deactivateStakeholder(farmer1.address);

            // Should still be registered but not active
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer1.address)).to.equal(true);
            expect(await stakeholderRegistry.isActiveStakeholder(farmer1.address)).to.equal(false);
        });
    });
});