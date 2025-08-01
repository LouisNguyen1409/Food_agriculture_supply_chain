const { ethers } = require("ethers")

async function main() {
    // Connect to local Hardhat network
    const provider = new ethers.JsonRpcProvider("http://localhost:8545")

    // Use the default account from hardhat
    const signer = await provider.getSigner(0)
    const address = await signer.getAddress()

    console.log(`Using address: ${address}`)
    console.log("Getting contract addresses...")

    // Get ProductFactory first to retrieve other contract addresses
    const productFactoryAddress = "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"
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

    console.log(`Registering address ${address} as a farmer...`)

    // In the contract, StakeholderRole enum is defined as:
    // enum StakeholderRole { NONE(0), FARMER(1), PROCESSOR(2), RETAILER(3), DISTRIBUTOR(4) }
    const FARMER_ROLE = 1 // FARMER is 1, not 0!

    // ABI with the correct function signatures
    const stakeholderManagerABI = [
        "function registerStakeholder(address _stakeholderAddress, uint8 _role, string memory _businessName, string memory _businessLicense, string memory _location, string memory _certifications) returns (bool)",
        "function hasRole(address _stakeholderAddress, uint8 _role) view returns (bool)",
    ]

    const stakeholderManager = new ethers.Contract(
        stakeholderManagerAddress,
        stakeholderManagerABI,
        signer
    )

    try {
        console.log(
            `Checking if address ${address} is already registered as a farmer (role ${FARMER_ROLE})...`
        )

        // Check if already registered as a farmer
        const isAlreadyFarmer = await stakeholderManager.hasRole(
            address,
            FARMER_ROLE
        )
        if (isAlreadyFarmer) {
            console.log(`Address ${address} is already registered as a farmer.`)
            return
        }

        console.log("Not registered yet, proceeding with registration...")

        // Register as a farmer
        const tx = await stakeholderManager.registerStakeholder(
            address,
            FARMER_ROLE,
            "Test Organic Farm",
            "LICENSE123",
            "Sydney, Australia",
            "Organic Certified"
        )

        console.log(`Transaction sent: ${tx.hash}`)

        // Wait for transaction confirmation using ethers v6 syntax
        const receipt = await tx.wait()
        console.log(
            `✅ Successfully registered as a farmer! Transaction confirmed in block ${receipt.blockNumber}`
        )
        console.log(
            `You can now create products using your account: ${address}`
        )
    } catch (error) {
        console.error("Error registering as a farmer:", error)

        if (error.message && error.message.includes("execution reverted")) {
            console.log("\nPossible reasons for failure:")
            console.log("1. Only an admin can register stakeholders")
            console.log(
                "2. Your Hardhat node might have restarted and lost deployment state"
            )
            console.log("3. The business license may already be registered")
        }

        // For ethers v6, we might also get a different error structure
        if (error.code === "CALL_EXCEPTION") {
            console.log("\nContract call failed. Make sure:")
            console.log(
                "1. Your contracts are properly deployed to the local Hardhat network"
            )
            console.log(
                "2. The account you're using has admin privileges to register stakeholders"
            )
            console.log("3. You're using the correct contract addresses")
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
