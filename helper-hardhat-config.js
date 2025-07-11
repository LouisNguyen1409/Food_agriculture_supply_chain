const networkConfig = {
    80002: {
        name: "polygon",
        ethUsdPriceFeed: "0xF0d50568e3A7e8259E16663972b11910F89BD8e7",
    },
}

const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_PRICE = 200000000000

module.exports = { networkConfig, developmentChains, DECIMALS, INITIAL_PRICE }