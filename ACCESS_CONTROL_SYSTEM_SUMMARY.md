# Access Control System Documentation

## Overview
Comprehensive role-based access control system with stakeholder management.

## Contracts

### AccessControl.sol
- **Purpose**: Core RBAC with account activation
- **Roles**: FARMER(1), PROCESSOR(2), DISTRIBUTOR(3), SHIPPER(4), RETAILER(5), ADMIN(6)
- **Key Functions**:
  - `grantRole(address, Role)` - Assign roles
  - `activateAccount(address)` - Enable account
  - `isAuthorizedToTrade(address, address)` - Validate trading pairs

### StakeholderManager.sol
- **Purpose**: Detailed stakeholder profile management
- **Features**: Registration, licensing, location tracking
- **Key Functions**:
  - `registerStakeholder()` - Register new stakeholder
  - `updateProfile()` - Update stakeholder details
  - `getStakeholderInfo()` - Retrieve profile data

### StakeholderRegistry.sol
- **Purpose**: Read-only query interface for stakeholder data
- **Optimization**: Avoids self-calls for gas efficiency
- **Key Functions**:
  - `getActiveStakeholdersByRole()` - Filter active users
  - `getRoleStatistics()` - Count by role
  - `getAllFarmers()` - Role-specific queries

## Security Model
- Owner-only contract management
- Admin role for user management
- Role-based function access
- Account activation gates