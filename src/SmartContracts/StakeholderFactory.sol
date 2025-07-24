// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Registry.sol";
import "./Stakeholder.sol";

contract StakeholderFactory {
    Registry public registry;
    address public admin;

    event StakeholderCreated(
        address indexed stakeholderContractAddress,
        address indexed stakeholderAddress,
        Stakeholder.StakeholderRole indexed role,
        string businessName,
        string businessLicense,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    constructor(address _registry) {
        registry = Registry(_registry);
        admin = msg.sender;
    }

    function createStakeholder(
        address _stakeholderAddress,
        Stakeholder.StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications
    ) external onlyAdmin returns (address stakeholderContractAddress) {
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

        // Create new Stakeholder contract
        stakeholderContractAddress = address(
            new Stakeholder(
                _stakeholderAddress,
                _role,
                _businessName,
                _businessLicense,
                _location,
                _certifications,
                admin
            )
        );

        // Register the stakeholder in the main registry
        registry.registerStakeholder(
            stakeholderContractAddress,
            _businessLicense,
            _stakeholderAddress,
            _role
        );


        emit StakeholderCreated(
            stakeholderContractAddress,
            _stakeholderAddress,
            _role,
            _businessName,
            _businessLicense,
            block.timestamp
        );

        return stakeholderContractAddress;
    }

}
