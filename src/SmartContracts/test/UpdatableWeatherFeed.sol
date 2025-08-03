// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title UpdatableWeatherFeed
 * @dev Weather feed contract that can be updated with real API data
 * Compatible with existing Chainlink AggregatorV3Interface
 */
contract UpdatableWeatherFeed is AggregatorV3Interface {
    struct RoundData {
        int256 answer;
        uint256 timestamp;
        uint80 roundId;
    }

    mapping(uint80 => RoundData) private rounds;
    uint80 private latestRoundId;
    uint8 private immutable _decimals;
    string private _description;
    uint256 private _version;
    address private owner;
    address private updater;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );
    event UpdaterChanged(
        address indexed previousUpdater,
        address indexed newUpdater
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyUpdater() {
        require(
            msg.sender == updater || msg.sender == owner,
            "Only updater can call this function"
        );
        _;
    }

    constructor(
        uint8 decimals_,
        string memory description_,
        int256 initialAnswer
    ) {
        owner = msg.sender;
        updater = msg.sender;
        _decimals = decimals_;
        _description = description_;
        _version = 1;

        // Initialize with first round
        latestRoundId = 1;
        rounds[latestRoundId] = RoundData({
            answer: initialAnswer,
            timestamp: block.timestamp,
            roundId: latestRoundId
        });

        emit AnswerUpdated(initialAnswer, latestRoundId, block.timestamp);
    }

    /**
     * @dev Update the feed with new data
     * @param newAnswer The new answer/value
     */
    function updateAnswer(int256 newAnswer) external onlyUpdater {
        latestRoundId++;
        rounds[latestRoundId] = RoundData({
            answer: newAnswer,
            timestamp: block.timestamp,
            roundId: latestRoundId
        });

        emit AnswerUpdated(newAnswer, latestRoundId, block.timestamp);
    }

    /**
     * @dev Batch update multiple rounds (useful for historical data)
     * @param answers Array of answers
     * @param timestamps Array of timestamps
     */
    function batchUpdateAnswers(
        int256[] memory answers,
        uint256[] memory timestamps
    ) external onlyUpdater {
        require(answers.length == timestamps.length, "Arrays length mismatch");

        for (uint i = 0; i < answers.length; i++) {
            latestRoundId++;
            rounds[latestRoundId] = RoundData({
                answer: answers[i],
                timestamp: timestamps[i],
                roundId: latestRoundId
            });

            emit AnswerUpdated(answers[i], latestRoundId, timestamps[i]);
        }
    }

    /**
     * @dev Set the updater address
     * @param newUpdater Address of the new updater
     */
    function setUpdater(address newUpdater) external onlyOwner {
        require(newUpdater != address(0), "Invalid updater address");
        address previousUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(previousUpdater, newUpdater);
    }

    // Chainlink AggregatorV3Interface implementation
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
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
        RoundData memory round = rounds[latestRoundId];
        return (
            round.roundId,
            round.answer,
            round.timestamp,
            round.timestamp,
            round.roundId
        );
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
        require(
            _roundId <= latestRoundId && _roundId > 0,
            "Round does not exist"
        );
        RoundData memory round = rounds[_roundId];
        return (
            round.roundId,
            round.answer,
            round.timestamp,
            round.timestamp,
            round.roundId
        );
    }

    // Additional helper functions
    function getLatestAnswer() external view returns (int256) {
        return rounds[latestRoundId].answer;
    }

    function getLatestTimestamp() external view returns (uint256) {
        return rounds[latestRoundId].timestamp;
    }

    function getUpdater() external view returns (address) {
        return updater;
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function getLatestRoundId() external view returns (uint80) {
        return latestRoundId;
    }
}
