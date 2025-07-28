// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title Efficient Stakeholder Management Contract
/// @notice Stores all stakeholders in a single contract for cost efficiency
/// @dev Inspired by the LunchVenue pattern for gas optimization

contract StakeholderManager {
    enum StakeholderRole {
        NONE,
        FARMER,
        PROCESSOR,
        RETAILER,
        DISTRIBUTOR
    }

    struct StakeholderInfo {
        address stakeholderAddress;
        StakeholderRole role;
        string businessName;
        string businessLicense;
        string location;
        string certifications;
        bool isActive;
        uint256 registeredAt;
        uint256 lastActivity;
    }

    // Core mappings for stakeholder data
    mapping(address => StakeholderInfo) public stakeholders;
    mapping(address => bool) public isRegistered;
    mapping(string => address) public licenseToAddress;
    mapping(bytes32 => bool) private licenseExists; // For duplicate checking

    // Role-based organization
    mapping(StakeholderRole => address[]) public stakeholdersByRole;
    mapping(StakeholderRole => uint256) public roleCount;

    // Arrays for iteration
    address[] public allStakeholders;

    // Contract state
    address public admin;
    uint256 public totalStakeholders = 0;

    // Events
    event StakeholderRegistered(
        address indexed stakeholderAddress,
        StakeholderRole indexed role,
        string businessName,
        string businessLicense,
        uint256 timestamp
    );

    event StakeholderUpdated(
        address indexed stakeholderAddress,
        string businessName,
        string location,
        string certifications,
        uint256 timestamp
    );

    event StakeholderDeactivated(
        address indexed stakeholderAddress,
        uint256 timestamp
    );
    event StakeholderReactivated(
        address indexed stakeholderAddress,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyRegistered() {
        require(isRegistered[msg.sender], "Not a registered stakeholder");
        _;
    }

    modifier validAddress(address _addr) {
        require(_addr != address(0), "Invalid address");
        _;
    }

    modifier stakeholderExists(address _addr) {
        require(isRegistered[_addr], "Stakeholder does not exist");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice Register a new stakeholder
     * @dev Can be called by admin
     * @param _stakeholderAddress The wallet address of the stakeholder
     * @param _role The role of the stakeholder
     * @param _businessName Name of the business
     * @param _businessLicense Unique business license number
     * @param _location Business location
     * @param _certifications Relevant certifications
     * @return success Whether registration was successful
     */
    function registerStakeholder(
        address _stakeholderAddress,
        StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications
    )
        external
        onlyAdmin
        validAddress(_stakeholderAddress)
        returns (bool success)
    {
        require(!isRegistered[_stakeholderAddress], "Already registered");
        require(bytes(_businessName).length > 0, "Business name required");
        require(
            bytes(_businessLicense).length > 0,
            "Business license required"
        );

        // Check for duplicate license
        bytes32 licenseKey = keccak256(bytes(_businessLicense));
        require(!licenseExists[licenseKey], "License already exists");

        // Store stakeholder information
        stakeholders[_stakeholderAddress] = StakeholderInfo({
            stakeholderAddress: _stakeholderAddress,
            role: _role,
            businessName: _businessName,
            businessLicense: _businessLicense,
            location: _location,
            certifications: _certifications,
            isActive: true,
            registeredAt: block.timestamp,
            lastActivity: block.timestamp
        });

        // Update tracking mappings
        isRegistered[_stakeholderAddress] = true;
        licenseToAddress[_businessLicense] = _stakeholderAddress;
        licenseExists[licenseKey] = true;

        // Add to role-based tracking
        stakeholdersByRole[_role].push(_stakeholderAddress);
        roleCount[_role]++;

        // Add to global list
        allStakeholders.push(_stakeholderAddress);
        totalStakeholders++;

        emit StakeholderRegistered(
            _stakeholderAddress,
            _role,
            _businessName,
            _businessLicense,
            block.timestamp
        );

        return true;
    }

    /**
     * @notice Update stakeholder information
     * @dev Can be called by admin or the stakeholder themselves
     */
    function updateStakeholderInfo(
        address _stakeholderAddress,
        string memory _businessName,
        string memory _location,
        string memory _certifications
    ) external stakeholderExists(_stakeholderAddress) {
        require(
            msg.sender == admin || msg.sender == _stakeholderAddress,
            "Unauthorized to update"
        );
        require(
            stakeholders[_stakeholderAddress].isActive,
            "Stakeholder not active"
        );
        require(bytes(_businessName).length > 0, "Business name required");

        stakeholders[_stakeholderAddress].businessName = _businessName;
        stakeholders[_stakeholderAddress].location = _location;
        stakeholders[_stakeholderAddress].certifications = _certifications;
        stakeholders[_stakeholderAddress].lastActivity = block.timestamp;

        emit StakeholderUpdated(
            _stakeholderAddress,
            _businessName,
            _location,
            _certifications,
            block.timestamp
        );
    }

    /**
     * @notice Deactivate a stakeholder
     */
    function deactivateStakeholder(
        address _stakeholderAddress
    ) external onlyAdmin stakeholderExists(_stakeholderAddress) {
        require(stakeholders[_stakeholderAddress].isActive, "Already inactive");

        stakeholders[_stakeholderAddress].isActive = false;
        stakeholders[_stakeholderAddress].lastActivity = block.timestamp;

        emit StakeholderDeactivated(_stakeholderAddress, block.timestamp);
    }

    /**
     * @notice Reactivate a stakeholder
     */
    function reactivateStakeholder(
        address _stakeholderAddress
    ) external onlyAdmin stakeholderExists(_stakeholderAddress) {
        require(!stakeholders[_stakeholderAddress].isActive, "Already active");

        stakeholders[_stakeholderAddress].isActive = true;
        stakeholders[_stakeholderAddress].lastActivity = block.timestamp;

        emit StakeholderReactivated(_stakeholderAddress, block.timestamp);
    }

    /**
     * @notice Get stakeholder information with permission checking
     * @dev Only registered stakeholders can view other stakeholders
     */
    function getStakeholderInfo(
        address _stakeholderAddress
    )
        external
        view
        stakeholderExists(_stakeholderAddress)
        returns (StakeholderInfo memory)
    {
        require(
            _canViewStakeholder(msg.sender, _stakeholderAddress),
            "Permission denied"
        );
        return stakeholders[_stakeholderAddress];
    }

    /**
     * @notice Check if an address is a registered stakeholder with specific role
     */
    function hasRole(
        address _stakeholderAddress,
        StakeholderRole _role
    ) external view returns (bool) {
        return
            isRegistered[_stakeholderAddress] &&
            stakeholders[_stakeholderAddress].isActive &&
            stakeholders[_stakeholderAddress].role == _role;
    }

    /**
     * @notice Get stakeholders by role with permission filtering
     */
    function getStakeholdersByRole(
        StakeholderRole _role
    ) external view returns (address[] memory validStakeholders) {
        address[] memory roleStakeholders = stakeholdersByRole[_role];
        address[] memory filtered = new address[](roleStakeholders.length);
        uint256 count = 0;

        for (uint256 i = 0; i < roleStakeholders.length; i++) {
            if (
                stakeholders[roleStakeholders[i]].isActive &&
                _canViewStakeholder(msg.sender, roleStakeholders[i])
            ) {
                filtered[count] = roleStakeholders[i];
                count++;
            }
        }

        // Resize array to actual count
        validStakeholders = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            validStakeholders[i] = filtered[i];
        }

        return validStakeholders;
    }

    /**
     * @notice Search stakeholders by business name (with permissions)
     */
    function searchByBusinessName(
        string memory _partialName
    ) external view returns (address[] memory matchingStakeholders) {
        address[] memory matches = new address[](totalStakeholders);
        uint256 count = 0;
        bytes memory partialNameBytes = bytes(_partialName);

        for (uint256 i = 0; i < allStakeholders.length; i++) {
            address stakeholderAddr = allStakeholders[i];
            if (
                stakeholders[stakeholderAddr].isActive &&
                _canViewStakeholder(msg.sender, stakeholderAddr) &&
                _contains(
                    bytes(stakeholders[stakeholderAddr].businessName),
                    partialNameBytes
                )
            ) {
                matches[count] = stakeholderAddr;
                count++;
            }
        }

        // Resize array
        matchingStakeholders = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            matchingStakeholders[i] = matches[i];
        }

        return matchingStakeholders;
    }

    /**
     * @notice Get all stakeholders that the caller can view
     * @dev Returns all active stakeholders for registered users, empty for non-registered
     */
    function getAllViewableStakeholders()
        external
        view
        returns (address[] memory)
    {
        address[] memory viewableStakeholders = new address[](
            totalStakeholders
        );
        uint256 count = 0;

        for (uint256 i = 0; i < allStakeholders.length; i++) {
            address stakeholderAddr = allStakeholders[i];
            if (
                stakeholders[stakeholderAddr].isActive &&
                _canViewStakeholder(msg.sender, stakeholderAddr)
            ) {
                viewableStakeholders[count] = stakeholderAddr;
                count++;
            }
        }

        // Resize array to actual count
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = viewableStakeholders[i];
        }

        return result;
    }

    /**
     * @notice Get batch stakeholder information for multiple addresses
     * @dev Efficient way to get info for multiple stakeholders at once
     */
    function getBatchStakeholderInfo(
        address[] memory _stakeholderAddresses
    ) external view returns (StakeholderInfo[] memory) {
        StakeholderInfo[] memory results = new StakeholderInfo[](
            _stakeholderAddresses.length
        );

        for (uint256 i = 0; i < _stakeholderAddresses.length; i++) {
            if (
                isRegistered[_stakeholderAddresses[i]] &&
                _canViewStakeholder(msg.sender, _stakeholderAddresses[i])
            ) {
                results[i] = stakeholders[_stakeholderAddresses[i]];
            }
            // If not viewable, returns default empty struct
        }

        return results;
    }

    /**
     * @notice Update activity timestamp (for logistics tracking)
     */
    function updateActivity() external onlyRegistered {
        stakeholders[msg.sender].lastActivity = block.timestamp;
    }

    /**
     * @dev Check if viewer can see stakeholder info
     * @dev Only registered stakeholders can view other stakeholders
     */
    function _canViewStakeholder(
        address _viewer,
        address _stakeholder
    ) internal view returns (bool) {
        // Admin can see everything
        if (_viewer == admin) return true;

        // Not registered viewers have no access
        if (!isRegistered[_viewer]) return false;

        // All registered stakeholders can view all other registered stakeholders
        if (
            isRegistered[_viewer] &&
            stakeholders[_viewer].isActive &&
            isRegistered[_stakeholder] &&
            stakeholders[_stakeholder].isActive
        ) {
            return true;
        }

        return false;
    }

    /**
     * @dev Helper function to check if bytes contains substring
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

    function getAllStakeholdersRoles()
        external
        view
        returns (StakeholderRole[] memory)
    {
        StakeholderRole[] memory roles = new StakeholderRole[](
            totalStakeholders
        );
        for (uint256 i = 0; i < totalStakeholders; i++) {
            roles[i] = stakeholders[allStakeholders[i]].role;
        }
        return roles;
    }
}
