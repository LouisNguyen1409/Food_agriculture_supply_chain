const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("FactoryRegistry", function () {
    let testHelpers;
    let factoryRegistry;
    let contractRegistry;
    let productFactory;
    let shipmentFactory;
    let supplyChainFactory;
    let accounts;
    let deployer, admin, unauthorized;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, admin, unauthorized } = accounts);

        // Deploy ContractRegistry first
        contractRegistry = await testHelpers.deployContractRegistry();

        // Deploy FactoryRegistry
        factoryRegistry = await testHelpers.deployFactoryRegistry(
            await contractRegistry.getAddress()
        );

        // Authorize FactoryRegistry to register contracts
        await contractRegistry.connect(deployer).addAuthorizedDeployer(
            await factoryRegistry.getAddress()
        );

        // Deploy factory contracts for testing
        const stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        const productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );
        const shipmentRegistry = await testHelpers.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );

        const ProductFactory = await ethers.getContractFactory("ProductFactory");
        productFactory = await ProductFactory.deploy(
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await productFactory.waitForDeployment();

        const ShipmentFactory = await ethers.getContractFactory("ShipmentFactory");
        shipmentFactory = await ShipmentFactory.deploy(
            await shipmentRegistry.getAddress(),
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await shipmentFactory.waitForDeployment();

        supplyChainFactory = await testHelpers.deploySupplyChainFactory(
            await contractRegistry.getAddress()
        );
    });

    describe("Deployment", function () {
        it("Should set correct contract registry address", async function () {
            expect(await factoryRegistry.contractRegistry()).to.equal(
                await contractRegistry.getAddress()
            );
        });

        it("Should reject deployment with zero address", async function () {
            const FactoryRegistry = await ethers.getContractFactory("FactoryRegistry");
            await expect(
                FactoryRegistry.deploy(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid registry address");
        });
    });

    describe("Factory Registration", function () {
        it("Should register a factory successfully", async function () {
            const tx = await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Product creation and templates"
            );

            await expect(tx)
                .to.emit(factoryRegistry, "FactoryRegistered")
                .withArgs(
                    "ProductFactory",
                    await productFactory.getAddress(),
                    await getBlockTimestamp(tx)
                );

            // Verify registration in local mapping
            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );

            // Verify factory info
            const factoryInfo = await factoryRegistry.getFactoryInfo(
                await productFactory.getAddress()
            );
            expect(factoryInfo.factoryAddress).to.equal(await productFactory.getAddress());
            expect(factoryInfo.factoryType).to.equal("ProductFactory");
            expect(factoryInfo.isActive).to.be.true;
            expect(factoryInfo.registeredAt).to.be.greaterThan(0);
        });

        it("Should register multiple different factory types", async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Product creation"
            );

            await factoryRegistry.connect(deployer).registerFactory(
                await shipmentFactory.getAddress(),
                "ShipmentFactory",
                "Shipment creation"
            );

            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("ShipmentFactory")).to.equal(
                await shipmentFactory.getAddress()
            );
        });

        it("Should allow re-registration of same factory type with different address", async function () {
            // Register first factory
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "First product factory"
            );

            // Deploy second ProductFactory
            const stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
            const productRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );
            const ProductFactory = await ethers.getContractFactory("ProductFactory");
            const secondProductFactory = await ProductFactory.deploy(
                await productRegistry.getAddress(),
                await stakeholderRegistry.getAddress()
            );
            await secondProductFactory.waitForDeployment();

            // Register second factory with same type
            await factoryRegistry.connect(deployer).registerFactory(
                await secondProductFactory.getAddress(),
                "ProductFactory",
                "Second product factory"
            );

            // Latest should be the second factory
            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await secondProductFactory.getAddress()
            );
        });

        it("Should reject registration with zero address", async function () {
            await expect(
                factoryRegistry.connect(deployer).registerFactory(
                    ethers.ZeroAddress,
                    "ProductFactory",
                    "Test factory"
                )
            ).to.be.revertedWith("Invalid factory address");
        });

        it("Should reject registration with empty factory type", async function () {
            await expect(
                factoryRegistry.connect(deployer).registerFactory(
                    await productFactory.getAddress(),
                    "",
                    "Test factory"
                )
            ).to.be.revertedWith("Factory type required");
        });

        it("Should register with ContractRegistry", async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Product creation"
            );

            // Verify registration in main ContractRegistry
            const latestContract = await contractRegistry.getLatestContract("ProductFactory");
            expect(latestContract).to.equal(await productFactory.getAddress());
        });
    });

    describe("Factory Discovery", function () {
        beforeEach(async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Product creation"
            );
            await factoryRegistry.connect(deployer).registerFactory(
                await shipmentFactory.getAddress(),
                "ShipmentFactory",
                "Shipment creation"
            );
        });

        it("Should return correct factory address by type", async function () {
            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("ShipmentFactory")).to.equal(
                await shipmentFactory.getAddress()
            );
        });

        it("Should return zero address for non-existent factory type", async function () {
            expect(await factoryRegistry.getFactory("NonExistentFactory")).to.equal(
                ethers.ZeroAddress
            );
        });

        it("Should return complete factory info", async function () {
            const factoryInfo = await factoryRegistry.getFactoryInfo(
                await productFactory.getAddress()
            );

            expect(factoryInfo.factoryAddress).to.equal(await productFactory.getAddress());
            expect(factoryInfo.factoryType).to.equal("ProductFactory");
            expect(factoryInfo.isActive).to.be.true;
            expect(factoryInfo.registeredAt).to.be.greaterThan(0);
        });

        it("Should return empty info for non-registered factory", async function () {
            const randomAddress = ethers.Wallet.createRandom().address;
            const factoryInfo = await factoryRegistry.getFactoryInfo(randomAddress);

            expect(factoryInfo.factoryAddress).to.equal(ethers.ZeroAddress);
            expect(factoryInfo.factoryType).to.equal("");
            expect(factoryInfo.isActive).to.be.false;
            expect(factoryInfo.registeredAt).to.equal(0);
        });
    });

    describe("Batch Factory Registration", function () {
        it("Should register all three common factories", async function () {
            const tx = await factoryRegistry.connect(deployer).registerCommonFactories(
                await productFactory.getAddress(),
                await shipmentFactory.getAddress(),
                await supplyChainFactory.getAddress()
            );

            // Should emit three events
            const receipt = await tx.wait();
            const events = receipt.logs.filter(log => {
                try {
                    const parsed = factoryRegistry.interface.parseLog(log);
                    return parsed && parsed.name === 'FactoryRegistered';
                } catch {
                    return false;
                }
            });
            expect(events.length).to.equal(3);

            // Verify all factories are registered
            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("ShipmentFactory")).to.equal(
                await shipmentFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("SupplyChainFactory")).to.equal(
                await supplyChainFactory.getAddress()
            );
        });

        it("Should register only non-zero factories", async function () {
            await factoryRegistry.connect(deployer).registerCommonFactories(
                await productFactory.getAddress(),
                ethers.ZeroAddress,
                await supplyChainFactory.getAddress()
            );

            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("ShipmentFactory")).to.equal(
                ethers.ZeroAddress
            );
            expect(await factoryRegistry.getFactory("SupplyChainFactory")).to.equal(
                await supplyChainFactory.getAddress()
            );
        });

        it("Should handle all zero addresses gracefully", async function () {
            await expect(
                factoryRegistry.connect(deployer).registerCommonFactories(
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress
                )
            ).to.not.be.reverted;

            // Should not register any factories
            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                ethers.ZeroAddress
            );
            expect(await factoryRegistry.getFactory("ShipmentFactory")).to.equal(
                ethers.ZeroAddress
            );
            expect(await factoryRegistry.getFactory("SupplyChainFactory")).to.equal(
                ethers.ZeroAddress
            );
        });
    });

    describe("Integration with ContractRegistry", function () {
        it("Should maintain consistency between registries", async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Product creation"
            );

            // Check both registries
            const localFactory = await factoryRegistry.getFactory("ProductFactory");
            const registryFactory = await contractRegistry.getLatestContract("ProductFactory");

            expect(localFactory).to.equal(registryFactory);
            expect(localFactory).to.equal(await productFactory.getAddress());
        });

        it("Should increment version in ContractRegistry on re-registration", async function () {
            // Register first time
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "First version"
            );

            const version1 = await contractRegistry.getContractVersionCount("ProductFactory");

            // Register again with different address
            const stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
            const productRegistry = await testHelpers.deployProductRegistry(
                await stakeholderRegistry.getAddress()
            );
            const ProductFactory = await ethers.getContractFactory("ProductFactory");
            const newProductFactory = await ProductFactory.deploy(
                await productRegistry.getAddress(),
                await stakeholderRegistry.getAddress()
            );
            await newProductFactory.waitForDeployment();

            await factoryRegistry.connect(deployer).registerFactory(
                await newProductFactory.getAddress(),
                "ProductFactory",
                "Second version"
            );

            const version2 = await contractRegistry.getContractVersionCount("ProductFactory");
            expect(version2).to.be.greaterThan(version1);
        });
    });

    describe("Access Control", function () {
        it("Should allow any authorized deployer to register factories", async function () {
            // Add admin as authorized deployer
            await contractRegistry.connect(deployer).addAuthorizedDeployer(admin.address);

            await expect(
                factoryRegistry.connect(admin).registerFactory(
                    await productFactory.getAddress(),
                    "ProductFactory",
                    "Registered by admin"
                )
            ).to.not.be.reverted;
        });

        it("Should reject registration from unauthorized user", async function () {
            await expect(
                factoryRegistry.connect(unauthorized).registerFactory(
                    await productFactory.getAddress(),
                    "ProductFactory",
                    "Unauthorized registration"
                )
            ).to.be.revertedWith("Not authorized deployer");
        });

        it("Should allow unauthorized users to read factory info", async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Test factory"
            );

            // Unauthorized users should be able to read
            expect(await factoryRegistry.connect(unauthorized).getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );

            const factoryInfo = await factoryRegistry.connect(unauthorized).getFactoryInfo(
                await productFactory.getAddress()
            );
            expect(factoryInfo.factoryType).to.equal("ProductFactory");
        });
    });

    describe("Event Emission", function () {
        it("Should emit FactoryRegistered event with correct parameters", async function () {
            const tx = await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Test factory"
            );

            await expect(tx)
                .to.emit(factoryRegistry, "FactoryRegistered")
                .withArgs(
                    "ProductFactory",
                    await productFactory.getAddress(),
                    await getBlockTimestamp(tx)
                );
        });

        it("Should emit events for batch registration", async function () {
            const tx = await factoryRegistry.connect(deployer).registerCommonFactories(
                await productFactory.getAddress(),
                await shipmentFactory.getAddress(),
                ethers.ZeroAddress
            );

            const receipt = await tx.wait();
            const events = receipt.logs.filter(log => {
                try {
                    const parsed = factoryRegistry.interface.parseLog(log);
                    return parsed && parsed.name === 'FactoryRegistered';
                } catch {
                    return false;
                }
            });

            expect(events.length).to.equal(2); // Only non-zero addresses
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle factory info for zero address", async function () {
            const factoryInfo = await factoryRegistry.getFactoryInfo(ethers.ZeroAddress);
            
            expect(factoryInfo.factoryAddress).to.equal(ethers.ZeroAddress);
            expect(factoryInfo.factoryType).to.equal("");
            expect(factoryInfo.isActive).to.be.false;
            expect(factoryInfo.registeredAt).to.equal(0);
        });

        it("Should handle getting factory for empty string", async function () {
            expect(await factoryRegistry.getFactory("")).to.equal(ethers.ZeroAddress);
        });

        it("Should handle very long factory type names", async function () {
            const longName = "A".repeat(100);
            
            await expect(
                factoryRegistry.connect(deployer).registerFactory(
                    await productFactory.getAddress(),
                    longName,
                    "Long name test"
                )
            ).to.not.be.reverted;

            expect(await factoryRegistry.getFactory(longName)).to.equal(
                await productFactory.getAddress()
            );
        });

        it("Should handle registration with same address but different type", async function () {
            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "First registration"
            );

            await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "CustomFactory",
                "Second registration"
            );

            expect(await factoryRegistry.getFactory("ProductFactory")).to.equal(
                await productFactory.getAddress()
            );
            expect(await factoryRegistry.getFactory("CustomFactory")).to.equal(
                await productFactory.getAddress()
            );
        });
    });

    describe("Gas Usage", function () {
        it("Should track gas usage for single factory registration", async function () {
            const tx = await factoryRegistry.connect(deployer).registerFactory(
                await productFactory.getAddress(),
                "ProductFactory",
                "Gas test"
            );

            const receipt = await tx.wait();
            console.log(`Single factory registration gas used: ${receipt.gasUsed.toString()}`);
            
            // Should be reasonable for a simple registration (updated to realistic value)
            expect(receipt.gasUsed).to.be.below(500000n);
        });

        it("Should track gas usage for batch registration", async function () {
            const tx = await factoryRegistry.connect(deployer).registerCommonFactories(
                await productFactory.getAddress(),
                await shipmentFactory.getAddress(),
                await supplyChainFactory.getAddress()
            );

            const receipt = await tx.wait();
            console.log(`Batch factory registration gas used: ${receipt.gasUsed.toString()}`);
            
            // Should be efficient for batch operation (updated to realistic value)
            expect(receipt.gasUsed).to.be.below(1500000n);
        });
    });

    // Helper function to get block timestamp
    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }
}); 