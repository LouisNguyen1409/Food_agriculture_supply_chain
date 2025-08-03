const networkConfig = {
    80002: {
        name: "polygon",
        ethUsdPriceFeed: "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
        // For production, use our updatable weather feeds
        // Deploy updatable feeds first, then update these addresses
        temperatureFeed: "0x0000000000000000000000000000000000000000", // To be deployed
        humidityFeed: "0x0000000000000000000000000000000000000000", // To be deployed
        rainfallFeed: "0x0000000000000000000000000000000000000000", // To be deployed
        windSpeedFeed: "0x0000000000000000000000000000000000000000", // To be deployed
    },
}

const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_PRICE = 200000000000

module.exports = { networkConfig, developmentChains, DECIMALS, INITIAL_PRICE }
