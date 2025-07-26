// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockOracle
 * @dev Simple mock oracle for testing purposes
 */
contract MockOracle is AggregatorV3Interface {
    int256 private _price;
    uint8 private _decimals;
    uint256 private _version;
    string private _description;

    constructor(
        int256 initialPrice,
        uint8 decimals_,
        uint256 version_,
        string memory description_
    ) {
        _price = initialPrice;
        _decimals = decimals_;
        _version = version_;
        _description = description_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
    }

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _price, block.timestamp, block.timestamp, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _price, block.timestamp, block.timestamp, 1);
    }

    // Helper function to update price for testing
    function updatePrice(int256 newPrice) external {
        _price = newPrice;
    }
} 