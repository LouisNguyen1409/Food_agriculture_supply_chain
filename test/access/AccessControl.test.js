const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AccessControl", function () {
    let accessControl;
    let owner, admin, farmer, processor, user1, user2;

    beforeEach(async function () {
        [owner, admin, farmer, processor, user1, user2] = await ethers.getSigners();

        const AccessControl = await ethers.getContractFactory("AccessControl");
        accessControl = await AccessControl.deploy();
        await accessControl.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the deployer as owner", async function () {
            expect(await accessControl.owner()).to.equal(owner.address);
        });

        it("Should have correct initial state", async function () {
            expect(await accessControl.getRole(owner.address)).to.equal(6); // ADMIN
            expect(await accessControl.isActive(owner.address)).to.equal(true);
        });
    });

    describe("Role Management", function () {
        it("Admin can grant and overwrite roles", async function () {
            await expect(accessControl.connect(owner).grantRole(admin.address, 6))
                .to.emit(accessControl, "RoleGranted")
                .withArgs(admin.address, 6);
            expect(await accessControl.getRole(admin.address)).to.equal(6);
            expect(await accessControl.hasRole(admin.address, 6)).to.equal(true);

            await accessControl.connect(owner).grantRole(user1.address, 1); // FARMER
            expect(await accessControl.getRole(user1.address)).to.equal(1);
            await accessControl.connect(owner).grantRole(user1.address, 2); // switch to PROCESSOR
            expect(await accessControl.getRole(user1.address)).to.equal(2);
        });

        it("Non-admin cannot grant roles", async function () {
            await expect(accessControl.connect(user1).grantRole(farmer.address, 1))
                .to.be.revertedWith("AccessControl: admin role required");
        });

        it("Admin can revoke roles", async function () {
            await accessControl.connect(owner).grantRole(farmer.address, 1);
            await expect(accessControl.connect(owner).revokeRole(farmer.address))
                .to.emit(accessControl, "RoleRevoked");
            expect(await accessControl.getRole(farmer.address)).to.equal(0);
            expect(await accessControl.hasRole(farmer.address, 1)).to.equal(false);
        });

        it("Non-admin cannot revoke roles", async function () {
            await accessControl.connect(owner).grantRole(farmer.address, 1);
            await expect(accessControl.connect(user1).revokeRole(farmer.address))
                .to.be.revertedWith("AccessControl: admin role required");
        });

        it("Role.NONE is not active", async function () {
            expect(await accessControl.getRole(user2.address)).to.equal(0);
            expect(await accessControl.hasRole(user2.address, 0)).to.equal(false);
            expect(await accessControl.isActive(user2.address)).to.equal(false);
        });
    });

    describe("Account Status Management", function () {
        beforeEach(async function () {
            await accessControl.connect(owner).grantRole(farmer.address, 1);
            await accessControl.connect(owner).grantRole(admin.address, 6);
        });

        it("Owner can activate account", async function () {
            await accessControl.connect(owner).deactivateAccount(farmer.address);
            expect(await accessControl.isActive(farmer.address)).to.equal(false);
            await accessControl.connect(owner).activateAccount(farmer.address);
            expect(await accessControl.isActive(farmer.address)).to.equal(true);
        });

        it("Non-owner cannot activate account", async function () {
            await expect(accessControl.connect(user1).activateAccount(farmer.address))
                .to.be.revertedWith("AccessControl: caller is not owner");
        });

        it("Admin can deactivate and reactivate (via reactivateAccount)", async function () {
            await accessControl.connect(admin).deactivateAccount(farmer.address);
            expect(await accessControl.isActive(farmer.address)).to.equal(false);
            await accessControl.connect(admin).reactivateAccount(farmer.address);
            expect(await accessControl.isActive(farmer.address)).to.equal(true);
        });

        it("Non-admin cannot deactivate/reactivate", async function () {
            await expect(accessControl.connect(user1).deactivateAccount(farmer.address))
                .to.be.revertedWith("AccessControl: admin role required");
            await expect(accessControl.connect(user1).reactivateAccount(farmer.address))
                .to.be.revertedWith("AccessControl: admin role required");
        });
    });

    describe("Modifiers and Authorization", function () {
        beforeEach(async function () {
            await accessControl.connect(owner).grantRole(farmer.address, 1);
            await accessControl.connect(owner).grantRole(processor.address, 2);
        });

        it("onlyActiveStakeholder implies has role and active", async function () {
            expect(await accessControl.isActive(farmer.address)).to.equal(true);
        });

        it("isAuthorizedToTrade allows valid pairs", async function () {
            expect(await accessControl.isAuthorizedToTrade(farmer.address, processor.address)).to.equal(true);
        });

        it("Rejects invalid pairs", async function () {
            await accessControl.connect(owner).grantRole(user1.address, 1);
            expect(await accessControl.isAuthorizedToTrade(farmer.address, user1.address)).to.equal(false);
        });

        it("Rejects trades involving inactive accounts", async function () {
            await accessControl.connect(owner).grantRole(admin.address, 6);
            await accessControl.connect(admin).deactivateAccount(processor.address);
            expect(await accessControl.isAuthorizedToTrade(farmer.address, processor.address)).to.equal(false);
        });
    });

    describe("Edge Cases", function () {
        it("Zero address role and active checks", async function () {
            expect(await accessControl.getRole(ethers.ZeroAddress)).to.equal(0);
            expect(await accessControl.isActive(ethers.ZeroAddress)).to.equal(false);
        });

        it("Ownership transfer works", async function () {
            await accessControl.connect(owner).transferOwnership(user1.address);
            expect(await accessControl.owner()).to.equal(user1.address);
        });
    });
});
