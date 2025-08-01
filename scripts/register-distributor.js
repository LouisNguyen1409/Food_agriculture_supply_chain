const { ethers } = require("ethers")

async function main() {
    // Connect to local Hardhat network
    const provider = new ethers.JsonRpcProvider("http://localhost:8545")

    // Use account #0 (admin) to register account #1 as a distributor
    const adminSigner = await provider.getSigner(0) // Admin account
    const adminAddress = await adminSigner.getAddress()
    
    // Account #1 to be registered as distributor
    const distributorAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" // This is hardhat's account #1
    
    console.log(`Admin address: ${adminAddress}`)
    console.log(`Distributor address to register: ${distributorAddress}`)
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

    console.log(`Registering address ${distributorAddress} as a distributor...`)

    // In the contract, StakeholderRole enum is defined as:
    // enum StakeholderRole { NONE(0), FARMER(1), PROCESSOR(2), RETAILER(3), DISTRIBUTOR(4) }
    const DISTRIBUTOR_ROLE = 4 // DISTRIBUTOR is 4

    // ABI with the correct function signatures
    const stakeholderManagerABI = [
        "function registerStakeholder(address _stakeholderAddress, uint8 _role, string memory _businessName, string memory _businessLicense, string memory _location, string memory _certifications) returns (bool)",
        "function hasRole(address _stakeholderAddress, uint8 _role) view returns (bool)",
    ]

    const stakeholderManager = new ethers.Contract(
        stakeholderManagerAddress,
        stakeholderManagerABI,
        adminSigner // Using admin signer
    )

    try {
        console.log(
            `Checking if address ${distributorAddress} is already registered as a distributor (role ${DISTRIBUTOR_ROLE})...`
        )

        // Check if already registered as a distributor
        const isAlreadyDistributor = await stakeholderManager.hasRole(
            distributorAddress,
            DISTRIBUTOR_ROLE
        )
        if (isAlreadyDistributor) {
            console.log(
                `Address ${distributorAddress} is already registered as a distributor.`
            )
            return
        }

        console.log("Not registered yet, proceeding with registration...")

        // Admin registers account #1 as a distributor
        const tx = await stakeholderManager.registerStakeholder(
            distributorAddress,
            DISTRIBUTOR_ROLE,
            "Test Logistics & Distribution",
            "DISTLIC456",
            "Melbourne, Australia",
            "ISO 9001 Certified"
        )

        console.log(`Transaction sent: ${tx.hash}`)

        // Wait for transaction confirmation using ethers v6 syntax
        const receipt = await tx.wait()
        console.log(
            `✅ Successfully registered account #1 as a distributor! Transaction confirmed in block ${receipt.blockNumber}`
        )
        console.log(
            `You can now create shipments and perform distribution operations using account #1: ${distributorAddress}`
        )

    } catch (error) {
        console.error("Error registering as a distributor:", error)

        if (error.message && error.message.includes("execution reverted")) {
            console.log("\nPossible reasons for failure:")
            console.log("1. The admin account may no longer have admin privileges")
            console.log(
                "2. Your Hardhat node might have restarted and lost deployment state"
            )
            console.log("3. The business license may already be registered")
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
