const networkConfig = {
    80002: {
        name: "polygon",
        ethUsdPriceFeed: "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
        // For production, use our updatable weather feeds
        // Deploy updatable feeds first, then update these addresses
        temperatureFeed: "0x7C93A1543A3C222b7BD43a4EdeEfb71D46B012c4", // To be deployed
        humidityFeed: "0xf79031eC88b021224A64e05d345c9098c0a41f8A", // To be deployed
        rainfallFeed: "0xC8cA43cfa2d006839289fa3f968a111B72F45eE7", // To be deployed
        windSpeedFeed: "0x241ecA8de6d4A26e5aAf5e6816fDF7D010833159", // To be deployed
    },
}

const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_PRICE = 200000000000

module.exports = { networkConfig, developmentChains, DECIMALS, INITIAL_PRICE }
