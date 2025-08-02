// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./AccessControl.sol";

/**
 * @title StakeholderManager
 * @dev Manages stakeholder registration, partnership, and license keys with explicit active flag.
 */
contract StakeholderManager is AccessControl {
    struct Stakeholder {
        address stakeholderAddress;
        Role role;
        string name;
        string licenseId;
        string location;
        string certification;
        uint256 registeredAt;
        string licenseKey;
        uint256 licenseKeyGeneratedAt;
        mapping(address => bool) authorizedPartners;
    }

    struct RegistrationRequest {
        uint256 requestId;
        address applicant;
        Role requestedRole;
        string name;
        string licenseId;
        string location;
        string certification;
        string businessDescription;
        string contactEmail;
        uint256 requestedAt;
        RequestStatus status;
        address reviewedBy;
        uint256 reviewedAt;
        string reviewNotes;
        string generatedLicenseKey;
    }

    enum RequestStatus {
        PENDING,
        APPROVED,
        REJECTED,
        CANCELLED
    }

    // State
    mapping(address => Stakeholder) public stakeholders;
    mapping(Role => address[]) public stakeholdersByRole;
    mapping(uint256 => RegistrationRequest) public registrationRequests;
    mapping(address => uint256[]) public userRequests;
    mapping(address => bool) public blacklistedAddresses;
    mapping(string => address) public licenseKeyToAddress;

    address[] public allStakeholders;
    uint256 public totalStakeholders;
    uint256 public nextRequestId = 1;
    uint256 public totalRequests;
    uint256 public pendingRequests;

    // Events
    event StakeholderRegistered(
        address indexed stakeholder,
        Role indexed role,
        string name,
        address indexed registeredBy
    );
    event StakeholderDeactivated(
        address indexed stakeholder,
        address indexed deactivatedBy
    );
    event StakeholderReactivated(
        address indexed stakeholder,
        address indexed reactivatedBy
    );
    event PartnershipUpdated(
        address indexed a,
        address indexed b,
        bool authorized
    );

    event RegistrationRequested(
        uint256 indexed requestId,
        address indexed applicant,
        Role indexed requestedRole,
        string name
    );
    event RegistrationReviewed(
        uint256 indexed requestId,
        address indexed applicant,
        RequestStatus status,
        address indexed reviewedBy
    );
    event RegistrationCancelled(
        uint256 indexed requestId,
        address indexed applicant
    );
    event LicenseKeyGenerated(
        address indexed stakeholder,
        string licenseKey,
        uint256 timestamp
    );
    event LicenseKeyVerified(
        string licenseKey,
        address indexed stakeholder,
        bool isValid
    );

    // --- Registration flow ---

    function submitRegistrationRequest(
        Role requestedRole,
        string calldata name,
        string calldata licenseId,
        string calldata location,
        string calldata certification,
        string calldata businessDescription,
        string calldata contactEmail
    ) external returns (uint256) {
        require(
            requestedRole != Role.NONE && requestedRole != Role.ADMIN,
            "Invalid role"
        );
        require(bytes(name).length > 0, "Name required");
        require(bytes(licenseId).length > 0, "License ID required");
        require(bytes(location).length > 0, "Location required");
        require(bytes(contactEmail).length > 0, "Contact email required");
        require(!isActive(msg.sender), "Already registered or active");
        require(!blacklistedAddresses[msg.sender], "Blacklisted");

        uint256 requestId = nextRequestId++;
        RegistrationRequest storage req = registrationRequests[requestId];
        req.requestId = requestId;
        req.applicant = msg.sender;
        req.requestedRole = requestedRole;
        req.name = name;
        req.licenseId = licenseId;
        req.location = location;
        req.certification = certification;
        req.businessDescription = businessDescription;
        req.contactEmail = contactEmail;
        req.requestedAt = block.timestamp;
        req.status = RequestStatus.PENDING;

        userRequests[msg.sender].push(requestId);
        totalRequests++;
        pendingRequests++;

        emit RegistrationRequested(requestId, msg.sender, requestedRole, name);
        return requestId;
    }

    function approveRegistrationRequest(
        uint256 requestId,
        string calldata reviewNotes
    ) external onlyAdmin {
        require(_requestExists(requestId), "Request missing");
        RegistrationRequest storage req = registrationRequests[requestId];
        require(req.status == RequestStatus.PENDING, "Not pending");
        require(!isActive(req.applicant), "Already active");
        require(!blacklistedAddresses[req.applicant], "Blacklisted");

        string memory licenseKey = _generateLicenseKey(
            req.applicant,
            req.requestedRole,
            block.timestamp
        );

        req.status = RequestStatus.APPROVED;
        req.reviewedBy = msg.sender;
        req.reviewedAt = block.timestamp;
        req.reviewNotes = reviewNotes;
        req.generatedLicenseKey = licenseKey;
        pendingRequests--;

        _registerStakeholderWithLicenseKey(
            req.applicant,
            req.requestedRole,
            req.name,
            req.licenseId,
            req.location,
            req.certification,
            licenseKey
        );

        emit RegistrationReviewed(
            requestId,
            req.applicant,
            RequestStatus.APPROVED,
            msg.sender
        );
        emit LicenseKeyGenerated(req.applicant, licenseKey, block.timestamp);
    }

    function rejectRegistrationRequest(
        uint256 requestId,
        string calldata reviewNotes
    ) external onlyAdmin {
        require(_requestExists(requestId), "Request missing");
        RegistrationRequest storage req = registrationRequests[requestId];
        require(req.status == RequestStatus.PENDING, "Not pending");

        req.status = RequestStatus.REJECTED;
        req.reviewedBy = msg.sender;
        req.reviewedAt = block.timestamp;
        req.reviewNotes = reviewNotes;
        pendingRequests--;

        emit RegistrationReviewed(
            requestId,
            req.applicant,
            RequestStatus.REJECTED,
            msg.sender
        );
    }

    function cancelRegistrationRequest(uint256 requestId) external {
        require(_requestExists(requestId), "Request missing");
        RegistrationRequest storage req = registrationRequests[requestId];
        require(req.applicant == msg.sender, "Not applicant");
        require(req.status == RequestStatus.PENDING, "Not pending");

        req.status = RequestStatus.CANCELLED;
        pendingRequests--;

        emit RegistrationCancelled(requestId, msg.sender);
    }

    // --- License key access ---

    function getMyLicenseKey() external view returns (string memory) {
        require(isActive(msg.sender), "Not fully active");
        return stakeholders[msg.sender].licenseKey;
    }

    function getLicenseKey(
        address stakeholder
    ) external view onlyAdmin returns (string memory) {
        require(isActive(stakeholder), "Not fully active");
        return stakeholders[stakeholder].licenseKey;
    }

    function getLicenseKeyForAddress(
        address stakeholder
    ) external view returns (string memory) {
        require(isActive(stakeholder), "Not active");
        return stakeholders[stakeholder].licenseKey;
    }

    function verifyLicenseKey(
        string calldata licenseKey
    )
        external
        view
        returns (
            bool isValid,
            address stakeholder,
            Role role,
            string memory name,
            uint256 registeredAt
        )
    {
        stakeholder = licenseKeyToAddress[licenseKey];
        if (stakeholder != address(0) && isActive(stakeholder)) {
            isValid = true;
            Stakeholder storage s = stakeholders[stakeholder];
            role = s.role;
            name = s.name;
            registeredAt = s.registeredAt;
        } else {
            isValid = false;
        }

        //emit LicenseKeyVerified(licenseKey, stakeholder, isValid);
        return (isValid, stakeholder, role, name, registeredAt);
    }

    function regenerateLicenseKey(
        address stakeholder
    ) external onlyAdmin returns (string memory) {
        require(isActive(stakeholder), "Not fully active");

        Stakeholder storage s = stakeholders[stakeholder];
        string memory oldKey = s.licenseKey;
        if (bytes(oldKey).length > 0) {
            delete licenseKeyToAddress[oldKey];
        }

        string memory newKey = _generateLicenseKey(
            stakeholder,
            s.role,
            block.timestamp
        );
        s.licenseKey = newKey;
        s.licenseKeyGeneratedAt = block.timestamp;
        licenseKeyToAddress[newKey] = stakeholder;

        emit LicenseKeyGenerated(stakeholder, newKey, block.timestamp);
        return newKey;
    }

    // --- Internal registration helper ---

    function _registerStakeholderWithLicenseKey(
        address stakeholder,
        Role role,
        string memory name,
        string memory licenseId,
        string memory location,
        string memory certification,
        string memory licenseKey
    ) internal {
        // All updates in single transaction
        Stakeholder storage s = stakeholders[stakeholder];
        s.stakeholderAddress = stakeholder;
        s.role = role;
        s.name = name;
        s.licenseId = licenseId;
        s.location = location;
        s.certification = certification;
        s.registeredAt = block.timestamp;
        s.licenseKey = licenseKey;
        s.licenseKeyGeneratedAt = block.timestamp;

        // Update arrays
        stakeholdersByRole[role].push(stakeholder);
        allStakeholders.push(stakeholder);
        totalStakeholders++;

        // Update mappings
        licenseKeyToAddress[licenseKey] = stakeholder;

        // LAST: Set role and activate (atomic)
        // This activates in AccessControl
        _setRole(stakeholder, role);

        emit StakeholderRegistered(stakeholder, role, name, msg.sender);
    }

    // --- Partnership & transaction logic ---

    function setPartnership(
        address a,
        address b,
        bool authorized
    ) external onlyAdmin {
        require(isActive(a), "A not fully active");
        require(isActive(b), "B not fully active");

        Stakeholder storage sa = stakeholders[a];
        Stakeholder storage sb = stakeholders[b];
        sa.authorizedPartners[b] = authorized;
        sb.authorizedPartners[a] = authorized;
        emit PartnershipUpdated(a, b, authorized);
    }

    function isPartnershipAuthorized(
        address a,
        address b
    ) external view returns (bool) {
        return stakeholders[a].authorizedPartners[b];
    }

    /**
     * @dev Fully active check (single source of truth)
     */
    function isFullyActive(address account) public view returns (bool) {
        return isActive(account);
    }

    /**
     * @dev Unified check: base role compatibility + stakeholder-level active + partnership exceptions.
     * Farmer→Processor and Processor→Distributor are open; others need explicit mutual partnership.
     */
    function canTransact(address from, address to) public view returns (bool) {
        // Single active check
        if (!isActive(from) || !isActive(to)) return false;

        Role fromRole = getRole(from);
        Role toRole = getRole(to);

        // Simple business rules
        if (fromRole == Role.FARMER && toRole == Role.PROCESSOR) return true;
        if (fromRole == Role.PROCESSOR && toRole == Role.DISTRIBUTOR)
            return true;

        // Partnership fallback
        return
            stakeholders[from].authorizedPartners[to] &&
            stakeholders[to].authorizedPartners[from];
    }

    // --- Lifecycle & admin controls ---

    function deactivateStakeholder(address stakeholder) external onlyAdmin {
        require(isActive(stakeholder), "Stakeholder not active");
        _removeRole(stakeholder, stakeholders[stakeholder].role); // optional: could preserve role but business logic uses explicit flag
        emit StakeholderDeactivated(stakeholder, msg.sender);
    }

    function reactivateStakeholder(address stakeholder) external onlyAdmin {
        require(!isActive(stakeholder), "Already active");
        require(
            stakeholders[stakeholder].stakeholderAddress != address(0),
            "Not registered"
        );
        _setRole(stakeholder, stakeholders[stakeholder].role);
        emit StakeholderReactivated(stakeholder, msg.sender);
    }

    function blacklistAddress(
        address addr,
        bool isBlacklisted
    ) external onlyAdmin {
        require(addr != address(0), "Invalid");
        blacklistedAddresses[addr] = isBlacklisted;
    }

    function registerStakeholder(
        address stakeholder,
        Role role,
        string calldata name,
        string calldata licenseId,
        string calldata location,
        string calldata certification
    ) external onlyAdmin {
        require(stakeholder != address(0), "Invalid");
        require(role != Role.NONE, "Invalid role");
        require(bytes(name).length > 0, "Name required");
        require(!isFullyActive(stakeholder), "Already active");
        require(!blacklistedAddresses[stakeholder], "Blacklisted");

        string memory licenseKey = _generateLicenseKey(
            stakeholder,
            role,
            block.timestamp
        );
        _registerStakeholderWithLicenseKey(
            stakeholder,
            role,
            name,
            licenseId,
            location,
            certification,
            licenseKey
        );
        emit LicenseKeyGenerated(stakeholder, licenseKey, block.timestamp);
    }

    // --- Views / stats ---

    function getStakeholderInfo(
        address stakeholder
    )
        external
        view
        returns (
            Role role,
            string memory name,
            string memory licenseId,
            string memory location,
            string memory certification,
            bool active,
            uint256 registeredAt
        )
    {
        require(
            stakeholders[stakeholder].stakeholderAddress != address(0),
            "Not found"
        );
        Stakeholder storage s = stakeholders[stakeholder];
        return (
            s.role,
            s.name,
            s.licenseId,
            s.location,
            s.certification,
            isFullyActive(stakeholder),
            s.registeredAt
        );
    }

    function getCompleteStakeholderInfo(
        address stakeholder
    )
        external
        view
        returns (
            Role role,
            string memory name,
            string memory licenseId,
            string memory location,
            string memory certification,
            bool active,
            uint256 registeredAt,
            string memory licenseKey,
            uint256 licenseKeyGeneratedAt
        )
    {
        require(
            stakeholders[stakeholder].stakeholderAddress != address(0),
            "Not found"
        );
        require(
            msg.sender == stakeholder || hasRole(msg.sender, Role.ADMIN),
            "Forbidden"
        );

        Stakeholder storage s = stakeholders[stakeholder];
        return (
            s.role,
            s.name,
            s.licenseId,
            s.location,
            s.certification,
            isFullyActive(stakeholder),
            s.registeredAt,
            s.licenseKey,
            s.licenseKeyGeneratedAt
        );
    }

    function getAllStakeholders() external view returns (address[] memory) {
        return allStakeholders;
    }

    function getStakeholdersByRole(
        Role role
    ) external view returns (address[] memory) {
        return stakeholdersByRole[role];
    }

    function getTotalStakeholders() external view returns (uint256) {
        return totalStakeholders;
    }

    function isRegistered(address stakeholder) external view returns (bool) {
        return stakeholders[stakeholder].registeredAt > 0;
    }

    function getStakeholderRole(
        address stakeholder
    ) external view returns (Role) {
        return stakeholders[stakeholder].role;
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
        totalFarmers = stakeholdersByRole[Role.FARMER].length;
        totalProcessors = stakeholdersByRole[Role.PROCESSOR].length;
        totalDistributors = stakeholdersByRole[Role.DISTRIBUTOR].length;
        totalShippers = stakeholdersByRole[Role.SHIPPER].length;
        totalRetailers = stakeholdersByRole[Role.RETAILER].length;
        totalAdmins = stakeholdersByRole[Role.ADMIN].length;
    }

    function getPendingRequests()
        external
        view
        onlyAdmin
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](pendingRequests);
        uint256 count = 0;
        for (uint256 i = 1; i < nextRequestId; i++) {
            if (registrationRequests[i].status == RequestStatus.PENDING) {
                result[count++] = i;
            }
        }
        return result;
    }

    function getUserRequests(
        address applicant
    ) external view returns (uint256[] memory) {
        return userRequests[applicant];
    }

    function getRegistrationRequest(
        uint256 requestId
    ) external view returns (
        uint256,       // requestId
        address,       // applicant
        Role,          // requestedRole
        string memory, // name
        string memory, // licenseId
        string memory, // location
        string memory, // certification
        string memory, // businessDescription
        string memory, // contactEmail
        uint256,       // requestedAt
        RequestStatus, // status
        address,       // reviewedBy
        uint256,       // reviewedAt
        string memory, // reviewNotes
        string memory  // generatedLicenseKey
    ) {
        require(_requestExists(requestId), "Request does not exist");
        RegistrationRequest storage req = registrationRequests[requestId];
        
        return (
            req.requestId,
            req.applicant,
            req.requestedRole,
            req.name,
            req.licenseId,
            req.location,
            req.certification,
            req.businessDescription,
            req.contactEmail,
            req.requestedAt,
            req.status,
            req.reviewedBy,
            req.reviewedAt,
            req.reviewNotes,
            req.generatedLicenseKey
        );
    }

    function getRegistrationStats()
        external
        view
        onlyAdmin
        returns (
            uint256 _totalRequests,
            uint256 _pendingRequests,
            uint256 _approvedRequests,
            uint256 _rejectedRequests,
            uint256 _cancelledRequests
        )
    {
        _totalRequests = totalRequests;
        _pendingRequests = pendingRequests;
        for (uint256 i = 1; i < nextRequestId; i++) {
            RequestStatus status = registrationRequests[i].status;
            if (status == RequestStatus.APPROVED) _approvedRequests++;
            else if (status == RequestStatus.REJECTED) _rejectedRequests++;
            else if (status == RequestStatus.CANCELLED) _cancelledRequests++;
        }
    }

    // --- Internal helpers ---

    function _requestExists(uint256 requestId) internal view returns (bool) {
        return
            requestId > 0 &&
            requestId < nextRequestId &&
            registrationRequests[requestId].requestId != 0;
    }

    // --- License key generation (proper hex) ---

    function _generateLicenseKey(
        address stakeholder,
        Role role,
        uint256 timestamp
    ) internal pure returns (string memory) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                "LICENSE_KEY_",
                stakeholder,
                role,
                timestamp,
                "SUPPLY_CHAIN_2024"
            )
        );
        bytes memory segment1 = _toFixedLengthHex(
            uint32(uint256(hash) >> 224),
            8
        );
        bytes memory segment2 = _toFixedLengthHex(
            uint32((uint256(hash) >> 192) & 0xFFFFFFFF),
            8
        );
        bytes memory segment3 = _toFixedLengthHex(
            uint32((uint256(hash) >> 160) & 0xFFFFFFFF),
            8
        );
        return
            string(
                abi.encodePacked("SC-", segment1, "-", segment2, "-", segment3)
            );
    }

    function _toFixedLengthHex(
        uint256 value,
        uint256 length
    ) internal pure returns (bytes memory) {
        bytes memory buffer = new bytes(length);
        for (uint256 i = length; i > 0; --i) {
            uint8 nibble = uint8(value & 0xf);
            buffer[i - 1] = _nibbleToHexChar(nibble);
            value >>= 4;
        }
        return buffer;
    }

    function _nibbleToHexChar(uint8 nibble) internal pure returns (bytes1) {
        return
            nibble < 10
                ? bytes1(uint8(48 + nibble))
                : bytes1(uint8(87 + nibble)); // '0'-'9', 'a'-'f'
    }
}
