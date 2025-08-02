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
        // Polygon Amoy Testnet
        polygon: {
            url:
                process.env.POLYGON_RPC_URL ||
                "https://rpc-amoy.polygon.technology/",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 80002,
            blockConfirmations: 6,
            gasPrice: 30000000000, // 30 gwei
        },
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
        // Use the new v2 API format with a single API key
        apiKey:
            process.env.ETHERSCAN_API_KEY ||
            process.env.POLYGONSCAN_API_KEY ||
            "",
        customChains: [
            {
                network: "polygon",
                chainId: 80002,
                urls: {
                    apiURL: "https://api-amoy.polygonscan.com/api",
                    browserURL: "https://amoy.polygonscan.com/",
                },
            },
        ],
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
        sources: "./src/SmartContracts",
        tests: "./src/test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    mocha: {
        timeout: 60000, // Increased timeout for complex tests
    },
}
