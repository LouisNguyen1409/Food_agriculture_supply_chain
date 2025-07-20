// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";

contract FileStorageManager {
    enum FileType {
        IMAGE,
        CERTIFICATE,
        DOCUMENT,
        TEST_RESULT,
        VIDEO,
        OTHER
    }

    enum ProductStage {
        FARM,
        PROCESSING,
        DISTRIBUTION,
        RETAIL,
        CONSUMED
    }

    enum RequestStatus {
        PENDING,
        PROCESSING,
        COMPLETED,
        FAILED
    }

    struct FileStorageRequest {
        uint256 requestId;
        uint256 productId;
        string fileName;
        bytes32 fileHash;
        FileType fileType;
        ProductStage stage;
        address requester;
        uint256 requestedAt;
        RequestStatus status;
        string s3Url;
        string errorMessage;
        uint256 completedAt;
    }

    struct TransactionLog {
        uint256 requestId;
        string action; // "UPLOAD_REQUESTED", "S3_UPLOAD_SUCCESS", "S3_UPLOAD_FAILED"
        bool success;
        uint256 timestamp;
        string details;
        address actor;
    }

    // Storage
    mapping(uint256 => FileStorageRequest) public fileRequests;
    mapping(uint256 => TransactionLog[]) public transactionLogs;
    mapping(uint256 => uint256[]) public productFiles; // productId => requestIds[]
    mapping(address => uint256[]) public userRequests; // user => requestIds[]

    uint256 public nextRequestId = 1;
    address public oracleOperator;
    StakeholderRegistry public stakeholderRegistry;

    // Events - Oracle listens to these to trigger S3 operations
    event FileUploadRequested(
        uint256 indexed requestId,
        uint256 indexed productId,
        address indexed requester,
        string fileName,
        bytes32 fileHash,
        FileType fileType,
        ProductStage stage,
        uint256 timestamp
    );

    event S3OperationCompleted(
        uint256 indexed requestId,
        bool success,
        string s3Url,
        string errorMessage,
        uint256 timestamp
    );

    event TransactionLogged(
        uint256 indexed requestId,
        string action,
        bool success,
        uint256 timestamp,
        string details,
        address actor
    );

    modifier onlyOracleOperator() {
        require(
            msg.sender == oracleOperator,
            "Only oracle operator can call this"
        );
        _;
    }

    modifier onlyRegisteredStakeholder() {
        require(
            stakeholderRegistry.isActiveStakeholder(msg.sender),
            "Not an active stakeholder"
        );
        _;
    }

    modifier validRequest(uint256 _requestId) {
        require(
            _requestId > 0 && _requestId < nextRequestId,
            "Invalid request ID"
        );
        _;
    }

    constructor(address _stakeholderRegistryAddress, address _oracleOperator) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        oracleOperator = _oracleOperator;
    }

    /**
     * @dev Web API calls this to request file storage
     * Flow: Web API → Smart Contracts → AWS S3 (via oracle)
     */
    function requestFileStorage(
        uint256 _productId,
        string memory _fileName,
        bytes32 _fileHash,
        uint8 _fileType,
        uint8 _stage
    ) external onlyRegisteredStakeholder returns (uint256) {
        require(_productId > 0, "Invalid product ID");
        require(bytes(_fileName).length > 0, "File name cannot be empty");
        require(_fileHash != bytes32(0), "File hash required");
        require(_fileType <= uint8(FileType.OTHER), "Invalid file type");
        require(_stage <= uint8(ProductStage.CONSUMED), "Invalid stage");

        uint256 requestId = nextRequestId++;

        // Create storage request
        fileRequests[requestId] = FileStorageRequest({
            requestId: requestId,
            productId: _productId,
            fileName: _fileName,
            fileHash: _fileHash,
            fileType: FileType(_fileType),
            stage: ProductStage(_stage),
            requester: msg.sender,
            requestedAt: block.timestamp,
            status: RequestStatus.PENDING,
            s3Url: "",
            errorMessage: "",
            completedAt: 0
        });

        // Update mappings
        productFiles[_productId].push(requestId);
        userRequests[msg.sender].push(requestId);

        // Log transaction
        _logTransaction(
            requestId,
            "UPLOAD_REQUESTED",
            true,
            "File upload requested through Web API",
            msg.sender
        );

        // Emit event for oracle to pick up - Smart Contracts → AWS S3
        emit FileUploadRequested(
            requestId,
            _productId,
            msg.sender,
            _fileName,
            _fileHash,
            FileType(_fileType),
            ProductStage(_stage),
            block.timestamp
        );

        return requestId;
    }

    /**
     * @dev Oracle reports S3 operation result back to contract
     * Flow: AWS S3 → Transaction Log
     */
    function reportS3Result(
        uint256 _requestId,
        bool _success,
        string memory _s3Url,
        string memory _errorMessage
    ) external onlyOracleOperator validRequest(_requestId) {
        FileStorageRequest storage request = fileRequests[_requestId];
        require(request.status == RequestStatus.PENDING, "Request not pending");

        // Update request status
        if (_success) {
            request.status = RequestStatus.COMPLETED;
            request.s3Url = _s3Url;

            _logTransaction(
                _requestId,
                "S3_UPLOAD_SUCCESS",
                true,
                string(
                    abi.encodePacked(
                        "File successfully uploaded to S3: ",
                        _s3Url
                    )
                ),
                msg.sender
            );
        } else {
            request.status = RequestStatus.FAILED;
            request.errorMessage = _errorMessage;

            _logTransaction(
                _requestId,
                "S3_UPLOAD_FAILED",
                false,
                string(abi.encodePacked("S3 upload failed: ", _errorMessage)),
                msg.sender
            );
        }

        request.completedAt = block.timestamp;

        // Emit completion event
        emit S3OperationCompleted(
            _requestId,
            _success,
            _s3Url,
            _errorMessage,
            block.timestamp
        );
    }

    /**
     * @dev Internal function to log all transactions on blockchain
     */
    function _logTransaction(
        uint256 _requestId,
        string memory _action,
        bool _success,
        string memory _details,
        address _actor
    ) internal {
        transactionLogs[_requestId].push(
            TransactionLog({
                requestId: _requestId,
                action: _action,
                success: _success,
                timestamp: block.timestamp,
                details: _details,
                actor: _actor
            })
        );

        emit TransactionLogged(
            _requestId,
            _action,
            _success,
            block.timestamp,
            _details,
            _actor
        );
    }

    /**
     * @dev Get file request details
     */
    function getFileRequest(
        uint256 _requestId
    )
        external
        view
        validRequest(_requestId)
        returns (FileStorageRequest memory)
    {
        return fileRequests[_requestId];
    }

    /**
     * @dev Get transaction logs for a request
     */
    function getTransactionLogs(
        uint256 _requestId
    ) external view validRequest(_requestId) returns (TransactionLog[] memory) {
        return transactionLogs[_requestId];
    }

    /**
     * @dev Get all file requests for a product
     */
    function getProductFiles(
        uint256 _productId
    ) external view returns (uint256[] memory) {
        return productFiles[_productId];
    }

    /**
     * @dev Get successful file URLs for a product
     */
    function getProductFileUrls(
        uint256 _productId
    ) external view returns (string[] memory) {
        uint256[] memory requestIds = productFiles[_productId];
        string[] memory urls = new string[](requestIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < requestIds.length; i++) {
            if (fileRequests[requestIds[i]].status == RequestStatus.COMPLETED) {
                urls[count] = fileRequests[requestIds[i]].s3Url;
                count++;
            }
        }

        // Resize array to actual count
        string[] memory result = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = urls[i];
        }

        return result;
    }

    /**
     * @dev Get files by stage for a product
     */
    function getProductFilesByStage(
        uint256 _productId,
        ProductStage _stage
    ) external view returns (uint256[] memory) {
        uint256[] memory allRequests = productFiles[_productId];
        uint256[] memory stageRequests = new uint256[](allRequests.length);
        uint256 count = 0;

        for (uint256 i = 0; i < allRequests.length; i++) {
            if (
                fileRequests[allRequests[i]].stage == _stage &&
                fileRequests[allRequests[i]].status == RequestStatus.COMPLETED
            ) {
                stageRequests[count] = allRequests[i];
                count++;
            }
        }

        // Resize array
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = stageRequests[i];
        }

        return result;
    }

    /**
     * @dev Verify file integrity
     */
    function verifyFileIntegrity(
        uint256 _requestId,
        bytes32 _providedHash
    ) external view validRequest(_requestId) returns (bool) {
        return fileRequests[_requestId].fileHash == _providedHash;
    }

    /**
     * @dev Get contract statistics
     */
    function getStats()
        external
        view
        returns (
            uint256 totalRequests,
            uint256 completedRequests,
            uint256 failedRequests,
            uint256 pendingRequests
        )
    {
        uint256 completed = 0;
        uint256 failed = 0;
        uint256 pending = 0;

        for (uint256 i = 1; i < nextRequestId; i++) {
            RequestStatus status = fileRequests[i].status;
            if (status == RequestStatus.COMPLETED) {
                completed++;
            } else if (status == RequestStatus.FAILED) {
                failed++;
            } else if (status == RequestStatus.PENDING) {
                pending++;
            }
        }

        return (nextRequestId - 1, completed, failed, pending);
    }

    /**
     * @dev Update oracle operator (admin function)
     */
    function updateOracleOperator(address _newOperator) external {
        require(
            msg.sender == oracleOperator,
            "Only current operator can update"
        );
        oracleOperator = _newOperator;
    }
}
