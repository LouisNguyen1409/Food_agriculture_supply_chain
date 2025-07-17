const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestHelpers } = require("./helpers/testHelpers");

describe("ShipmentFactory", function () {
    let testHelpers;
    let shipmentFactory;
    let shipmentRegistry;
    let productRegistry;
    let stakeholderRegistry;
    let accounts;
    let deployer, distributor, retailer, unauthorized;
    let productId;

    beforeEach(async function () {
        testHelpers = new TestHelpers();
        accounts = await testHelpers.setup();
        ({ deployer, distributor, retailer, unauthorized } = accounts);

        // Deploy dependencies
        stakeholderRegistry = await testHelpers.deployStakeholderRegistry();
        productRegistry = await testHelpers.deployProductRegistry(
            await stakeholderRegistry.getAddress()
        );
        shipmentRegistry = await testHelpers.deployShipmentRegistry(
            await stakeholderRegistry.getAddress(),
            await productRegistry.getAddress()
        );

        // Deploy ShipmentFactory
        const ShipmentFactory = await ethers.getContractFactory("ShipmentFactory");
        shipmentFactory = await ShipmentFactory.deploy(
            await shipmentRegistry.getAddress(),
            await productRegistry.getAddress(),
            await stakeholderRegistry.getAddress()
        );
        await shipmentFactory.waitForDeployment();

        // Register stakeholders
        await testHelpers.setupStakeholders(stakeholderRegistry);
        
        // Register factories as stakeholders to allow them to call registry functions
        await testHelpers.registerFactoriesAsStakeholders(stakeholderRegistry, null, shipmentFactory);

        // Create a test product and update it to PROCESSING stage so it can be shipped
        productId = await testHelpers.createSampleProductSimple(productRegistry, accounts.farmer);
        await testHelpers.updateProductStage(productRegistry, accounts.processor, productId, 1, "Processed");
    });

    describe("Deployment", function () {
        it("Should set correct factory owner", async function () {
            expect(await shipmentFactory.factoryOwner()).to.equal(deployer.address);
        });

        it("Should set correct contract addresses", async function () {
            expect(await shipmentFactory.shipmentRegistry()).to.equal(await shipmentRegistry.getAddress());
            expect(await shipmentFactory.productRegistry()).to.equal(await productRegistry.getAddress());
            expect(await shipmentFactory.stakeholderRegistry()).to.equal(await stakeholderRegistry.getAddress());
        });

        it("Should initialize with correct default values", async function () {
            expect(await shipmentFactory.nextTemplateId()).to.equal(1);
            expect(await shipmentFactory.nextRouteId()).to.equal(1);
            expect(await shipmentFactory.nextBatchId()).to.equal(1);
            expect(await shipmentFactory.totalShipmentsCreated()).to.equal(0);
        });
    });

    describe("Shipment Template Management", function () {
        it("Should create a shipment template successfully", async function () {
            const templateName = "Cold Chain Transport";
            const transportMode = "REFRIGERATED_TRUCK";
            const requiredConditions = ["Temperature Control", "Humidity Control"];
            const estimatedDurationHours = 24;
            const temperatureControlled = true;
            const minTemperature = -18;
            const maxTemperature = 2;

            const tx = await shipmentFactory.createShipmentTemplate(
                templateName,
                transportMode,
                requiredConditions,
                estimatedDurationHours,
                temperatureControlled,
                minTemperature,
                maxTemperature
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentTemplateCreated")
                .withArgs(1, templateName, deployer.address, await getBlockTimestamp(tx));

            const template = await shipmentFactory.getShipmentTemplate(1);
            expect(template.templateId).to.equal(1);
            expect(template.templateName).to.equal(templateName);
            expect(template.transportMode).to.equal(transportMode);
            expect(template.temperatureControlled).to.be.true;
            expect(template.isActive).to.be.true;
        });

        it("Should reject empty template name", async function () {
            await expect(
                shipmentFactory.createShipmentTemplate("", "TRUCK", [], 24, false, 0, 0)
            ).to.be.revertedWith("Template name cannot be empty");
        });

        it("Should reject duplicate template names", async function () {
            const templateName = "Duplicate Template";
            
            await shipmentFactory.createShipmentTemplate(templateName, "TRUCK", [], 24, false, 0, 0);
            
            await expect(
                shipmentFactory.createShipmentTemplate(templateName, "AIR", [], 12, false, 0, 0)
            ).to.be.revertedWith("Template name already exists");
        });

        it("Should get template by name", async function () {
            const templateName = "Test Transport";
            await shipmentFactory.createShipmentTemplate(templateName, "TRUCK", [], 24, false, 0, 0);

            const template = await shipmentFactory.getTemplateByName(templateName);
            expect(template.templateName).to.equal(templateName);
        });

        it("Should reject getting non-existent template by name", async function () {
            await expect(
                shipmentFactory.getTemplateByName("Non-existent")
            ).to.be.revertedWith("Template not found");
        });

        it("Should deactivate template by creator", async function () {
            await shipmentFactory.createShipmentTemplate("Test", "TRUCK", [], 24, false, 0, 0);
            
            // First verify template is active
            let template = await shipmentFactory.getShipmentTemplate(1);
            expect(template.isActive).to.be.true;
            
            // Deactivate template
            await shipmentFactory.deactivateTemplate(1);
            
            // After deactivation, trying to get the template should fail due to templateExists modifier
            await expect(
                shipmentFactory.getShipmentTemplate(1)
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should reject unauthorized template deactivation", async function () {
            await shipmentFactory.createShipmentTemplate("Test", "TRUCK", [], 24, false, 0, 0);
            
            await expect(
                shipmentFactory.connect(unauthorized).deactivateTemplate(1)
            ).to.be.revertedWith("Not authorized");
        });
    });

    describe("Route Template Management", function () {
        it("Should create a route template successfully", async function () {
            const routeName = "Farm to Market Route";
            const origin = "Green Valley Farm";
            const destination = "Central Market";
            const waypoints = ["Highway Junction", "City Center"];
            const estimatedDurationHours = 6;
            const transportMode = "TRUCK";

            const tx = await shipmentFactory.createRouteTemplate(
                routeName,
                origin,
                destination,
                waypoints,
                estimatedDurationHours,
                transportMode
            );

            await expect(tx)
                .to.emit(shipmentFactory, "RouteTemplateCreated")
                .withArgs(1, routeName, origin, destination, await getBlockTimestamp(tx));

            const route = await shipmentFactory.getRouteTemplate(1);
            expect(route.routeId).to.equal(1);
            expect(route.routeName).to.equal(routeName);
            expect(route.origin).to.equal(origin);
            expect(route.destination).to.equal(destination);
            expect(route.isActive).to.be.true;
            expect(route.usageCount).to.equal(0);
        });

        it("Should reject empty route name", async function () {
            await expect(
                shipmentFactory.createRouteTemplate("", "Origin", "Destination", [], 6, "TRUCK")
            ).to.be.revertedWith("Route name cannot be empty");
        });

        it("Should reject duplicate route names", async function () {
            const routeName = "Duplicate Route";
            
            await shipmentFactory.createRouteTemplate(routeName, "A", "B", [], 6, "TRUCK");
            
            await expect(
                shipmentFactory.createRouteTemplate(routeName, "C", "D", [], 8, "AIR")
            ).to.be.revertedWith("Route name already exists");
        });

        it("Should get route by name", async function () {
            const routeName = "Test Route";
            await shipmentFactory.createRouteTemplate(routeName, "A", "B", [], 6, "TRUCK");

            const route = await shipmentFactory.getRouteByName(routeName);
            expect(route.routeName).to.equal(routeName);
        });

        it("Should deactivate route by factory owner", async function () {
            await shipmentFactory.createRouteTemplate("Test Route", "A", "B", [], 6, "TRUCK");
            
            // First verify route is active
            let route = await shipmentFactory.getRouteTemplate(1);
            expect(route.isActive).to.be.true;
            
            // Deactivate route
            await shipmentFactory.connect(deployer).deactivateRoute(1);
            
            // After deactivation, trying to get the route should fail due to routeExists modifier
            await expect(
                shipmentFactory.getRouteTemplate(1)
            ).to.be.revertedWith("Route does not exist or is inactive");
        });

        it("Should reject route deactivation by non-owner", async function () {
            await shipmentFactory.createRouteTemplate("Test Route", "A", "B", [], 6, "TRUCK");
            
            await expect(
                shipmentFactory.connect(unauthorized).deactivateRoute(1)
            ).to.be.revertedWith("Only factory owner can perform this action");
        });
    });

    describe("Shipment Creation from Templates", function () {
        beforeEach(async function () {
            // Create a template for testing
            await shipmentFactory.createShipmentTemplate(
                "Standard Transport",
                "TRUCK",
                ["GPS Tracking"],
                24,
                false,
                0,
                0
            );
        });

        it("Should create shipment from template", async function () {
            const tx = await shipmentFactory.connect(distributor).createShipmentFromTemplate(
                1,
                productId,
                retailer.address,
                "TRACK123"
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate");

            expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
            
            const distributorShipments = await shipmentFactory.getDistributorShipments(distributor.address);
            expect(distributorShipments.length).to.equal(1);
        });

        it("Should reject shipment creation by non-distributor", async function () {
            await expect(
                shipmentFactory.connect(unauthorized).createShipmentFromTemplate(
                    1,
                    productId,
                    retailer.address,
                    "TRACK123"
                )
            ).to.be.revertedWith("Only registered distributors can create shipments");
        });

        it("Should reject shipment creation with non-existent template", async function () {
            await expect(
                shipmentFactory.connect(distributor).createShipmentFromTemplate(
                    999,
                    productId,
                    retailer.address,
                    "TRACK123"
                )
            ).to.be.revertedWith("Template does not exist or is inactive");
        });
    });

    describe("Shipment Creation with Routes", function () {
        beforeEach(async function () {
            // Create template and route
            await shipmentFactory.createShipmentTemplate("Transport", "TRUCK", [], 24, false, 0, 0);
            await shipmentFactory.createRouteTemplate("Route", "A", "B", [], 6, "TRUCK");
        });

        it("Should create shipment with route", async function () {
            const tx = await shipmentFactory.connect(distributor).createShipmentWithRoute(
                productId,
                retailer.address,
                "TRACK123",
                1, // routeId
                1  // templateId
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate");

            // Check route usage was incremented
            const route = await shipmentFactory.getRouteTemplate(1);
            expect(route.usageCount).to.equal(1);
        });

        it("Should reject shipment creation with non-existent route", async function () {
            await expect(
                shipmentFactory.connect(distributor).createShipmentWithRoute(
                    productId,
                    retailer.address,
                    "TRACK123",
                    999, // non-existent routeId
                    1
                )
            ).to.be.revertedWith("Route does not exist or is inactive");
        });
    });

    describe("Batch Shipment Creation", function () {
        beforeEach(async function () {
            await shipmentFactory.createShipmentTemplate("Batch Transport", "TRUCK", [], 24, false, 0, 0);
            await shipmentFactory.createRouteTemplate("Batch Route", "A", "B", [], 6, "TRUCK");
        });

        it("Should request batch shipment creation", async function () {
            const productIds = [productId];
            const receivers = [retailer.address];
            const trackingNumbers = ["BATCH001"];

            const tx = await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                productIds,
                receivers,
                trackingNumbers,
                1, // templateId
                1  // routeId
            );

            await expect(tx)
                .to.emit(shipmentFactory, "BatchShipmentRequested")
                .withArgs(1, distributor.address, 1, await getBlockTimestamp(tx));

            const batchRequest = await shipmentFactory.getBatchRequest(1);
            expect(batchRequest.distributor).to.equal(distributor.address);
            expect(batchRequest.isProcessed).to.be.false;
        });

        it("Should reject batch creation with empty arrays", async function () {
            await expect(
                shipmentFactory.connect(distributor).requestBatchShipmentCreation([], [], [], 1, 1)
            ).to.be.revertedWith("Must specify at least one shipment");
        });

        it("Should reject batch creation with mismatched array lengths", async function () {
            await expect(
                shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                    [productId],
                    [retailer.address, accounts.consumer.address], // Different length
                    ["TRACK1"],
                    1,
                    1
                )
            ).to.be.revertedWith("Array lengths must match");
        });

        it("Should process batch creation by distributor", async function () {
            // Request batch
            await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                [productId],
                [retailer.address],
                ["BATCH001"],
                1,
                1
            );

            // Process batch
            const tx = await shipmentFactory.connect(distributor).processBatchShipmentCreation(1);

            await expect(tx)
                .to.emit(shipmentFactory, "BatchShipmentCompleted");

            const batchRequest = await shipmentFactory.getBatchRequest(1);
            expect(batchRequest.isProcessed).to.be.true;
            expect(batchRequest.createdShipmentIds.length).to.equal(1);
        });

        it("Should process batch creation by factory owner", async function () {
            await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                [productId],
                [retailer.address],
                ["BATCH001"],
                1,
                1
            );

            await shipmentFactory.connect(deployer).processBatchShipmentCreation(1);

            const batchRequest = await shipmentFactory.getBatchRequest(1);
            expect(batchRequest.isProcessed).to.be.true;
        });

        it("Should reject processing already processed batch", async function () {
            await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                [productId],
                [retailer.address],
                ["BATCH001"],
                1,
                1
            );
            await shipmentFactory.connect(distributor).processBatchShipmentCreation(1);

            await expect(
                shipmentFactory.connect(distributor).processBatchShipmentCreation(1)
            ).to.be.revertedWith("Batch already processed");
        });

        it("Should reject processing by unauthorized user", async function () {
            await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                [productId],
                [retailer.address],
                ["BATCH001"],
                1,
                1
            );

            await expect(
                shipmentFactory.connect(unauthorized).processBatchShipmentCreation(1)
            ).to.be.revertedWith("Only distributor or factory owner can process batch");
        });
    });

    describe("Standard and Express Shipments", function () {
        it("Should create standard shipment", async function () {
            const tx = await shipmentFactory.connect(distributor).createStandardShipment(
                productId,
                retailer.address,
                "STD123",
                "TRUCK"
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate")
                .withArgs(
                    1, // shipmentId
                    0, // templateId (0 for standard)
                    productId,
                    distributor.address,
                    await getBlockTimestamp(tx)
                );

            expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
        });

        it("Should create express shipment", async function () {
            const tx = await shipmentFactory.connect(distributor).createExpressShipment(
                productId,
                retailer.address,
                "EXP123"
            );

            await expect(tx)
                .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate");

            expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
        });

        it("Should reject standard shipment creation by non-distributor", async function () {
            await expect(
                shipmentFactory.connect(unauthorized).createStandardShipment(
                    productId,
                    retailer.address,
                    "STD123",
                    "TRUCK"
                )
            ).to.be.revertedWith("Only registered distributors can create shipments");
        });
    });

    describe("Route Optimization", function () {
        beforeEach(async function () {
            // Create multiple routes
            await shipmentFactory.createRouteTemplate("Route1", "CityA", "CityB", [], 6, "TRUCK");
            await shipmentFactory.createRouteTemplate("Route2", "CityA", "CityB", [], 8, "TRUCK");
            await shipmentFactory.createRouteTemplate("Route3", "CityA", "CityC", [], 10, "AIR");
        });

        it("Should get optimal routes", async function () {
            const routeIds = await shipmentFactory.getOptimalRoutes("CityA", "CityB", "TRUCK");
            expect(routeIds.length).to.equal(2); // Should find both routes matching criteria
        });

        it("Should return empty array for non-matching routes", async function () {
            const routeIds = await shipmentFactory.getOptimalRoutes("CityX", "CityY", "SHIP");
            expect(routeIds.length).to.equal(0);
        });

        it("Should get most used routes", async function () {
            // Create template and use routes to increment usage
            await shipmentFactory.createShipmentTemplate("Test", "TRUCK", [], 24, false, 0, 0);
            
            await shipmentFactory.connect(distributor).createShipmentWithRoute(
                productId,
                retailer.address,
                "TRACK1",
                1, // Use route 1
                1
            );

            const [routeIds, usageCounts] = await shipmentFactory.getMostUsedRoutes(5);
            expect(routeIds.length).to.be.at.least(1);
            expect(usageCounts[0]).to.equal(1);
        });
    });

    describe("Query Functions", function () {
        beforeEach(async function () {
            await shipmentFactory.createShipmentTemplate("Test Template", "TRUCK", [], 24, false, 0, 0);
            await shipmentFactory.createRouteTemplate("Test Route", "A", "B", [], 6, "TRUCK");
            await shipmentFactory.connect(distributor).createStandardShipment(
                productId,
                retailer.address,
                "TRACK123",
                "TRUCK"
            );
        });

        it("Should get distributor shipments", async function () {
            const shipments = await shipmentFactory.getDistributorShipments(distributor.address);
            expect(shipments.length).to.equal(1);
        });

        it("Should get factory stats", async function () {
            const [totalTemplates, totalRoutes, totalShipments, totalBatches] = 
                await shipmentFactory.getFactoryStats();
            
            expect(totalTemplates).to.equal(1);
            expect(totalRoutes).to.equal(1);
            expect(totalShipments).to.equal(1);
            expect(totalBatches).to.equal(0);
        });
    });

    describe("Admin Functions", function () {
        it("Should update shipment registry", async function () {
            const newShipmentRegistry = await testHelpers.deployShipmentRegistry(
                await stakeholderRegistry.getAddress(),
                await productRegistry.getAddress()
            );

            await shipmentFactory.connect(deployer).updateShipmentRegistry(
                await newShipmentRegistry.getAddress()
            );

            expect(await shipmentFactory.shipmentRegistry()).to.equal(
                await newShipmentRegistry.getAddress()
            );
        });

        it("Should reject updating with zero address", async function () {
            await expect(
                shipmentFactory.connect(deployer).updateShipmentRegistry(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should reject admin functions by non-owner", async function () {
            const newRegistry = await testHelpers.deployShipmentRegistry(
                await stakeholderRegistry.getAddress(),
                await productRegistry.getAddress()
            );

            await expect(
                shipmentFactory.connect(unauthorized).updateShipmentRegistry(
                    await newRegistry.getAddress()
                )
            ).to.be.revertedWith("Only factory owner can perform this action");
        });

        it("Should transfer ownership", async function () {
            await shipmentFactory.connect(deployer).transferOwnership(distributor.address);
            expect(await shipmentFactory.factoryOwner()).to.equal(distributor.address);
        });

        it("Should reject ownership transfer to zero address", async function () {
            await expect(
                shipmentFactory.connect(deployer).transferOwnership(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });
    });

    describe("Edge Cases and Error Handling", function () {
        it("Should handle template existence checks", async function () {
            await expect(
                shipmentFactory.getShipmentTemplate(999)
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should handle route existence checks", async function () {
            await expect(
                shipmentFactory.getRouteTemplate(999)
            ).to.be.revertedWith("Route does not exist or is inactive");
        });

        it("Should handle deactivated templates", async function () {
            await shipmentFactory.createShipmentTemplate("Test", "TRUCK", [], 24, false, 0, 0);
            await shipmentFactory.deactivateTemplate(1);

            await expect(
                shipmentFactory.connect(distributor).createShipmentFromTemplate(
                    1,
                    productId,
                    retailer.address,
                    "TRACK123"
                )
            ).to.be.revertedWith("Template does not exist or is inactive");
        });

        it("Should handle batch request for non-existent batch", async function () {
            const batchRequest = await shipmentFactory.getBatchRequest(999);
            expect(batchRequest.distributor).to.equal(ethers.ZeroAddress);
        });
    });

    // Helper function to get block timestamp
    async function getBlockTimestamp(tx) {
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);
        return block.timestamp;
    }

    describe("Comprehensive Function Coverage", function () {
        let templateId, routeId;

        beforeEach(async function () {
            // Create template and route for testing
            const templateTx = await shipmentFactory.createShipmentTemplate(
                "Test Template",
                "TRUCK",
                ["Temperature Controlled", "Fragile Handling"],
                24,
                true,
                -5,
                5
            );
            const templateReceipt = await templateTx.wait();
            const templateEvent = templateReceipt.logs.find(log => {
                try {
                    const parsed = shipmentFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'ShipmentTemplateCreated';
                } catch {
                    return false;
                }
            });
            templateId = templateEvent ? shipmentFactory.interface.parseLog(templateEvent).args.templateId : 1;
            
            const routeTx = await shipmentFactory.createRouteTemplate(
                "Test Route",
                "Origin City",
                "Destination City",
                ["Waypoint 1", "Waypoint 2"],
                8,
                "TRUCK"
            );
            const routeReceipt = await routeTx.wait();
            const routeEvent = routeReceipt.logs.find(log => {
                try {
                    const parsed = shipmentFactory.interface.parseLog(log);
                    return parsed && parsed.name === 'RouteTemplateCreated';
                } catch {
                    return false;
                }
            });
            routeId = routeEvent ? shipmentFactory.interface.parseLog(routeEvent).args.routeId : 1;
        });

        describe("Template-based Shipment Creation", function () {
            it("Should create shipment from template successfully", async function () {
                const tx = await shipmentFactory.connect(distributor).createShipmentFromTemplate(
                    templateId,
                    productId,
                    retailer.address,
                    "TEMPLATE_TRACK_001"
                );

                await expect(tx)
                    .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate")
                    .withArgs(
                        1, // shipmentId
                        templateId,
                        productId,
                        distributor.address,
                        await getBlockTimestamp(tx)
                    );

                expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
                const distributorShipments = await shipmentFactory.getDistributorShipments(distributor.address);
                expect(distributorShipments.length).to.equal(1);
            });

            it("Should fail with invalid template", async function () {
                await expect(
                    shipmentFactory.connect(distributor).createShipmentFromTemplate(
                        999, // non-existent template
                        productId,
                        retailer.address,
                        "TRACK001"
                    )
                ).to.be.revertedWith("Template does not exist or is inactive");
            });

            it("Should fail when called by non-distributor", async function () {
                await expect(
                    shipmentFactory.connect(unauthorized).createShipmentFromTemplate(
                        templateId,
                        productId,
                        retailer.address,
                        "TRACK001"
                    )
                ).to.be.revertedWith("Only registered distributors can create shipments");
            });
        });

        describe("Route-based Shipment Creation", function () {
            it("Should create shipment with route successfully", async function () {
                const tx = await shipmentFactory.connect(distributor).createShipmentWithRoute(
                    productId,
                    retailer.address,
                    "ROUTE_TRACK_001",
                    routeId,
                    templateId
                );

                await expect(tx)
                    .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate");

                // Check that route usage was incremented
                const routeTemplate = await shipmentFactory.getRouteTemplate(routeId);
                expect(routeTemplate.usageCount).to.equal(1);
            });

            it("Should fail with invalid route", async function () {
                await expect(
                    shipmentFactory.connect(distributor).createShipmentWithRoute(
                        productId,
                        retailer.address,
                        "TRACK001",
                        999, // non-existent route
                        templateId
                    )
                ).to.be.revertedWith("Route does not exist or is inactive");
            });

            it("Should fail with invalid template", async function () {
                await expect(
                    shipmentFactory.connect(distributor).createShipmentWithRoute(
                        productId,
                        retailer.address,
                        "TRACK001",
                        routeId,
                        999 // non-existent template
                    )
                ).to.be.revertedWith("Template does not exist or is inactive");
            });
        });

        describe("Standard Shipment Creation", function () {
            it("Should create standard shipment successfully", async function () {
                const tx = await shipmentFactory.connect(distributor).createStandardShipment(
                    productId,
                    retailer.address,
                    "STD_TRACK_001",
                    "TRUCK"
                );

                await expect(tx)
                    .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate")
                    .withArgs(
                        1, // shipmentId
                        0, // no template used
                        productId,
                        distributor.address,
                        await getBlockTimestamp(tx)
                    );

                expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
            });

            it("Should fail when called by non-distributor", async function () {
                await expect(
                    shipmentFactory.connect(unauthorized).createStandardShipment(
                        productId,
                        retailer.address,
                        "TRACK001",
                        "TRUCK"
                    )
                ).to.be.revertedWith("Only registered distributors can create shipments");
            });
        });

        describe("Express Shipment Creation", function () {
            it("Should create express shipment with enhanced tracking", async function () {
                const tx = await shipmentFactory.connect(distributor).createExpressShipment(
                    productId,
                    retailer.address,
                    "EXPRESS_001"
                );

                await expect(tx)
                    .to.emit(shipmentFactory, "ShipmentCreatedFromTemplate")
                    .withArgs(
                        1, // shipmentId
                        0, // no template used
                        productId,
                        distributor.address,
                        await getBlockTimestamp(tx)
                    );

                expect(await shipmentFactory.totalShipmentsCreated()).to.equal(1);
            });
        });

        describe("Batch Shipment Operations", function () {
            it("Should request batch shipment creation successfully", async function () {
                // Create additional product for batch
                const productId2 = await testHelpers.createSampleProductSimple(productRegistry, accounts.farmer);
                await testHelpers.updateProductStage(productRegistry, accounts.processor, productId2, 1, "Processed");

                const tx = await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                    [productId, productId2],
                    [retailer.address, accounts.consumer.address],
                    ["BATCH_001", "BATCH_002"],
                    templateId,
                    routeId
                );

                await expect(tx)
                    .to.emit(shipmentFactory, "BatchShipmentRequested")
                    .withArgs(
                        1, // batchId
                        distributor.address,
                        2, // shipmentCount
                        await getBlockTimestamp(tx)
                    );

                const batchRequest = await shipmentFactory.getBatchRequest(1);
                expect(batchRequest.distributor).to.equal(distributor.address);
                expect(batchRequest.productIds.length).to.equal(2);
                expect(batchRequest.isProcessed).to.be.false;
            });

            it("Should fail with empty product list", async function () {
                await expect(
                    shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                        [], // empty array
                        [],
                        [],
                        templateId,
                        routeId
                    )
                ).to.be.revertedWith("Must specify at least one shipment");
            });

            it("Should fail with mismatched array lengths", async function () {
                await expect(
                    shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                        [productId],
                        [retailer.address, accounts.consumer.address], // mismatched length
                        ["BATCH_001"],
                        templateId,
                        routeId
                    )
                ).to.be.revertedWith("Array lengths must match");
            });

            it("Should process batch creation successfully", async function () {
                // Create additional product for batch
                const productId2 = await testHelpers.createSampleProductSimple(productRegistry, accounts.farmer);
                await testHelpers.updateProductStage(productRegistry, accounts.processor, productId2, 1, "Processed");

                // Request batch
                await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                    [productId, productId2],
                    [retailer.address, accounts.consumer.address],
                    ["BATCH_001", "BATCH_002"],
                    templateId,
                    routeId
                );

                // Process batch
                const tx = await shipmentFactory.connect(distributor).processBatchShipmentCreation(1);

                await expect(tx)
                    .to.emit(shipmentFactory, "BatchShipmentCompleted");

                const batchRequest = await shipmentFactory.getBatchRequest(1);
                expect(batchRequest.isProcessed).to.be.true;
                expect(batchRequest.createdShipmentIds.length).to.equal(2);

                // Check route usage was updated
                const routeTemplate = await shipmentFactory.getRouteTemplate(routeId);
                expect(routeTemplate.usageCount).to.equal(2);
            });

            it("Should allow factory owner to process batch", async function () {
                await shipmentFactory.connect(distributor).requestBatchShipmentCreation(
                    [productId],
                    [retailer.address],
                    ["BATCH_001"],
                    templateId,
                    routeId
                );

                // Factory owner can process
                await expect(
                    shipmentFactory.connect(deployer).processBatchShipmentCreation(1)
                ).to.not.be.reverted;
            });

            it("Should fail processing non-existent batch", async function () {
                await expect(
                    shipmentFactory.connect(distributor).processBatchShipmentCreation(999)
                ).to.be.revertedWith("Only distributor or factory owner can process batch");
            });
        });

        describe("Query and Statistics Functions", function () {
            beforeEach(async function () {
                // Create some shipments for testing
                await shipmentFactory.connect(distributor).createStandardShipment(
                    productId,
                    retailer.address,
                    "STATS_001",
                    "TRUCK"
                );
            });

            it("Should get distributor shipments", async function () {
                const shipments = await shipmentFactory.getDistributorShipments(distributor.address);
                expect(shipments.length).to.equal(1);
                expect(shipments[0]).to.equal(1); // first shipment ID
            });

            it("Should return empty array for distributor with no shipments", async function () {
                const shipments = await shipmentFactory.getDistributorShipments(accounts.consumer.address);
                expect(shipments.length).to.equal(0);
            });

            it("Should get factory statistics", async function () {
                const [totalTemplates, totalRoutes, totalShipments, totalBatches] = 
                    await shipmentFactory.getFactoryStats();
                
                expect(totalTemplates).to.equal(1); // created in beforeEach
                expect(totalRoutes).to.equal(1); // created in beforeEach
                expect(totalShipments).to.equal(1); // created in this beforeEach
                expect(totalBatches).to.equal(0); // no batches created yet
            });
        });

        describe("Template and Route Management", function () {
            it("Should get template by name", async function () {
                const template = await shipmentFactory.getTemplateByName("Test Template");
                expect(template.templateName).to.equal("Test Template");
                expect(template.transportMode).to.equal("TRUCK");
                expect(template.isActive).to.be.true;
            });

            it("Should fail getting non-existent template by name", async function () {
                await expect(
                    shipmentFactory.getTemplateByName("Non-existent Template")
                ).to.be.revertedWith("Template not found");
            });

            it("Should get route by name", async function () {
                const route = await shipmentFactory.getRouteByName("Test Route");
                expect(route.routeName).to.equal("Test Route");
                expect(route.origin).to.equal("Origin City");
                expect(route.destination).to.equal("Destination City");
            });

            it("Should fail getting non-existent route by name", async function () {
                await expect(
                    shipmentFactory.getRouteByName("Non-existent Route")
                ).to.be.revertedWith("Route not found");
            });

            it("Should deactivate template by creator", async function () {
                await shipmentFactory.connect(deployer).deactivateTemplate(templateId);
                
                await expect(
                    shipmentFactory.getShipmentTemplate(templateId)
                ).to.be.revertedWith("Template does not exist or is inactive");
            });

            it("Should deactivate route by factory owner", async function () {
                await shipmentFactory.connect(deployer).deactivateRoute(routeId);
                
                await expect(
                    shipmentFactory.getRouteTemplate(routeId)
                ).to.be.revertedWith("Route does not exist or is inactive");
            });

            it("Should fail deactivating template by unauthorized user", async function () {
                await expect(
                    shipmentFactory.connect(unauthorized).deactivateTemplate(templateId)
                ).to.be.revertedWith("Not authorized");
            });
        });

        describe("Registry Update Functions", function () {
            it("Should update product registry", async function () {
                const newProductRegistry = await testHelpers.deployProductRegistry(
                    await stakeholderRegistry.getAddress()
                );

                await shipmentFactory.connect(deployer).updateProductRegistry(
                    await newProductRegistry.getAddress()
                );

                expect(await shipmentFactory.productRegistry()).to.equal(
                    await newProductRegistry.getAddress()
                );
            });

            it("Should fail updating product registry with zero address", async function () {
                await expect(
                    shipmentFactory.connect(deployer).updateProductRegistry(ethers.ZeroAddress)
                ).to.be.revertedWith("Invalid address");
            });

            it("Should update stakeholder registry", async function () {
                const newStakeholderRegistry = await testHelpers.deployStakeholderRegistry();

                await shipmentFactory.connect(deployer).updateStakeholderRegistry(
                    await newStakeholderRegistry.getAddress()
                );

                expect(await shipmentFactory.stakeholderRegistry()).to.equal(
                    await newStakeholderRegistry.getAddress()
                );
            });

            it("Should fail updating stakeholder registry with zero address", async function () {
                await expect(
                    shipmentFactory.connect(deployer).updateStakeholderRegistry(ethers.ZeroAddress)
                ).to.be.revertedWith("Invalid address");
            });

            it("Should fail registry updates by non-owner", async function () {
                const newRegistry = await testHelpers.deployProductRegistry(
                    await stakeholderRegistry.getAddress()
                );

                await expect(
                    shipmentFactory.connect(unauthorized).updateProductRegistry(
                        await newRegistry.getAddress()
                    )
                ).to.be.revertedWith("Only factory owner can perform this action");
            });
        });

        describe("Ownership Management", function () {
            it("Should transfer ownership successfully", async function () {
                await shipmentFactory.connect(deployer).transferOwnership(distributor.address);
                expect(await shipmentFactory.factoryOwner()).to.equal(distributor.address);
            });

            it("Should fail transferring to zero address", async function () {
                await expect(
                    shipmentFactory.connect(deployer).transferOwnership(ethers.ZeroAddress)
                ).to.be.revertedWith("Invalid address");
            });

            it("Should fail transfer by non-owner", async function () {
                await expect(
                    shipmentFactory.connect(unauthorized).transferOwnership(distributor.address)
                ).to.be.revertedWith("Only factory owner can perform this action");
            });
        });
    });
}); 