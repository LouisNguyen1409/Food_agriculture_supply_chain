// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderManager.sol";

contract StakeholderRegistry {
    StakeholderManager public stakeholderManager;
    address public admin;

    event StakeholderLookupPerformed(
        address indexed stakeholderAddress,
        address indexed requester,
        uint256 timestamp
    );

    constructor(address _stakeholderManager) {
        stakeholderManager = StakeholderManager(_stakeholderManager);
        admin = msg.sender;
    }

    /**
     * @dev Check if address is registered stakeholder with specific role
     */
    function isRegisteredStakeholder(
        address _stakeholderAddress,
        StakeholderManager.StakeholderRole _role
    ) public view returns (bool) {
        return stakeholderManager.hasRole(_stakeholderAddress, _role);
    }

    /**
     * @dev Check if address is any active stakeholder (regardless of role)
     */
    function isActiveStakeholder(
        address _stakeholderAddress
    ) public view returns (bool) {
        if (!stakeholderManager.isRegistered(_stakeholderAddress)) {
            return false;
        }

        try stakeholderManager.getStakeholderInfo(_stakeholderAddress) returns (
            StakeholderManager.StakeholderInfo memory info
        ) {
            return info.isActive;
        } catch {
            return false;
        }
    }

    /**
     * @dev Get stakeholder info by wallet address
     */
    function getStakeholderInfo(
        address _stakeholderAddress
    )
        public
        view
        returns (
            address,
            StakeholderManager.StakeholderRole,
            string memory,
            string memory,
            string memory,
            string memory,
            bool,
            uint256,
            uint256
        )
    {
        if (!stakeholderManager.isRegistered(_stakeholderAddress)) {
            return (
                address(0),
                StakeholderManager.StakeholderRole.NONE,
                "",
                "",
                "",
                "",
                false,
                0,
                0
            );
        }

        try stakeholderManager.getStakeholderInfo(_stakeholderAddress) returns (
            StakeholderManager.StakeholderInfo memory info
        ) {
            return (
                info.stakeholderAddress,
                info.role,
                info.businessName,
                info.businessLicense,
                info.location,
                info.certifications,
                info.isActive,
                info.registeredAt,
                info.lastActivity
            );
        } catch {
            return (
                address(0),
                StakeholderManager.StakeholderRole.NONE,
                "",
                "",
                "",
                "",
                false,
                0,
                0
            );
        }
    }

    /**
     * @dev Get stakeholders by role
     */
    function getStakeholdersByRole(
        StakeholderManager.StakeholderRole _role
    ) public view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(_role);
    }

    /**
     * @dev Get all viewable stakeholders
     */
    function getAllViewableStakeholders()
        external
        view
        returns (address[] memory)
    {
        return stakeholderManager.getAllViewableStakeholders();
    }

    /**
     * @dev Find stakeholders by business name (partial match)
     */
    function findStakeholdersByBusinessName(
        string memory _partialName
    ) external view returns (address[] memory) {
        return stakeholderManager.searchByBusinessName(_partialName);
    }
}
