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

        // Use the public stakeholders mapping directly to avoid permission issues
        (,,,,,, bool isActive,,) = stakeholderManager.stakeholders(_stakeholderAddress);
        
        return isActive;
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

        // Use the public stakeholders mapping directly to avoid permission issues
        return stakeholderManager.stakeholders(_stakeholderAddress);
    }

    /**
     * @dev Get stakeholders by role
     */
    function getStakeholdersByRole(
        StakeholderManager.StakeholderRole _role
    ) public view returns (address[] memory) {
        // Get total number of stakeholders to size our temporary array
        uint256 totalStakeholders = stakeholderManager.totalStakeholders();
        address[] memory filtered = new address[](totalStakeholders);
        uint256 count = 0;

        // Iterate through all stakeholders using the public allStakeholders array
        for (uint256 i = 0; i < totalStakeholders; i++) {
            address stakeholderAddr = stakeholderManager.allStakeholders(i);
            if (stakeholderManager.isRegistered(stakeholderAddr)) {
                (, StakeholderManager.StakeholderRole role,,,,,bool isActive,,) = stakeholderManager.stakeholders(stakeholderAddr);
                if (role == _role && isActive) {
                    filtered[count] = stakeholderAddr;
                    count++;
                }
            }
        }

        // Resize array to actual count
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = filtered[i];
        }

        return result;
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
        uint256 totalStakeholders = stakeholderManager.totalStakeholders();
        address[] memory matches = new address[](totalStakeholders);
        uint256 count = 0;
        bytes memory partialNameBytes = bytes(_partialName);

        for (uint256 i = 0; i < totalStakeholders; i++) {
            address stakeholderAddr = stakeholderManager.allStakeholders(i);
            if (stakeholderManager.isRegistered(stakeholderAddr)) {
                (,, string memory businessName,,,, bool isActive,,) = stakeholderManager.stakeholders(stakeholderAddr);
                if (isActive && _contains(bytes(businessName), partialNameBytes)) {
                    matches[count] = stakeholderAddr;
                    count++;
                }
            }
        }

        // Resize array
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = matches[i];
        }

        return result;
    }

    /**
     * @dev Helper function to check if haystack contains needle (case-sensitive)
     */
    function _contains(
        bytes memory haystack,
        bytes memory needle
    ) internal pure returns (bool) {
        if (needle.length > haystack.length) return false;

        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    /**
     * @dev Get stakeholder address by business license
     */
    function getStakeholderByLicense(
        string memory _license
    ) external view returns (address) {
        return stakeholderManager.licenseToAddress(_license);
    }
}
