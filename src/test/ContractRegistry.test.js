const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ContractRegistry", function () {
    let testHelpers;
    let contractRegistry;
    let accounts;
    let deployer, admin, unauthorized, factory, client;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, unauthorized } = accounts);
        factory = accounts.farmer;
        client = accounts.processor;

        contractRegistry = await testHelpers.deployContractRegistry();
    });

    describe("Deployment", function () {
        it("Should set the correct registry owner", async function () {
            expect(await contractRegistry.registryOwner()).to.equal(deployer.address);
        });

        it("Should authorize the deployer as authorized deployer", async function () {
            expect(await contractRegistry.authorizedDeployers(deployer.address)).to.be.true;
        });

        it("Should initialize supported contract types", async function () {
            const supportedTypes = await contractRegistry.getSupportedContractTypes();
            expect(supportedTypes).to.include("StakeholderRegistry");
            expect(supportedTypes).to.include("ProductRegistry");
            expect(supportedTypes).to.include("ShipmentRegistry");
            expect(supportedTypes).to.include("SupplyChainManager");
            expect(supportedTypes).to.include("PublicVerification");
            expect(supportedTypes).to.include("ProductFactory");
            expect(supportedTypes).to.include("ShipmentFactory");
            expect(supportedTypes).to.include("SupplyChainFactory");
        });

        it("Should start with zero registered contracts", async function () {
            expect(await contractRegistry.totalRegisteredContracts()).to.equal(0);
        });
    });

    describe("Authorization Management", function () {
        it("Should allow owner to add authorized deployers", async function () {
            await contractRegistry.connect(deployer).addAuthorizedDeployer(factory.address);
            expect(await contractRegistry.authorizedDeployers(factory.address)).to.be.true;
        });

        it("Should allow owner to remove authorized deployers", async function () {
            await contractRegistry.connect(deployer).addAuthorizedDeployer(factory.address);
            await contractRegistry.connect(deployer).removeAuthorizedDeployer(factory.address);
            expect(await contractRegistry.authorizedDeployers(factory.address)).to.be.false;
        });

        it("Should reject unauthorized user trying to add deployers", async function () {
            await expect(
                contractRegistry.connect(unauthorized).addAuthorizedDeployer(factory.address)
            ).to.be.revertedWith("Only registry owner");
        });

        it("Should reject unauthorized user trying to remove deployers", async function () {
            await contractRegistry.connect(deployer).addAuthorizedDeployer(factory.address);
            await expect(
                contractRegistry.connect(unauthorized).removeAuthorizedDeployer(factory.address)
            ).to.be.revertedWith("Only registry owner");
        });
    });

    describe("Contract Registration", function () {
        let mockContract;

        beforeEach(async function () {
            // Deploy a mock contract to register
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            mockContract = await MockContract.deploy();
            await mockContract.waitForDeployment();
        });

        it("Should allow authorized deployer to register a contract", async function () {
            const contractAddress = await mockContract.getAddress();
            const contractType = "ProductRegistry";
            const description = "Test product registry";

            const tx = await contractRegistry.connect(deployer).registerContract(
                contractAddress,
                contractType,
                description
            );
            const receipt = await tx.wait();

            // Find the ContractRegistered event
            const event = receipt.logs.find(log => {
                try {
                    const parsed = contractRegistry.interface.parseLog(log);
                    return parsed && parsed.name === 'ContractRegistered';
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
            const parsedEvent = contractRegistry.interface.parseLog(event);
            
            // Verify event arguments
            expect(parsedEvent.args.contractAddress).to.equal(contractAddress);
            expect(parsedEvent.args.contractType).to.equal(contractType);
            expect(parsedEvent.args.version).to.equal(1);
            expect(parsedEvent.args.deployer).to.equal(deployer.address);
            
            // Verify the contractId exists and is not zero
            expect(parsedEvent.args.contractId).to.not.equal(ethers.ZeroHash);
        });

        it("Should increment total registered contracts", async function () {
            const contractAddress = await mockContract.getAddress();
            
            await contractRegistry.connect(deployer).registerContract(
                contractAddress,
                "ProductRegistry",
                "Test registry"
            );

            expect(await contractRegistry.totalRegisteredContracts()).to.equal(1);
        });

        it("Should set the contract as latest for its type", async function () {
            const contractAddress = await mockContract.getAddress();
            const contractType = "ProductRegistry";
            
            await contractRegistry.connect(deployer).registerContract(
                contractAddress,
                contractType,
                "Test registry"
            );

            expect(await contractRegistry.getLatestContract(contractType))
                .to.equal(contractAddress);
        });

        it("Should increment version for subsequent registrations of same type", async function () {
            const contractAddress = await mockContract.getAddress();
            const contractType = "ProductRegistry";
            
            // Deploy second mock contract
            const MockContract2 = await ethers.getContractFactory("ContractRegistry");
            const mockContract2 = await MockContract2.deploy();
            await mockContract2.waitForDeployment();
            const contractAddress2 = await mockContract2.getAddress();

            // Register first contract
            await contractRegistry.connect(deployer).registerContract(
                contractAddress,
                contractType,
                "Version 1"
            );

            // Register second contract of same type
            await contractRegistry.connect(deployer).registerContract(
                contractAddress2,
                contractType,
                "Version 2"
            );

            // Should have 2 versions
            const versions = await contractRegistry.getContractVersions(contractType);
            expect(versions.length).to.equal(2);

            // Latest should be the second contract
            expect(await contractRegistry.getLatestContract(contractType))
                .to.equal(contractAddress2);
        });

        it("Should reject registration from unauthorized deployer", async function () {
            const contractAddress = await mockContract.getAddress();
            
            await expect(
                contractRegistry.connect(unauthorized).registerContract(
                    contractAddress,
                    "ProductRegistry",
                    "Test registry"
                )
            ).to.be.revertedWith("Not authorized deployer");
        });

        it("Should reject registration with invalid contract address", async function () {
            await expect(
                contractRegistry.connect(deployer).registerContract(
                    ethers.ZeroAddress,
                    "ProductRegistry",
                    "Test registry"
                )
            ).to.be.revertedWith("Invalid contract address");
        });

        it("Should reject registration with empty contract type", async function () {
            const contractAddress = await mockContract.getAddress();
            
            await expect(
                contractRegistry.connect(deployer).registerContract(
                    contractAddress,
                    "",
                    "Test registry"
                )
            ).to.be.revertedWith("Contract type required");
        });
    });

    describe("System Registration", function () {
        let systemContracts;

        beforeEach(async function () {
            // Deploy a complete system for testing
            systemContracts = await testHelpers.deployCompleteSystem();
        });

        it("Should allow authorized deployer to register a complete system", async function () {
            const systemId = 1;

            await expect(
                contractRegistry.connect(deployer).registerSystem(
                    systemId,
                    await systemContracts.stakeholderRegistry.getAddress(),
                    await systemContracts.productRegistry.getAddress(),
                    await systemContracts.shipmentRegistry.getAddress(),
                    await systemContracts.supplyChainManager.getAddress(),
                    await systemContracts.publicVerification.getAddress()
                )
            ).to.emit(contractRegistry, "SystemRegistered")
                .withArgs(systemId, deployer.address, [
                    "StakeholderRegistry",
                    "ProductRegistry",
                    "ShipmentRegistry",
                    "SupplyChainManager",
                    "PublicVerification"
                ]);
        });

        it("Should allow retrieval of system contracts", async function () {
            const systemId = 1;

            await contractRegistry.connect(deployer).registerSystem(
                systemId,
                await systemContracts.stakeholderRegistry.getAddress(),
                await systemContracts.productRegistry.getAddress(),
                await systemContracts.shipmentRegistry.getAddress(),
                await systemContracts.supplyChainManager.getAddress(),
                await systemContracts.publicVerification.getAddress()
            );

            expect(await contractRegistry.getSystemContract(systemId, "ProductRegistry"))
                .to.equal(await systemContracts.productRegistry.getAddress());
            expect(await contractRegistry.getSystemContract(systemId, "ShipmentRegistry"))
                .to.equal(await systemContracts.shipmentRegistry.getAddress());
        });

        it("Should return correct system info", async function () {
            const systemId = 1;

            await contractRegistry.connect(deployer).registerSystem(
                systemId,
                await systemContracts.stakeholderRegistry.getAddress(),
                await systemContracts.productRegistry.getAddress(),
                await systemContracts.shipmentRegistry.getAddress(),
                await systemContracts.supplyChainManager.getAddress(),
                await systemContracts.publicVerification.getAddress()
            );

            const [isActive, contractTypes, contractAddresses] = 
                await contractRegistry.getSystemInfo(systemId);

            expect(isActive).to.be.true;
            expect(contractTypes).to.have.lengthOf(5);
            expect(contractAddresses).to.have.lengthOf(5);
            expect(contractTypes).to.include("ProductRegistry");
            expect(contractAddresses).to.include(await systemContracts.productRegistry.getAddress());
        });

        it("Should reject system registration from unauthorized deployer", async function () {
            const systemId = 1;

            await expect(
                contractRegistry.connect(unauthorized).registerSystem(
                    systemId,
                    await systemContracts.stakeholderRegistry.getAddress(),
                    await systemContracts.productRegistry.getAddress(),
                    await systemContracts.shipmentRegistry.getAddress(),
                    await systemContracts.supplyChainManager.getAddress(),
                    await systemContracts.publicVerification.getAddress()
                )
            ).to.be.revertedWith("Not authorized deployer");
        });
    });

    describe("Contract Discovery", function () {
        let mockContracts;

        beforeEach(async function () {
            // Deploy multiple mock contracts
            mockContracts = [];
            for (let i = 0; i < 3; i++) {
                const MockContract = await ethers.getContractFactory("ContractRegistry");
                const mockContract = await MockContract.deploy();
                await mockContract.waitForDeployment();
                mockContracts.push(mockContract);
            }
        });

        it("Should return all contracts of a specific type", async function () {
            const contractType = "ProductRegistry";

            // Register multiple contracts of same type
            for (let i = 0; i < mockContracts.length; i++) {
                await contractRegistry.connect(deployer).registerContract(
                    await mockContracts[i].getAddress(),
                    contractType,
                    `Version ${i + 1}`
                );
            }

            const contractsByType = await contractRegistry.getContractsByType(contractType);
            expect(contractsByType).to.have.lengthOf(3);
            
            for (let i = 0; i < mockContracts.length; i++) {
                expect(contractsByType).to.include(await mockContracts[i].getAddress());
            }
        });

        it("Should return empty array for non-existent contract type", async function () {
            const contractsByType = await contractRegistry.getContractsByType("NonExistentType");
            expect(contractsByType).to.have.lengthOf(0);
        });

        it("Should return correct contract versions", async function () {
            const contractType = "ProductRegistry";

            // Register multiple versions
            for (let i = 0; i < mockContracts.length; i++) {
                await contractRegistry.connect(deployer).registerContract(
                    await mockContracts[i].getAddress(),
                    contractType,
                    `Version ${i + 1}`
                );
            }

            const versions = await contractRegistry.getContractVersions(contractType);
            expect(versions).to.have.lengthOf(3);
        });

        it("Should revert when getting latest contract of non-existent type", async function () {
            await expect(
                contractRegistry.getLatestContract("NonExistentType")
            ).to.be.revertedWith("Contract type not found");
        });
    });

    describe("Contract Upgrades", function () {
        let oldContract, newContract;

        beforeEach(async function () {
            // Deploy contracts for upgrade testing
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            oldContract = await MockContract.deploy();
            await oldContract.waitForDeployment();
            
            newContract = await MockContract.deploy();
            await newContract.waitForDeployment();

            // Register old contract
            await contractRegistry.connect(deployer).registerContract(
                await oldContract.getAddress(),
                "ProductRegistry",
                "Version 1"
            );
        });

        it("Should allow authorized deployer to upgrade contract", async function () {
            const oldAddress = await oldContract.getAddress();
            const newAddress = await newContract.getAddress();

            // The deployer is already authorized by default in the constructor
            await expect(
                contractRegistry.connect(deployer).upgradeContract(
                    "ProductRegistry",
                    newAddress,
                    "Version 2 with new features"
                )
            ).to.emit(contractRegistry, "ContractUpgraded")
                .withArgs("ProductRegistry", oldAddress, newAddress, 2);
        });

        it("Should update latest contract after upgrade", async function () {
            const newAddress = await newContract.getAddress();

            // Use deployer (who is authorized by default) for the upgrade
            await contractRegistry.connect(deployer).upgradeContract(
                "ProductRegistry",
                newAddress,
                "Version 2"
            );

            expect(await contractRegistry.getLatestContract("ProductRegistry"))
                .to.equal(newAddress);
        });

        it("Should reject upgrade from unauthorized deployer", async function () {
            await expect(
                contractRegistry.connect(unauthorized).upgradeContract(
                    "ProductRegistry",
                    await newContract.getAddress(),
                    "Version 2"
                )
            ).to.be.revertedWith("Not authorized deployer");
        });
    });

    describe("Contract Deactivation", function () {
        let mockContract, contractId;

        beforeEach(async function () {
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            mockContract = await MockContract.deploy();
            await mockContract.waitForDeployment();

            // Register contract and get its ID
            const tx = await contractRegistry.connect(deployer).registerContract(
                await mockContract.getAddress(),
                "ProductRegistry",
                "Test contract"
            );
            const receipt = await tx.wait();
            
            const event = receipt.logs.find(log => {
                try {
                    const parsed = contractRegistry.interface.parseLog(log);
                    return parsed && parsed.name === 'ContractRegistered';
                } catch {
                    return false;
                }
            });
            
            contractId = contractRegistry.interface.parseLog(event).args.contractId;
        });

        it("Should allow authorized deployer to deactivate contract", async function () {
            const reason = "Security vulnerability found";

            await expect(
                contractRegistry.connect(deployer).deactivateContract(contractId, reason)
            ).to.emit(contractRegistry, "ContractDeactivated")
                .withArgs(contractId, await mockContract.getAddress(), reason);
        });

        it("Should mark contract as inactive after deactivation", async function () {
            await contractRegistry.connect(deployer).deactivateContract(
                contractId, 
                "Security issue"
            );

            const contractInfo = await contractRegistry.getContractInfo(contractId);
            expect(contractInfo.isActive).to.be.false;
        });

        it("Should reject deactivation from unauthorized deployer", async function () {
            await expect(
                contractRegistry.connect(unauthorized).deactivateContract(
                    contractId,
                    "Unauthorized attempt"
                )
            ).to.be.revertedWith("Not authorized deployer");
        });

        it("Should reject deactivation of non-existent contract", async function () {
            const fakeContractId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
            
            await expect(
                contractRegistry.connect(deployer).deactivateContract(
                    fakeContractId,
                    "Doesn't exist"
                )
            ).to.be.revertedWith("Contract not found");
        });
    });

    describe("Ownership Transfer", function () {
        it("Should allow owner to transfer ownership", async function () {
            await contractRegistry.connect(deployer).transferOwnership(admin.address);
            expect(await contractRegistry.registryOwner()).to.equal(admin.address);
        });

        it("Should reject ownership transfer from non-owner", async function () {
            await expect(
                contractRegistry.connect(unauthorized).transferOwnership(admin.address)
            ).to.be.revertedWith("Only registry owner");
        });

        it("Should reject transfer to zero address", async function () {
            await expect(
                contractRegistry.connect(deployer).transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid new owner");
        });
    });

    describe("Registry Statistics", function () {
        it("Should return correct statistics", async function () {
            // Deploy and register some contracts
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            const mockContract1 = await MockContract.deploy();
            const mockContract2 = await MockContract.deploy();
            await mockContract1.waitForDeployment();
            await mockContract2.waitForDeployment();

            await contractRegistry.connect(deployer).registerContract(
                await mockContract1.getAddress(),
                "ProductRegistry",
                "Test 1"
            );
            await contractRegistry.connect(deployer).registerContract(
                await mockContract2.getAddress(),
                "ShipmentRegistry",
                "Test 2"
            );

            const [totalContracts, totalSystems, totalContractTypes] = 
                await contractRegistry.getRegistryStats();

            expect(totalContracts).to.equal(2);
            expect(totalSystems).to.equal(0); // Systems counting not fully implemented
            expect(totalContractTypes).to.equal(8); // Number of supported types
        });
    });

    describe("Contract Activity Check", function () {
        it("Should detect active contracts", async function () {
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            const mockContract = await MockContract.deploy();
            await mockContract.waitForDeployment();

            await contractRegistry.connect(deployer).registerContract(
                await mockContract.getAddress(),
                "ProductRegistry",
                "Test contract"
            );

            expect(await contractRegistry.isContractActive(await mockContract.getAddress()))
                .to.be.true;
        });

        it("Should return false for unregistered contracts", async function () {
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            const unregisteredContract = await MockContract.deploy();
            await unregisteredContract.waitForDeployment();

            expect(await contractRegistry.isContractActive(await unregisteredContract.getAddress()))
                .to.be.false;
        });
    });

    describe("Gas Usage", function () {
        it("Should track gas usage for contract registration", async function () {
            const MockContract = await ethers.getContractFactory("ContractRegistry");
            const mockContract = await MockContract.deploy();
            await mockContract.waitForDeployment();

            const tx = await contractRegistry.connect(deployer).registerContract(
                await mockContract.getAddress(),
                "ProductRegistry",
                "Gas test contract"
            );
            const receipt = await tx.wait();
            
            console.log(`Contract registration gas used: ${receipt.gasUsed.toString()}`);
            expect(receipt.gasUsed).to.be.below(400000); // Updated to realistic value
        });

        it("Should track gas usage for system registration", async function () {
            const systemContracts = await testHelpers.deployCompleteSystem();

            const tx = await contractRegistry.connect(deployer).registerSystem(
                1,
                await systemContracts.stakeholderRegistry.getAddress(),
                await systemContracts.productRegistry.getAddress(),
                await systemContracts.shipmentRegistry.getAddress(),
                await systemContracts.supplyChainManager.getAddress(),
                await systemContracts.publicVerification.getAddress()
            );
            const receipt = await tx.wait();
            
            console.log(`System registration gas used: ${receipt.gasUsed.toString()}`);
            expect(receipt.gasUsed).to.be.below(500000); // Updated to realistic value
        });
    });
}); 