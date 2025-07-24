// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Stakeholder {
    enum StakeholderRole {
        FARMER,
        PROCESSOR,
        RETAILER,
        DISTRIBUTOR
    }

    // Basic stakeholder info
    address public stakeholderAddress;
    StakeholderRole public role;
    string public businessName;
    string public businessLicense;
    string public location;
    string public certifications;

    // State tracking
    bool public isActive;
    uint256 public registeredAt;
    uint256 public lastActivity;

    // Admin who can update this stakeholder
    address public admin;

    // Events
    event StakeholderUpdated(
        string businessName,
        string location,
        string certifications,
        uint256 timestamp
    );

    event StakeholderDeactivated(uint256 timestamp);
    event StakeholderReactivated(uint256 timestamp);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyActive() {
        require(isActive, "Stakeholder is not active");
        _;
    }

    constructor(
        address _stakeholderAddress,
        StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications,
        address _admin
    ) {
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

        stakeholderAddress = _stakeholderAddress;
        role = _role;
        businessName = _businessName;
        businessLicense = _businessLicense;
        location = _location;
        certifications = _certifications;
        isActive = true;
        registeredAt = block.timestamp;
        lastActivity = block.timestamp;
        admin = _admin;
    }

    /**
     * @dev Update stakeholder information
     */
    function updateInfo(
        string memory _businessName,
        string memory _location,
        string memory _certifications
    ) external onlyAdmin onlyActive {
        require(
            bytes(_businessName).length > 0,
            "Business name cannot be empty"
        );

        businessName = _businessName;
        location = _location;
        certifications = _certifications;
        lastActivity = block.timestamp;

        emit StakeholderUpdated(
            _businessName,
            _location,
            _certifications,
            block.timestamp
        );
    }

    /**
     * @dev Deactivate stakeholder
     */
    function deactivate() external onlyAdmin onlyActive {
        isActive = false;
        lastActivity = block.timestamp;

        emit StakeholderDeactivated(block.timestamp);
    }

    /**
     * @dev Reactivate stakeholder
     */
    function reactivate() external onlyAdmin {
        require(!isActive, "Stakeholder is already active");

        isActive = true;
        lastActivity = block.timestamp;

        emit StakeholderReactivated(block.timestamp);
    }

    /**
     * @dev Update last activity timestamp
     */
    function updateActivity() external {
        require(
            msg.sender == stakeholderAddress || msg.sender == admin,
            "Only stakeholder or admin can update activity"
        );

        lastActivity = block.timestamp;
    }

    /**
     * @dev Check if stakeholder has specific role
     */
    function hasRole(StakeholderRole _role) external view returns (bool) {
        return isActive && role == _role;
    }

    /**
     * @dev Get complete stakeholder information
     */
    function getStakeholderInfo()
        external
        view
        returns (
            address addr,
            StakeholderRole stakeholderRole,
            string memory name,
            string memory license,
            string memory loc,
            string memory certs,
            bool active,
            uint256 registered,
            uint256 activity
        )
    {
        return (
            stakeholderAddress,
            role,
            businessName,
            businessLicense,
            location,
            certifications,
            isActive,
            registeredAt,
            lastActivity
        );
    }

    /**
     * @dev Get role as string
     */
    function getRoleString() external view returns (string memory) {
        if (role == StakeholderRole.FARMER) return "FARMER";
        if (role == StakeholderRole.PROCESSOR) return "PROCESSOR";
        if (role == StakeholderRole.RETAILER) return "RETAILER";
        if (role == StakeholderRole.DISTRIBUTOR) return "DISTRIBUTOR";
        return "UNKNOWN";
    }

    /**
     * @dev Check if stakeholder is valid for operations
     */
    function isValidForOperations() external view returns (bool) {
        return isActive && block.timestamp > registeredAt;
    }
}
