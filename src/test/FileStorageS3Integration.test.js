const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock AWS S3 for testing
const mockS3Upload = {
    promise: async () => ({
        Location: 'https://test-bucket.s3.amazonaws.com/test-file.txt',
        ETag: '"mock-etag"',
        Bucket: 'test-bucket',
        Key: 'test-file.txt'
    })
};

const mockS3 = {
    upload: () => mockS3Upload,
    headBucket: () => ({
        promise: async () => ({ BucketName: 'test-bucket' })
    })
};

describe("FileStorage S3 Integration Tests", function () {
    let fileStorageManager;
    let stakeholderRegistry;
    let owner, oracle, farmer, processor, unauthorized;
    let mockOracle;

    // Test data
    const testProductId = 123;
    const testFileName = "organic-certificate.pdf";
    const testFileContent = "Test certificate content for supply chain verification";
    const testFileHash = crypto.createHash('sha256').update(testFileContent).digest('hex');
    const testFileHashBytes32 = ethers.keccak256('0x' + testFileHash);

    beforeEach(async function () {
        // Get signers
        [owner, oracle, farmer, processor, unauthorized] = await ethers.getSigners();

        // Deploy StakeholderRegistry
        const StakeholderRegistry = await ethers.getContractFactory("StakeholderRegistry");
        stakeholderRegistry = await StakeholderRegistry.deploy();
        await stakeholderRegistry.waitForDeployment();

        // Deploy FileStorageManager
        const FileStorageManager = await ethers.getContractFactory("FileStorageManager");
        fileStorageManager = await FileStorageManager.deploy(
            await stakeholderRegistry.getAddress(),
            oracle.address
        );
        await fileStorageManager.waitForDeployment();

        // Register test stakeholders
        await stakeholderRegistry.registerStakeholder(
            farmer.address,
            0, // FARMER
            "Green Valley Farm",
            "FARM001",
            "California, USA",
            "Organic, Non-GMO"
        );

        await stakeholderRegistry.registerStakeholder(
            processor.address,
            1, // PROCESSOR
            "Fresh Foods Processing",
            "PROC001",
            "Texas, USA",
            "FDA Approved, HACCP"
        );

        // Create mock oracle
        mockOracle = {
            s3: mockS3,
            bucketName: 'test-bucket',
            isRunning: false,
            pendingFiles: new Map(),

            async uploadToS3(key, content, fileName) {
                const result = await mockS3.upload({
                    Bucket: this.bucketName,
                    Key: key,
                    Body: content,
                    ContentType: 'text/plain'
                }).promise();
                return result.Location;
            },

            generateS3Key(productId, stage, fileName, requestId) {
                const stageNames = ['farm', 'processing', 'distribution', 'retail', 'consumed'];
                const stageName = stageNames[stage] || 'misc';
                const timestamp = Date.now();
                const fileExtension = path.extname(fileName) || '.txt';
                return `products/${productId}/${stageName}/${timestamp}-${requestId}${fileExtension}`;
            },

            async handleFileUploadRequest(requestData) {
                const s3Key = this.generateS3Key(
                    requestData.productId,
                    requestData.stage,
                    requestData.fileName,
                    requestData.requestId
                );

                const s3Url = await this.uploadToS3(s3Key, testFileContent, requestData.fileName);

                // Report success back to contract
                const contract = fileStorageManager.connect(oracle);
                await contract.reportS3Result(
                    requestData.requestId,
                    true,
                    s3Url,
                    ""
                );

                return { success: true, s3Url, s3Key };
            }
        };
    });

    describe("File Storage Request Flow", function () {
        it("Should allow registered stakeholder to request file storage", async function () {
            // Farmer requests file storage
            const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                testProductId,
                testFileName,
                testFileHashBytes32,
                1, // CERTIFICATE
                0  // FARM stage
            );

            const receipt = await tx.wait();

            // Check event emission
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "FileUploadRequested"
            );

            expect(event).to.not.be.undefined;
            expect(event.args[1]).to.equal(testProductId); // productId
            expect(event.args[2]).to.equal(farmer.address); // requester
            expect(event.args[3]).to.equal(testFileName); // fileName
        });

        it("Should reject file storage request from unregistered user", async function () {
            await expect(
                fileStorageManager.connect(unauthorized).requestFileStorage(
                    testProductId,
                    testFileName,
                    testFileHashBytes32,
                    1, // CERTIFICATE
                    0  // FARM stage
                )
            ).to.be.revertedWith("Not an active stakeholder");
        });

        it("Should validate file storage request parameters", async function () {
            // Invalid product ID
            await expect(
                fileStorageManager.connect(farmer).requestFileStorage(
                    0, // Invalid product ID
                    testFileName,
                    testFileHashBytes32,
                    1,
                    0
                )
            ).to.be.revertedWith("Invalid product ID");

            // Empty file name
            await expect(
                fileStorageManager.connect(farmer).requestFileStorage(
                    testProductId,
                    "", // Empty file name
                    testFileHashBytes32,
                    1,
                    0
                )
            ).to.be.revertedWith("File name cannot be empty");

            // Invalid file hash
            await expect(
                fileStorageManager.connect(farmer).requestFileStorage(
                    testProductId,
                    testFileName,
                    ethers.ZeroHash, // Invalid hash
                    1,
                    0
                )
            ).to.be.revertedWith("File hash required");
        });
    });

    describe("Oracle S3 Integration", function () {
        let requestId;

        beforeEach(async function () {
            // Create file storage request
            const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                testProductId,
                testFileName,
                testFileHashBytes32,
                1, // CERTIFICATE
                0  // FARM stage
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "FileUploadRequested"
            );
            requestId = event.args[0].toString();
        });

        it("Should process file upload request and upload to S3", async function () {
            // Simulate oracle processing the request
            const requestData = {
                requestId,
                productId: testProductId,
                fileName: testFileName,
                stage: 0,
                fileType: 1
            };

            const result = await mockOracle.handleFileUploadRequest(requestData);

            expect(result.success).to.be.true;
            expect(result.s3Url).to.include('test-bucket.s3.amazonaws.com');
            expect(result.s3Key).to.include(`products/${testProductId}/farm/`);
        });

        it("Should report S3 upload success back to contract", async function () {
            const s3Url = "https://test-bucket.s3.amazonaws.com/products/123/farm/test-file.pdf";

            // Oracle reports success
            await fileStorageManager.connect(oracle).reportS3Result(
                requestId,
                true,
                s3Url,
                ""
            );

            // Verify request status updated
            const request = await fileStorageManager.getFileRequest(requestId);
            expect(request.status).to.equal(2); // COMPLETED
            expect(request.s3Url).to.equal(s3Url);
        });

        it("Should report S3 upload failure back to contract", async function () {
            const errorMessage = "S3 upload failed: Access denied";

            // Oracle reports failure
            await fileStorageManager.connect(oracle).reportS3Result(
                requestId,
                false,
                "",
                errorMessage
            );

            // Verify request status updated
            const request = await fileStorageManager.getFileRequest(requestId);
            expect(request.status).to.equal(3); // FAILED
            expect(request.errorMessage).to.equal(errorMessage);
        });

        it("Should only allow oracle to report S3 results", async function () {
            await expect(
                fileStorageManager.connect(farmer).reportS3Result(
                    requestId,
                    true,
                    "https://test.com/file.pdf",
                    ""
                )
            ).to.be.revertedWith("Only oracle operator can call this");
        });

        it("Should log transaction history", async function () {
            const s3Url = "https://test-bucket.s3.amazonaws.com/products/123/farm/test-file.pdf";

            // Oracle reports success
            await fileStorageManager.connect(oracle).reportS3Result(
                requestId,
                true,
                s3Url,
                ""
            );

            // Check transaction logs
            const logs = await fileStorageManager.getTransactionLogs(requestId);
            expect(logs.length).to.be.at.least(2);

            // First log should be upload request
            expect(logs[0].action).to.equal("UPLOAD_REQUESTED");
            expect(logs[0].success).to.be.true;

            // Second log should be S3 success
            expect(logs[1].action).to.equal("S3_UPLOAD_SUCCESS");
            expect(logs[1].success).to.be.true;
        });
    });

    describe("File Verification and Retrieval", function () {
        let requestId;
        const s3Url = "https://test-bucket.s3.amazonaws.com/products/123/farm/organic-cert.pdf";

        beforeEach(async function () {
            // Create and complete file storage request
            const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                testProductId,
                testFileName,
                testFileHashBytes32,
                1, // CERTIFICATE
                0  // FARM stage
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "FileUploadRequested"
            );
            requestId = event.args[0].toString();

            // Oracle completes upload
            await fileStorageManager.connect(oracle).reportS3Result(
                requestId,
                true,
                s3Url,
                ""
            );
        });

        it("Should retrieve product file URLs", async function () {
            const urls = await fileStorageManager.getProductFileUrls(testProductId);
            expect(urls.length).to.equal(1);
            expect(urls[0]).to.equal(s3Url);
        });

        it("Should retrieve files by stage", async function () {
            const farmFiles = await fileStorageManager.getProductFilesByStage(testProductId, 0);
            expect(farmFiles.length).to.equal(1);
            expect(farmFiles[0]).to.equal(requestId);

            // No processing files yet
            const processingFiles = await fileStorageManager.getProductFilesByStage(testProductId, 1);
            expect(processingFiles.length).to.equal(0);
        });

        it("Should verify file integrity", async function () {
            const isValid = await fileStorageManager.verifyFileIntegrity(requestId, testFileHashBytes32);
            expect(isValid).to.be.true;

            // Create a different valid hash for testing invalid case
            const invalidHash = ethers.keccak256('0x' + '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
            const isInvalid = await fileStorageManager.verifyFileIntegrity(requestId, invalidHash);
            expect(isInvalid).to.be.false;
        });

        it("Should get contract statistics", async function () {
            const stats = await fileStorageManager.getStats();
            expect(stats.totalRequests).to.equal(1);
            expect(stats.completedRequests).to.equal(1);
            expect(stats.failedRequests).to.equal(0);
            expect(stats.pendingRequests).to.equal(0);
        });
    });

    describe("Multi-Stage Supply Chain Flow", function () {
        it("Should handle complete supply chain file flow", async function () {
            const stages = [
                { stage: 0, stakeholder: farmer, fileName: "farm-certificate.pdf" },
                { stage: 1, stakeholder: processor, fileName: "processing-certificate.pdf" }
            ];

            const requestIds = [];

            // Upload files at different stages
            for (const stageData of stages) {
                const stageFileHash = crypto.createHash('sha256')
                    .update(`${stageData.fileName} content`)
                    .digest('hex');
                const stageFileHashBytes32 = ethers.keccak256('0x' + stageFileHash);

                const tx = await fileStorageManager.connect(stageData.stakeholder).requestFileStorage(
                    testProductId,
                    stageData.fileName,
                    stageFileHashBytes32,
                    1, // CERTIFICATE
                    stageData.stage
                );

                const receipt = await tx.wait();
                const event = receipt.logs.find(log =>
                    log.fragment && log.fragment.name === "FileUploadRequested"
                );
                const requestId = event.args[0].toString();
                requestIds.push(requestId);

                // Oracle completes upload
                const s3Url = `https://test-bucket.s3.amazonaws.com/products/${testProductId}/stage${stageData.stage}/${stageData.fileName}`;
                await fileStorageManager.connect(oracle).reportS3Result(
                    requestId,
                    true,
                    s3Url,
                    ""
                );
            }

            // Verify all files are accessible
            const allFiles = await fileStorageManager.getProductFiles(testProductId);
            expect(allFiles.length).to.equal(2);

            // Verify files by stage
            const farmFiles = await fileStorageManager.getProductFilesByStage(testProductId, 0);
            const processingFiles = await fileStorageManager.getProductFilesByStage(testProductId, 1);

            expect(farmFiles.length).to.equal(1);
            expect(processingFiles.length).to.equal(1);

            // Verify all S3 URLs
            const urls = await fileStorageManager.getProductFileUrls(testProductId);
            expect(urls.length).to.equal(2);
            expect(urls[0]).to.include('test-bucket.s3.amazonaws.com');
            expect(urls[1]).to.include('test-bucket.s3.amazonaws.com');
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should handle oracle reporting on non-existent request", async function () {
            await expect(
                fileStorageManager.connect(oracle).reportS3Result(
                    999, // Non-existent request ID
                    true,
                    "https://test.com/file.pdf",
                    ""
                )
            ).to.be.revertedWith("Invalid request ID");
        });

        it("Should prevent duplicate reporting on same request", async function () {
            // Create request
            const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                testProductId,
                testFileName,
                testFileHashBytes32,
                1,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "FileUploadRequested"
            );
            const requestId = event.args[0].toString();

            // First report succeeds
            await fileStorageManager.connect(oracle).reportS3Result(
                requestId,
                true,
                "https://test.com/file.pdf",
                ""
            );

            // Second report should fail
            await expect(
                fileStorageManager.connect(oracle).reportS3Result(
                    requestId,
                    true,
                    "https://test.com/file2.pdf",
                    ""
                )
            ).to.be.revertedWith("Request not pending");
        });

        it("Should handle large product with many files", async function () {
            const fileCount = 10;
            const requestIds = [];

            // Create multiple file requests
            for (let i = 0; i < fileCount; i++) {
                const fileName = `file-${i}.pdf`;
                const fileHash = crypto.createHash('sha256')
                    .update(`File content ${i}`)
                    .digest('hex');
                const fileHashBytes32 = ethers.keccak256('0x' + fileHash);

                const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                    testProductId,
                    fileName,
                    fileHashBytes32,
                    1,
                    0
                );

                const receipt = await tx.wait();
                const event = receipt.logs.find(log =>
                    log.fragment && log.fragment.name === "FileUploadRequested"
                );
                const requestId = event.args[0].toString();
                requestIds.push(requestId);

                // Oracle completes upload
                const s3Url = `https://test-bucket.s3.amazonaws.com/products/${testProductId}/farm/${fileName}`;
                await fileStorageManager.connect(oracle).reportS3Result(
                    requestId,
                    true,
                    s3Url,
                    ""
                );
            }

            // Verify all files are tracked
            const productFiles = await fileStorageManager.getProductFiles(testProductId);
            expect(productFiles.length).to.equal(fileCount);

            const urls = await fileStorageManager.getProductFileUrls(testProductId);
            expect(urls.length).to.equal(fileCount);
        });
    });

    describe("Oracle Management", function () {
        it("Should allow oracle operator update", async function () {
            const newOracle = processor.address;

            await fileStorageManager.connect(oracle).updateOracleOperator(newOracle);

            // Old oracle should not be able to report
            const tx = await fileStorageManager.connect(farmer).requestFileStorage(
                testProductId,
                testFileName,
                testFileHashBytes32,
                1,
                0
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log =>
                log.fragment && log.fragment.name === "FileUploadRequested"
            );
            const requestId = event.args[0].toString();

            await expect(
                fileStorageManager.connect(oracle).reportS3Result(
                    requestId,
                    true,
                    "https://test.com/file.pdf",
                    ""
                )
            ).to.be.revertedWith("Only oracle operator can call this");

            // New oracle should be able to report
            await fileStorageManager.connect(processor).reportS3Result(
                requestId,
                true,
                "https://test.com/file.pdf",
                ""
            );

            const request = await fileStorageManager.getFileRequest(requestId);
            expect(request.status).to.equal(2); // COMPLETED
        });
    });
});