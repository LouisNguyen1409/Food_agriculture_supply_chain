// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract StakeholderRegistry {
    enum StakeholderRole {
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

    mapping(address => StakeholderInfo) public stakeholders;
    mapping(StakeholderRole => address[]) public stakeholdersByRole;
    mapping(string => address) public licenseToAddress;

    address public admin;
    uint256 public totalStakeholders;

    event StakeholderRegistered(
        address indexed stakeholder,
        StakeholderRole indexed role,
        string businessName,
        uint256 timestamp
    );

    event StakeholderUpdated(address indexed stakeholder, uint256 timestamp);
    event StakeholderDeactivated(
        address indexed stakeholder,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier validStakeholder(address _stakeholder) {
        require(
            stakeholders[_stakeholder].isActive,
            "Stakeholder is not active"
        );
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerStakeholder(
        address _stakeholderAddress,
        StakeholderRole _role,
        string memory _businessName,
        string memory _businessLicense,
        string memory _location,
        string memory _certifications
    ) external onlyAdmin {
        require(
            _stakeholderAddress != address(0),
            "Invalid stakeholder address"
        );
        require(
            !stakeholders[_stakeholderAddress].isActive,
            "Stakeholder already registered"
        );
        require(
            licenseToAddress[_businessLicense] == address(0),
            "Business license already registered"
        );

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

        stakeholdersByRole[_role].push(_stakeholderAddress);
        licenseToAddress[_businessLicense] = _stakeholderAddress;
        totalStakeholders++;

        emit StakeholderRegistered(
            _stakeholderAddress,
            _role,
            _businessName,
            block.timestamp
        );
    }

    function isRegisteredStakeholder(
        address _stakeholder,
        StakeholderRole _role
    ) public view returns (bool) {
        return
            stakeholders[_stakeholder].isActive &&
            stakeholders[_stakeholder].role == _role;
    }

    function getStakeholderInfo(
        address _stakeholder
    ) public view returns (StakeholderInfo memory) {
        return stakeholders[_stakeholder];
    }

    function getStakeholdersByRole(
        StakeholderRole _role
    ) public view returns (address[] memory) {
        return stakeholdersByRole[_role];
    }

    function updateLastActivity(
        address _stakeholder
    ) external validStakeholder(_stakeholder) {
        stakeholders[_stakeholder].lastActivity = block.timestamp;
    }

    function deactivateStakeholder(address _stakeholder) external onlyAdmin {
        require(
            stakeholders[_stakeholder].isActive,
            "Stakeholder is not active"
        );

        stakeholders[_stakeholder].isActive = false;

        emit StakeholderDeactivated(_stakeholder, block.timestamp);
    }

    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid new admin address");
        admin = _newAdmin;
    }
}
