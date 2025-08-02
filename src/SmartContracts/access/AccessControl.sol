// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AccessControl
 * @dev Base contract for role-based access control with explicit activation/deactivation and trade authorization matrix.
 */
contract AccessControl {
    // Role definitions
    enum Role {
        NONE,           // 0 - No role assigned / inactive
        FARMER,         // 1 - Can create products
        PROCESSOR,      // 2 - Can process products
        DISTRIBUTOR,    // 3 - Can create shipments
        SHIPPER,        // 4 - Can handle shipments
        RETAILER,       // 5 - Can retail products
        ADMIN           // 6 - System admin
    }

    // Events
    event RoleGranted(address indexed account, Role role);
    event RoleRevoked(address indexed account, Role role);

    // State
    mapping(address => Role) private _roles;
    mapping(address => bool) private _activeStatus; // explicit activation override
    address public owner;

    // Compact role-pair trade permission
    mapping(Role => mapping(Role => bool)) private _tradeAllowed;

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "AccessControl: caller is not owner");
        _;
    }

    modifier onlyRole(Role role) {
        require(hasRole(msg.sender, role), "AccessControl: unauthorized role");
        _;
    }

    modifier onlyActiveStakeholder() {
        require(isActive(msg.sender), "AccessControl: account not active");
        _;
    }

    modifier onlyAdmin() {
        require(hasRole(msg.sender, Role.ADMIN), "AccessControl: admin role required");
        _;
    }

    constructor() {
        owner = msg.sender;
        _roles[msg.sender] = Role.ADMIN;
        _activeStatus[msg.sender] = true;
        emit RoleGranted(msg.sender, Role.ADMIN);
        _initializeTradeMatrix();
    }

    function _initializeTradeMatrix() internal {
        _tradeAllowed[Role.FARMER][Role.PROCESSOR] = true;
        _tradeAllowed[Role.PROCESSOR][Role.DISTRIBUTOR] = true;
        _tradeAllowed[Role.DISTRIBUTOR][Role.SHIPPER] = true;
        _tradeAllowed[Role.DISTRIBUTOR][Role.RETAILER] = true;
        _tradeAllowed[Role.SHIPPER][Role.RETAILER] = true;
    }

    /**
     * @dev Check if account has specific role and is active.
     */
    function hasRole(address account, Role role) public view returns (bool) {
        return _roles[account] == role && _activeStatus[account] && role != Role.NONE;
    }

    /**
     * @dev Get raw role (could be NONE).
     */
    function getRole(address account) public view returns (Role) {
        return _roles[account];
    }

    /**
     * @dev Check if account is active (role != NONE and explicit active flag).
     */
    function isActive(address account) public view returns (bool) {
        return _roles[account] != Role.NONE && _activeStatus[account];
    }
    
    /**
     * @dev Check if account has admin role and is active.
     */
    function isAdmin(address account) public view returns (bool) {
        return hasRole(account, Role.ADMIN);
    }

    /**
     * @dev Grant role (activates if role not NONE).
     */
    function grantRole(address account, Role role) external onlyAdmin {
        require(account != address(0), "AccessControl: invalid address");
        require(role != Role.NONE, "AccessControl: cannot grant NONE");

        Role previous = _roles[account];
        if (previous != role) {
            if (previous != Role.NONE) emit RoleRevoked(account, previous);
            _roles[account] = role;
            _activeStatus[account] = true; // implicit activation on role grant
            emit RoleGranted(account, role);
        } else if (!_activeStatus[account]) {
            // same role but was inactive: reactivate
            _activeStatus[account] = true;
            emit RoleGranted(account, role);
        }
    }

    /**
     * @dev Revoke role (deactivates).
     */
    function revokeRole(address account) external onlyAdmin {
        require(account != owner, "AccessControl: cannot revoke owner");
        Role previous = _roles[account];
        require(previous != Role.NONE, "AccessControl: already none");

        _roles[account] = Role.NONE;
        _activeStatus[account] = false;
        emit RoleRevoked(account, previous);
    }

    /**
     * @dev Activate account (owner only) without changing role.
     */
    function activateAccount(address account) external onlyOwner {
        require(account != address(0), "AccessControl: invalid address");
        _activeStatus[account] = true;
    }

    /**
     * @dev Deactivate account without removing role (admin only).
     */
    function deactivateAccount(address account) external onlyAdmin {
        require(account != owner, "AccessControl: cannot deactivate owner");
        _activeStatus[account] = false;
    }

    /**
     * @dev Reactivate account (admin only) assuming role is assigned.
     */
    function reactivateAccount(address account) external onlyAdmin {
        require(_roles[account] != Role.NONE, "AccessControl: no role assigned");
        _activeStatus[account] = true;
    }

    /**
     * @dev Transfer ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AccessControl: zero address");
        owner = newOwner;
    }

    /**
     * @dev Internal setter for role (used by inheriting contracts).
     */
    function _setRole(address account, Role role) internal {
        Role previous = _roles[account];
        if (previous != role) {
            if (previous != Role.NONE) emit RoleRevoked(account, previous);
            _roles[account] = role;
            if (role != Role.NONE) {
                _activeStatus[account] = true;
                emit RoleGranted(account, role);
            }
        }
    }

    /**
     * @dev Internal remover of role.
     */
    function _removeRole(address account, Role role) internal {
        if (_roles[account] == role) {
            _roles[account] = Role.NONE;
            _activeStatus[account] = false;
            emit RoleRevoked(account, role);
        }
    }

    /**
     * @dev Check if a role-pair is allowed in principle (ignores partnerships).
     */
    function isAuthorizedToTrade(address from, address to) public view returns (bool) {
        Role fromRole = _roles[from];
        Role toRole = _roles[to];

        if (fromRole == Role.NONE || toRole == Role.NONE) return false;
        if (!_activeStatus[from] || !_activeStatus[to]) return false;
        return _tradeAllowed[fromRole][toRole];
    }

    /**
     * @dev Get role name (display helper).
     */
    function getRoleName(Role role) public pure returns (string memory) {
        if (role == Role.FARMER) return "Farmer";
        if (role == Role.PROCESSOR) return "Processor";
        if (role == Role.DISTRIBUTOR) return "Distributor";
        if (role == Role.SHIPPER) return "Shipper";
        if (role == Role.RETAILER) return "Retailer";
        if (role == Role.ADMIN) return "Admin";
        return "None";
    }
}
