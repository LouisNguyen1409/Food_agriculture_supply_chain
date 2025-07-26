// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderManager.sol";
import "./StakeholderManager.sol";

contract StakeholderFactory {
    StakeholderManager public stakeholderManager;
    address public admin;

    event StakeholderCreated(
        address indexed stakeholderAddress,
        StakeholderManager.StakeholderRole indexed role,
        string businessName,
        string businessLicense,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    constructor(address _stakeholderManager) {
        stakeholderManager = StakeholderManager(_stakeholderManager);
        admin = msg.sender;
    }

    function createStakeholder(
        address _stakeholderAddress,
        StakeholderManager.StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications
    ) external onlyAdmin returns (address) {
        require(
            _stakeholderAddress != address(0),
            "Invalid stakeholder address"
        );
        require(
            bytes(_businessName).length > 0,
            "Business name cannot be empty"
        );
        require(
            bytes(_businessLicense).length > 0,
            "Business license cannot be empty"
        );

        // Register the stakeholder in the StakeholderManager
        stakeholderManager.registerStakeholder(
            _stakeholderAddress,
            _role,
            _businessName,
            _businessLicense,
            _location,
            _certifications
        );

        emit StakeholderCreated(
            _stakeholderAddress,
            _role,
            _businessName,
            _businessLicense,
            block.timestamp
        );

        return _stakeholderAddress;
    }
}
