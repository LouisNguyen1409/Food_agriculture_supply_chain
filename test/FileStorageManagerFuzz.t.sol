// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/SmartContracts/FileStorageManager.sol";
import "../src/SmartContracts/StakeholderRegistry.sol";

contract FileStorageManagerFuzz is Test {
    FileStorageManager fileManager;
    StakeholderRegistry stakeholderRegistry;

    address owner = address(0x1);
    address oracleOperator = address(0x2);
    address farmer = address(0x10);
    address processor = address(0x20);
    address distributor = address(0x30);
    address retailer = address(0x40);
    address unauthorized = address(0x99);

    // Helper variable for consumer-like functionality (using unauthorized address)

    function setUp() public {
        // Deploy StakeholderRegistry first
        vm.prank(owner);
        stakeholderRegistry = new StakeholderRegistry();

        // Deploy FileStorageManager
        vm.prank(owner);
        fileManager = new FileStorageManager(
            address(stakeholderRegistry),
            oracleOperator
        );

        // Register stakeholders (admin required for registration)
        vm.prank(owner);
        stakeholderRegistry.registerStakeholder(
            farmer,
            StakeholderRegistry.StakeholderRole.FARMER,
            "Farmer Corp",
            "FARM001",
            "Farm Location",
            "Organic Certified"
        );

        vm.prank(owner);
        stakeholderRegistry.registerStakeholder(
            processor,
            StakeholderRegistry.StakeholderRole.PROCESSOR,
            "Processing Inc",
            "PROC001",
            "Processing Location",
            "FDA Certified"
        );

        vm.prank(owner);
        stakeholderRegistry.registerStakeholder(
            distributor,
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR,
            "Distribution Ltd",
            "DIST001",
            "Distribution Location",
            "Transport Certified"
        );

        vm.prank(owner);
        stakeholderRegistry.registerStakeholder(
            retailer,
            StakeholderRegistry.StakeholderRole.RETAILER,
            "Retail Store",
            "RET001",
            "Retail Location",
            "Retail Certified"
        );

        // Note: StakeholderRegistry only has FARMER, PROCESSOR, RETAILER, DISTRIBUTOR roles
        // Consumer will be treated as unauthorized for testing
    }

    // ===== CONSTRUCTOR TESTS =====

    /**
     * @dev Test constructor with valid parameters
     */
    function testFuzzConstructorValid() public {
        FileStorageManager newManager = new FileStorageManager(
            address(stakeholderRegistry),
            oracleOperator
        );

        assertEq(
            address(newManager.stakeholderRegistry()),
            address(stakeholderRegistry)
        );
        assertEq(newManager.oracleOperator(), oracleOperator);
        assertEq(newManager.nextRequestId(), 1);
    }

    // ===== FILE STORAGE REQUEST TESTS =====

    /**
     * @dev Test successful file storage request
     */
    function testFuzzRequestFileStorage(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        uint8 fileType,
        uint8 stage
    ) public {
        vm.assume(productId > 0);
        vm.assume(productId < type(uint256).max / 2); // Reasonable limit
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        vm.expectEmit(true, true, true, true);
        emit FileUploadRequested(
            1,
            productId,
            farmer,
            fileName,
            fileHash,
            FileStorageManager.FileType(fileType),
            FileStorageManager.ProductStage(stage),
            block.timestamp
        );

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            fileType,
            stage
        );

        assertEq(requestId, 1);

        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(request.requestId, requestId);
        assertEq(request.productId, productId);
        assertEq(request.fileName, fileName);
        assertEq(request.fileHash, fileHash);
        assertEq(uint8(request.fileType), fileType);
        assertEq(uint8(request.stage), stage);
        assertEq(request.requester, farmer);
        assertEq(request.requestedAt, block.timestamp);
        assertEq(
            uint8(request.status),
            uint8(FileStorageManager.RequestStatus.PENDING)
        );
        assertEq(request.s3Url, "");
        assertEq(request.errorMessage, "");
        assertEq(request.completedAt, 0);
    }

    /**
     * @dev Test file storage request with invalid product ID
     */
    function testFuzzRequestFileStorageInvalidProductId(
        string memory fileName,
        bytes32 fileHash,
        uint8 fileType,
        uint8 stage
    ) public {
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        vm.expectRevert("Invalid product ID");
        vm.prank(farmer);
        fileManager.requestFileStorage(
            0, // Invalid product ID
            fileName,
            fileHash,
            fileType,
            stage
        );
    }

    /**
     * @dev Test file storage request with empty file name
     */
    function testFuzzRequestFileStorageEmptyFileName(
        uint256 productId,
        bytes32 fileHash,
        uint8 fileType,
        uint8 stage
    ) public {
        vm.assume(productId > 0);
        vm.assume(fileHash != bytes32(0));
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        vm.expectRevert("File name cannot be empty");
        vm.prank(farmer);
        fileManager.requestFileStorage(
            productId,
            "", // Empty file name
            fileHash,
            fileType,
            stage
        );
    }

    /**
     * @dev Test file storage request with zero file hash
     */
    function testFuzzRequestFileStorageZeroHash(
        uint256 productId,
        string memory fileName,
        uint8 fileType,
        uint8 stage
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        vm.expectRevert("File hash required");
        vm.prank(farmer);
        fileManager.requestFileStorage(
            productId,
            fileName,
            bytes32(0), // Zero hash
            fileType,
            stage
        );
    }

    /**
     * @dev Test file storage request with invalid file type
     */
    function testFuzzRequestFileStorageInvalidFileType(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        uint8 stage
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        uint8 invalidFileType = uint8(FileStorageManager.FileType.OTHER) + 1;

        vm.expectRevert("Invalid file type");
        vm.prank(farmer);
        fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            invalidFileType,
            stage
        );
    }

    /**
     * @dev Test file storage request with invalid stage
     */
    function testFuzzRequestFileStorageInvalidStage(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        uint8 fileType
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));

        uint8 invalidStage = uint8(FileStorageManager.ProductStage.CONSUMED) +
            1;

        vm.expectRevert("Invalid stage");
        vm.prank(farmer);
        fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            fileType,
            invalidStage
        );
    }

    /**
     * @dev Test file storage request by unauthorized user
     */
    function testFuzzRequestFileStorageUnauthorized(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        uint8 fileType,
        uint8 stage
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(fileType <= uint8(FileStorageManager.FileType.OTHER));
        vm.assume(stage <= uint8(FileStorageManager.ProductStage.CONSUMED));

        vm.expectRevert("Not an active stakeholder");
        vm.prank(unauthorized);
        fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            fileType,
            stage
        );
    }

    /**
     * @dev Test multiple file storage requests increment ID
     */
    function testFuzzMultipleRequests(
        uint256 productId1,
        uint256 productId2,
        string memory fileName1,
        string memory fileName2,
        bytes32 fileHash1,
        bytes32 fileHash2
    ) public {
        vm.assume(productId1 > 0 && productId2 > 0);
        vm.assume(productId1 != productId2);
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(fileHash1 != bytes32(0) && fileHash2 != bytes32(0));
        vm.assume(fileHash1 != fileHash2);

        // First request
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId1,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        // Second request
        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId2,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        assertEq(requestId1, 1);
        assertEq(requestId2, 2);
        assertEq(fileManager.nextRequestId(), 3);
    }

    // ===== S3 RESULT REPORTING TESTS =====

    /**
     * @dev Test successful S3 result reporting
     */
    function testFuzzReportS3ResultSuccess(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        string memory s3Url
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(bytes(s3Url).length > 0 && bytes(s3Url).length <= 200);

        // Create a request first
        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.expectEmit(true, false, false, true);
        emit S3OperationCompleted(requestId, true, s3Url, "", block.timestamp);

        // Report success
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId, true, s3Url, "");

        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(
            uint8(request.status),
            uint8(FileStorageManager.RequestStatus.COMPLETED)
        );
        assertEq(request.s3Url, s3Url);
        assertEq(request.errorMessage, "");
        assertEq(request.completedAt, block.timestamp);
    }

    /**
     * @dev Test failed S3 result reporting
     */
    function testFuzzReportS3ResultFailure(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        string memory errorMessage
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(
            bytes(errorMessage).length > 0 && bytes(errorMessage).length <= 200
        );

        // Create a request first
        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.DOCUMENT),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.expectEmit(true, false, false, true);
        emit S3OperationCompleted(
            requestId,
            false,
            "",
            errorMessage,
            block.timestamp
        );

        // Report failure
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId, false, "", errorMessage);

        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(
            uint8(request.status),
            uint8(FileStorageManager.RequestStatus.FAILED)
        );
        assertEq(request.s3Url, "");
        assertEq(request.errorMessage, errorMessage);
        assertEq(request.completedAt, block.timestamp);
    }

    /**
     * @dev Test S3 result reporting by unauthorized user
     */
    function testFuzzReportS3ResultUnauthorized(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        // Create a request first
        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.expectRevert("Only oracle operator can call this");
        vm.prank(unauthorized);
        fileManager.reportS3Result(
            requestId,
            true,
            "https://s3.example.com/file.jpg",
            ""
        );
    }

    /**
     * @dev Test S3 result reporting for invalid request ID
     */
    function testFuzzReportS3ResultInvalidRequestId() public {
        vm.expectRevert("Invalid request ID");
        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            999, // Non-existent request ID
            true,
            "https://s3.example.com/file.jpg",
            ""
        );
    }

    /**
     * @dev Test S3 result reporting for non-pending request
     */
    function testFuzzReportS3ResultNonPending(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        // Create and complete a request first
        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId,
            true,
            "https://s3.example.com/file.jpg",
            ""
        );

        // Try to report again
        vm.expectRevert("Request not pending");
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId, false, "", "Already completed");
    }

    // ===== FILE RETRIEVAL TESTS =====

    /**
     * @dev Test getting file request details
     */
    function testFuzzGetFileRequest(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.VIDEO),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(request.requestId, requestId);
        assertEq(request.productId, productId);
        assertEq(request.fileName, fileName);
        assertEq(request.fileHash, fileHash);
        assertEq(
            uint8(request.fileType),
            uint8(FileStorageManager.FileType.VIDEO)
        );
        assertEq(
            uint8(request.stage),
            uint8(FileStorageManager.ProductStage.FARM)
        );
        assertEq(request.requester, farmer);
    }

    /**
     * @dev Test getting file request with invalid ID
     */
    function testFuzzGetFileRequestInvalidId() public {
        vm.expectRevert("Invalid request ID");
        fileManager.getFileRequest(999);
    }

    /**
     * @dev Test getting transaction logs
     */
    function testFuzzGetTransactionLogs(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        FileStorageManager.TransactionLog[] memory logs = fileManager
            .getTransactionLogs(requestId);
        assertEq(logs.length, 1);
        assertEq(logs[0].requestId, requestId);
        assertEq(logs[0].action, "UPLOAD_REQUESTED");
        assertTrue(logs[0].success);
        assertEq(logs[0].actor, farmer);
    }

    /**
     * @dev Test getting product files
     */
    function testFuzzGetProductFiles(
        uint256 productId,
        string memory fileName1,
        string memory fileName2,
        bytes32 fileHash1,
        bytes32 fileHash2
    ) public {
        vm.assume(productId > 0);
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(fileHash1 != bytes32(0) && fileHash2 != bytes32(0));
        vm.assume(fileHash1 != fileHash2);
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName2)));

        // Create two requests for the same product
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        uint256[] memory productFiles = fileManager.getProductFiles(productId);
        assertEq(productFiles.length, 2);
        assertEq(productFiles[0], requestId1);
        assertEq(productFiles[1], requestId2);
    }

    /**
     * @dev Test getting product file URLs
     */
    function testFuzzGetProductFileUrls(
        uint256 productId,
        string memory fileName1,
        string memory fileName2,
        bytes32 fileHash1,
        bytes32 fileHash2
    ) public {
        vm.assume(productId > 0);
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(fileHash1 != bytes32(0) && fileHash2 != bytes32(0));
        vm.assume(fileHash1 != fileHash2);
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName2)));

        // Create requests
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        // Complete first request
        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId1,
            true,
            "https://s3.example.com/file1.jpg",
            ""
        );

        // Leave second request pending

        string[] memory urls = fileManager.getProductFileUrls(productId);
        assertEq(urls.length, 1);
        assertEq(urls[0], "https://s3.example.com/file1.jpg");
    }

    /**
     * @dev Test getting product files by stage
     */
    function testFuzzGetProductFilesByStage(
        uint256 productId,
        string memory fileName1,
        string memory fileName2,
        bytes32 fileHash1,
        bytes32 fileHash2
    ) public {
        vm.assume(productId > 0);
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(fileHash1 != bytes32(0) && fileHash2 != bytes32(0));
        vm.assume(fileHash1 != fileHash2);
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName2)));

        // Create requests for different stages
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        // Complete both requests
        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId1,
            true,
            "https://s3.example.com/farm.jpg",
            ""
        );

        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId2,
            true,
            "https://s3.example.com/processing.pdf",
            ""
        );

        // Get files by FARM stage
        uint256[] memory farmFiles = fileManager.getProductFilesByStage(
            productId,
            FileStorageManager.ProductStage.FARM
        );
        assertEq(farmFiles.length, 1);
        assertEq(farmFiles[0], requestId1);

        // Get files by PROCESSING stage
        uint256[] memory processingFiles = fileManager.getProductFilesByStage(
            productId,
            FileStorageManager.ProductStage.PROCESSING
        );
        assertEq(processingFiles.length, 1);
        assertEq(processingFiles[0], requestId2);

        // Get files by DISTRIBUTION stage (should be empty)
        uint256[] memory distributionFiles = fileManager.getProductFilesByStage(
            productId,
            FileStorageManager.ProductStage.DISTRIBUTION
        );
        assertEq(distributionFiles.length, 0);
    }

    // ===== FILE INTEGRITY TESTS =====

    /**
     * @dev Test file integrity verification - correct hash
     */
    function testFuzzVerifyFileIntegrityCorrect(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        assertTrue(fileManager.verifyFileIntegrity(requestId, fileHash));
    }

    /**
     * @dev Test file integrity verification - incorrect hash
     */
    function testFuzzVerifyFileIntegrityIncorrect(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        bytes32 wrongHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(wrongHash != bytes32(0));
        vm.assume(fileHash != wrongHash);

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        assertFalse(fileManager.verifyFileIntegrity(requestId, wrongHash));
    }

    /**
     * @dev Test file integrity verification with invalid request ID
     */
    function testFuzzVerifyFileIntegrityInvalidId(bytes32 fileHash) public {
        vm.assume(fileHash != bytes32(0));

        vm.expectRevert("Invalid request ID");
        fileManager.verifyFileIntegrity(999, fileHash);
    }

    // ===== STATISTICS TESTS =====

    /**
     * @dev Test contract statistics
     */
    function testFuzzGetStats(
        uint256 productId1,
        uint256 productId2,
        uint256 productId3,
        string memory fileName1,
        string memory fileName2,
        string memory fileName3,
        bytes32 fileHash1,
        bytes32 fileHash2,
        bytes32 fileHash3
    ) public {
        vm.assume(productId1 > 0 && productId2 > 0 && productId3 > 0);
        vm.assume(
            productId1 != productId2 &&
                productId2 != productId3 &&
                productId1 != productId3
        );
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(
            bytes(fileName3).length > 0 && bytes(fileName3).length <= 100
        );
        vm.assume(
            fileHash1 != bytes32(0) &&
                fileHash2 != bytes32(0) &&
                fileHash3 != bytes32(0)
        );
        vm.assume(
            fileHash1 != fileHash2 &&
                fileHash2 != fileHash3 &&
                fileHash1 != fileHash3
        );
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName2)));
        vm.assume(keccak256(bytes(fileName2)) != keccak256(bytes(fileName3)));
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName3)));

        // Create three requests
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId1,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId2,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        vm.prank(distributor);
        uint256 requestId3 = fileManager.requestFileStorage(
            productId3,
            fileName3,
            fileHash3,
            uint8(FileStorageManager.FileType.DOCUMENT),
            uint8(FileStorageManager.ProductStage.DISTRIBUTION)
        );

        // Complete first request successfully
        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId1,
            true,
            "https://s3.example.com/file1.jpg",
            ""
        );

        // Fail second request
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId2, false, "", "Upload failed");

        // Leave third request pending

        (
            uint256 totalRequests,
            uint256 completedRequests,
            uint256 failedRequests,
            uint256 pendingRequests
        ) = fileManager.getStats();

        assertEq(totalRequests, 3);
        assertEq(completedRequests, 1);
        assertEq(failedRequests, 1);
        assertEq(pendingRequests, 1);
    }

    // ===== ORACLE OPERATOR MANAGEMENT TESTS =====

    /**
     * @dev Test updating oracle operator
     */
    function testFuzzUpdateOracleOperator(address newOperator) public {
        vm.assume(newOperator != address(0));
        vm.assume(newOperator != oracleOperator);

        vm.prank(oracleOperator);
        fileManager.updateOracleOperator(newOperator);

        assertEq(fileManager.oracleOperator(), newOperator);
    }

    /**
     * @dev Test updating oracle operator by unauthorized user
     */
    function testFuzzUpdateOracleOperatorUnauthorized(
        address newOperator
    ) public {
        vm.assume(newOperator != address(0));
        vm.assume(newOperator != oracleOperator);

        vm.expectRevert("Only current operator can update");
        vm.prank(unauthorized);
        fileManager.updateOracleOperator(newOperator);
    }

    // ===== EDGE CASES AND BOUNDARY TESTS =====

    /**
     * @dev Test maximum length file names
     */
    function testFuzzMaxLengthFileName(
        uint256 productId,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(fileHash != bytes32(0));

        // Create a very long file name (near boundary)
        string
            memory longFileName = "verylongfilenametotestboundaryconditionsabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123";

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            longFileName,
            fileHash,
            uint8(FileStorageManager.FileType.DOCUMENT),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(request.fileName, longFileName);
    }

    /**
     * @dev Test all file types
     */
    function testFuzzAllFileTypes(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(productId < type(uint256).max / 10); // Prevent overflow when adding to productId
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        // Test each file type
        uint8[6] memory fileTypes = [
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.FileType.DOCUMENT),
            uint8(FileStorageManager.FileType.TEST_RESULT),
            uint8(FileStorageManager.FileType.VIDEO),
            uint8(FileStorageManager.FileType.OTHER)
        ];

        for (uint256 i = 0; i < fileTypes.length; i++) {
            vm.prank(farmer);
            uint256 requestId = fileManager.requestFileStorage(
                productId + i, // Different product ID for each
                fileName,
                keccak256(abi.encodePacked(fileHash, i)), // Different hash for each
                fileTypes[i],
                uint8(FileStorageManager.ProductStage.FARM)
            );

            FileStorageManager.FileStorageRequest memory request = fileManager
                .getFileRequest(requestId);
            assertEq(uint8(request.fileType), fileTypes[i]);
        }
    }

    /**
     * @dev Test all product stages
     */
    function testFuzzAllProductStages(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(productId < type(uint256).max / 10); // Prevent overflow when adding to productId
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        // Test each stage with appropriate stakeholders
        uint8[5] memory stages = [
            uint8(FileStorageManager.ProductStage.FARM),
            uint8(FileStorageManager.ProductStage.PROCESSING),
            uint8(FileStorageManager.ProductStage.DISTRIBUTION),
            uint8(FileStorageManager.ProductStage.RETAIL),
            uint8(FileStorageManager.ProductStage.CONSUMED)
        ];

        // Use only registered stakeholders (no consumer role in StakeholderRegistry)
        address[5] memory stakeholders = [
            farmer,
            processor,
            distributor,
            retailer,
            farmer
        ]; // Use farmer for CONSUMED stage

        for (uint256 i = 0; i < stages.length; i++) {
            vm.prank(stakeholders[i]);
            uint256 requestId = fileManager.requestFileStorage(
                productId + i, // Different product ID for each
                fileName,
                keccak256(abi.encodePacked(fileHash, i)), // Different hash for each
                uint8(FileStorageManager.FileType.IMAGE),
                stages[i]
            );

            FileStorageManager.FileStorageRequest memory request = fileManager
                .getFileRequest(requestId);
            assertEq(uint8(request.stage), stages[i]);
        }
    }

    /**
     * @dev Test large number of requests for same product
     */
    function testFuzzManyRequestsSameProduct(
        uint256 productId,
        string memory baseFileName,
        bytes32 baseHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(
            bytes(baseFileName).length > 0 && bytes(baseFileName).length <= 90
        );
        vm.assume(baseHash != bytes32(0));

        uint256 numRequests = 5;
        uint256[] memory requestIds = new uint256[](numRequests);

        for (uint256 i = 0; i < numRequests; i++) {
            vm.prank(farmer);
            requestIds[i] = fileManager.requestFileStorage(
                productId,
                string(abi.encodePacked(baseFileName, "_", vm.toString(i))),
                keccak256(abi.encodePacked(baseHash, i)),
                uint8(FileStorageManager.FileType.IMAGE),
                uint8(FileStorageManager.ProductStage.FARM)
            );
        }

        uint256[] memory productFiles = fileManager.getProductFiles(productId);
        assertEq(productFiles.length, numRequests);

        for (uint256 i = 0; i < numRequests; i++) {
            assertEq(productFiles[i], requestIds[i]);
        }
    }

    // ===== EVENT TESTING =====

    event FileUploadRequested(
        uint256 indexed requestId,
        uint256 indexed productId,
        address indexed requester,
        string fileName,
        bytes32 fileHash,
        FileStorageManager.FileType fileType,
        FileStorageManager.ProductStage stage,
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

    /**
     * @dev Test transaction logging events
     */
    function testFuzzTransactionLogEvents(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));

        vm.expectEmit(true, false, false, true);
        emit TransactionLogged(
            1,
            "UPLOAD_REQUESTED",
            true,
            block.timestamp,
            "File upload requested through Web API",
            farmer
        );

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        // Check success event
        vm.expectEmit(true, false, false, true);
        emit TransactionLogged(
            requestId,
            "S3_UPLOAD_SUCCESS",
            true,
            block.timestamp,
            string(
                abi.encodePacked(
                    "File successfully uploaded to S3: ",
                    "https://s3.example.com/file.jpg"
                )
            ),
            oracleOperator
        );

        vm.prank(oracleOperator);
        fileManager.reportS3Result(
            requestId,
            true,
            "https://s3.example.com/file.jpg",
            ""
        );
    }

    /**
     * @dev Test transaction logging with failure
     */
    function testFuzzTransactionLogFailureEvents(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        string memory errorMsg
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(bytes(errorMsg).length > 0 && bytes(errorMsg).length <= 100);

        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.DOCUMENT),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        // Check failure event
        vm.expectEmit(true, false, false, true);
        emit TransactionLogged(
            requestId,
            "S3_UPLOAD_FAILED",
            false,
            block.timestamp,
            string(abi.encodePacked("S3 upload failed: ", errorMsg)),
            oracleOperator
        );

        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId, false, "", errorMsg);
    }

    // ===== INTEGRATION AND COMPLEX SCENARIOS =====

    /**
     * @dev Test complete file lifecycle
     */
    function testFuzzCompleteFileLifecycle(
        uint256 productId,
        string memory fileName,
        bytes32 fileHash,
        string memory s3Url
    ) public {
        vm.assume(productId > 0);
        vm.assume(bytes(fileName).length > 0 && bytes(fileName).length <= 100);
        vm.assume(fileHash != bytes32(0));
        vm.assume(bytes(s3Url).length > 0 && bytes(s3Url).length <= 200);

        // 1. Request file storage
        vm.prank(farmer);
        uint256 requestId = fileManager.requestFileStorage(
            productId,
            fileName,
            fileHash,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        // Verify initial state
        FileStorageManager.FileStorageRequest memory request = fileManager
            .getFileRequest(requestId);
        assertEq(
            uint8(request.status),
            uint8(FileStorageManager.RequestStatus.PENDING)
        );

        // 2. Oracle reports success
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId, true, s3Url, "");

        // Verify completed state
        request = fileManager.getFileRequest(requestId);
        assertEq(
            uint8(request.status),
            uint8(FileStorageManager.RequestStatus.COMPLETED)
        );
        assertEq(request.s3Url, s3Url);

        // 3. Verify file integrity
        assertTrue(fileManager.verifyFileIntegrity(requestId, fileHash));

        // 4. Check transaction logs
        FileStorageManager.TransactionLog[] memory logs = fileManager
            .getTransactionLogs(requestId);
        assertEq(logs.length, 2);
        assertEq(logs[0].action, "UPLOAD_REQUESTED");
        assertEq(logs[1].action, "S3_UPLOAD_SUCCESS");

        // 5. Check stats
        (
            uint256 total,
            uint256 completed,
            uint256 failed,
            uint256 pending
        ) = fileManager.getStats();
        assertEq(total, 1);
        assertEq(completed, 1);
        assertEq(failed, 0);
        assertEq(pending, 0);

        // 6. Check product files
        uint256[] memory productFiles = fileManager.getProductFiles(productId);
        assertEq(productFiles.length, 1);
        assertEq(productFiles[0], requestId);

        string[] memory urls = fileManager.getProductFileUrls(productId);
        assertEq(urls.length, 1);
        assertEq(urls[0], s3Url);
    }

    /**
     * @dev Test mixed success/failure scenarios
     */
    function testFuzzMixedSuccessFailure(
        uint256 productId,
        string memory fileName1,
        string memory fileName2,
        bytes32 fileHash1,
        bytes32 fileHash2,
        string memory successUrl,
        string memory errorMsg
    ) public {
        vm.assume(productId > 0);
        vm.assume(
            bytes(fileName1).length > 0 && bytes(fileName1).length <= 100
        );
        vm.assume(
            bytes(fileName2).length > 0 && bytes(fileName2).length <= 100
        );
        vm.assume(fileHash1 != bytes32(0) && fileHash2 != bytes32(0));
        vm.assume(fileHash1 != fileHash2);
        vm.assume(keccak256(bytes(fileName1)) != keccak256(bytes(fileName2)));
        vm.assume(
            bytes(successUrl).length > 0 && bytes(successUrl).length <= 200
        );
        vm.assume(bytes(errorMsg).length > 0 && bytes(errorMsg).length <= 100);

        // Create two requests
        vm.prank(farmer);
        uint256 requestId1 = fileManager.requestFileStorage(
            productId,
            fileName1,
            fileHash1,
            uint8(FileStorageManager.FileType.IMAGE),
            uint8(FileStorageManager.ProductStage.FARM)
        );

        vm.prank(processor);
        uint256 requestId2 = fileManager.requestFileStorage(
            productId,
            fileName2,
            fileHash2,
            uint8(FileStorageManager.FileType.CERTIFICATE),
            uint8(FileStorageManager.ProductStage.PROCESSING)
        );

        // First succeeds
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId1, true, successUrl, "");

        // Second fails
        vm.prank(oracleOperator);
        fileManager.reportS3Result(requestId2, false, "", errorMsg);

        // Check final state
        FileStorageManager.FileStorageRequest memory req1 = fileManager
            .getFileRequest(requestId1);
        FileStorageManager.FileStorageRequest memory req2 = fileManager
            .getFileRequest(requestId2);

        assertEq(
            uint8(req1.status),
            uint8(FileStorageManager.RequestStatus.COMPLETED)
        );
        assertEq(
            uint8(req2.status),
            uint8(FileStorageManager.RequestStatus.FAILED)
        );

        // Only successful URL should be returned
        string[] memory urls = fileManager.getProductFileUrls(productId);
        assertEq(urls.length, 1);
        assertEq(urls[0], successUrl);

        // Stats should reflect both outcomes
        (
            uint256 total,
            uint256 completed,
            uint256 failed,
            uint256 pending
        ) = fileManager.getStats();
        assertEq(total, 2);
        assertEq(completed, 1);
        assertEq(failed, 1);
        assertEq(pending, 0);
    }
}
