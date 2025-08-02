const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakeholderManager", function () {
    let stakeholderManager;
    let owner, admin, farmer, processor, distributor, retailer, user1;

    const ROLE = { FARMER: 1, PROCESSOR: 2, DISTRIBUTOR: 3, SHIPPER: 4, RETAILER: 5, ADMIN: 6 };

    beforeEach(async function () {
        [owner, admin, farmer, processor, distributor, retailer, user1] = await ethers.getSigners();

        // Deploy StakeholderManager (it inherits from AccessControl)
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();

        // Owner is automatically admin, so we can directly register stakeholders
    });

    describe("Deployment", function () {
        it("Should deploy successfully", async function () {
            expect(await stakeholderManager.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should set correct owner", async function () {
            expect(await stakeholderManager.owner()).to.equal(owner.address);
        });
    });

    describe("Admin Registration (Direct)", function () {
        it("Should register farmer successfully via admin", async function () {
            await expect(stakeholderManager.connect(owner).registerStakeholder(
                farmer.address,
                ROLE.FARMER,
                "John Farm",
                "LIC123456",
                "Costa Rica",
                "Organic certification"
            )).to.emit(stakeholderManager, "StakeholderRegistered")
              .withArgs(farmer.address, ROLE.FARMER, "John Farm", owner.address);

            const info = await stakeholderManager.getStakeholderInfo(farmer.address);
            expect(info.name).to.equal("John Farm");
            expect(info.role).to.equal(ROLE.FARMER);
            expect(info.active).to.equal(true);
        });

        it("Should register processor successfully", async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                processor.address,
                ROLE.PROCESSOR,
                "Processing Corp",
                "PROC789",
                "Mexico",
                "Food processing certification"
            );

            const info = await stakeholderManager.getStakeholderInfo(processor.address);
            expect(info.name).to.equal("Processing Corp");
            expect(info.role).to.equal(ROLE.PROCESSOR);
        });

        it("Should prevent duplicate registration", async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );

            await expect(stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm 2", "LIC456", "Costa Rica", "Cert"
            )).to.be.revertedWith("Already active");
        });

        it("Should reject invalid role", async function () {
            await expect(stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, 0, "Invalid", "LIC123", "Costa Rica", "Cert"
            )).to.be.revertedWith("Invalid role");
        });
    });

    describe("Registration Request Workflow", function () {
        it("Should submit registration request successfully", async function () {
            await expect(stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER,
                "John Farm",
                "LIC123456",
                "Costa Rica",
                "Organic certification",
                "Organic vegetable farming",
                "john@farm.com"
            )).to.emit(stakeholderManager, "RegistrationRequested");

            const userRequests = await stakeholderManager.getUserRequests(farmer.address);
            expect(userRequests.length).to.equal(1);
        });

        it("Should approve registration request successfully", async function () {
            // Submit request
            await stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER, "John Farm", "LIC123456", "Costa Rica",
                "Organic certification", "Organic farming", "john@farm.com"
            );

            // Approve request
            await expect(stakeholderManager.connect(owner).approveRegistrationRequest(
                1, "Approved - valid documentation"
            )).to.emit(stakeholderManager, "RegistrationReviewed");

            const info = await stakeholderManager.getStakeholderInfo(farmer.address);
            expect(info.name).to.equal("John Farm");
            expect(info.active).to.equal(true);
        });

        it("Should reject registration request", async function () {
            await stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER, "John Farm", "LIC123456", "Costa Rica",
                "Cert", "Business", "john@farm.com"
            );

            await expect(stakeholderManager.connect(owner).rejectRegistrationRequest(
                1, "Invalid documentation"
            )).to.emit(stakeholderManager, "RegistrationReviewed");

            // Should not be registered
            await expect(stakeholderManager.getStakeholderInfo(farmer.address))
                .to.be.revertedWith("Not found");
        });

        it("Should cancel registration request", async function () {
            await stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER, "John Farm", "LIC123456", "Costa Rica",
                "Cert", "Business", "john@farm.com"
            );

            await expect(stakeholderManager.connect(farmer).cancelRegistrationRequest(1))
                .to.emit(stakeholderManager, "RegistrationCancelled");
        });
    });

    describe("License Key Management", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );
        });

        it("Should return license key for registered stakeholder", async function () {
            const licenseKey = await stakeholderManager.connect(farmer).getMyLicenseKey();
            expect(licenseKey).to.include("SC-"); // Should start with "SC-"
        });

        it("Should verify license key successfully", async function () {
            const licenseKey = await stakeholderManager.connect(farmer).getMyLicenseKey();

            // The function returns a tuple, not an object with named properties
            const result = await stakeholderManager.verifyLicenseKey(licenseKey);
            console.log("Verify result:", result);
            expect(result[0]).to.equal(true); // isValid
            expect(result[1]).to.equal(farmer.address); // stakeholder
            expect(result[2]).to.equal(ROLE.FARMER); // role
        });

        it("Should regenerate license key", async function () {
            const oldKey = await stakeholderManager.connect(farmer).getMyLicenseKey();

            await expect(stakeholderManager.connect(owner).regenerateLicenseKey(farmer.address))
                .to.emit(stakeholderManager, "LicenseKeyGenerated");

            const newKey = await stakeholderManager.connect(farmer).getMyLicenseKey();
            expect(newKey).to.not.equal(oldKey);
        });
    });

    describe("Partnership Management", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );
            await stakeholderManager.connect(owner).registerStakeholder(
                processor.address, ROLE.PROCESSOR, "Processing Corp", "PROC789", "Mexico", "Cert"
            );
        });

        it("Should set partnership successfully", async function () {
            await expect(stakeholderManager.connect(owner).setPartnership(
                farmer.address, processor.address, true
            )).to.emit(stakeholderManager, "PartnershipUpdated");

            const isAuthorized = await stakeholderManager.isPartnershipAuthorized(
                farmer.address, processor.address
            );
            expect(isAuthorized).to.equal(true);
        });

        it("Should check transaction capability", async function () {
            // Farmer -> Processor should be allowed by default
            const canTransact = await stakeholderManager.canTransact(farmer.address, processor.address);
            expect(canTransact).to.equal(true);
        });
    });

    describe("Stakeholder Lifecycle", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );
        });

        it("Should deactivate stakeholder", async function () {
            await expect(stakeholderManager.connect(owner).deactivateStakeholder(farmer.address))
                .to.emit(stakeholderManager, "StakeholderDeactivated");

            const info = await stakeholderManager.getStakeholderInfo(farmer.address);
            expect(info.active).to.equal(false);
        });

        it("Should reactivate stakeholder", async function () {
            await stakeholderManager.connect(owner).deactivateStakeholder(farmer.address);

            await expect(stakeholderManager.connect(owner).reactivateStakeholder(farmer.address))
                .to.emit(stakeholderManager, "StakeholderReactivated");

            const info = await stakeholderManager.getStakeholderInfo(farmer.address);
            expect(info.active).to.equal(true);
        });

        it("Should blacklist address", async function () {
            await stakeholderManager.connect(owner).blacklistAddress(user1.address, true);

            await expect(stakeholderManager.connect(user1).submitRegistrationRequest(
                ROLE.FARMER, "Blacklisted", "LIC123", "Location",
                "Cert", "Business", "email@test.com"
            )).to.be.revertedWith("Blacklisted");
        });
    });

    describe("Statistics and Queries", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );
            await stakeholderManager.connect(owner).registerStakeholder(
                processor.address, ROLE.PROCESSOR, "Processing Corp", "PROC789", "Mexico", "Cert"
            );
        });

        it("Should return correct total count", async function () {
            expect(await stakeholderManager.getTotalStakeholders()).to.equal(2);
        });

        it("Should check registration status", async function () {
            expect(await stakeholderManager.isRegistered(farmer.address)).to.equal(true);
            expect(await stakeholderManager.isRegistered(user1.address)).to.equal(false);
        });

        it("Should return role statistics", async function () {
            const stats = await stakeholderManager.getRoleStatistics();
            expect(stats.totalFarmers).to.equal(1);
            expect(stats.totalProcessors).to.equal(1);
            expect(stats.totalDistributors).to.equal(0);
        });

        it("Should return stakeholders by role", async function () {
            const farmers = await stakeholderManager.getStakeholdersByRole(ROLE.FARMER);
            expect(farmers.length).to.equal(1);
            expect(farmers[0]).to.equal(farmer.address);
        });

        it("Should return all stakeholders", async function () {
            const allStakeholders = await stakeholderManager.getAllStakeholders();
            expect(allStakeholders.length).to.equal(2);
            expect(allStakeholders).to.include(farmer.address);
            expect(allStakeholders).to.include(processor.address);
        });
    });

    describe("Access Control", function () {
        it("Should only allow admin to register stakeholders directly", async function () {
            await expect(stakeholderManager.connect(farmer).registerStakeholder(
                processor.address, ROLE.PROCESSOR, "Unauthorized", "LIC123", "Location", "Cert"
            )).to.be.reverted;
        });

        it("Should only allow admin to approve requests", async function () {
            await stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER, "John Farm", "LIC123", "Costa Rica",
                "Cert", "Business", "john@farm.com"
            );

            await expect(stakeholderManager.connect(farmer).approveRegistrationRequest(
                1, "Self approval attempt"
            )).to.be.reverted;
        });

        it("Should allow stakeholder to get own license key", async function () {
            await stakeholderManager.connect(owner).registerStakeholder(
                farmer.address, ROLE.FARMER, "John Farm", "LIC123", "Costa Rica", "Cert"
            );

            const licenseKey = await stakeholderManager.connect(farmer).getMyLicenseKey();
            expect(licenseKey).to.include("SC-");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle empty registration data", async function () {
            await expect(stakeholderManager.connect(farmer).submitRegistrationRequest(
                ROLE.FARMER, "", "", "", "", "", ""
            )).to.be.revertedWith("Name required");
        });

        it("Should handle invalid request ID", async function () {
            await expect(stakeholderManager.connect(owner).approveRegistrationRequest(
                999, "Non-existent request"
            )).to.be.revertedWith("Request missing");
        });

        it("Should handle non-registered stakeholder info request", async function () {
            await expect(stakeholderManager.getStakeholderInfo(user1.address))
                .to.be.revertedWith("Not found");
        });
    });
});