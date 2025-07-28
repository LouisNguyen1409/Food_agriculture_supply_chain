const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("StakeholderManager Contract Tests", function () {
    let stakeholderManager;
    let admin, farmer, processor, distributor, retailer, unauthorized;
    let accounts;

    beforeEach(async function () {
        // Get test accounts
        accounts = await ethers.getSigners();
        [admin, farmer, processor, distributor, retailer, unauthorized] = accounts;

        // Deploy StakeholderManager
        const StakeholderManager = await ethers.getContractFactory("StakeholderManager");
        stakeholderManager = await StakeholderManager.deploy();
        await stakeholderManager.waitForDeployment();
    });

    describe("Contract Deployment", function () {
        it("Should deploy with correct admin", async function () {
            expect(await stakeholderManager.admin()).to.equal(admin.address);
        });

        it("Should initialize with zero total stakeholders", async function () {
            expect(await stakeholderManager.totalStakeholders()).to.equal(0);
        });

        it("Should have valid contract address", async function () {
            expect(await stakeholderManager.getAddress()).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Stakeholder Registration", function () {
        it("Should allow admin to register a farmer", async function () {
            const tx = await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1, // FARMER
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await expect(tx)
                .to.emit(stakeholderManager, "StakeholderRegistered")
                .withArgs(
                    farmer.address,
                    1,
                    "Green Valley Farm",
                    "FARM123",
                    anyValue // timestamp
                );

            expect(await stakeholderManager.isRegistered(farmer.address)).to.be.true;
            expect(await stakeholderManager.totalStakeholders()).to.equal(1);
        });

        it("Should register all stakeholder types correctly", async function () {
            // Register farmer
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1, // FARMER
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            // Register processor
            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2, // PROCESSOR
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );

            // Register retailer
            await stakeholderManager.connect(admin).registerStakeholder(
                retailer.address,
                3, // RETAILER
                "Fresh Market",
                "RET789",
                "New York, USA",
                "Quality Assured"
            );

            // Register distributor
            await stakeholderManager.connect(admin).registerStakeholder(
                distributor.address,
                4, // DISTRIBUTOR
                "Supply Chain Inc",
                "DIST101",
                "Los Angeles, USA",
                "ISO 9001 Certified"
            );

            expect(await stakeholderManager.totalStakeholders()).to.equal(4);
            expect(await stakeholderManager.isRegistered(farmer.address)).to.be.true;
            expect(await stakeholderManager.isRegistered(processor.address)).to.be.true;
            expect(await stakeholderManager.isRegistered(retailer.address)).to.be.true;
            expect(await stakeholderManager.isRegistered(distributor.address)).to.be.true;
        });

        it("Should reject registration from non-admin", async function () {
            await expect(
                stakeholderManager.connect(farmer).registerStakeholder(
                    processor.address,
                    2,
                    "Unauthorized Farm",
                    "UNAUTH123",
                    "Nowhere",
                    "None"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should prevent duplicate address registration", async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await expect(
                stakeholderManager.connect(admin).registerStakeholder(
                    farmer.address,
                    2,
                    "Another Business",
                    "FARM456",
                    "Texas, USA",
                    "Different Cert"
                )
            ).to.be.revertedWith("Already registered");
        });

        it("Should prevent duplicate license registration", async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await expect(
                stakeholderManager.connect(admin).registerStakeholder(
                    processor.address,
                    2,
                    "Processing Co",
                    "FARM123", // Same license
                    "Texas, USA",
                    "FDA Approved"
                )
            ).to.be.revertedWith("License already exists");
        });

        it("Should reject registration with empty business name", async function () {
            await expect(
                stakeholderManager.connect(admin).registerStakeholder(
                    farmer.address,
                    1,
                    "", // Empty business name
                    "FARM123",
                    "California, USA",
                    "Organic Certified"
                )
            ).to.be.revertedWith("Business name required");
        });

        it("Should reject registration with empty license", async function () {
            await expect(
                stakeholderManager.connect(admin).registerStakeholder(
                    farmer.address,
                    1,
                    "Green Valley Farm",
                    "", // Empty license
                    "California, USA",
                    "Organic Certified"
                )
            ).to.be.revertedWith("Business license required");
        });

        it("Should reject registration with zero address", async function () {
            await expect(
                stakeholderManager.connect(admin).registerStakeholder(
                    ethers.ZeroAddress,
                    1,
                    "Green Valley Farm",
                    "FARM123",
                    "California, USA",
                    "Organic Certified"
                )
            ).to.be.revertedWith("Invalid address");
        });
    });

    describe("Stakeholder Information Management", function () {
        beforeEach(async function () {
            // Register test stakeholders
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2,
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );
        });

        it("Should allow admin to get stakeholder info", async function () {
            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            
            expect(info.stakeholderAddress).to.equal(farmer.address);
            expect(info.role).to.equal(1); // FARMER
            expect(info.businessName).to.equal("Green Valley Farm");
            expect(info.businessLicense).to.equal("FARM123");
            expect(info.location).to.equal("California, USA");
            expect(info.certifications).to.equal("Organic Certified");
            expect(info.isActive).to.be.true;
            expect(info.registeredAt).to.be.greaterThan(0);
            expect(info.lastActivity).to.be.greaterThan(0);
        });

        it("Should allow registered stakeholder to view other stakeholders", async function () {
            const info = await stakeholderManager.connect(farmer).getStakeholderInfo(processor.address);
            
            expect(info.stakeholderAddress).to.equal(processor.address);
            expect(info.role).to.equal(2); // PROCESSOR
            expect(info.businessName).to.equal("Fresh Processing Co");
        });

        it("Should reject info access from unregistered user", async function () {
            await expect(
                stakeholderManager.connect(unauthorized).getStakeholderInfo(farmer.address)
            ).to.be.revertedWith("Permission denied");
        });

        it("Should reject info access for non-existent stakeholder", async function () {
            await expect(
                stakeholderManager.connect(admin).getStakeholderInfo(unauthorized.address)
            ).to.be.revertedWith("Stakeholder does not exist");
        });
    });

    describe("Stakeholder Information Updates", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );
        });

        it("Should allow admin to update stakeholder info", async function () {
            const tx = await stakeholderManager.connect(admin).updateStakeholderInfo(
                farmer.address,
                "Updated Green Valley Farm",
                "Updated California, USA",
                "Updated Organic Certified"
            );

            await expect(tx)
                .to.emit(stakeholderManager, "StakeholderUpdated")
                .withArgs(
                    farmer.address,
                    "Updated Green Valley Farm",
                    "Updated California, USA",
                    "Updated Organic Certified",
                    anyValue
                );

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("Updated Green Valley Farm");
            expect(info.location).to.equal("Updated California, USA");
            expect(info.certifications).to.equal("Updated Organic Certified");
        });

        it("Should allow stakeholder to update their own info", async function () {
            await stakeholderManager.connect(farmer).updateStakeholderInfo(
                farmer.address,
                "Self Updated Farm",
                "Self Updated Location",
                "Self Updated Certifications"
            );

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("Self Updated Farm");
        });

        it("Should reject update from unauthorized user", async function () {
            await expect(
                stakeholderManager.connect(processor).updateStakeholderInfo(
                    farmer.address,
                    "Unauthorized Update",
                    "Unauthorized Location",
                    "Unauthorized Cert"
                )
            ).to.be.revertedWith("Unauthorized to update");
        });

        it("Should reject update with empty business name", async function () {
            await expect(
                stakeholderManager.connect(admin).updateStakeholderInfo(
                    farmer.address,
                    "", // Empty name
                    "Updated Location",
                    "Updated Cert"
                )
            ).to.be.revertedWith("Business name required");
        });
    });

    describe("Stakeholder Activation/Deactivation", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );
        });

        it("Should allow admin to deactivate stakeholder", async function () {
            const tx = await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);

            await expect(tx)
                .to.emit(stakeholderManager, "StakeholderDeactivated")
                .withArgs(farmer.address, anyValue);

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.false;
        });

        it("Should allow admin to reactivate stakeholder", async function () {
            await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);
            
            const tx = await stakeholderManager.connect(admin).reactivateStakeholder(farmer.address);

            await expect(tx)
                .to.emit(stakeholderManager, "StakeholderReactivated")
                .withArgs(farmer.address, anyValue);

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.true;
        });

        it("Should reject deactivation from non-admin", async function () {
            await expect(
                stakeholderManager.connect(farmer).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should reject deactivation of already inactive stakeholder", async function () {
            await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);
            
            await expect(
                stakeholderManager.connect(admin).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Already inactive");
        });

        it("Should reject reactivation of already active stakeholder", async function () {
            await expect(
                stakeholderManager.connect(admin).reactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Already active");
        });
    });

    describe("Role-based Queries", function () {
        beforeEach(async function () {
            // Register multiple stakeholders
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1, // FARMER
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2, // PROCESSOR
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                retailer.address,
                3, // RETAILER
                "Fresh Market",
                "RET789",
                "New York, USA",
                "Quality Assured"
            );
        });

        it("Should check stakeholder roles correctly", async function () {
            expect(await stakeholderManager.hasRole(farmer.address, 1)).to.be.true; // FARMER
            expect(await stakeholderManager.hasRole(processor.address, 2)).to.be.true; // PROCESSOR
            expect(await stakeholderManager.hasRole(retailer.address, 3)).to.be.true; // RETAILER
            
            expect(await stakeholderManager.hasRole(farmer.address, 2)).to.be.false; // Wrong role
            expect(await stakeholderManager.hasRole(unauthorized.address, 1)).to.be.false; // Not registered
        });

        it("Should return stakeholders by role for admin", async function () {
            const farmers = await stakeholderManager.connect(admin).getStakeholdersByRole(1);
            const processors = await stakeholderManager.connect(admin).getStakeholdersByRole(2);
            const retailers = await stakeholderManager.connect(admin).getStakeholdersByRole(3);

            expect(farmers).to.include(farmer.address);
            expect(farmers.length).to.equal(1);
            
            expect(processors).to.include(processor.address);
            expect(processors.length).to.equal(1);
            
            expect(retailers).to.include(retailer.address);
            expect(retailers.length).to.equal(1);
        });

        it("Should return stakeholders by role for registered users", async function () {
            const farmers = await stakeholderManager.connect(farmer).getStakeholdersByRole(1);
            expect(farmers).to.include(farmer.address);
        });

        it("Should return empty array for unauthorized users", async function () {
            const farmers = await stakeholderManager.connect(unauthorized).getStakeholdersByRole(1);
            expect(farmers.length).to.equal(0);
        });

        it("Should not include inactive stakeholders in role queries", async function () {
            await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);
            
            const farmers = await stakeholderManager.connect(admin).getStakeholdersByRole(1);
            expect(farmers).to.not.include(farmer.address);
        });
    });

    describe("Business Name Search", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2,
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                retailer.address,
                3,
                "Fresh Market",
                "RET789",
                "New York, USA",
                "Quality Assured"
            );
        });

        it("Should find stakeholders by partial business name for admin", async function () {
            const freshResults = await stakeholderManager.connect(admin).searchByBusinessName("Fresh");
            expect(freshResults.length).to.equal(2);
            expect(freshResults).to.include(processor.address);
            expect(freshResults).to.include(retailer.address);

            const farmResults = await stakeholderManager.connect(admin).searchByBusinessName("Farm");
            expect(farmResults.length).to.equal(1);
            expect(farmResults).to.include(farmer.address);
        });

        it("Should find stakeholders by partial business name for registered users", async function () {
            const results = await stakeholderManager.connect(farmer).searchByBusinessName("Fresh");
            expect(results.length).to.equal(2);
        });

        it("Should return empty results for unauthorized users", async function () {
            const results = await stakeholderManager.connect(unauthorized).searchByBusinessName("Fresh");
            expect(results.length).to.equal(0);
        });

        it("Should be case sensitive", async function () {
            const results = await stakeholderManager.connect(admin).searchByBusinessName("fresh");
            expect(results.length).to.equal(0);
        });

        it("Should not include inactive stakeholders in search", async function () {
            await stakeholderManager.connect(admin).deactivateStakeholder(processor.address);
            
            const results = await stakeholderManager.connect(admin).searchByBusinessName("Fresh");
            expect(results.length).to.equal(1);
            expect(results).to.include(retailer.address);
            expect(results).to.not.include(processor.address);
        });
    });

    describe("Batch Operations", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2,
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );
        });

        it("Should get batch stakeholder info for admin", async function () {
            const addresses = [farmer.address, processor.address];
            const results = await stakeholderManager.connect(admin).getBatchStakeholderInfo(addresses);
            
            expect(results.length).to.equal(2);
            expect(results[0].stakeholderAddress).to.equal(farmer.address);
            expect(results[1].stakeholderAddress).to.equal(processor.address);
        });

        it("Should get batch stakeholder info for registered users", async function () {
            const addresses = [farmer.address, processor.address];
            const results = await stakeholderManager.connect(farmer).getBatchStakeholderInfo(addresses);
            
            expect(results.length).to.equal(2);
            expect(results[0].stakeholderAddress).to.equal(farmer.address);
            expect(results[1].stakeholderAddress).to.equal(processor.address);
        });

        it("Should return empty structs for unauthorized access in batch", async function () {
            const addresses = [farmer.address, processor.address];
            const results = await stakeholderManager.connect(unauthorized).getBatchStakeholderInfo(addresses);
            
            expect(results.length).to.equal(2);
            expect(results[0].stakeholderAddress).to.equal(ethers.ZeroAddress);
            expect(results[1].stakeholderAddress).to.equal(ethers.ZeroAddress);
        });
    });

    describe("Viewable Stakeholders", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2,
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );
        });

        it("Should return all viewable stakeholders for admin", async function () {
            const viewable = await stakeholderManager.connect(admin).getAllViewableStakeholders();
            expect(viewable.length).to.equal(2);
            expect(viewable).to.include(farmer.address);
            expect(viewable).to.include(processor.address);
        });

        it("Should return all viewable stakeholders for registered users", async function () {
            const viewable = await stakeholderManager.connect(farmer).getAllViewableStakeholders();
            expect(viewable.length).to.equal(2);
        });

        it("Should return empty array for unauthorized users", async function () {
            const viewable = await stakeholderManager.connect(unauthorized).getAllViewableStakeholders();
            expect(viewable.length).to.equal(0);
        });

        it("Should not include inactive stakeholders", async function () {
            await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);
            
            const viewable = await stakeholderManager.connect(admin).getAllViewableStakeholders();
            expect(viewable.length).to.equal(1);
            expect(viewable).to.include(processor.address);
            expect(viewable).to.not.include(farmer.address);
        });
    });

    describe("Activity Management", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );
        });

        it("Should allow registered stakeholder to update activity", async function () {
            const infoBefore = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            const initialActivity = infoBefore.lastActivity;

            // Wait a moment and update activity
            await new Promise(resolve => setTimeout(resolve, 1000));
            await stakeholderManager.connect(farmer).updateActivity();

            const infoAfter = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(infoAfter.lastActivity).to.be.greaterThan(initialActivity);
        });

        it("Should reject activity update from unregistered user", async function () {
            await expect(
                stakeholderManager.connect(unauthorized).updateActivity()
            ).to.be.revertedWith("Not a registered stakeholder");
        });
    });

    describe("Utility Functions", function () {
        beforeEach(async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            await stakeholderManager.connect(admin).registerStakeholder(
                processor.address,
                2,
                "Fresh Processing Co",
                "PROC456",
                "Texas, USA",
                "FDA Approved"
            );
        });

        it("Should return license to address mapping", async function () {
            expect(await stakeholderManager.licenseToAddress("FARM123")).to.equal(farmer.address);
            expect(await stakeholderManager.licenseToAddress("PROC456")).to.equal(processor.address);
            expect(await stakeholderManager.licenseToAddress("NONEXISTENT")).to.equal(ethers.ZeroAddress);
        });

        it("Should return all stakeholder roles", async function () {
            const roles = await stakeholderManager.getAllStakeholdersRoles();
            expect(roles.length).to.equal(2);
            expect(roles[0]).to.equal(1); // FARMER
            expect(roles[1]).to.equal(2); // PROCESSOR
        });

        it("Should access public stakeholder data correctly", async function () {
            const stakeholderData = await stakeholderManager.stakeholders(farmer.address);
            expect(stakeholderData.stakeholderAddress).to.equal(farmer.address);
            expect(stakeholderData.role).to.equal(1);
            expect(stakeholderData.businessName).to.equal("Green Valley Farm");
        });

        it("Should access public allStakeholders array", async function () {
            expect(await stakeholderManager.allStakeholders(0)).to.equal(farmer.address);
            expect(await stakeholderManager.allStakeholders(1)).to.equal(processor.address);
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle empty search strings", async function () {
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            const results = await stakeholderManager.connect(admin).searchByBusinessName("");
            expect(results.length).to.equal(1); // Empty string matches everything
        });

        it("Should handle very long strings", async function () {
            const longName = "A".repeat(1000);
            const longLicense = "B".repeat(100);
            const longLocation = "C".repeat(500);
            const longCert = "D".repeat(500);

            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                longName,
                longLicense,
                longLocation,
                longCert
            );

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal(longName);
        });

        it("Should handle special characters in strings", async function () {
            const specialName = "Farm & Co. (Organic) 100%";
            const specialLicense = "FARM-123_ABC.DEF";

            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                specialName,
                specialLicense,
                "Location, State",
                "Cert #123"
            );

            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal(specialName);
            expect(info.businessLicense).to.equal(specialLicense);
        });

        it("Should maintain consistent state across multiple operations", async function () {
            // Register stakeholder
            await stakeholderManager.connect(admin).registerStakeholder(
                farmer.address,
                1,
                "Green Valley Farm",
                "FARM123",
                "California, USA",
                "Organic Certified"
            );

            // Update info
            await stakeholderManager.connect(admin).updateStakeholderInfo(
                farmer.address,
                "Updated Farm Name",
                "Updated Location",
                "Updated Cert"
            );

            // Deactivate and reactivate
            await stakeholderManager.connect(admin).deactivateStakeholder(farmer.address);
            await stakeholderManager.connect(admin).reactivateStakeholder(farmer.address);

            // Verify final state
            const info = await stakeholderManager.connect(admin).getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("Updated Farm Name");
            expect(info.isActive).to.be.true;
            expect(await stakeholderManager.totalStakeholders()).to.equal(1);
        });
    });
});
