// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./StakeholderManager.sol";

/**
 * @title StakeholderRegistry
 * @dev Read-only interface for querying stakeholder information (avoids costly self-calls where possible)
 */
contract StakeholderRegistry {

    StakeholderManager public immutable stakeholderManager;

    constructor(address _stakeholderManager) {
        require(_stakeholderManager != address(0), "Invalid address");
        stakeholderManager = StakeholderManager(_stakeholderManager);
    }

    function totalStakeholders() external view returns (uint256) {
        return stakeholderManager.getTotalStakeholders();
    }

    function isRegisteredStakeholder(address stakeholder) external view returns (bool) {
        return stakeholderManager.isRegistered(stakeholder);
    }

    function isRegisteredStakeholder(address stakeholder, AccessControl.Role role)
        external
        view
        returns (bool)
    {
        return stakeholderManager.hasRole(stakeholder, role);
    }

    function getStakeholderInfo(address stakeholder)
        external
        view
        returns (
            AccessControl.Role role,
            string memory name,
            string memory licenseId,
            string memory location,
            string memory certification,
            bool isActive,
            uint256 registeredAt
        )
    {
        require(stakeholderManager.isRegistered(stakeholder), "Not found");
        return stakeholderManager.getStakeholderInfo(stakeholder);
    }

    function getStakeholderRole(address stakeholder) external view returns (AccessControl.Role) {
        return stakeholderManager.getStakeholderRole(stakeholder);
    }

    function isActiveStakeholder(address stakeholder) external view returns (bool) {
        return stakeholderManager.isFullyActive(stakeholder);
    }

    function getStakeholdersByRole(AccessControl.Role role)
        external
        view
        returns (address[] memory)
    {
        return stakeholderManager.getStakeholdersByRole(role);
    }

    function getStakeholderCountByRole(AccessControl.Role role)
        external
        view
        returns (uint256)
    {
        return stakeholderManager.getStakeholdersByRole(role).length;
    }

    function getActiveStakeholdersByRole(AccessControl.Role role)
        external
        view
        returns (address[] memory)
    {
        address[] memory all = stakeholderManager.getStakeholdersByRole(role);
        uint256 activeCount = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (stakeholderManager.isFullyActive(all[i])) activeCount++;
        }

        address[] memory active = new address[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (stakeholderManager.isFullyActive(all[i])) {
                active[idx++] = all[i];
            }
        }
        return active;
    }

    function getActiveStakeholderCountByRole(AccessControl.Role role)
        external
        view
        returns (uint256)
    {
        address[] memory list = stakeholderManager.getStakeholdersByRole(role);
        uint256 activeCount = 0;
        for (uint256 i = 0; i < list.length; i++) {
            if (stakeholderManager.isFullyActive(list[i])) activeCount++;
        }
        return activeCount;
    }

    function getAllFarmers() external view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(AccessControl.Role.FARMER);
    }

    function getAllProcessors() external view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(AccessControl.Role.PROCESSOR);
    }

    function getAllDistributors() external view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(AccessControl.Role.DISTRIBUTOR);
    }

    function getAllShippers() external view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(AccessControl.Role.SHIPPER);
    }

    function getAllRetailers() external view returns (address[] memory) {
        return stakeholderManager.getStakeholdersByRole(AccessControl.Role.RETAILER);
    }

    function getRoleStatistics()
        external
        view
        returns (
            uint256 totalFarmers,
            uint256 totalProcessors,
            uint256 totalDistributors,
            uint256 totalShippers,
            uint256 totalRetailers,
            uint256 totalAdmins
        )
    {
        return stakeholderManager.getRoleStatistics();
    }

    function getActiveRoleStatistics()
        external
        view
        returns (
            uint256 totalFarmers,
            uint256 totalProcessors,
            uint256 totalDistributors,
            uint256 totalShippers,
            uint256 totalRetailers,
            uint256 totalAdmins
        )
    {
        totalFarmers = this.getActiveStakeholderCountByRole(AccessControl.Role.FARMER);
        totalProcessors = this.getActiveStakeholderCountByRole(AccessControl.Role.PROCESSOR);
        totalDistributors = this.getActiveStakeholderCountByRole(AccessControl.Role.DISTRIBUTOR);
        totalShippers = this.getActiveStakeholderCountByRole(AccessControl.Role.SHIPPER);
        totalRetailers = this.getActiveStakeholderCountByRole(AccessControl.Role.RETAILER);
        totalAdmins = this.getActiveStakeholderCountByRole(AccessControl.Role.ADMIN);
    }

    function getAllStakeholders() external view returns (address[] memory) {
        return stakeholderManager.getAllStakeholders();
    }
}
