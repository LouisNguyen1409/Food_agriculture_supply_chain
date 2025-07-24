const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { TestHelpers } = require("./helpers/testHelpers");

describe("Stakeholder Contract Tests", function () {
    let testHelpers;
    let stakeholder;
    let accounts;
    let deployer, stakeholderAddress, admin, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, unauthorized } = accounts);
        stakeholderAddress = accounts.farmer.address;

        // Deploy Stakeholder contract directly
        const Stakeholder = await ethers.getContractFactory("Stakeholder");
        stakeholder = await Stakeholder.deploy(
            stakeholderAddress,
            0, // FARMER role
            "Green Valley Farm",
            "FARM123",
            "California, USA",
            "Organic Certified, USDA Approved",
            admin.address
        );
        await stakeholder.waitForDeployment();
    });

    describe("Stakeholder Creation", function () {
        it("Should initialize with correct parameters", async function () {
            expect(await stakeholder.stakeholderAddress()).to.equal(stakeholderAddress);
            expect(await stakeholder.role()).to.equal(0); // FARMER
            expect(await stakeholder.businessName()).to.equal("Green Valley Farm");
            expect(await stakeholder.businessLicense()).to.equal("FARM123");
            expect(await stakeholder.location()).to.equal("California, USA");
            expect(await stakeholder.certifications()).to.equal("Organic Certified, USDA Approved");
            expect(await stakeholder.isActive()).to.be.true;
            expect(await stakeholder.admin()).to.equal(admin.address);
        });

        it("Should set correct timestamps", async function () {
            const registeredAt = await stakeholder.registeredAt();
            const lastActivity = await stakeholder.lastActivity();
            
            expect(registeredAt).to.be.greaterThan(0);
            expect(lastActivity).to.be.greaterThan(0);
            expect(lastActivity).to.equal(registeredAt);
        });

        it("Should reject invalid constructor parameters", async function () {
            const Stakeholder = await ethers.getContractFactory("Stakeholder");
            
            // Invalid stakeholder address
            await expect(
                Stakeholder.deploy(
                    ethers.ZeroAddress, 0, "Name", "License", "Location", "Certs", admin.address
                )
            ).to.be.revertedWith("Invalid stakeholder address");

            // Empty business name
            await expect(
                Stakeholder.deploy(
                    stakeholderAddress, 0, "", "License", "Location", "Certs", admin.address
                )
            ).to.be.revertedWith("Business name cannot be empty");

            // Empty business license
            await expect(
                Stakeholder.deploy(
                    stakeholderAddress, 0, "Name", "", "Location", "Certs", admin.address
                )
            ).to.be.revertedWith("Business license cannot be empty");
        });
    });

    describe("Information Updates", function () {
        it("Should allow admin to update information", async function () {
            await expect(
                stakeholder.connect(admin).updateInfo(
                    "Updated Green Valley Farm",
                    "Updated California, USA",
                    "Updated Organic Certified"
                )
            ).to.emit(stakeholder, "StakeholderUpdated")
            .withArgs(
                "Updated Green Valley Farm",
                "Updated California, USA", 
                "Updated Organic Certified",
                anyValue
            );

            expect(await stakeholder.businessName()).to.equal("Updated Green Valley Farm");
            expect(await stakeholder.location()).to.equal("Updated California, USA");
            expect(await stakeholder.certifications()).to.equal("Updated Organic Certified");
        });

        it("Should update lastActivity timestamp when updating info", async function () {
            const initialActivity = await stakeholder.lastActivity();
            
            // Wait a moment to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await stakeholder.connect(admin).updateInfo(
                "New Name", "New Location", "New Certs"
            );
            
            const newActivity = await stakeholder.lastActivity();
            expect(newActivity).to.be.greaterThan(initialActivity);
        });

        it("Should reject info update from non-admin", async function () {
            await expect(
                stakeholder.connect(unauthorized).updateInfo(
                    "Unauthorized Update", "Location", "Certs"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should reject info update from stakeholder address", async function () {
            await expect(
                stakeholder.connect(accounts.farmer).updateInfo(
                    "Self Update", "Location", "Certs"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should reject empty business name in update", async function () {
            await expect(
                stakeholder.connect(admin).updateInfo("", "Location", "Certs")
            ).to.be.revertedWith("Business name cannot be empty");
        });

        it("Should allow empty location and certifications", async function () {
            await expect(
                stakeholder.connect(admin).updateInfo("Valid Name", "", "")
            ).to.not.be.reverted;

            expect(await stakeholder.location()).to.equal("");
            expect(await stakeholder.certifications()).to.equal("");
        });
    });

    describe("Activation and Deactivation", function () {
        it("Should allow admin to deactivate stakeholder", async function () {
            expect(await stakeholder.isActive()).to.be.true;

            await expect(
                stakeholder.connect(admin).deactivate()
            ).to.emit(stakeholder, "StakeholderDeactivated")
            .withArgs(anyValue);

            expect(await stakeholder.isActive()).to.be.false;
        });

        it("Should allow admin to reactivate stakeholder", async function () {
            // First deactivate
            await stakeholder.connect(admin).deactivate();
            expect(await stakeholder.isActive()).to.be.false;

            // Then reactivate
            await expect(
                stakeholder.connect(admin).reactivate()
            ).to.emit(stakeholder, "StakeholderReactivated")
            .withArgs(anyValue);

            expect(await stakeholder.isActive()).to.be.true;
        });

        it("Should not allow deactivation of already inactive stakeholder", async function () {
            await stakeholder.connect(admin).deactivate();
            
            await expect(
                stakeholder.connect(admin).deactivate()
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should not allow reactivation of already active stakeholder", async function () {
            await expect(
                stakeholder.connect(admin).reactivate()
            ).to.be.revertedWith("Stakeholder is already active");
        });

        it("Should reject deactivation from non-admin", async function () {
            await expect(
                stakeholder.connect(unauthorized).deactivate()
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should reject reactivation from non-admin", async function () {
            await stakeholder.connect(admin).deactivate();
            
            await expect(
                stakeholder.connect(unauthorized).reactivate()
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should update lastActivity on deactivation and reactivation", async function () {
            const initialActivity = await stakeholder.lastActivity();
            
            await stakeholder.connect(admin).deactivate();
            const deactivateActivity = await stakeholder.lastActivity();
            expect(deactivateActivity).to.be.greaterThan(initialActivity);

            await stakeholder.connect(admin).reactivate();
            const reactivateActivity = await stakeholder.lastActivity();
            expect(reactivateActivity).to.be.greaterThan(deactivateActivity);
        });

        it("Should not allow info updates when inactive", async function () {
            await stakeholder.connect(admin).deactivate();
            
            await expect(
                stakeholder.connect(admin).updateInfo("Updated Name", "Location", "Certs")
            ).to.be.revertedWith("Stakeholder is not active");
        });
    });

    describe("Activity Management", function () {
        it("Should allow stakeholder to update their own activity", async function () {
            const initialActivity = await stakeholder.lastActivity();
            
            await stakeholder.connect(accounts.farmer).updateActivity();
            
            const newActivity = await stakeholder.lastActivity();
            expect(newActivity).to.be.greaterThan(initialActivity);
        });

        it("Should allow admin to update activity", async function () {
            const initialActivity = await stakeholder.lastActivity();
            
            await stakeholder.connect(admin).updateActivity();
            
            const newActivity = await stakeholder.lastActivity();
            expect(newActivity).to.be.greaterThan(initialActivity);
        });

        it("Should reject activity update from unauthorized user", async function () {
            await expect(
                stakeholder.connect(unauthorized).updateActivity()
            ).to.be.revertedWith("Only stakeholder or admin can update activity");
        });
    });

    describe("Role Management", function () {
        it("Should return true for correct role when active", async function () {
            expect(await stakeholder.hasRole(0)).to.be.true; // FARMER
            expect(await stakeholder.hasRole(1)).to.be.false; // PROCESSOR
            expect(await stakeholder.hasRole(2)).to.be.false; // RETAILER
            expect(await stakeholder.hasRole(3)).to.be.false; // DISTRIBUTOR
        });

        it("Should return false for any role when inactive", async function () {
            await stakeholder.connect(admin).deactivate();
            
            expect(await stakeholder.hasRole(0)).to.be.false; // Even correct role
            expect(await stakeholder.hasRole(1)).to.be.false;
            expect(await stakeholder.hasRole(2)).to.be.false;
            expect(await stakeholder.hasRole(3)).to.be.false;
        });

        it("Should test all stakeholder roles", async function () {
            // Test PROCESSOR
            const Stakeholder = await ethers.getContractFactory("Stakeholder");
            const processor = await Stakeholder.deploy(
                accounts.processor.address, 1, "Processor Co", "PROC123", "Location", "Certs", admin.address
            );
            expect(await processor.hasRole(1)).to.be.true;
            expect(await processor.hasRole(0)).to.be.false;

            // Test RETAILER
            const retailer = await Stakeholder.deploy(
                accounts.retailer.address, 2, "Retail Store", "RET123", "Location", "Certs", admin.address
            );
            expect(await retailer.hasRole(2)).to.be.true;
            expect(await retailer.hasRole(1)).to.be.false;

            // Test DISTRIBUTOR
            const distributor = await Stakeholder.deploy(
                accounts.distributor.address, 3, "Distribution Inc", "DIST123", "Location", "Certs", admin.address
            );
            expect(await distributor.hasRole(3)).to.be.true;
            expect(await distributor.hasRole(2)).to.be.false;
        });
    });

    describe("Information Retrieval", function () {
        it("Should return complete stakeholder information", async function () {
            const [
                addr, role, name, license, location, certs, active, registered, activity
            ] = await stakeholder.getStakeholderInfo();

            expect(addr).to.equal(stakeholderAddress);
            expect(role).to.equal(0); // FARMER
            expect(name).to.equal("Green Valley Farm");
            expect(license).to.equal("FARM123");
            expect(location).to.equal("California, USA");
            expect(certs).to.equal("Organic Certified, USDA Approved");
            expect(active).to.be.true;
            expect(registered).to.be.greaterThan(0);
            expect(activity).to.be.greaterThan(0);
        });

        it("Should return updated information after changes", async function () {
            await stakeholder.connect(admin).updateInfo("New Name", "New Location", "New Certs");
            await stakeholder.connect(admin).deactivate();

            const [,, name, , location, certs, active,,] = await stakeholder.getStakeholderInfo();

            expect(name).to.equal("New Name");
            expect(location).to.equal("New Location");
            expect(certs).to.equal("New Certs");
            expect(active).to.be.false;
        });

        it("Should return correct role strings", async function () {
            expect(await stakeholder.getRoleString()).to.equal("FARMER");

            // Test other roles
            const Stakeholder = await ethers.getContractFactory("Stakeholder");
            
            const processor = await Stakeholder.deploy(
                accounts.processor.address, 1, "Processor", "PROC123", "Location", "Certs", admin.address
            );
            expect(await processor.getRoleString()).to.equal("PROCESSOR");

            const retailer = await Stakeholder.deploy(
                accounts.retailer.address, 2, "Retailer", "RET123", "Location", "Certs", admin.address
            );
            expect(await retailer.getRoleString()).to.equal("RETAILER");

            const distributor = await Stakeholder.deploy(
                accounts.distributor.address, 3, "Distributor", "DIST123", "Location", "Certs", admin.address
            );
            expect(await distributor.getRoleString()).to.equal("DISTRIBUTOR");
        });
    });

    describe("Validation Functions", function () {
        it("Should validate stakeholder for operations when active and registered", async function () {
            // The isValidForOperations function requires block.timestamp > registeredAt
            // In test environment, this might be false if called immediately after creation
            // Let's advance time slightly to ensure validation passes
            await ethers.provider.send("evm_increaseTime", [1]);
            await ethers.provider.send("evm_mine");
            
            expect(await stakeholder.isValidForOperations()).to.be.true;
        });

        it("Should invalidate stakeholder for operations when inactive", async function () {
            await stakeholder.connect(admin).deactivate();
            expect(await stakeholder.isValidForOperations()).to.be.false;
        });

        it("Should validate operations based on registration time", async function () {
            // This test ensures the registration time check works
            const registered = await stakeholder.registeredAt();
            
            // Advance time to ensure block.timestamp > registeredAt
            await ethers.provider.send("evm_increaseTime", [2]);
            await ethers.provider.send("evm_mine");
            
            const latestBlock = await ethers.provider.getBlock("latest");
            const currentBlockTime = latestBlock.timestamp;
            
            // Should be valid as current block time is now greater than registration time
            expect(currentBlockTime).to.be.greaterThan(registered);
            expect(await stakeholder.isValidForOperations()).to.be.true;
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle very long business names", async function () {
            const longName = "A".repeat(1000);
            
            await expect(
                stakeholder.connect(admin).updateInfo(longName, "Location", "Certs")
            ).to.not.be.reverted;

            expect(await stakeholder.businessName()).to.equal(longName);
        });

        it("Should handle special characters in information", async function () {
            const specialChars = "!@#$%^&*()_+[]{}|;':\",./<>?`~";
            
            await expect(
                stakeholder.connect(admin).updateInfo(
                    `Farm ${specialChars}`,
                    `Location ${specialChars}`,
                    `Certs ${specialChars}`
                )
            ).to.not.be.reverted;

            expect(await stakeholder.businessName()).to.include(specialChars);
        });

        it("Should handle unicode characters", async function () {
            const unicode = "农场 🚜 Фермa";
            
            await expect(
                stakeholder.connect(admin).updateInfo(unicode, unicode, unicode)
            ).to.not.be.reverted;

            expect(await stakeholder.businessName()).to.equal(unicode);
        });

        it("Should maintain state consistency during multiple operations", async function () {
            // Perform multiple operations
            await stakeholder.connect(admin).updateInfo("Updated 1", "Loc 1", "Cert 1");
            await stakeholder.connect(admin).deactivate();
            await stakeholder.connect(admin).reactivate();
            await stakeholder.connect(admin).updateInfo("Updated 2", "Loc 2", "Cert 2");
            await stakeholder.connect(accounts.farmer).updateActivity();

            // Verify final state
            expect(await stakeholder.businessName()).to.equal("Updated 2");
            expect(await stakeholder.isActive()).to.be.true;
            expect(await stakeholder.hasRole(0)).to.be.true;
            expect(await stakeholder.isValidForOperations()).to.be.true;
        });
    });

    describe("Multiple Stakeholder Interaction", function () {
        let processor, retailer, distributor;

        beforeEach(async function () {
            const Stakeholder = await ethers.getContractFactory("Stakeholder");
            
            processor = await Stakeholder.deploy(
                accounts.processor.address, 1, "Processing Co", "PROC123", "Texas", "FDA Approved", admin.address
            );
            
            retailer = await Stakeholder.deploy(
                accounts.retailer.address, 2, "Retail Store", "RET123", "New York", "Quality Assured", admin.address
            );
            
            distributor = await Stakeholder.deploy(
                accounts.distributor.address, 3, "Distribution Inc", "DIST123", "California", "ISO Certified", admin.address
            );
        });

        it("Should maintain independent states for different stakeholders", async function () {
            // Deactivate only the farmer
            await stakeholder.connect(admin).deactivate();

            expect(await stakeholder.isActive()).to.be.false;
            expect(await processor.isActive()).to.be.true;
            expect(await retailer.isActive()).to.be.true;
            expect(await distributor.isActive()).to.be.true;
        });

        it("Should allow different roles to have different properties", async function () {
            expect(await stakeholder.hasRole(0)).to.be.true; // FARMER
            expect(await processor.hasRole(1)).to.be.true; // PROCESSOR
            expect(await retailer.hasRole(2)).to.be.true; // RETAILER
            expect(await distributor.hasRole(3)).to.be.true; // DISTRIBUTOR

            // Cross-check roles
            expect(await stakeholder.hasRole(1)).to.be.false;
            expect(await processor.hasRole(0)).to.be.false;
        });

        it("Should handle concurrent operations on different stakeholders", async function () {
            // Update all stakeholders concurrently
            await Promise.all([
                stakeholder.connect(admin).updateInfo("Farmer Updated", "CA", "Organic"),
                processor.connect(admin).updateInfo("Processor Updated", "TX", "FDA"),
                retailer.connect(admin).updateInfo("Retailer Updated", "NY", "Quality"),
                distributor.connect(admin).updateInfo("Distributor Updated", "CA", "ISO")
            ]);

            expect(await stakeholder.businessName()).to.equal("Farmer Updated");
            expect(await processor.businessName()).to.equal("Processor Updated");
            expect(await retailer.businessName()).to.equal("Retailer Updated");
            expect(await distributor.businessName()).to.equal("Distributor Updated");
        });
    });

    describe("Access Control Edge Cases", function () {
        it("Should maintain admin privileges after stakeholder updates", async function () {
            await stakeholder.connect(accounts.farmer).updateActivity();
            
            // Admin should still be able to update info
            await expect(
                stakeholder.connect(admin).updateInfo("Admin Update", "Location", "Certs")
            ).to.not.be.reverted;
        });

        it("Should prevent privilege escalation", async function () {
            // Stakeholder cannot perform admin functions
            await expect(
                stakeholder.connect(accounts.farmer).deactivate()
            ).to.be.revertedWith("Only admin can call this function");

            await expect(
                stakeholder.connect(accounts.farmer).updateInfo("Unauthorized", "Update", "Attempt")
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should handle admin address changes conceptually", async function () {
            // Note: This contract doesn't have admin transfer functionality,
            // but we can verify the current admin is correctly set
            expect(await stakeholder.admin()).to.equal(admin.address);
            
            // Only the set admin can perform admin functions
            await expect(
                stakeholder.connect(admin).deactivate()
            ).to.not.be.reverted;
        });
    });
});
