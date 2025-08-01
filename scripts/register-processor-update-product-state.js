const { ethers } = require("ethers")

async function main() {
    // Connect to local Hardhat network
    const provider = new ethers.JsonRpcProvider("http://localhost:8545")

    // Use account #2 as a processor to update the product
    // Account #0 is usually admin/farmer
    // Account #1 is your distributor
    // So we'll use Account #2 as a processor
    const processorSigner = await provider.getSigner(2) // Processor account (Account #2)
    const processorAddress = await processorSigner.getAddress()

    // The product address that needs to be updated to PROCESSING stage
    const productAddress = "0x94099942864EA81cCF197E9D71ac53310b1468D8" // Update this with your product address

    console.log(`Processor address: ${processorAddress}`)
    console.log(`Product address: ${productAddress}`)

    // First, check if Account #2 is registered as a processor
    // Get ProductFactory first to retrieve other contract addresses (ShipmentFactoryAddress)
    const productFactoryAddress = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"
    const productFactoryABI = [
        "function stakeholderRegistry() view returns (address)",
    ]

    const productFactory = new ethers.Contract(
        productFactoryAddress,
        productFactoryABI,
        provider
    )

    // Get StakeholderRegistry address from ProductFactory
    const stakeholderRegistryAddress =
        await productFactory.stakeholderRegistry()
    console.log(`StakeholderRegistry address: ${stakeholderRegistryAddress}`)

    // Get StakeholderManager address from StakeholderRegistry
    const stakeholderRegistryABI = [
        "function stakeholderManager() view returns (address)",
    ]

    const stakeholderRegistry = new ethers.Contract(
        stakeholderRegistryAddress,
        stakeholderRegistryABI,
        provider
    )

    const stakeholderManagerAddress =
        await stakeholderRegistry.stakeholderManager()
    console.log(`StakeholderManager address: ${stakeholderManagerAddress}`)

    // First, let's check if the account is registered as PROCESSOR
    const PROCESSOR_ROLE = 2 // PROCESSOR is 2 in the enum
    const stakeholderManagerABI = [
        "function registerStakeholder(address _stakeholderAddress, uint8 _role, string memory _businessName, string memory _businessLicense, string memory _location, string memory _certifications) returns (bool)",
        "function hasRole(address _stakeholderAddress, uint8 _role) view returns (bool)",
    ]

    const stakeholderManager = new ethers.Contract(
        stakeholderManagerAddress,
        stakeholderManagerABI,
        await provider.getSigner(0) // Use admin (account #0) as signer for registration if needed
    )

    // Check if account #2 is registered as a processor
    const isProcessor = await stakeholderManager.hasRole(
        processorAddress,
        PROCESSOR_ROLE
    )
    console.log(`Account #2 is registered as PROCESSOR? ${isProcessor}`)

    if (!isProcessor) {
        console.log(
            "Account #2 is not registered as a processor. Registering now..."
        )

        // Register account #2 as a processor
        const tx = await stakeholderManager.registerStakeholder(
            processorAddress,
            PROCESSOR_ROLE,
            "Test Processing Company",
            "PROCLIC123",
            "Sydney, Australia",
            "ISO 22000 Food Safety"
        )

        console.log(`Registration transaction sent: ${tx.hash}`)
        const receipt = await tx.wait()
        console.log(
            `✅ Successfully registered account #2 as a processor! Transaction confirmed in block ${receipt.blockNumber}`
        )
    } else {
        console.log("Account #2 is already registered as a processor.")
    }

    // Now update the product stage to PROCESSING
    console.log("Updating product stage to PROCESSING...")

    const productABI = [
        "function updateProcessingStage(string calldata _processingData) external",
        "function currentStage() view returns (uint8)",
        "function name() view returns (string)",
    ]

    const product = new ethers.Contract(
        productAddress,
        productABI,
        processorSigner // Use processor account to make the update
    )

    try {
        // First check the current stage
        const currentStage = await product.currentStage()
        const productName = await product.name()
        console.log(`Product Name: ${productName}`)
        console.log(
            `Current product stage: ${currentStage} (0=FARM, 1=PROCESSING, 2=DISTRIBUTION, 3=RETAIL, 4=CONSUMED)`
        )

        if (currentStage > 0) {
            console.log(
                "Product is already past the FARM stage. No need to update."
            )
            return
        }

        // Update to PROCESSING stage
        const tx = await product.updateProcessingStage(
            "Product processed by Test Processing Company: Quality inspection passed, product prepared for distribution."
        )

        console.log(`Transaction sent: ${tx.hash}`)
        const receipt = await tx.wait()
        console.log(
            `✅ Successfully updated product to PROCESSING stage! Transaction confirmed in block ${receipt.blockNumber}`
        )
        console.log(
            "Now you should be able to create a shipment for this product."
        )
    } catch (error) {
        console.error("Error updating product stage:", error)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
