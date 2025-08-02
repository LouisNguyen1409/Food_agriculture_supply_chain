// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";

/**
 * @title FileStorageManager
 * @dev Manages references to files stored off-chain (S3, IPFS, etc.)
 * Updated to work with the new system architecture
 */
contract FileStorageManager is AccessControl {

    enum StorageProvider {
        IPFS,           // 0 - InterPlanetary File System
        S3,             // 1 - Amazon S3
        ARWEAVE,        // 2 - Arweave permanent storage
        CUSTOM          // 3 - Custom storage solution
    }

    struct FileRecord {
        uint256 fileId;
        uint256 batchId;            // Associated product batch
        string fileName;
        string fileHash;            // SHA256 or IPFS hash
        string storageUrl;          // Full URL to access file
        StorageProvider provider;
        address uploader;           // Who uploaded the file
        uint256 uploadedAt;
        uint256 fileSize;           // File size in bytes
        string contentType;         // MIME type
        bool isActive;              // Whether file is still accessible
        string[] tags;              // Search tags
    }

    struct UploadRequest {
        uint256 requestId;
        uint256 batchId;
        address requester;
        string fileName;
        string contentType;
        StorageProvider provider;
        uint256 requestedAt;
        bool isCompleted;
        uint256 fileId;             // Set when upload is completed
    }

    // State variables
    mapping(uint256 => FileRecord) public files;
    mapping(uint256 => UploadRequest) public uploadRequests;
    mapping(uint256 => uint256[]) public batchFiles;        // batchId => fileIds[]
    mapping(address => uint256[]) public userFiles;         // user => fileIds[]
    mapping(string => uint256) public hashToFileId;         // fileHash => fileId
    mapping(address => bool) public authorizedOracles;      // Oracles that can complete uploads

    uint256 public nextFileId = 1;
    uint256 public nextRequestId = 1;
    uint256 public totalFiles;
    uint256 public totalUploadRequests;

    // Events
    event FileUploadRequested(
        uint256 indexed requestId,
        uint256 indexed batchId,
        address indexed requester,
        string fileName,
        StorageProvider provider
    );
    event FileUploaded(
        uint256 indexed fileId,
        uint256 indexed batchId,
        address indexed uploader,
        string fileHash,
        string storageUrl
    );
    event FileDeactivated(uint256 indexed fileId, address indexed deactivator);
    event OracleAuthorized(address indexed oracle, bool authorized);

    constructor() {
        // Contract deployer is initially the only authorized oracle
        authorizedOracles[msg.sender] = true;
    }

    modifier onlyAuthorizedOracle() {
        require(authorizedOracles[msg.sender], "Not an authorized oracle");
        _;
    }

    /**
     * @dev Request file upload (creates upload request that oracle will fulfill)
     */
    function requestFileStorage(
        uint256 batchId,
        string calldata fileName,
        string calldata contentType,
        StorageProvider provider
    ) external onlyActiveStakeholder returns (uint256) {
        require(bytes(fileName).length > 0, "File name required");
        require(bytes(contentType).length > 0, "Content type required");

        uint256 requestId = nextRequestId++;

        uploadRequests[requestId] = UploadRequest({
            requestId: requestId,
            batchId: batchId,
            requester: msg.sender,
            fileName: fileName,
            contentType: contentType,
            provider: provider,
            requestedAt: block.timestamp,
            isCompleted: false,
            fileId: 0
        });

        totalUploadRequests++;

        emit FileUploadRequested(requestId, batchId, msg.sender, fileName, provider);
        return requestId;
    }

    /**
     * @dev Complete file upload (called by authorized oracle after uploading to storage)
     */
    function completeFileUpload(
        uint256 requestId,
        string calldata fileHash,
        string calldata storageUrl,
        uint256 fileSize,
        string[] calldata tags
    ) external onlyAuthorizedOracle returns (uint256) {
        require(uploadRequests[requestId].requestId != 0, "Upload request not found");
        require(!uploadRequests[requestId].isCompleted, "Upload already completed");
        require(bytes(fileHash).length > 0, "File hash required");
        require(bytes(storageUrl).length > 0, "Storage URL required");
        require(hashToFileId[fileHash] == 0, "File hash already exists");

        UploadRequest storage request = uploadRequests[requestId];
        uint256 fileId = nextFileId++;

        // Create file record
        FileRecord storage file = files[fileId];
        file.fileId = fileId;
        file.batchId = request.batchId;
        file.fileName = request.fileName;
        file.fileHash = fileHash;
        file.storageUrl = storageUrl;
        file.provider = request.provider;
        file.uploader = request.requester;
        file.uploadedAt = block.timestamp;
        file.fileSize = fileSize;
        file.contentType = request.contentType;
        file.isActive = true;
        file.tags = tags;

        // Update mappings
        batchFiles[request.batchId].push(fileId);
        userFiles[request.requester].push(fileId);
        hashToFileId[fileHash] = fileId;

        // Mark request as completed
        request.isCompleted = true;
        request.fileId = fileId;

        totalFiles++;

        emit FileUploaded(fileId, request.batchId, request.requester, fileHash, storageUrl);
        return fileId;
    }

    /**
     * @dev Get file information
     */
    function getFileInfo(uint256 fileId)
        external
        view
        returns (
            uint256 batchId,
            string memory fileName,
            string memory fileHash,
            string memory storageUrl,
            StorageProvider provider,
            address uploader,
            uint256 uploadedAt,
            uint256 fileSize,
            string memory contentType,
            bool isActive
        )
    {
        require(_fileExists(fileId), "File does not exist");
        FileRecord storage file = files[fileId];

        return (
            file.batchId,
            file.fileName,
            file.fileHash,
            file.storageUrl,
            file.provider,
            file.uploader,
            file.uploadedAt,
            file.fileSize,
            file.contentType,
            file.isActive
        );
    }

    /**
     * @dev Get files for a batch
     */
    function getBatchFiles(uint256 batchId) external view returns (uint256[] memory) {
        return batchFiles[batchId];
    }

    /**
     * @dev Get files by user
     */
    function getUserFiles(address user) external view returns (uint256[] memory) {
        return userFiles[user];
    }

    /**
     * @dev Get file by hash
     */
    function getFileByHash(string calldata fileHash) external view returns (uint256) {
        uint256 fileId = hashToFileId[fileHash];
        require(fileId != 0, "File not found");
        return fileId;
    }

    /**
     * @dev Get upload request information
     */
    function getUploadRequest(uint256 requestId)
        external
        view
        returns (
            uint256 batchId,
            address requester,
            string memory fileName,
            string memory contentType,
            StorageProvider provider,
            uint256 requestedAt,
            bool isCompleted,
            uint256 fileId
        )
    {
        require(uploadRequests[requestId].requestId != 0, "Upload request not found");
        UploadRequest storage request = uploadRequests[requestId];

        return (
            request.batchId,
            request.requester,
            request.fileName,
            request.contentType,
            request.provider,
            request.requestedAt,
            request.isCompleted,
            request.fileId
        );
    }

    /**
     * @dev Get pending upload requests
     */
    function getPendingUploadRequests() external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](totalUploadRequests);
        uint256 count = 0;

        for (uint256 i = 1; i < nextRequestId; i++) {
            if (uploadRequests[i].requestId != 0 && !uploadRequests[i].isCompleted) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory pendingRequests = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            pendingRequests[i] = result[i];
        }

        return pendingRequests;
    }

    /**
     * @dev Search files by tags
     */
    function searchFilesByTag(string calldata tag) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](totalFiles);
        uint256 count = 0;

        for (uint256 i = 1; i < nextFileId; i++) {
            if (_fileExists(i) && _hasTag(i, tag)) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory taggedFiles = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            taggedFiles[i] = result[i];
        }

        return taggedFiles;
    }

    /**
     * @dev Get files by provider
     */
    function getFilesByProvider(StorageProvider provider) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](totalFiles);
        uint256 count = 0;

        for (uint256 i = 1; i < nextFileId; i++) {
            if (_fileExists(i) && files[i].provider == provider) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory providerFiles = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            providerFiles[i] = result[i];
        }

        return providerFiles;
    }

    /**
     * @dev Deactivate a file (uploader or admin only)
     */
    function deactivateFile(uint256 fileId) external {
        require(_fileExists(fileId), "File does not exist");

        FileRecord storage file = files[fileId];
        require(
            msg.sender == file.uploader || hasRole(msg.sender, Role.ADMIN),
            "Unauthorized to deactivate file"
        );
        require(file.isActive, "File already inactive");

        file.isActive = false;
        emit FileDeactivated(fileId, msg.sender);
    }

    /**
     * @dev Set oracle authorization (admin only)
     */
    function setOracleOperator(address oracle, bool authorized) external onlyAdmin {
        require(oracle != address(0), "Invalid oracle address");
        authorizedOracles[oracle] = authorized;
        emit OracleAuthorized(oracle, authorized);
    }

    /**
     * @dev Get file tags
     */
    function getFileTags(uint256 fileId) external view returns (string[] memory) {
        require(_fileExists(fileId), "File does not exist");
        return files[fileId].tags;
    }

    /**
     * @dev Add tags to file (uploader or admin only)
     */
    function addFileTags(uint256 fileId, string[] calldata newTags) external {
        require(_fileExists(fileId), "File does not exist");

        FileRecord storage file = files[fileId];
        require(
            msg.sender == file.uploader || hasRole(msg.sender, Role.ADMIN),
            "Unauthorized to modify file"
        );

        for (uint256 i = 0; i < newTags.length; i++) {
            file.tags.push(newTags[i]);
        }
    }

    /**
     * @dev Get storage provider name
     */
    function getProviderName(StorageProvider provider) external pure returns (string memory) {
        if (provider == StorageProvider.IPFS) return "IPFS";
        if (provider == StorageProvider.S3) return "Amazon S3";
        if (provider == StorageProvider.ARWEAVE) return "Arweave";
        if (provider == StorageProvider.CUSTOM) return "Custom";
        return "Unknown";
    }

    /**
     * @dev Get system statistics
     */
    function getStorageStats()
        external
        view
        returns (
            uint256 _totalFiles,
            uint256 _totalUploadRequests,
            uint256 activeFiles,
            uint256 pendingRequests
        )
    {
        _totalFiles = totalFiles;
        _totalUploadRequests = totalUploadRequests;

        // Count active files
        for (uint256 i = 1; i < nextFileId; i++) {
            if (_fileExists(i) && files[i].isActive) {
                activeFiles++;
            }
        }

        // Count pending requests
        for (uint256 i = 1; i < nextRequestId; i++) {
            if (uploadRequests[i].requestId != 0 && !uploadRequests[i].isCompleted) {
                pendingRequests++;
            }
        }
    }

    /**
     * @dev Check if file exists
     */
    function _fileExists(uint256 fileId) internal view returns (bool) {
        return fileId > 0 && fileId < nextFileId && files[fileId].fileId != 0;
    }

    /**
     * @dev Check if file has specific tag
     */
    function _hasTag(uint256 fileId, string calldata tag) internal view returns (bool) {
        string[] storage tags = files[fileId].tags;
        for (uint256 i = 0; i < tags.length; i++) {
            if (keccak256(bytes(tags[i])) == keccak256(bytes(tag))) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Batch request multiple file uploads
     */
    function batchRequestFileStorage(
        uint256[] calldata batchIds,
        string[] calldata fileNames,
        string[] calldata contentTypes,
        StorageProvider provider
    ) external onlyActiveStakeholder returns (uint256[] memory) {
        require(batchIds.length == fileNames.length, "Array length mismatch");
        require(batchIds.length == contentTypes.length, "Array length mismatch");
        require(batchIds.length > 0, "No files to upload");

        uint256[] memory requestIds = new uint256[](batchIds.length);

        for (uint256 i = 0; i < batchIds.length; i++) {
            requestIds[i] = this.requestFileStorage(
                batchIds[i],
                fileNames[i],
                contentTypes[i],
                provider
            );
        }

        return requestIds;
    }

    /**
     * @dev Get recent files (last N files)
     */
    function getRecentFiles(uint256 count) external view returns (uint256[] memory) {
        require(count > 0, "Count must be positive");

        uint256 actualCount = count;
        if (actualCount > totalFiles) {
            actualCount = totalFiles;
        }

        uint256[] memory result = new uint256[](actualCount);
        uint256 resultIndex = 0;

        // Start from most recent and work backwards
        for (uint256 i = nextFileId - 1; i >= 1 && resultIndex < actualCount; i--) {
            if (_fileExists(i)) {
                result[resultIndex] = i;
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Emergency function to deactivate all files for a batch (admin only)
     */
    function emergencyDeactivateBatchFiles(uint256 batchId) external onlyAdmin {
        uint256[] storage fileIds = batchFiles[batchId];

        for (uint256 i = 0; i < fileIds.length; i++) {
            if (files[fileIds[i]].isActive) {
                files[fileIds[i]].isActive = false;
                emit FileDeactivated(fileIds[i], msg.sender);
            }
        }
    }

    /**
     * @dev Check if oracle is authorized
     */
    function isAuthorizedOracle(address oracle) external view returns (bool) {
        return authorizedOracles[oracle];
    }

    /**
     * @dev Get all authorized oracles (admin only)
     */
    function getAuthorizedOracles() external view onlyAdmin returns (address[] memory) {
        // This is a simplified implementation
        // In practice, you'd want to track authorized oracles in an array
        address[] memory result = new address[](1);
        result[0] = owner; // Just return owner for now
        return result;
    }
}