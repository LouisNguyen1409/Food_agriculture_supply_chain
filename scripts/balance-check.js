const { ethers, network } = require("hardhat")

async function main() {
    const [signer] = await ethers.getSigners()
    const balance = await signer.provider.getBalance(signer.address)

    console.log("=".repeat(50))
    console.log("Account Balance Check")
    console.log("=".repeat(50))
    console.log(`Address: ${signer.address}`)
    console.log(`Balance: ${ethers.formatEther(balance)} MATIC`)
    console.log(
        `Network: ${network.name} (Chain ID: ${network.config.chainId})`
    )

    if (balance < ethers.parseEther("1")) {
        console.log("\nNeed more MATIC for full deployment!")
        console.log("Get test MATIC from: https://faucet.polygon.technology/")
        console.log("   1. Connect your wallet")
        console.log("   2. Select 'Polygon Amoy' network")
        console.log("   3. Request test MATIC")
        console.log("   4. Wait a few minutes and check again")
    } else {
        console.log("\nSufficient balance for deployment!")
    }
    console.log("=".repeat(50))
}

main().catch(console.error)
