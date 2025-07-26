// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./StakeholderRegistry.sol";
import "./StakeholderManager.sol";
import "./Product.sol";
import "./Registry.sol";

contract ProductFactory {
    StakeholderRegistry public stakeholderRegistry;
    Registry public registry;

    // Oracle feed addresses for product creation
    address public temperatureFeed;
    address public humidityFeed;
    address public rainfallFeed;
    address public windSpeedFeed;
    address public priceFeed;

    event ProductCreated(
        address indexed productAddress,
        string name,
        address indexed creator,
        uint256 timestamp
    );

    modifier onlyRegisteredStakeholder(
        StakeholderManager.StakeholderRole _requiredRole
    ) {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                _requiredRole
            ),
            "Not registered for this role"
        );
        _;
    }

    constructor(
        address _stakeholderRegistry,
        address _registry,
        address _temperatureFeed,
        address _humidityFeed,
        address _rainfallFeed,
        address _windSpeedFeed,
        address _priceFeed
    ) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistry);
        registry = Registry(_registry);
        temperatureFeed = _temperatureFeed;
        humidityFeed = _humidityFeed;
        rainfallFeed = _rainfallFeed;
        windSpeedFeed = _windSpeedFeed;
        priceFeed = _priceFeed;
    }

    function createProduct(
        string memory name,
        string memory description,
        uint256 minCTemperature,
        uint256 maxCTemperature,
        string memory location,
        string memory farmData
    )
        public
        onlyRegisteredStakeholder(StakeholderManager.StakeholderRole.FARMER)
        returns (address)
    {
        address productAddress = address(
            new Product(
                name,
                description,
                minCTemperature,
                maxCTemperature,
                location,
                farmData,
                address(stakeholderRegistry),
                temperatureFeed,
                humidityFeed,
                rainfallFeed,
                windSpeedFeed,
                priceFeed
            )
        );

        registry.registerProduct(productAddress);
        emit ProductCreated(productAddress, name, msg.sender, block.timestamp);
        return productAddress;
    }
}
