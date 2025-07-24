// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Registry.sol";
import "./Stakeholder.sol";

contract StakeholderRegistry {
    Registry public registry;
    address public admin;

    event StakeholderLookupPerformed(
        address indexed stakeholderContract,
        address indexed requester,
        uint256 timestamp
    );

    constructor(address _registry) {
        registry = Registry(_registry);
        admin = msg.sender;
    }

    /**
     * @dev Check if address is registered stakeholder with specific role
     */
    function isRegisteredStakeholder(
        address _stakeholderAddress,
        Stakeholder.StakeholderRole _role
    ) public view returns (bool) {
        address stakeholderContract = registry.getStakeholderByWallet(
            _stakeholderAddress
        );

        if (stakeholderContract == address(0)) {
            return false;
        }

        try Stakeholder(stakeholderContract).hasRole(_role) returns (
            bool hasRole
        ) {
            return hasRole;
        } catch {
            return false;
        }
    }

    /**
     * @dev Check if address is any active stakeholder (regardless of role)
     */
    function isActiveStakeholder(
        address _stakeholderAddress
    ) public view returns (bool) {
        address stakeholderContract = registry.getStakeholderByWallet(
            _stakeholderAddress
        );

        if (stakeholderContract == address(0)) {
            return false;
        }

        try Stakeholder(stakeholderContract).isActive() returns (bool active) {
            return active;
        } catch {
            return false;
        }
    }

    /**
     * @dev Get stakeholder contract by wallet address
     */
    function getStakeholderContract(
        address _stakeholderAddress
    ) external view returns (address) {
        return registry.getStakeholderByWallet(_stakeholderAddress);
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
            Stakeholder.StakeholderRole,
            string memory,
            string memory,
            string memory,
            string memory,
            bool,
            uint256,
            uint256
        )
    {
        address stakeholderContract = registry.getStakeholderByWallet(
            _stakeholderAddress
        );

        if (stakeholderContract == address(0)) {
            return (
                address(0),
                Stakeholder.StakeholderRole.FARMER,
                "",
                "",
                "",
                "",
                false,
                0,
                0
            );
        }

        try Stakeholder(stakeholderContract).getStakeholderInfo() returns (
            address stakeholderAddr,
            Stakeholder.StakeholderRole stakeholderRole,
            string memory businessName,
            string memory businessLicense,
            string memory location,
            string memory certifications,
            bool isActive,
            uint256 registeredAt,
            uint256 lastActivity
        ) {
            return (
                stakeholderAddr,
                stakeholderRole,
                businessName,
                businessLicense,
                location,
                certifications,
                isActive,
                registeredAt,
                lastActivity
            );
        } catch {
            return (
                address(0),
                Stakeholder.StakeholderRole.FARMER,
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
        Stakeholder.StakeholderRole _role
    ) public view returns (address[] memory) {
        address[] memory stakeholderContracts = registry.getStakeholdersByRole(_role);
        address[] memory stakeholderAddresses = new address[](
            stakeholderContracts.length
        );
        uint256 count = 0;

        for (uint256 i = 0; i < stakeholderContracts.length; i++) {
            try
                Stakeholder(stakeholderContracts[i]).stakeholderAddress()
            returns (address addr) {
                try Stakeholder(stakeholderContracts[i]).isActive() returns (
                    bool active
                ) {
                    if (active) {
                        stakeholderAddresses[count] = addr;
                        count++;
                    }
                } catch {
                    continue;
                }
            } catch {
                continue;
            }
        }

        // Resize array to actual count
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = stakeholderAddresses[i];
        }

        return result;
    }

    /**
     * @dev Get stakeholder by business license
     */
    function getStakeholderByLicense(
        string memory _businessLicense
    ) external view returns (address) {
        address stakeholderContract = registry.getStakeholderByLicense(
            _businessLicense
        );

        if (stakeholderContract == address(0)) {
            return address(0);
        }

        try Stakeholder(stakeholderContract).stakeholderAddress() returns (
            address addr
        ) {
            return addr;
        } catch {
            return address(0);
        }
    }

    /**
     * @dev Find stakeholders by business name (partial match)
     */
    function findStakeholdersByBusinessName(
        string memory _partialName
    ) external view returns (address[] memory) {
        address[] memory allStakeholders = registry.getAllStakeholders();
        address[] memory matchingStakeholders = new address[](
            allStakeholders.length
        );
        uint256 count = 0;

        bytes memory partialNameBytes = bytes(_partialName);

        for (uint256 i = 0; i < allStakeholders.length; i++) {
            try Stakeholder(allStakeholders[i]).businessName() returns (
                string memory businessName
            ) {
                try Stakeholder(allStakeholders[i]).isActive() returns (
                    bool active
                ) {
                    if (
                        active &&
                        _contains(bytes(businessName), partialNameBytes)
                    ) {
                        try
                            Stakeholder(allStakeholders[i]).stakeholderAddress()
                        returns (address addr) {
                            matchingStakeholders[count] = addr;
                            count++;
                        } catch {
                            continue;
                        }
                    }
                } catch {
                    continue;
                }
            } catch {
                continue;
            }
        }

        // Resize array to actual count
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = matchingStakeholders[i];
        }

        return result;
    }

    /**
     * @dev Helper function to check if bytes contains substring
     */
    function _contains(
        bytes memory haystack,
        bytes memory needle
    ) internal pure returns (bool) {
        if (needle.length > haystack.length) {
            return false;
        }

        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
        }

        return false;
    }
}
