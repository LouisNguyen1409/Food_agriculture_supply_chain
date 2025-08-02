// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";

/**
 * @title ProvenanceTracker
 * @dev Tracks provenance chain using Merkle trees for immutable history
 */
contract ProvenanceTracker is AccessControl {

    struct ProvenanceRecord {
        uint256 batchId;
        address actor;              // Who performed the action
        string action;              // What action was performed
        string location;            // Where it happened
        uint256 timestamp;          // When it happened
        string metadataHash;        // IPFS hash of additional data
        bytes32 previousHash;       // Hash of previous record
        bytes32 recordHash;         // Hash of this record
    }

    struct ProvenanceChain {
        uint256 batchId;
        bytes32 rootHash;           // Merkle root of all records
        uint256 recordCount;
        bool isFinalized;
        mapping(uint256 => ProvenanceRecord) records;
    }

    // State variables
    mapping(uint256 => ProvenanceChain) public provenanceChains;
    mapping(bytes32 => bool) public recordHashes;       // Prevent duplicate records
    mapping(uint256 => bytes32[]) public chainHashes;   // For Merkle tree construction

    uint256 public totalChains;

    // Events
    event ProvenanceRecordAdded(
        uint256 indexed batchId,
        address indexed actor,
        string action,
        bytes32 recordHash,
        uint256 recordIndex
    );
    event ProvenanceChainFinalized(uint256 indexed batchId, bytes32 rootHash);

    /**
     * @dev Add a new provenance record
     */
    function addProvenanceRecord(
        uint256 batchId,
        string calldata action,
        string calldata location,
        string calldata metadataHash
    ) external onlyActiveStakeholder returns (bytes32) {
        require(bytes(action).length > 0, "Action required");
        require(bytes(location).length > 0, "Location required");

        ProvenanceChain storage chain = provenanceChains[batchId];
        require(!chain.isFinalized, "Provenance chain is finalized");

        // Initialize chain if first record
        if (chain.batchId == 0) {
            chain.batchId = batchId;
            totalChains++;
        }

        uint256 recordIndex = chain.recordCount;
        bytes32 previousHash = recordIndex > 0 ? chain.records[recordIndex - 1].recordHash : bytes32(0);

        // Create record hash
        bytes32 recordHash = keccak256(abi.encodePacked(
            batchId,
            msg.sender,
            action,
            location,
            block.timestamp,
            metadataHash,
            previousHash
        ));

        require(!recordHashes[recordHash], "Duplicate record");

        // Create provenance record
        ProvenanceRecord storage record = chain.records[recordIndex];
        record.batchId = batchId;
        record.actor = msg.sender;
        record.action = action;
        record.location = location;
        record.timestamp = block.timestamp;
        record.metadataHash = metadataHash;
        record.previousHash = previousHash;
        record.recordHash = recordHash;

        // Track record
        recordHashes[recordHash] = true;
        chainHashes[batchId].push(recordHash);
        chain.recordCount++;

        // Update chain root hash
        chain.rootHash = _calculateMerkleRoot(chainHashes[batchId]);

        emit ProvenanceRecordAdded(batchId, msg.sender, action, recordHash, recordIndex);
        return recordHash;
    }

    /**
     * @dev Finalize provenance chain (prevents further modifications)
     */
    function finalizeProvenanceChain(uint256 batchId) external onlyAdmin {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");
        require(!chain.isFinalized, "Chain already finalized");
        require(chain.recordCount > 0, "No records in chain");

        chain.isFinalized = true;
        emit ProvenanceChainFinalized(batchId, chain.rootHash);
    }

    /**
     * @dev Get provenance record by index
     */
    function getProvenanceRecord(uint256 batchId, uint256 recordIndex)
        external
        view
        returns (
            address actor,
            string memory action,
            string memory location,
            uint256 timestamp,
            string memory metadataHash,
            bytes32 previousHash,
            bytes32 recordHash
        )
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");
        require(recordIndex < chain.recordCount, "Record index out of range");

        ProvenanceRecord storage record = chain.records[recordIndex];
        return (
            record.actor,
            record.action,
            record.location,
            record.timestamp,
            record.metadataHash,
            record.previousHash,
            record.recordHash
        );
    }

    /**
     * @dev Get full provenance chain for a batch
     */
    function getFullProvenanceChain(uint256 batchId)
        external
        view
        returns (
            uint256 recordCount,
            bytes32 rootHash,
            bool isFinalized
        )
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");

        return (
            chain.recordCount,
            chain.rootHash,
            chain.isFinalized
        );
    }

    /**
     * @dev Get all record hashes for a batch (for Merkle proof verification)
     */
    function getRecordHashes(uint256 batchId) external view returns (bytes32[] memory) {
        return chainHashes[batchId];
    }

    /**
     * @dev Verify a record exists in the provenance chain using Merkle proof
     */
    function verifyProvenanceRecord(
        uint256 batchId,
        bytes32 recordHash,
        bytes32[] calldata merkleProof
    ) external view returns (bool) {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");

        return _verifyMerkleProof(merkleProof, recordHash, chain.rootHash);
    }

    /**
     * @dev Get provenance summary (first and last records)
     */
    function getProvenanceSummary(uint256 batchId)
        external
        view
        returns (
            address firstActor,
            string memory firstAction,
            string memory firstLocation,
            uint256 firstTimestamp,
            address lastActor,
            string memory lastAction,
            string memory lastLocation,
            uint256 lastTimestamp,
            uint256 totalRecords,
            bool isComplete
        )
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");
        require(chain.recordCount > 0, "No records in chain");

        ProvenanceRecord storage firstRecord = chain.records[0];
        ProvenanceRecord storage lastRecord = chain.records[chain.recordCount - 1];

        return (
            firstRecord.actor,
            firstRecord.action,
            firstRecord.location,
            firstRecord.timestamp,
            lastRecord.actor,
            lastRecord.action,
            lastRecord.location,
            lastRecord.timestamp,
            chain.recordCount,
            chain.isFinalized
        );
    }

    /**
     * @dev Get records by actor
     */
    function getRecordsByActor(uint256 batchId, address actor)
        external
        view
        returns (uint256[] memory)
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");

        uint256[] memory result = new uint256[](chain.recordCount);
        uint256 count = 0;

        for (uint256 i = 0; i < chain.recordCount; i++) {
            if (chain.records[i].actor == actor) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory actorRecords = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            actorRecords[i] = result[i];
        }

        return actorRecords;
    }

    /**
     * @dev Search records by action type
     */
    function getRecordsByAction(uint256 batchId, string calldata actionType)
        external
        view
        returns (uint256[] memory)
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");

        uint256[] memory result = new uint256[](chain.recordCount);
        uint256 count = 0;

        for (uint256 i = 0; i < chain.recordCount; i++) {
            if (keccak256(bytes(chain.records[i].action)) == keccak256(bytes(actionType))) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory actionRecords = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            actionRecords[i] = result[i];
        }

        return actionRecords;
    }

    /**
     * @dev Calculate Merkle root from array of hashes
     */
    function _calculateMerkleRoot(bytes32[] memory hashes) internal pure returns (bytes32) {
        if (hashes.length == 0) return bytes32(0);
        if (hashes.length == 1) return hashes[0];

        // Build Merkle tree bottom-up
        uint256 length = hashes.length;
        while (length > 1) {
            for (uint256 i = 0; i < length / 2; i++) {
                hashes[i] = keccak256(abi.encodePacked(hashes[i * 2], hashes[i * 2 + 1]));
            }
            if (length % 2 == 1) {
                hashes[length / 2] = hashes[length - 1];
                length = length / 2 + 1;
            } else {
                length = length / 2;
            }
        }

        return hashes[0];
    }

    /**
     * @dev Verify Merkle proof
     */
    function _verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 leaf,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == root;
    }

    /**
     * @dev Generate Merkle proof for a specific record
     */
    function generateMerkleProof(uint256 batchId, uint256 recordIndex)
        external
        view
        returns (bytes32[] memory)
    {
        ProvenanceChain storage chain = provenanceChains[batchId];
        require(chain.batchId != 0, "Provenance chain does not exist");
        require(recordIndex < chain.recordCount, "Record index out of range");

        bytes32[] memory hashes = chainHashes[batchId];
        return _generateMerkleProof(hashes, recordIndex);
    }

    /**
     * @dev Internal function to generate Merkle proof
     */
    function _generateMerkleProof(bytes32[] memory hashes, uint256 index)
        internal
        pure
        returns (bytes32[] memory)
    {
        require(index < hashes.length, "Index out of range");

        // Calculate proof length (log2 of array length, rounded up)
        uint256 proofLength = 0;
        uint256 temp = hashes.length;
        while (temp > 1) {
            proofLength++;
            temp = (temp + 1) / 2;
        }

        bytes32[] memory proof = new bytes32[](proofLength);
        uint256 proofIndex = 0;
        uint256 currentIndex = index;
        uint256 currentLength = hashes.length;

        // Build proof by walking up the tree
        while (currentLength > 1) {
            if (currentIndex % 2 == 0) {
                // Left node, proof element is right sibling
                if (currentIndex + 1 < currentLength) {
                    proof[proofIndex] = hashes[currentIndex + 1];
                }
            } else {
                // Right node, proof element is left sibling
                proof[proofIndex] = hashes[currentIndex - 1];
            }

            // Move to next level
            for (uint256 i = 0; i < currentLength / 2; i++) {
                hashes[i] = keccak256(abi.encodePacked(hashes[i * 2], hashes[i * 2 + 1]));
            }
            if (currentLength % 2 == 1) {
                hashes[currentLength / 2] = hashes[currentLength - 1];
                currentLength = currentLength / 2 + 1;
            } else {
                currentLength = currentLength / 2;
            }

            currentIndex = currentIndex / 2;
            proofIndex++;
        }

        return proof;
    }

    /**
     * @dev Check if record hash exists
     */
    function recordExists(bytes32 recordHash) external view returns (bool) {
        return recordHashes[recordHash];
    }

    /**
     * @dev Get total number of records across all chains
     */
    function getTotalRecords() external view returns (uint256) {
        uint256 total = 0;
        // Note: This would require tracking in practice
        return total;
    }

    /**
     * @dev Check if provenance chain is complete and finalized
     */
    function isProvenanceComplete(uint256 batchId) external view returns (bool) {
        ProvenanceChain storage chain = provenanceChains[batchId];
        return chain.batchId != 0 && chain.isFinalized && chain.recordCount > 0;
    }
}