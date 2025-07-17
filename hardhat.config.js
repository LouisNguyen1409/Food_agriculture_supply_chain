require("@nomicfoundation/hardhat-toolbox")
require("dotenv").config()
require("hardhat-deploy")

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            // Default Hardhat network for testing
            chainId: 31337,
            allowUnlimitedContractSize: true, // Allow large contracts for testing
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337,
            allowUnlimitedContractSize: true,
        },
        // Only add Polygon network if environment variables are set
        ...(process.env.POLYGON_RPC_URL && process.env.PRIVATE_KEY ? {
            polygon: {
                url: process.env.POLYGON_RPC_URL,
                accounts: [process.env.PRIVATE_KEY],
                chainId: 80002,
                blockConfirmations: 6,
            },
        } : {}),
    },
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000, // Increased for better optimization
            },
            viaIR: true, // Enable intermediate representation for better optimization
        },
        compilers: [
            {
                version: "0.8.19",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000,
                    },
                    viaIR: true,
                },
            },
            {
                version: "0.8.8",
            },
            {
                version: "0.6.6",
            },
        ],
    },
    etherscan: {
        apiKey: {
            polygon: process.env.POLYGONSCAN_API_KEY || "",
            polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS === "true",
        currency: "USD",
        outputFile: "gas-report.txt",
        noColors: true,
        coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    },
    paths: {
        sources: "./src/SmartContract",
        tests: "./src/test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    mocha: {
        timeout: 60000, // Increased timeout for complex tests
    },
}
