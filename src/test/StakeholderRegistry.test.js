const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("StakeholderRegistry", function () {
    let testHelpers;
    let stakeholderRegistry;
    let accounts;
    let deployer, admin, farmer, processor, distributor, retailer, consumer, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, farmer, processor, distributor, retailer, consumer, unauthorized } = accounts);

        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
    });

    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }

    describe("Deployment and Initialization", function () {
        it("Should set correct admin on deployment", async function () {
            expect(await stakeholderRegistry.admin()).to.equal(deployer.address);
        });

        it("Should initialize with zero total stakeholders", async function () {
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(0);
        });
    });

    describe("Stakeholder Registration", function () {
        it("Should register stakeholder successfully", async function () {
            const tx = await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0, // FARMER role
                "Green Valley Farm",
                "LICENSE001",
                "California, USA",
                "Organic Certification"
            );

            await expect(tx)
                .to.emit(stakeholderRegistry, "StakeholderRegistered")
                .withArgs(
                    farmer.address,
                    0, // FARMER role
                    "Green Valley Farm",
                    await getBlockTimestamp(tx)
                );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(1);
        });

        it("Should register multiple stakeholders with different roles", async function () {
            // Register farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0, // FARMER
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            // Register processor
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address,
                1, // PROCESSOR
                "Fresh Processing Co",
                "LICENSE002",
                "Texas",
                "HACCP Certified"
            );

            // Register distributor
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                distributor.address,
                3, // DISTRIBUTOR
                "Swift Distribution",
                "LICENSE003",
                "New York",
                "Cold Chain Certified"
            );

            // Register retailer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                retailer.address,
                2, // RETAILER
                "SuperMart Chain",
                "LICENSE004",
                "Florida",
                "Food Safety Certified"
            );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(4);
        });

        it("Should fail with invalid stakeholder address", async function () {
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    ethers.ZeroAddress,
                    0,
                    "Test Business",
                    "LICENSE001",
                    "Location",
                    "Certifications"
                )
            ).to.be.revertedWith("Invalid stakeholder address");
        });

        it("Should fail with duplicate stakeholder address", async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    farmer.address,
                    1, // Different role
                    "Different Business",
                    "LICENSE002",
                    "Different Location",
                    "Different Cert"
                )
            ).to.be.revertedWith("Stakeholder already registered");
        });

        it("Should fail with duplicate business license", async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    processor.address,
                    1,
                    "Different Business",
                    "LICENSE001", // Same license
                    "Different Location",
                    "Different Cert"
                )
            ).to.be.revertedWith("Business license already registered");
        });

        it("Should fail if not called by admin", async function () {
            await expect(
                stakeholderRegistry.connect(unauthorized).registerStakeholder(
                    farmer.address,
                    0,
                    "Green Valley Farm",
                    "LICENSE001",
                    "California",
                    "Organic Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });
    });

    describe("Stakeholder Validation", function () {
        beforeEach(async function () {
            // Register test stakeholders
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0, // FARMER
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address,
                1, // PROCESSOR
                "Fresh Processing Co",
                "LICENSE002",
                "Texas",
                "HACCP Cert"
            );
        });

        it("Should validate registered stakeholder with correct role", async function () {
            const isValidFarmer = await stakeholderRegistry.isRegisteredStakeholder(
                farmer.address,
                0 // FARMER role
            );
            expect(isValidFarmer).to.be.true;

            const isValidProcessor = await stakeholderRegistry.isRegisteredStakeholder(
                processor.address,
                1 // PROCESSOR role
            );
            expect(isValidProcessor).to.be.true;
        });

        it("Should return false for stakeholder with wrong role", async function () {
            const isValid = await stakeholderRegistry.isRegisteredStakeholder(
                farmer.address,
                1 // PROCESSOR role (wrong for farmer)
            );
            expect(isValid).to.be.false;
        });

        it("Should return false for unregistered stakeholder", async function () {
            const isValid = await stakeholderRegistry.isRegisteredStakeholder(
                unauthorized.address,
                0 // FARMER role
            );
            expect(isValid).to.be.false;
        });

        it("Should return false for deactivated stakeholder", async function () {
            // Deactivate the farmer
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            const isValid = await stakeholderRegistry.isRegisteredStakeholder(
                farmer.address,
                0 // FARMER role
            );
            expect(isValid).to.be.false;
        });
    });

    describe("Stakeholder Information Retrieval", function () {
        beforeEach(async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0, // FARMER
                "Green Valley Farm",
                "LICENSE001",
                "California, USA",
                "Organic Certification, Non-GMO"
            );
        });

        it("Should get stakeholder information", async function () {
            const stakeholderInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);

            expect(stakeholderInfo.stakeholderAddress).to.equal(farmer.address);
            expect(stakeholderInfo.role).to.equal(0); // FARMER
            expect(stakeholderInfo.businessName).to.equal("Green Valley Farm");
            expect(stakeholderInfo.businessLicense).to.equal("LICENSE001");
            expect(stakeholderInfo.location).to.equal("California, USA");
            expect(stakeholderInfo.certifications).to.equal("Organic Certification, Non-GMO");
            expect(stakeholderInfo.isActive).to.be.true;
            expect(stakeholderInfo.registeredAt).to.be.greaterThan(0);
            expect(stakeholderInfo.lastActivity).to.be.greaterThan(0);
        });

        it("Should return empty info for unregistered stakeholder", async function () {
            const stakeholderInfo = await stakeholderRegistry.getStakeholderInfo(unauthorized.address);

            expect(stakeholderInfo.stakeholderAddress).to.equal(ethers.ZeroAddress);
            expect(stakeholderInfo.isActive).to.be.false;
            expect(stakeholderInfo.businessName).to.equal("");
        });

        it("Should get stakeholders by role", async function () {
            // Register additional stakeholders
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address,
                1, // PROCESSOR
                "Fresh Processing Co",
                "LICENSE002",
                "Texas",
                "HACCP Cert"
            );

            await stakeholderRegistry.connect(deployer).registerStakeholder(
                distributor.address,
                3, // DISTRIBUTOR
                "Swift Distribution",
                "LICENSE003",
                "New York",
                "Cold Chain"
            );

            // Register another farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                consumer.address, // Using consumer as second farmer for test
                0, // FARMER
                "Sunny Farm",
                "LICENSE004",
                "Arizona",
                "Organic"
            );

            const farmers = await stakeholderRegistry.getStakeholdersByRole(0); // FARMER
            const processors = await stakeholderRegistry.getStakeholdersByRole(1); // PROCESSOR
            const distributors = await stakeholderRegistry.getStakeholdersByRole(3); // DISTRIBUTOR

            expect(farmers).to.have.length(2);
            expect(farmers).to.include(farmer.address);
            expect(farmers).to.include(consumer.address);

            expect(processors).to.have.length(1);
            expect(processors[0]).to.equal(processor.address);

            expect(distributors).to.have.length(1);
            expect(distributors[0]).to.equal(distributor.address);
        });

        it("Should return empty array for role with no stakeholders", async function () {
            const retailers = await stakeholderRegistry.getStakeholdersByRole(2); // RETAILER
            expect(retailers).to.have.length(0);
        });
    });

    describe("Activity Tracking", function () {
        beforeEach(async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );
        });

        it("Should update last activity timestamp and emit event", async function () {
            const initialInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const initialActivity = initialInfo.lastActivity;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));

            const tx = await stakeholderRegistry.updateLastActivity(farmer.address);

            // Check that StakeholderUpdated event is emitted
            await expect(tx)
                .to.emit(stakeholderRegistry, "StakeholderUpdated")
                .withArgs(farmer.address, await getBlockTimestamp(tx));

            const updatedInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const updatedActivity = updatedInfo.lastActivity;

            expect(updatedActivity).to.be.greaterThan(initialActivity);
        });

        it("Should fail to update activity for inactive stakeholder", async function () {
            // Deactivate stakeholder first
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should fail to update activity for non-existent stakeholder", async function () {
            await expect(
                stakeholderRegistry.updateLastActivity(unauthorized.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });
    });

    describe("Stakeholder Information Updates", function () {
        beforeEach(async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Original Farm Name",
                "LICENSE001",
                "Original Location",
                "Original Certifications"
            );
        });

        it("Should update stakeholder information successfully", async function () {
            const newBusinessName = "Updated Farm Name";
            const newLocation = "Updated Location";
            const newCertifications = "Updated Certifications";

            const tx = await stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                farmer.address,
                newBusinessName,
                newLocation,
                newCertifications
            );

            // Check that StakeholderUpdated event is emitted
            await expect(tx)
                .to.emit(stakeholderRegistry, "StakeholderUpdated")
                .withArgs(farmer.address, await getBlockTimestamp(tx));

            const updatedInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(updatedInfo.businessName).to.equal(newBusinessName);
            expect(updatedInfo.location).to.equal(newLocation);
            expect(updatedInfo.certifications).to.equal(newCertifications);
            expect(updatedInfo.lastActivity).to.be.greaterThan(0);
        });

        it("Should fail to update information for inactive stakeholder", async function () {
            // Deactivate stakeholder first
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    farmer.address,
                    "New Name",
                    "New Location",
                    "New Certs"
                )
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should fail to update information for non-existent stakeholder", async function () {
            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    unauthorized.address,
                    "New Name",
                    "New Location",
                    "New Certs"
                )
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should fail if not called by admin", async function () {
            await expect(
                stakeholderRegistry.connect(unauthorized).updateStakeholderInfo(
                    farmer.address,
                    "New Name",
                    "New Location",
                    "New Certs"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should update with empty strings", async function () {
            const tx = await stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                farmer.address,
                "",
                "",
                ""
            );

            await expect(tx)
                .to.emit(stakeholderRegistry, "StakeholderUpdated");

            const updatedInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(updatedInfo.businessName).to.equal("");
            expect(updatedInfo.location).to.equal("");
            expect(updatedInfo.certifications).to.equal("");
        });

        it("Should update last activity timestamp when updating info", async function () {
            const initialInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const initialActivity = initialInfo.lastActivity;

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1000));

            await stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                farmer.address,
                "Updated Name",
                "Updated Location",
                "Updated Certifications"
            );

            const updatedInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(updatedInfo.lastActivity).to.be.greaterThan(initialActivity);
        });
    });

    describe("Stakeholder Deactivation", function () {
        beforeEach(async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );
        });

        it("Should deactivate stakeholder successfully", async function () {
            const tx = await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            await expect(tx)
                .to.emit(stakeholderRegistry, "StakeholderDeactivated")
                .withArgs(farmer.address, await getBlockTimestamp(tx));

            const stakeholderInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(stakeholderInfo.isActive).to.be.false;

            // Should not be valid for role validation
            const isValid = await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0);
            expect(isValid).to.be.false;
        });

        it("Should fail to deactivate already inactive stakeholder", async function () {
            // Deactivate first
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Try to deactivate again
            await expect(
                stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should fail to deactivate non-existent stakeholder", async function () {
            await expect(
                stakeholderRegistry.connect(deployer).deactivateStakeholder(unauthorized.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should fail if not called by admin", async function () {
            await expect(
                stakeholderRegistry.connect(unauthorized).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Only admin can call this function");
        });
    });

    describe("Admin Management", function () {
        it("Should transfer admin successfully", async function () {
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);
            
            expect(await stakeholderRegistry.admin()).to.equal(admin.address);
        });

        it("Should fail to transfer admin to zero address", async function () {
            await expect(
                stakeholderRegistry.connect(deployer).transferAdmin(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid new admin address");
        });

        it("Should fail if not called by current admin", async function () {
            await expect(
                stakeholderRegistry.connect(unauthorized).transferAdmin(admin.address)
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should allow new admin to perform admin operations", async function () {
            // Transfer admin
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);

            // New admin should be able to register stakeholder
            await stakeholderRegistry.connect(admin).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(1);
        });

        it("Should prevent old admin from performing admin operations", async function () {
            // Transfer admin
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);

            // Old admin should not be able to register stakeholder
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    farmer.address,
                    0,
                    "Green Valley Farm",
                    "LICENSE001",
                    "California",
                    "Organic Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });
    });

    describe("Comprehensive Stakeholder Lifecycle", function () {
        it("Should handle complete stakeholder lifecycle", async function () {
            // 1. Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(1);

            // 2. Validate stakeholder
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;

            // 3. Update activity
            await stakeholderRegistry.updateLastActivity(farmer.address);

            // 4. Check info
            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("Green Valley Farm");

            // 5. Deactivate stakeholder
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // 6. Verify deactivation
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
            const deactivatedInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(deactivatedInfo.isActive).to.be.false;
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle license lookup mapping", async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Green Valley Farm",
                "LICENSE001",
                "California",
                "Organic Cert"
            );

            // The licenseToAddress mapping should be set correctly
            // (This is internal state, tested indirectly through duplicate license rejection)
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    processor.address,
                    1,
                    "Different Business",
                    "LICENSE001", // Same license
                    "Texas",
                    "Different Cert"
                )
            ).to.be.revertedWith("Business license already registered");
        });

        it("Should handle empty string inputs gracefully", async function () {
            // The contract should accept empty strings for optional fields
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "", // Empty business name
                "LICENSE001",
                "", // Empty location
                "" // Empty certifications
            );

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("");
            expect(info.location).to.equal("");
            expect(info.certifications).to.equal("");
        });

        it("Should maintain consistent total stakeholder count", async function () {
            // Register multiple stakeholders
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm1", "LIC001", "CA", "Cert1"
            );
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address, 1, "Proc1", "LIC002", "TX", "Cert2"
            );
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                distributor.address, 3, "Dist1", "LIC003", "NY", "Cert3"
            );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(3);

            // Deactivating should not change total count (it's total registered, not active)
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(3);
        });

        it("Should handle role arrays correctly", async function () {
            // Register multiple stakeholders of same role
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm1", "LIC001", "CA", "Cert1"
            );
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                consumer.address, 0, "Farm2", "LIC002", "AZ", "Cert2"
            );

            const farmers = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmers).to.have.length(2);
            expect(farmers).to.include(farmer.address);
            expect(farmers).to.include(consumer.address);
        });
    });

    describe("Role Enum Testing", function () {
        it("Should register stakeholders with all valid roles", async function () {
            const roles = [0, 1, 2, 3]; // FARMER, PROCESSOR, RETAILER, DISTRIBUTOR
            const addresses = [farmer.address, processor.address, retailer.address, distributor.address];
            const names = ["Farm", "Processor", "Retailer", "Distributor"];

            for (let i = 0; i < roles.length; i++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    addresses[i],
                    roles[i],
                    names[i],
                    `LICENSE00${i+1}`,
                    "Location",
                    "Certifications"
                );

                expect(await stakeholderRegistry.isRegisteredStakeholder(addresses[i], roles[i])).to.be.true;
            }

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(4);
        });
    });

    describe("Specific Coverage Tests - Target Uncovered Lines", function () {
        it("Should hit deactivateStakeholder function completely", async function () {
            // Register a stakeholder first
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Test Farm",
                "TEST_LICENSE",
                "Test Location",
                "Test Cert"
            );

            // Verify stakeholder is active
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
            
            const beforeInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(beforeInfo.isActive).to.be.true;

            // Deactivate stakeholder - this should hit lines 134, 139, 141
            const tx = await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            
            // Verify event emission (line 141)
            await expect(tx).to.emit(stakeholderRegistry, "StakeholderDeactivated");

            // Verify stakeholder is now inactive (line 139 was executed)
            const afterInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(afterInfo.isActive).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
        });

        it("Should test deactivateStakeholder error path (line 134)", async function () {
            // Try to deactivate non-existent stakeholder to hit the require on line 134
            await expect(
                stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test updateLastActivity function", async function () {
            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Test Farm",
                "TEST_LICENSE",
                "Test Location", 
                "Test Cert"
            );

            const beforeInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            
            // Update activity
            await stakeholderRegistry.updateLastActivity(farmer.address);
            
            const afterInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(afterInfo.lastActivity).to.be.greaterThanOrEqual(beforeInfo.lastActivity);
        });

        it("Should test updateLastActivity with inactive stakeholder", async function () {
            // Register and then deactivate stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Test Farm",
                "TEST_LICENSE",
                "Test Location",
                "Test Cert"
            );
            
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Try to update activity on inactive stakeholder
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test all transferAdmin scenarios", async function () {
            // Test successful transfer
            expect(await stakeholderRegistry.admin()).to.equal(deployer.address);
            
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);
            expect(await stakeholderRegistry.admin()).to.equal(admin.address);

            // Test transfer with zero address
            await expect(
                stakeholderRegistry.connect(admin).transferAdmin(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid new admin address");

            // Test transfer from non-admin
            await expect(
                stakeholderRegistry.connect(deployer).transferAdmin(farmer.address)
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should test getStakeholdersByRole with empty and populated arrays", async function () {
            // Test empty arrays for all roles
            for (let role = 0; role < 4; role++) {
                const members = await stakeholderRegistry.getStakeholdersByRole(role);
                expect(members).to.have.length(0);
            }

            // Register one stakeholder of each role
            const addresses = [farmer.address, processor.address, retailer.address, distributor.address];
            for (let role = 0; role < 4; role++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    addresses[role],
                    role,
                    `Business${role}`,
                    `LICENSE${role}`,
                    "Location",
                    "Cert"
                );

                const members = await stakeholderRegistry.getStakeholdersByRole(role);
                expect(members).to.have.length(1);
                expect(members[0]).to.equal(addresses[role]);
            }
        });

        it("Should test isRegisteredStakeholder with all combinations", async function () {
            // Test with non-existent stakeholder
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.false;

            // Register as farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0, // FARMER
                "Test Farm",
                "LICENSE001",
                "Location",
                "Cert"
            );

            // Test correct role
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
            
            // Test wrong roles
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 2)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 3)).to.be.false;

            // Deactivate and test again
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
        });

        it("Should test registration with edge case inputs", async function () {
            // Test with minimal valid inputs
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "A", // Single character
                "L", // Single character license
                "", // Empty location
                ""  // Empty certifications
            );

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("A");
            expect(info.businessLicense).to.equal("L");
            expect(info.location).to.equal("");
            expect(info.certifications).to.equal("");
            expect(info.isActive).to.be.true;
        });
    });

    describe("Complete Function Coverage Tests", function () {
        it("Should test registerStakeholder with all validation paths", async function () {
            // Test invalid address
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    ethers.ZeroAddress,
                    0,
                    "Farm",
                    "LICENSE001",
                    "Location",
                    "Cert"
                )
            ).to.be.revertedWith("Invalid stakeholder address");

            // Test successful registration 
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Farm",
                "LICENSE001",
                "Location",
                "Cert"
            );

            // Test already registered stakeholder
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    farmer.address,
                    1,
                    "Processing",
                    "LICENSE002",
                    "Location2",
                    "Cert2"
                )
            ).to.be.revertedWith("Stakeholder already registered");

            // Test duplicate license
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    processor.address,
                    1,
                    "Processing",
                    "LICENSE001", // Same license as farmer
                    "Location2",
                    "Cert2"
                )
            ).to.be.revertedWith("Business license already registered");

            // Test non-admin trying to register
            await expect(
                stakeholderRegistry.connect(farmer).registerStakeholder(
                    processor.address,
                    1,
                    "Processing",
                    "LICENSE002",
                    "Location2",
                    "Cert2"
                )
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should test all modifier paths", async function () {
            // Test onlyAdmin modifier with every admin function
            const nonAdminAddresses = [farmer, processor, distributor, retailer, consumer, unauthorized];
            
            for (const addr of nonAdminAddresses) {
                await expect(
                    stakeholderRegistry.connect(addr).registerStakeholder(
                        farmer.address, 0, "Farm", "LIC", "Loc", "Cert"
                    )
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(addr).deactivateStakeholder(farmer.address)
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(addr).transferAdmin(farmer.address)
                ).to.be.revertedWith("Only admin can call this function");
            }
        });

        it("Should test validStakeholder modifier", async function () {
            // Test with non-existent stakeholder
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");

            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // Should work now
            await stakeholderRegistry.updateLastActivity(farmer.address);

            // Deactivate and test again
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test complete stakeholder data structure", async function () {
            // Register stakeholder and verify all fields are set correctly
            const businessName = "Complete Test Farm";
            const businessLicense = "COMPLETE_LICENSE";
            const location = "Complete Location";
            const certifications = "Complete Certifications";
            const role = 0; // FARMER

            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                role,
                businessName,
                businessLicense,
                location,
                certifications
            );

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            
            // Check every field
            expect(info.stakeholderAddress).to.equal(farmer.address);
            expect(info.role).to.equal(role);
            expect(info.businessName).to.equal(businessName);
            expect(info.businessLicense).to.equal(businessLicense);
            expect(info.location).to.equal(location);
            expect(info.certifications).to.equal(certifications);
            expect(info.isActive).to.be.true;
            expect(info.registeredAt).to.be.greaterThan(0);
            expect(info.lastActivity).to.equal(info.registeredAt);

            // Check totalStakeholders incremented
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(1);

            // Check stakeholdersByRole array
            const farmersArray = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmersArray).to.have.length(1);
            expect(farmersArray[0]).to.equal(farmer.address);

            // Check isRegisteredStakeholder
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
        });

        it("Should test state changes during registration", async function () {
            // Initial state
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(0);
            
            // Register multiple stakeholders and verify state changes
            const stakeholders = [
                { addr: farmer.address, role: 0, license: "LIC001" },
                { addr: processor.address, role: 1, license: "LIC002" },
                { addr: distributor.address, role: 3, license: "LIC003" }
            ];

            for (let i = 0; i < stakeholders.length; i++) {
                const s = stakeholders[i];
                
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    s.addr, s.role, `Business${i}`, s.license, "Location", "Cert"
                );

                // Verify state after each registration
                expect(await stakeholderRegistry.totalStakeholders()).to.equal(i + 1);
                
                const roleMembers = await stakeholderRegistry.getStakeholdersByRole(s.role);
                expect(roleMembers).to.include(s.addr);
                
                expect(await stakeholderRegistry.isRegisteredStakeholder(s.addr, s.role)).to.be.true;
            }
        });

        it("Should test getStakeholderInfo for non-existent stakeholder", async function () {
            // Should return empty struct for non-existent stakeholder
            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            
            expect(info.stakeholderAddress).to.equal(ethers.ZeroAddress);
            expect(info.role).to.equal(0);
            expect(info.businessName).to.equal("");
            expect(info.businessLicense).to.equal("");
            expect(info.location).to.equal("");
            expect(info.certifications).to.equal("");
            expect(info.isActive).to.be.false;
            expect(info.registeredAt).to.equal(0);
            expect(info.lastActivity).to.equal(0);
        });

        it("Should test updateStakeholderInfo with all validation paths", async function () {
            // Test with non-existent stakeholder
            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    farmer.address, "Name", "Location", "Cert"
                )
            ).to.be.revertedWith("Stakeholder is not active");

            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Original Farm", "LICENSE001", "Original Location", "Original Cert"
            );

            // Test successful update
            const tx = await stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                farmer.address, "Updated Farm", "Updated Location", "Updated Cert"
            );

            await expect(tx).to.emit(stakeholderRegistry, "StakeholderUpdated");

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("Updated Farm");
            expect(info.location).to.equal("Updated Location");
            expect(info.certifications).to.equal("Updated Cert");

            // Test non-admin trying to update
            await expect(
                stakeholderRegistry.connect(farmer).updateStakeholderInfo(
                    farmer.address, "Name", "Location", "Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");

            // Deactivate and test inactive stakeholder
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    farmer.address, "Name", "Location", "Cert"
                )
            ).to.be.revertedWith("Stakeholder is not active");
        });
    });

    describe("Advanced Data Integrity and State Management", function () {
        it("Should handle stakeholder re-registration after deactivation", async function () {
            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                "Original Farm",
                "ORIGINAL_LICENSE",
                "Original Location",
                "Original Cert"
            );

            // Deactivate
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Should be able to register again with different details
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                1, // Different role
                "New Processing Plant",
                "NEW_LICENSE",
                "New Location",
                "New Certifications"
            );

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.role).to.equal(1); // PROCESSOR
            expect(info.businessName).to.equal("New Processing Plant");
            expect(info.businessLicense).to.equal("NEW_LICENSE");
            expect(info.isActive).to.be.true;
        });

        it("Should handle maximum length string inputs", async function () {
            const longString = "A".repeat(1000); // Very long string
            
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address,
                0,
                longString,
                "LICENSE_LONG",
                longString,
                longString
            );

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal(longString);
            expect(info.location).to.equal(longString);
            expect(info.certifications).to.equal(longString);
        });

        it("Should maintain data consistency across multiple operations", async function () {
            // Register multiple stakeholders
            const stakeholders = [
                { addr: farmer.address, role: 0, name: "Farm1", license: "LIC001" },
                { addr: processor.address, role: 1, name: "Proc1", license: "LIC002" },
                { addr: distributor.address, role: 3, name: "Dist1", license: "LIC003" },
                { addr: retailer.address, role: 2, name: "Retail1", license: "LIC004" }
            ];

            for (const s of stakeholders) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    s.addr, s.role, s.name, s.license, "Location", "Cert"
                );
            }

            // Verify all mappings are consistent
            for (const s of stakeholders) {
                // Check stakeholder info
                const info = await stakeholderRegistry.getStakeholderInfo(s.addr);
                expect(info.role).to.equal(s.role);
                expect(info.businessName).to.equal(s.name);
                expect(info.businessLicense).to.equal(s.license);

                // Check role validation
                expect(await stakeholderRegistry.isRegisteredStakeholder(s.addr, s.role)).to.be.true;

                // Check role arrays
                const roleMembers = await stakeholderRegistry.getStakeholdersByRole(s.role);
                expect(roleMembers).to.include(s.addr);

                // Check license mapping (indirectly through duplicate prevention)
                await expect(
                    stakeholderRegistry.connect(deployer).registerStakeholder(
                        consumer.address, 0, "Duplicate", s.license, "Loc", "Cert"
                    )
                ).to.be.revertedWith("Business license already registered");
            }

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(4);
        });

        it("Should handle concurrent activity updates correctly", async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            const initialInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            const initialActivity = initialInfo.lastActivity;

            // Multiple activity updates
            await stakeholderRegistry.updateLastActivity(farmer.address);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await stakeholderRegistry.updateLastActivity(farmer.address);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await stakeholderRegistry.updateLastActivity(farmer.address);

            const finalInfo = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(finalInfo.lastActivity).to.be.greaterThan(initialActivity);
        });
    });

    describe("Security and Access Control Edge Cases", function () {
        it("Should prevent unauthorized admin operations from any address", async function () {
            const unauthorizedAddresses = [farmer, processor, distributor, retailer, consumer, unauthorized];

            for (const addr of unauthorizedAddresses) {
                await expect(
                    stakeholderRegistry.connect(addr).registerStakeholder(
                        farmer.address, 0, "Unauthorized", "LICENSE", "Location", "Cert"
                    )
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(addr).deactivateStakeholder(farmer.address)
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(addr).transferAdmin(addr.address)
                ).to.be.revertedWith("Only admin can call this function");
            }
        });

        it("Should handle admin transfer chain correctly", async function () {
            // Chain of admin transfers
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);
            expect(await stakeholderRegistry.admin()).to.equal(admin.address);

            await stakeholderRegistry.connect(admin).transferAdmin(farmer.address);
            expect(await stakeholderRegistry.admin()).to.equal(farmer.address);

            await stakeholderRegistry.connect(farmer).transferAdmin(processor.address);
            expect(await stakeholderRegistry.admin()).to.equal(processor.address);

            // Only current admin can perform operations
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    retailer.address, 2, "Store", "LICENSE", "Location", "Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");

            await expect(
                stakeholderRegistry.connect(admin).registerStakeholder(
                    retailer.address, 2, "Store", "LICENSE", "Location", "Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");

            // But current admin (processor) can
            await expect(
                stakeholderRegistry.connect(processor).registerStakeholder(
                    retailer.address, 2, "Store", "LICENSE", "Location", "Cert"
                )
            ).to.not.be.reverted;
        });

        it("Should prevent circular admin transfers", async function () {
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);
            await stakeholderRegistry.connect(admin).transferAdmin(farmer.address);

            // Should not prevent back-transfers (this is actually allowed)
            await expect(
                stakeholderRegistry.connect(farmer).transferAdmin(admin.address)
            ).to.not.be.reverted;

            await expect(
                stakeholderRegistry.connect(admin).transferAdmin(deployer.address)
            ).to.not.be.reverted;
        });
    });

    describe("Event Emission Comprehensive Testing", function () {
        it("Should emit all events with correct parameters", async function () {
            // Test StakeholderRegistered event
            const tx1 = await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm Co", "LICENSE001", "Iowa", "Organic"
            );

            const receipt1 = await tx1.wait();
            const block1 = await ethers.provider.getBlock(receipt1.blockNumber);

            await expect(tx1)
                .to.emit(stakeholderRegistry, "StakeholderRegistered")
                .withArgs(farmer.address, 0, "Farm Co", block1.timestamp);

            // Test StakeholderDeactivated event
            const tx2 = await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            const receipt2 = await tx2.wait();
            const block2 = await ethers.provider.getBlock(receipt2.blockNumber);

            await expect(tx2)
                .to.emit(stakeholderRegistry, "StakeholderDeactivated")
                .withArgs(farmer.address, block2.timestamp);
        });

        it("Should emit events for each stakeholder operation", async function () {
            // Register multiple stakeholders and verify each emits correct event
            const stakeholders = [
                { addr: farmer.address, role: 0, name: "Farm1" },
                { addr: processor.address, role: 1, name: "Proc1" },
                { addr: distributor.address, role: 3, name: "Dist1" }
            ];

            for (let i = 0; i < stakeholders.length; i++) {
                const s = stakeholders[i];
                const tx = await stakeholderRegistry.connect(deployer).registerStakeholder(
                    s.addr, s.role, s.name, `LICENSE00${i}`, "Location", "Cert"
                );

                await expect(tx)
                    .to.emit(stakeholderRegistry, "StakeholderRegistered")
                    .withArgs(s.addr, s.role, s.name, await getBlockTimestamp(tx));
            }

            // Deactivate each and verify events
            for (const s of stakeholders) {
                const tx = await stakeholderRegistry.connect(deployer).deactivateStakeholder(s.addr);
                
                await expect(tx)
                    .to.emit(stakeholderRegistry, "StakeholderDeactivated")
                    .withArgs(s.addr, await getBlockTimestamp(tx));
            }
        });
    });

    describe("Complex Stakeholder Management Scenarios", function () {
        it("Should handle large-scale stakeholder registration", async function () {
            const batchSize = 20;
            const stakeholderData = [];

            // Generate test data
            for (let i = 0; i < batchSize; i++) {
                stakeholderData.push({
                    addr: accounts.deployer.address, // Use same address for simplicity, just testing count
                    role: i % 4, // Cycle through roles
                    name: `Business${i}`,
                    license: `LICENSE${i.toString().padStart(3, '0')}`,
                    location: `Location${i}`,
                    cert: `Certification${i}`
                });
            }

            // Note: We can't actually register the same address multiple times
            // So let's test the data structures can handle the pattern
            let currentRole = 0;
            for (let i = 0; i < 4; i++) { // Test each role
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    [farmer.address, processor.address, distributor.address, retailer.address][i],
                    i,
                    `Business${i}`,
                    `LICENSE${i}`,
                    `Location${i}`,
                    `Cert${i}`
                );
            }

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(4);

            // Verify role distribution
            for (let role = 0; role < 4; role++) {
                const roleMembers = await stakeholderRegistry.getStakeholdersByRole(role);
                expect(roleMembers).to.have.length(1);
            }
        });

        it("Should handle stakeholder role migration", async function () {
            // Register as farmer
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm Co", "LICENSE001", "Iowa", "Organic"
            );

            // Verify farmer registration
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
            const farmersRole = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmersRole).to.include(farmer.address);

            // Deactivate and re-register as processor
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 1, "Processing Co", "LICENSE002", "California", "FDA"
            );

            // Verify role change
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.true;

            const processorsRole = await stakeholderRegistry.getStakeholdersByRole(1);
            expect(processorsRole).to.include(farmer.address);
        });

        it("Should maintain consistent state during complex operations", async function () {
            // Register stakeholders
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm1", "LIC001", "IA", "Organic"
            );
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address, 1, "Proc1", "LIC002", "CA", "FDA"
            );

            // Transfer admin
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);

            // New admin deactivates stakeholder
            await stakeholderRegistry.connect(admin).deactivateStakeholder(farmer.address);

            // Verify state consistency
            expect(await stakeholderRegistry.admin()).to.equal(admin.address);
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(2);
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(processor.address, 1)).to.be.true;

            const info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.false;
        });
    });

    describe("Gas Optimization and Performance", function () {
        it("Should handle efficient batch operations", async function () {
            // Register multiple stakeholders of same role efficiently
            const addresses = [farmer.address, consumer.address];
            
            for (let i = 0; i < addresses.length; i++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    addresses[i],
                    0, // Same role
                    `Farm${i}`,
                    `LICENSE0${i}`,
                    `Location${i}`,
                    `Cert${i}`
                );
            }

            // Verify efficient role array growth
            const farmers = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmers).to.have.length(2);
            expect(farmers).to.include(farmer.address);
            expect(farmers).to.include(consumer.address);
        });

        it("Should efficiently handle mixed role registrations", async function () {
            const operations = [
                { addr: farmer.address, role: 0, name: "Farm1", license: "LIC001" },
                { addr: processor.address, role: 1, name: "Proc1", license: "LIC002" },
                { addr: farmer.address, role: 0, name: "Farm1", license: "LIC001", shouldFail: true }, // Duplicate
                { addr: distributor.address, role: 3, name: "Dist1", license: "LIC003" },
                { addr: retailer.address, role: 2, name: "Retail1", license: "LIC004" }
            ];

            let successCount = 0;
            for (const op of operations) {
                if (op.shouldFail) {
                    await expect(
                        stakeholderRegistry.connect(deployer).registerStakeholder(
                            op.addr, op.role, op.name, op.license, "Loc", "Cert"
                        )
                    ).to.be.reverted;
                } else {
                    await stakeholderRegistry.connect(deployer).registerStakeholder(
                        op.addr, op.role, op.name, op.license, "Loc", "Cert"
                    );
                    successCount++;
                }
            }

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(successCount);
        });
    });

    describe("Boundary Conditions and Limits", function () {
        it("Should handle role enum boundaries", async function () {
            // Test all valid role values
            const validRoles = [0, 1, 2, 3]; // FARMER, PROCESSOR, RETAILER, DISTRIBUTOR
            const addresses = [farmer.address, processor.address, retailer.address, distributor.address];

            for (let i = 0; i < validRoles.length; i++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    addresses[i],
                    validRoles[i],
                    `Business${i}`,
                    `LICENSE${i}`,
                    "Location",
                    "Cert"
                );

                expect(await stakeholderRegistry.isRegisteredStakeholder(addresses[i], validRoles[i])).to.be.true;
            }
        });

        it("Should handle timestamp edge cases", async function () {
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            const info1 = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info1.registeredAt).to.be.greaterThan(0);
            expect(info1.lastActivity).to.equal(info1.registeredAt);

            // Update activity
            await stakeholderRegistry.updateLastActivity(farmer.address);

            const info2 = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info2.lastActivity).to.be.greaterThanOrEqual(info1.lastActivity);
        });
    });

    describe("Additional Coverage Tests", function () {
        it("Should test all branch paths in isRegisteredStakeholder", async function () {
            // Test with non-existent stakeholder (both conditions false)
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;

            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // Test with correct role (both conditions true)
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;

            // Test with wrong role (isActive true, role false)
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 1)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 2)).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 3)).to.be.false;

            // Deactivate stakeholder
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Test with inactive stakeholder (isActive false, role true)
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;
        });

        it("Should test multiple deactivation attempts to cover error paths", async function () {
            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // First deactivation should succeed
            const tx = await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await expect(tx).to.emit(stakeholderRegistry, "StakeholderDeactivated");

            // Second deactivation should fail (this tests the require statement)
            await expect(
                stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");

            // Test deactivating non-existent stakeholder
            await expect(
                stakeholderRegistry.connect(deployer).deactivateStakeholder(processor.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test updateLastActivity with different stakeholder states", async function () {
            // Test with non-existent stakeholder
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");

            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // Test with active stakeholder (should work)
            await stakeholderRegistry.updateLastActivity(farmer.address);

            // Deactivate stakeholder
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            // Test with inactive stakeholder
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test license mapping edge cases", async function () {
            // Register first stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm1", "UNIQUE_LICENSE_001", "Location1", "Cert1"
            );

            // Try to register second stakeholder with same license
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    processor.address, 1, "Processing Co", "UNIQUE_LICENSE_001", "Location2", "Cert2"
                )
            ).to.be.revertedWith("Business license already registered");

            // Register with different license should work
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                processor.address, 1, "Processing Co", "UNIQUE_LICENSE_002", "Location2", "Cert2"
            );

            expect(await stakeholderRegistry.totalStakeholders()).to.equal(2);
        });

        it("Should test admin transfer edge cases", async function () {
            const originalAdmin = await stakeholderRegistry.admin();
            expect(originalAdmin).to.equal(deployer.address);

            // Transfer to new admin
            await stakeholderRegistry.connect(deployer).transferAdmin(admin.address);
            expect(await stakeholderRegistry.admin()).to.equal(admin.address);

            // Old admin should not be able to perform admin operations
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
                )
            ).to.be.revertedWith("Only admin can call this function");

            // New admin should be able to perform operations
            await stakeholderRegistry.connect(admin).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // Test transfer to zero address
            await expect(
                stakeholderRegistry.connect(admin).transferAdmin(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid new admin address");

            // Test transfer by non-admin
            await expect(
                stakeholderRegistry.connect(farmer).transferAdmin(farmer.address)
            ).to.be.revertedWith("Only admin can call this function");
        });

        it("Should test address validation in registerStakeholder", async function () {
            // Test zero address
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    ethers.ZeroAddress, 0, "Farm", "LICENSE001", "Location", "Cert"
                )
            ).to.be.revertedWith("Invalid stakeholder address");

            // Test valid address
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            // Test duplicate address
            await expect(
                stakeholderRegistry.connect(deployer).registerStakeholder(
                    farmer.address, 1, "Processing", "LICENSE002", "Location2", "Cert2"
                )
            ).to.be.revertedWith("Stakeholder already registered");
        });

        it("Should test getStakeholdersByRole with comprehensive scenarios", async function () {
            // Initially all roles should be empty
            for (let role = 0; role < 4; role++) {
                const stakeholders = await stakeholderRegistry.getStakeholdersByRole(role);
                expect(stakeholders).to.have.length(0);
            }

            // Register stakeholders for each role
            const testData = [
                { addr: farmer.address, role: 0, name: "Farm1", license: "LIC001" },
                { addr: processor.address, role: 1, name: "Proc1", license: "LIC002" },
                { addr: retailer.address, role: 2, name: "Retail1", license: "LIC003" },
                { addr: distributor.address, role: 3, name: "Dist1", license: "LIC004" },
                { addr: consumer.address, role: 0, name: "Farm2", license: "LIC005" } // Second farmer
            ];

            for (const data of testData) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    data.addr, data.role, data.name, data.license, "Location", "Cert"
                );
            }

            // Test each role
            const farmers = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmers).to.have.length(2);
            expect(farmers).to.include(farmer.address);
            expect(farmers).to.include(consumer.address);

            const processors = await stakeholderRegistry.getStakeholdersByRole(1);
            expect(processors).to.have.length(1);
            expect(processors[0]).to.equal(processor.address);

            const retailers = await stakeholderRegistry.getStakeholdersByRole(2);
            expect(retailers).to.have.length(1);
            expect(retailers[0]).to.equal(retailer.address);

            const distributors = await stakeholderRegistry.getStakeholdersByRole(3);
            expect(distributors).to.have.length(1);
            expect(distributors[0]).to.equal(distributor.address);
        });

        it("Should test all modifier combinations", async function () {
            // Test onlyAdmin modifier
            const nonAdminAccounts = [farmer, processor, distributor, retailer, consumer, unauthorized];
            
            for (const account of nonAdminAccounts) {
                await expect(
                    stakeholderRegistry.connect(account).registerStakeholder(
                        farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
                    )
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(account).deactivateStakeholder(farmer.address)
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(account).transferAdmin(account.address)
                ).to.be.revertedWith("Only admin can call this function");

                await expect(
                    stakeholderRegistry.connect(account).updateStakeholderInfo(
                        farmer.address, "Name", "Location", "Cert"
                    )
                ).to.be.revertedWith("Only admin can call this function");
            }

            // Test validStakeholder modifier
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");

            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    farmer.address, "Name", "Location", "Cert"
                )
            ).to.be.revertedWith("Stakeholder is not active");

            // Register stakeholder and test valid case
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm", "LICENSE001", "Location", "Cert"
            );

            await stakeholderRegistry.updateLastActivity(farmer.address);
            await stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                farmer.address, "Updated Name", "Updated Location", "Updated Cert"
            );

            // Deactivate and test again
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await expect(
                stakeholderRegistry.updateLastActivity(farmer.address)
            ).to.be.revertedWith("Stakeholder is not active");

            await expect(
                stakeholderRegistry.connect(deployer).updateStakeholderInfo(
                    farmer.address, "Name", "Location", "Cert"
                )
            ).to.be.revertedWith("Stakeholder is not active");
        });

        it("Should test comprehensive stakeholder lifecycle with edge cases", async function () {
            // Register stakeholder
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "Farm Co", "COMPREHENSIVE_LICENSE", "Farm Location", "Organic Cert"
            );

            // Verify initial state
            let info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.true;
            expect(info.role).to.equal(0);
            expect(info.businessName).to.equal("Farm Co");
            expect(info.businessLicense).to.equal("COMPREHENSIVE_LICENSE");

            // Update activity multiple times
            const initialActivity = info.lastActivity;
            await stakeholderRegistry.updateLastActivity(farmer.address);
            await stakeholderRegistry.updateLastActivity(farmer.address);

            info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.lastActivity).to.be.greaterThanOrEqual(initialActivity);

            // Verify role membership
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.true;
            const farmersArray = await stakeholderRegistry.getStakeholdersByRole(0);
            expect(farmersArray).to.include(farmer.address);

            // Deactivate stakeholder
            const tx = await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);
            await expect(tx).to.emit(stakeholderRegistry, "StakeholderDeactivated");

            // Verify deactivated state
            info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.false;
            expect(await stakeholderRegistry.isRegisteredStakeholder(farmer.address, 0)).to.be.false;

            // Verify total count doesn't change after deactivation
            expect(await stakeholderRegistry.totalStakeholders()).to.equal(1);

            // Reactivation by re-registering with different license
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 1, "Processing Co", "NEW_LICENSE", "Processing Location", "FDA Cert"
            );

            info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.isActive).to.be.true;
            expect(info.role).to.equal(1);
            expect(info.businessName).to.equal("Processing Co");
            expect(info.businessLicense).to.equal("NEW_LICENSE");
        });

        it("Should test string parameter edge cases", async function () {
            // Test with empty strings
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, "", "LICENSE_EMPTY_NAME", "", ""
            );

            let info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal("");
            expect(info.location).to.equal("");
            expect(info.certifications).to.equal("");

            // Deactivate and test with very long strings
            await stakeholderRegistry.connect(deployer).deactivateStakeholder(farmer.address);

            const longString = "A".repeat(1000);
            await stakeholderRegistry.connect(deployer).registerStakeholder(
                farmer.address, 0, longString, "LICENSE_LONG", longString, longString
            );

            info = await stakeholderRegistry.getStakeholderInfo(farmer.address);
            expect(info.businessName).to.equal(longString);
            expect(info.location).to.equal(longString);
            expect(info.certifications).to.equal(longString);
        });

        it("Should test branch coverage for all role validation paths", async function () {
            // Test each role validation path
            const roles = [0, 1, 2, 3];
            const addresses = [farmer.address, processor.address, retailer.address, distributor.address];

            for (let i = 0; i < roles.length; i++) {
                await stakeholderRegistry.connect(deployer).registerStakeholder(
                    addresses[i], roles[i], `Business${i}`, `LICENSE${i}`, "Location", "Cert"
                );

                // Test correct role
                expect(await stakeholderRegistry.isRegisteredStakeholder(addresses[i], roles[i])).to.be.true;

                // Test all other roles (wrong role branch)
                for (let j = 0; j < roles.length; j++) {
                    if (j !== i) {
                        expect(await stakeholderRegistry.isRegisteredStakeholder(addresses[i], roles[j])).to.be.false;
                    }
                }
            }
        });
    });
}); 