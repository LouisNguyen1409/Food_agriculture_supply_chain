// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IProductBatch {
    enum BatchStatus {
        CREATED,
        OFFERED,
        ACCEPTED,
        RECEIVED,
        PROCESSED,
        FINALIZED
    }

    struct BatchInfo {
        address farmer;
        address currentOwner;
        string name;
        string description;
        uint256 quantity;
        uint256 pricePerUnit;
        string originLocation;
        BatchStatus status;
        uint256 createdAt;
        uint256 lastUpdated;
    }

    function createBatch(
        string calldata name,
        string calldata description,
        uint256 quantity,
        uint256 pricePerUnit,
        string calldata originLocation,
        string calldata metadataHash
    ) external returns (uint256);

    function getBatchInfo(uint256 batchId) external view returns (BatchInfo memory);
    function updateBatchStatus(uint256 batchId, BatchStatus newStatus) external;
    function transferOwnership(uint256 batchId, address newOwner) external;
    function processBatch(
        uint256 batchId,
        string calldata processingType,
        string calldata qualityMetrics,
        string calldata certificationHash,
        uint256 outputQuantity
    ) external;
}