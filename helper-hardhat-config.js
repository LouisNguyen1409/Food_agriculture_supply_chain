const networkConfig = {
    11155111: {
        name: "sepolia",
        ethUsdPriceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306", // Chainlink ETH/USD on Sepolia
        // Note: These are placeholder addresses - replace with actual Chainlink weather oracle addresses
        temperatureFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real temperature feed
        humidityFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real humidity feed
        rainfallFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real rainfall feed
        windSpeedFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real wind speed feed
    },
    80002: {
        name: "polygon",
        ethUsdPriceFeed: "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
        // Note: These are placeholder addresses - replace with actual Chainlink weather oracle addresses
        temperatureFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real temperature feed
        humidityFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real humidity feed
        rainfallFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real rainfall feed
        windSpeedFeed: "0x0000000000000000000000000000000000000000", // TODO: Add real wind speed feed
    },
}

const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_PRICE = 200000000000

module.exports = { networkConfig, developmentChains, DECIMALS, INITIAL_PRICE }
