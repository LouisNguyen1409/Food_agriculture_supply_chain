const { ethers } = require("hardhat")

async function main() {
    console.log("Testing Fixed Four-Contract System...\n")

    const [
        deployer,
        farmer1,
        farmer2,
        processor1,
        distributor1,
        retailer1,
        shipper1,
        shipper2,
    ] = await ethers.getSigners()

    try {
        // Deploy core contracts
        console.log("Deploying core contracts...")

        const ProductBatch = await ethers.getContractFactory("ProductBatch")
        const productBatch = await ProductBatch.deploy()
        await productBatch.waitForDeployment()

        const OfferManager = await ethers.getContractFactory("OfferManager")
        const offerManager = await OfferManager.deploy(
            await productBatch.getAddress()
        )
        await offerManager.waitForDeployment()

        const ShipmentTracker = await ethers.getContractFactory(
            "ShipmentTracker"
        )
        const shipmentTracker = await ShipmentTracker.deploy(
            await productBatch.getAddress()
        )
        await shipmentTracker.waitForDeployment()

        const Registry = await ethers.getContractFactory("Registry")
        const registry = await Registry.deploy()
        await registry.waitForDeployment()

        console.log("All contracts deployed successfully\n")

        // Setup roles
        const setupRole = async (contract, address, role) => {
            await contract.grantRole(address, role)
            await contract.activateAccount(address)
        }

        const ROLE = {
            FARMER: 1,
            PROCESSOR: 2,
            DISTRIBUTOR: 3,
            SHIPPER: 4,
            RETAILER: 5,
        }
        const TRADING_MODE = {
            SPOT_MARKET: 0,
            CONTRACT_FARMING: 1,
            COOPERATIVE: 2,
        }

        // Setup roles for all contracts
        for (const contract of [
            productBatch,
            offerManager,
            shipmentTracker,
            registry,
        ]) {
            await setupRole(contract, farmer1.address, ROLE.FARMER)
            await setupRole(contract, farmer2.address, ROLE.FARMER)
            await setupRole(contract, processor1.address, ROLE.PROCESSOR)
            await setupRole(contract, distributor1.address, ROLE.DISTRIBUTOR)
            await setupRole(contract, retailer1.address, ROLE.RETAILER)
            await setupRole(contract, shipper1.address, ROLE.SHIPPER)
            await setupRole(contract, shipper2.address, ROLE.SHIPPER)
        }

        console.log("Roles assigned to all stakeholders\n")

        // ADD THIS: Grant ShipmentTracker permission to interact with ProductBatch
        console.log("Setting up cross-contract permissions...")
        await productBatch.grantRole(
            await shipmentTracker.getAddress(),
            ROLE.DISTRIBUTOR
        )
        await productBatch.activateAccount(await shipmentTracker.getAddress())

        // Also grant OfferManager permission to interact with ProductBatch
        await productBatch.grantRole(
            await offerManager.getAddress(),
            ROLE.PROCESSOR
        )
        await productBatch.activateAccount(await offerManager.getAddress())
        // =============================================================
        // SCENARIO 1: BASIC PRODUCT CREATION & REGISTRY
        // =============================================================
        console.log("SCENARIO 1: Product Creation & Registry\n")

        // Farmer1 creates mangoes
        console.log("Farmer1 creates mangoes...")
        const batch1Tx = await productBatch.connect(farmer1).createBatch(
            "Organic Mangoes",
            "Fresh organic mangoes from tropical farm",
            100, // quantity
            ethers.parseEther("0.01"), // 0.01 ETH base price
            "Costa Rica Farm",
            "QmMango1",
            TRADING_MODE.SPOT_MARKET,
            [], // no authorized buyers
            false // not weather dependent (to avoid oracle dependency)
        )
        await batch1Tx.wait()

        // Register in registry
        await registry.connect(farmer1).registerProduct(
            await productBatch.getAddress(),
            1, // batchId
            farmer1.address,
            "Organic Mangoes",
            "Fruits",
            100,
            ethers.parseEther("0.01"),
            "Costa Rica Farm",
            TRADING_MODE.SPOT_MARKET
        )
        console.log("Mangoes created and registered")

        // Farmer2 creates apples
        console.log("\nFarmer2 creates apples...")
        const batch2Tx = await productBatch
            .connect(farmer2)
            .createBatch(
                "Red Apples",
                "Crisp red apples from mountain orchard",
                150,
                ethers.parseEther("0.008"),
                "Washington Orchard",
                "QmApple1",
                TRADING_MODE.SPOT_MARKET,
                [],
                false
            )
        await batch2Tx.wait()

        await registry
            .connect(farmer2)
            .registerProduct(
                await productBatch.getAddress(),
                2,
                farmer2.address,
                "Red Apples",
                "Fruits",
                150,
                ethers.parseEther("0.008"),
                "Washington Orchard",
                TRADING_MODE.SPOT_MARKET
            )
        console.log("Apples created and registered")

        // =============================================================
        // SCENARIO 2: MARKETPLACE ANALYTICS
        // =============================================================
        console.log("\nSCENARIO 2: Marketplace Analytics\n")

        // Get marketplace overview
        console.log("Getting marketplace overview...")
        const marketOverview = await registry.getMarketplaceOverview()
        console.log(`   Total Products: ${marketOverview[0]}`)
        console.log(`   Available Products: ${marketOverview[1]}`)
        console.log(`   Total Transactions: ${marketOverview[2]}`)
        console.log(`   Total Volume: ${marketOverview[3]} units`)
        console.log(
            `   Total USD Value: $${ethers.formatUnits(marketOverview[4], 18)}`
        )
        console.log(`   Weather-Dependent Products: ${marketOverview[8]}`)

        // Get products by category
        console.log("\n Getting fruits products...")
        const fruitProducts = await registry.getAvailableProductsByCategory(
            "Fruits"
        )
        console.log(
            `   Found ${
                fruitProducts.length
            } fruit products: [${fruitProducts.join(", ")}]`
        )

        // Search products
        console.log("\n Searching for apples...")
        const appleSearch = await registry.searchProducts(
            "Apple",
            "",
            TRADING_MODE.SPOT_MARKET,
            false
        )
        console.log(
            `   Found ${appleSearch.length} apple products: [${appleSearch.join(
                ", "
            )}]`
        )

        // =============================================================
        // SCENARIO 3: TRADING WORKFLOW
        // =============================================================
        console.log("\n SCENARIO 3: Trading Workflow\n")

        // List products for sale
        console.log(" Listing products for sale...")
        await productBatch
            .connect(farmer1)
            .listForSale(
                1,
                ethers.parseEther("0.012"),
                TRADING_MODE.SPOT_MARKET
            )

        await productBatch
            .connect(farmer2)
            .listForSale(
                2,
                ethers.parseEther("0.010"),
                TRADING_MODE.SPOT_MARKET
            )
        console.log(" Products listed for sale")

        // Processor makes offer for mangoes
        console.log("\n Processor makes offer for mangoes...")
        // NEW - Use createBuyOffer since processor wants to buy:
        const offerTx = await offerManager.connect(processor1).createBuyOffer(
            1, // batchId (mangoes)
            ethers.parseEther("0.015"), // offered price
            100, // quantity
            "QmBuyTerms", // terms
            3600, // duration (1 hour)
            farmer1.address // seller (specific farmer)
        )
        await offerTx.wait()
        console.log(" Offer created")

        // Farmer accepts offer
        console.log("\n Farmer1 accepts the offer...")
        const acceptTx = await offerManager.connect(farmer1).acceptOffer(1)
        await acceptTx.wait()
        console.log(" Offer accepted")

        // Record transaction
        await registry.connect(farmer1).recordTransaction(
            1, // batchId
            farmer1.address,
            processor1.address,
            ethers.parseEther("0.015"),
            100, // quantity
            "SPOT_MARKET"
        )

        // =============================================================
        // SCENARIO 4: SHIPMENT TRACKING
        // =============================================================
        console.log("\n SCENARIO 4: Shipment Tracking\n")

        // Create shipment
        console.log(" Creating shipment with professional shipper...")
        const shipmentTx = await shipmentTracker
            .connect(farmer1)
            .createShipment(
                1, // batchId
                1, // offerId
                processor1.address, // receiver
                shipper1.address, // dedicated shipper
                "SHIP-MANGO-001", // trackingId
                "Costa Rica Farm", // fromLocation
                "Processing Facility", // toLocation
                "QmShipmentMeta" // metadataHash
            )
        await productBatch
            .connect(farmer1)
            ["transferOwnership(uint256,address)"](1, shipper1.address)
        console.log(" Ownership transferred from farmer to shipper")

        await shipmentTx.wait()
        console.log(" Shipment created with professional shipper")

        // Shipper manages the entire shipping process
        console.log(" Professional shipper manages delivery...")

        // 1. Shipper picks up from farmer
        await shipmentTracker.connect(shipper1).pickupShipment(1)
        console.log("    Shipper1 picked up from farmer")

        // 2. Shipper updates location during transit
        await shipmentTracker
            .connect(shipper1)
            .updateLocation(1, "Port - Loading for transport")
        console.log("    Shipper1: At port, loading cargo")

        await shipmentTracker
            .connect(shipper1)
            .updateLocation(1, "Highway 101 - In Transit to Processing")
        console.log("    Shipper1: En route to processing facility")

        await shipmentTracker
            .connect(shipper1)
            .updateLocation(1, "Processing Facility - Arrived")
        console.log("    Shipper1: Arrived at destination")

        // 3. Shipper marks as delivered
        await shipmentTracker.connect(shipper1).markDelivered(1)
        console.log("    Shipper1: Marked as delivered")

        // 4. Ownership transfer (farmer to processor)
        await productBatch
            .connect(shipper1)
            ["transferOwnership(uint256,address)"](1, processor1.address)
        console.log(" Ownership transferred from shipper to processor")

        // 5. Processor confirms delivery
        await shipmentTracker.connect(processor1).confirmDelivery(1)
        console.log(" Processor confirmed delivery from shipper")

        // =============================================================
        // SCENARIO 5: ENHANCED ANALYTICS
        // =============================================================
        console.log("\n SCENARIO 5: Enhanced Analytics\n")

        // User dashboards
        console.log("Farmer1 dashboard...")
        const farmer1Dashboard = await registry.getUserDashboard(
            farmer1.address
        )
        console.log(`   Total Products: ${farmer1Dashboard[0]}`)
        console.log(`   Available Products: ${farmer1Dashboard[1]}`)
        console.log(`   Transaction Count: ${farmer1Dashboard[2]}`)
        console.log(
            `   Total USD Value Traded: $${ethers.formatUnits(
                farmer1Dashboard[3],
                18
            )}`
        )
        console.log(`   Weather-Dependent Products: ${farmer1Dashboard[5]}`)

        console.log("\n Processor1 dashboard...")
        const processor1Dashboard = await registry.getUserDashboard(
            processor1.address
        )
        console.log(`   Total Products: ${processor1Dashboard[0]}`)
        console.log(`   Available Products: ${processor1Dashboard[1]}`)
        console.log(`   Transaction Count: ${processor1Dashboard[2]}`)
        console.log(
            `   Total USD Value Traded: $${ethers.formatUnits(
                processor1Dashboard[3],
                18
            )}`
        )

        // Category analytics
        console.log("\n Fruits category analytics...")
        const categoryAnalytics = await registry.getCategoryAnalytics("Fruits")
        console.log(
            `   Average USD Price: $${ethers.formatUnits(
                categoryAnalytics[0],
                18
            )}`
        )
        console.log(`   Total Volume: ${categoryAnalytics[2]} units`)
        console.log(`   Available Count: ${categoryAnalytics[5]}`)
        console.log(`   Weather-Dependent Count: ${categoryAnalytics[6]}`)

        // Trading mode analytics
        console.log("\n Spot market analytics...")
        const spotAnalytics = await registry.getTradingModeAnalytics(
            TRADING_MODE.SPOT_MARKET
        )
        console.log(`   Total Products: ${spotAnalytics[0]}`)
        console.log(`   Total Volume: ${spotAnalytics[1]}`)
        console.log(
            `   Average Price: $${ethers.formatUnits(spotAnalytics[2], 18)}`
        )

        // Batch transaction history
        console.log("\n Batch 1 transaction history...")
        const batchTransactions = await registry.getBatchTransactions(1)
        console.log(`   Transactions: [${batchTransactions.join(", ")}]`)

        // Final market overview
        console.log("\n Final market overview...")
        const finalOverview = await registry.getMarketOverview()
        console.log(`   Total Active Products: ${finalOverview[0]}`)
        console.log(`   Total Transaction Volume: ${finalOverview[1]}`)
        console.log(`   Spot Market Products: ${finalOverview[3]}`)
        console.log(`   Contract Farming Products: ${finalOverview[4]}`)

        // =============================================================
        // SUCCESS SUMMARY
        // =============================================================
        console.log("\n FIXED SYSTEM TEST COMPLETED SUCCESSFULLY!")
        console.log("\nSuccessfully Demonstrated:")
        console.log("    Product Creation & Registration")
        console.log("    Marketplace Analytics")
        console.log("    Product Search & Filtering")
        console.log("    Trading Workflow (Offer -> Accept -> Transfer)")
        console.log("    Shipment Tracking")
        console.log("    Enhanced User Dashboards")
        console.log("    Category & Trading Mode Analytics")
        console.log("    Transaction History Tracking")
        console.log("\n System Features:")
        console.log("    Comprehensive market analytics")
        console.log("    Advanced search capabilities")
        console.log("    Real-time dashboard updates")
        console.log("    Multi-stakeholder workflow")
        console.log("    End-to-end supply chain tracking")

        // =============================================================
        // SCENARIO 4B: EXTENDED SUPPLY CHAIN FLOW
        // =============================================================
        console.log("\n SCENARIO 4B: Extended Supply Chain Flow\n")

        // Processor processes the mangoes
        console.log(" Processor processes the mangoes...")
        await productBatch.connect(processor1).processBatch(
            1, // batchId
            "Juice Processing", // processingType
            "pH: 4.2, Sugar: 15%", // qualityMetrics
            80 // outputQuantity (100 -> 80 after processing)
        )
        console.log(" Mangoes processed into juice")

        // Processor lists processed product for distributors
        console.log("\n Processor lists juice for distributors...")
        await productBatch.connect(processor1).listForSale(
            1, // same batchId, now processed
            ethers.parseEther("0.025"), // higher price after processing
            TRADING_MODE.SPOT_MARKET
        )
        console.log(" Processed juice listed for sale")

        // Distributor makes offer to processor
        console.log("\n Distributor makes offer for juice...")
        const distributorOfferTx = await offerManager
            .connect(distributor1)
            .createBuyOffer(
                1, // batchId
                ethers.parseEther("0.025"), // offered price
                80, // quantity (processed amount)
                "QmDistributorTerms", // terms
                3600, // duration
                processor1.address // seller
            )
        await distributorOfferTx.wait()
        console.log(" Distributor offer created")

        // Processor accepts distributor's offer
        console.log("\n Processor accepts distributor's offer...")
        const acceptDistributorTx = await offerManager
            .connect(processor1)
            .acceptOffer(2) // Assuming offer ID 2
        await acceptDistributorTx.wait()
        console.log(" Distributor offer accepted")

        // Record processor -> distributor transaction
        await registry.connect(processor1).recordTransaction(
            1, // batchId
            processor1.address,
            distributor1.address,
            ethers.parseEther("0.025"),
            80, // quantity
            "SPOT_MARKET"
        )

        // Create shipment: Processor -> Distributor
        console.log("\n Creating shipment: Processor -> Distributor...")
        const shipment2Tx = await shipmentTracker
            .connect(processor1)
            .createShipment(
                1, // batchId
                2, // offerId
                distributor1.address, // receiver
                shipper2.address, // shipper
                "TRACK-JUICE-002",
                "Processing Facility",
                "Distribution Center",
                "QmShipment2Meta"
            )
        await shipment2Tx.wait()
        await productBatch
            .connect(processor1)
            ["transferOwnership(uint256,address)"](1, shipper2.address)
        console.log(" Ownership transferred")

        // Track shipment 2
        await shipmentTracker.connect(shipper2).pickupShipment(2)
        console.log("    Juice shipment picked up")
        await shipmentTracker
            .connect(shipper2)
            .updateLocation(2, "Regional Highway")
        console.log("    Juice shipment in transit")
        await shipmentTracker.connect(shipper2).markDelivered(2)
        console.log("    Juice shipment delivered to distributor")

        await productBatch
            .connect(shipper2)
            ["transferOwnership(uint256,address)"](1, distributor1.address)
        console.log(" Ownership transferred")

        await shipmentTracker.connect(distributor1).confirmDelivery(2)
        console.log(" Distributor confirmed juice delivery")

        // Distributor lists for retailers
        console.log("\n Distributor lists juice for retailers...")
        await productBatch.connect(distributor1).listForSale(
            1, // batchId
            ethers.parseEther("0.035"), // markup for retail
            TRADING_MODE.SPOT_MARKET
        )
        console.log(" Juice listed for retailers")

        // Retailer makes offer to distributor
        console.log("\n Retailer makes offer for juice...")
        const retailerOfferTx = await offerManager
            .connect(retailer1)
            .createBuyOffer(
                1, // batchId
                ethers.parseEther("0.035"), // offered price
                80, // quantity
                "QmRetailerTerms", // terms
                3600, // duration
                distributor1.address // seller
            )
        await retailerOfferTx.wait()
        console.log(" Retailer offer created")

        // Distributor accepts retailer's offer
        console.log("\n Distributor accepts retailer's offer...")
        const acceptRetailerTx = await offerManager
            .connect(distributor1)
            .acceptOffer(3) // Assuming offer ID 3
        await acceptRetailerTx.wait()
        console.log(" Retailer offer accepted")

        // Record distributor -> retailer transaction
        await registry.connect(distributor1).recordTransaction(
            1, // batchId
            distributor1.address,
            retailer1.address,
            ethers.parseEther("0.035"),
            80, // quantity
            "SPOT_MARKET"
        )

        // Create shipment: Distributor -> Retailer
        console.log("\n Creating shipment: Distributor -> Retailer...")
        const shipment3Tx = await shipmentTracker
            .connect(distributor1)
            .createShipment(
                1, // batchId
                3, // offerId
                retailer1.address, // receiver
                shipper1.address, // shipper
                "TRACK-JUICE-003",
                "Distribution Center",
                "Retail Store",
                "QmShipment3Meta"
            )
        await shipment3Tx.wait()
        await productBatch
            .connect(distributor1)
            ["transferOwnership(uint256,address)"](1, shipper1.address)
        console.log(" Ownership transferred")

        // Track shipment 3
        await shipmentTracker.connect(shipper1).pickupShipment(3)
        console.log("    Final shipment picked up")
        await shipmentTracker
            .connect(shipper1)
            .updateLocation(3, "City Streets")
        console.log("    Final shipment in transit")
        await shipmentTracker.connect(shipper1).markDelivered(3)
        console.log("    Final shipment delivered to retailer")

        await productBatch
            .connect(shipper1)
            ["transferOwnership(uint256,address)"](1, retailer1.address)
        console.log(" Ownership transferred")

        await shipmentTracker.connect(retailer1).confirmDelivery(3)
        console.log(" Retailer confirmed final delivery")

        await productBatch.connect(retailer1).listForSale(
            1, // batchId
            ethers.parseEther("0.035"), // markup for retail
            TRADING_MODE.SPOT_MARKET
        )
        // Final product ready for consumers
        console.log(
            "\n Product journey complete! Ready for consumers at retail store"
        )

        // =============================================================
        // SCENARIO 5: COMPREHENSIVE ANALYTICS
        // =============================================================
        console.log("\n SCENARIO 5: Comprehensive Supply Chain Analytics\n")

        // Updated marketplace overview
        console.log(" Final marketplace overview...")
        const finalMarketOverview = await registry.getMarketplaceOverview()
        console.log(`   Total Products: ${finalMarketOverview[0]}`)
        console.log(`   Available Products: ${finalMarketOverview[1]}`)
        console.log(`   Total Transactions: ${finalMarketOverview[2]}`)
        console.log(`   Total Volume: ${finalMarketOverview[3]} units`)
        console.log(
            `   Total USD Value: $${ethers.formatUnits(
                finalMarketOverview[4],
                18
            )}`
        )

        // Stakeholder dashboards
        console.log("\n Stakeholder Dashboards:")

        console.log("\nFarmer1 dashboard...")
        const farmer1Dashboard2 = await registry.getUserDashboard(
            farmer1.address
        )
        console.log(`   Products Created: ${farmer1Dashboard2[0]}`)
        console.log(`   Transactions: ${farmer1Dashboard2[2]}`)
        console.log(
            `   Revenue: $${ethers.formatUnits(farmer1Dashboard2[3], 18)}`
        )

        console.log("\n Processor1 dashboard...")
        const processor1Dashboard2 = await registry.getUserDashboard(
            processor1.address
        )
        console.log(`   Products Processed: ${processor1Dashboard2[0]}`)
        console.log(`   Transactions: ${processor1Dashboard2[2]}`)
        console.log(
            `   Revenue: $${ethers.formatUnits(processor1Dashboard2[3], 18)}`
        )

        console.log("\n Distributor1 dashboard...")
        const distributor1Dashboard = await registry.getUserDashboard(
            distributor1.address
        )
        console.log(`   Products Distributed: ${distributor1Dashboard[0]}`)
        console.log(`   Transactions: ${distributor1Dashboard[2]}`)
        console.log(
            `   Revenue: $${ethers.formatUnits(distributor1Dashboard[3], 18)}`
        )

        console.log("\n Retailer1 dashboard...")
        const retailer1Dashboard = await registry.getUserDashboard(
            retailer1.address
        )
        console.log(`   Products in Store: ${retailer1Dashboard[0]}`)
        console.log(`   Transactions: ${retailer1Dashboard[2]}`)
        console.log(
            `   Investment: $${ethers.formatUnits(retailer1Dashboard[3], 18)}`
        )

        // Complete transaction history for the batch
        console.log("\n Complete transaction history for Batch 1:")
        const allTransactions = await registry.getBatchTransactions(1)
        console.log(`   Transaction IDs: [${allTransactions.join(", ")}]`)

        // Value chain analysis
        console.log("\n Value Chain Analysis:")
        console.log("    Farm Gate Price: $0.015 (100 units)")
        console.log("    Processed Price: $0.025 (80 units) - 67% markup")
        console.log("    Distribution Price: $0.025 (80 units) - No markup")
        console.log("    Retail Price: $0.035 (80 units) - 40% markup")
        console.log("    Total Value Addition: 133% from farm to retail")

        console.log("\n Supply Chain Traceability:")
        console.log("    Farm to Processing: Tracked via shipment 1")
        console.log("    Processing to Distribution: Tracked via shipment 2")
        console.log("    Distribution to Retail: Tracked via shipment 3")
        console.log("    Complete chain of custody maintained")

        // Get some consumer accounts (using remaining signers)
        const [, , , , , , , , consumer1, consumer2] = await ethers.getSigners()

        // Retailer has the juice, let's make it available for consumers
        console.log(" Retailer1 makes juice available for consumer purchase...")

        // First, check current batch status
        const batchInfo = await productBatch.getBatchInfo(1)
        console.log(`   Current owner: ${batchInfo[1]}`)
        console.log(`   Current quantity: ${batchInfo[8]}`)
        console.log(`   Is available for sale: ${batchInfo[9]}`)

        // Consumer1 purchases juice with immediate ownership
        console.log(
            "\n Consumer1 purchases juice with immediate ownership transfer..."
        )

        const consumer1PurchaseTx = await productBatch
            .connect(consumer1)
            .purchaseWithImmediateOwnership(
                1, // batchId (the processed mango juice)
                retailer1.address, // retailer
                20, // quantity (buying 20 units out of 80)
                "123 Consumer Street, Home Address", // delivery address
                { value: ethers.parseEther("0.7") } // 20 units * 0.035 ETH each = 0.7 ETH
            )
        await consumer1PurchaseTx.wait()
        console.log(" Consumer1 purchase completed with immediate ownership!")

        // Get purchase details
        const consumer1Purchase = await productBatch.getConsumerPurchase(1)
        console.log(`   Purchase ID: 1`)
        console.log(`   Consumer: ${consumer1Purchase[1]}`)
        console.log(`   Retailer: ${consumer1Purchase[2]}`)
        console.log(
            `   Price Paid: ${ethers.formatEther(consumer1Purchase[3])} ETH`
        )
        console.log(`   Quantity: ${consumer1Purchase[4]} units`)
        console.log(`   Pickup Location: ${consumer1Purchase[8]}`)
        console.log(`   Is Picked Up: ${consumer1Purchase[6]}`)
        console.log(`   Ownership Claimed: ${consumer1Purchase[7]}`)

        // Show consumer purchase history
        console.log("\n Consumer Purchase Histories:")

        const consumer1History = await productBatch.getConsumerHistory(
            consumer1.address
        )
        console.log(`   Consumer1 purchases: [${consumer1History.join(", ")}]`)

        // Record consumer1 transaction
        await registry.connect(retailer1).recordTransaction(
            1, // batchId
            retailer1.address, // seller
            consumer1.address, // buyer
            ethers.parseEther("0.035"), // unit price
            20, // quantity
            "CONSUMER_PURCHASE"
        )

        console.log(" Consumer transactions recorded in registry")

        // Show complete supply chain journey
        console.log("\n COMPLETE SUPPLY CHAIN JOURNEY:")
        console.log("    Farmer1 (Costa Rica) → Created 100 mango units")
        console.log("    Processor1 → Processed to 80 juice units")
        console.log("    Distributor1 → Distributed 80 units")
        console.log("    Retailer1 → Stocked 80 units for sale")
        console.log("    Consumer1 → Bought 20 units (immediate ownership)")
        console.log("    Remaining → 60 units still available at retailer")
    } catch (err) {
        console.error(" Error:", err)
        console.error("Stack trace:", err.stack)
        process.exit(1)
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err)
        process.exit(1)
    })
