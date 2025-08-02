// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";

/**
 * @title MetadataManager
 * @dev Manages structured metadata for products, shipments, and other supply chain entities
 */
contract MetadataManager is AccessControl {

    enum MetadataType {
        PRODUCT,        // 0 - Product-related metadata
        SHIPMENT,       // 1 - Shipment-related metadata
        STAKEHOLDER,    // 2 - Stakeholder-related metadata
        CERTIFICATION,  // 3 - Certification metadata
        QUALITY,        // 4 - Quality assurance metadata
        CUSTOM          // 5 - Custom metadata type
    }

    struct MetadataRecord {
        uint256 metadataId;
        uint256 entityId;           // ID of associated entity (batch, shipment, etc.)
        MetadataType metadataType;
        string key;                 // Metadata key/name
        string value;               // Metadata value
        string dataType;            // Data type (string, number, boolean, json, etc.)
        address creator;            // Who created this metadata
        uint256 createdAt;
        uint256 updatedAt;
        bool isActive;
        string[] tags;              // Search tags
        mapping(string => string) attributes; // Additional key-value attributes
    }

    struct MetadataSchema {
        string schemaName;
        string description;
        string[] requiredFields;
        mapping(string => string) fieldTypes;    // field => type
        mapping(string => bool) fieldRequired;   // field => required
        bool isActive;
        uint256 createdAt;
    }

    // State variables
    mapping(uint256 => MetadataRecord) public metadata;
    mapping(string => MetadataSchema) public schemas;
    mapping(uint256 => mapping(MetadataType => uint256[])) public entityMetadata; // entityId => type => metadataIds[]
    mapping(address => uint256[]) public userMetadata;     // user => metadataIds[]
    mapping(string => uint256[]) public metadataByKey;     // key => metadataIds[]
    mapping(bytes32 => uint256) public metadataByHash;     // hash(entityId, type, key) => metadataId

    uint256 public nextMetadataId = 1;
    uint256 public totalMetadata;
    string[] public activeSchemas;

    // Events
    event MetadataCreated(
        uint256 indexed metadataId,
        uint256 indexed entityId,
        MetadataType metadataType,
        string key,
        address creator
    );
    event MetadataUpdated(
        uint256 indexed metadataId,
        string oldValue,
        string newValue,
        address updater
    );
    event MetadataDeactivated(uint256 indexed metadataId, address deactivator);
    event SchemaCreated(string indexed schemaName, address creator);
    event SchemaUpdated(string indexed schemaName, address updater);

    /**
     * @dev Create a new metadata record
     */
    function createMetadata(
        uint256 entityId,
        MetadataType metadataType,
        string calldata key,
        string calldata value,
        string calldata dataType,
        string[] calldata tags
    ) external onlyActiveStakeholder returns (uint256) {
        require(bytes(key).length > 0, "Key required");
        require(bytes(value).length > 0, "Value required");
        require(bytes(dataType).length > 0, "Data type required");

        // Check for duplicate metadata
        bytes32 metadataHash = keccak256(abi.encodePacked(entityId, metadataType, key));
        require(metadataByHash[metadataHash] == 0, "Metadata already exists for this entity/type/key");

        uint256 metadataId = nextMetadataId++;

        MetadataRecord storage record = metadata[metadataId];
        record.metadataId = metadataId;
        record.entityId = entityId;
        record.metadataType = metadataType;
        record.key = key;
        record.value = value;
        record.dataType = dataType;
        record.creator = msg.sender;
        record.createdAt = block.timestamp;
        record.updatedAt = block.timestamp;
        record.isActive = true;
        record.tags = tags;

        // Update mappings
        entityMetadata[entityId][metadataType].push(metadataId);
        userMetadata[msg.sender].push(metadataId);
        metadataByKey[key].push(metadataId);
        metadataByHash[metadataHash] = metadataId;
        totalMetadata++;

        emit MetadataCreated(metadataId, entityId, metadataType, key, msg.sender);
        return metadataId;
    }

    /**
     * @dev Update existing metadata value
     */
    function updateMetadata(
        uint256 metadataId,
        string calldata newValue
    ) external onlyActiveStakeholder {
        require(_metadataExists(metadataId), "Metadata does not exist");

        MetadataRecord storage record = metadata[metadataId];
        require(record.isActive, "Metadata is not active");
        require(
            msg.sender == record.creator || hasRole(msg.sender, Role.ADMIN),
            "Unauthorized to update metadata"
        );
        require(bytes(newValue).length > 0, "Value required");

        string memory oldValue = record.value;
        record.value = newValue;
        record.updatedAt = block.timestamp;

        emit MetadataUpdated(metadataId, oldValue, newValue, msg.sender);
    }

    /**
     * @dev Add attribute to metadata record
     */
    function addMetadataAttribute(
        uint256 metadataId,
        string calldata attributeKey,
        string calldata attributeValue
    ) external onlyActiveStakeholder {
        require(_metadataExists(metadataId), "Metadata does not exist");

        MetadataRecord storage record = metadata[metadataId];
        require(record.isActive, "Metadata is not active");
        require(
            msg.sender == record.creator || hasRole(msg.sender, Role.ADMIN),
            "Unauthorized to modify metadata"
        );
        require(bytes(attributeKey).length > 0, "Attribute key required");

        record.attributes[attributeKey] = attributeValue;
        record.updatedAt = block.timestamp;
    }

    /**
     * @dev Deactivate metadata record
     */
    function deactivateMetadata(uint256 metadataId) external {
        require(_metadataExists(metadataId), "Metadata does not exist");

        MetadataRecord storage record = metadata[metadataId];
        require(record.isActive, "Metadata already inactive");
        require(
            msg.sender == record.creator || hasRole(msg.sender, Role.ADMIN),
            "Unauthorized to deactivate metadata"
        );

        record.isActive = false;
        emit MetadataDeactivated(metadataId, msg.sender);
    }

    /**
     * @dev Create a metadata schema
     */
    function createSchema(
        string calldata schemaName,
        string calldata description,
        string[] calldata requiredFields,
        string[] calldata fieldTypes
    ) external onlyAdmin {
        require(bytes(schemaName).length > 0, "Schema name required");
        require(requiredFields.length == fieldTypes.length, "Fields and types length mismatch");
        require(!schemas[schemaName].isActive, "Schema already exists");

        MetadataSchema storage schema = schemas[schemaName];
        schema.schemaName = schemaName;
        schema.description = description;
        schema.requiredFields = requiredFields;
        schema.isActive = true;
        schema.createdAt = block.timestamp;

        // Set field types and requirements
        for (uint256 i = 0; i < requiredFields.length; i++) {
            schema.fieldTypes[requiredFields[i]] = fieldTypes[i];
            schema.fieldRequired[requiredFields[i]] = true;
        }

        activeSchemas.push(schemaName);

        emit SchemaCreated(schemaName, msg.sender);
    }

    /**
     * @dev Get metadata record information
     */
    function getMetadata(uint256 metadataId)
        external
        view
        returns (
            uint256 entityId,
            MetadataType metadataType,
            string memory key,
            string memory value,
            string memory dataType,
            address creator,
            uint256 createdAt,
            uint256 updatedAt,
            bool isActive
        )
    {
        require(_metadataExists(metadataId), "Metadata does not exist");

        MetadataRecord storage record = metadata[metadataId];
        return (
            record.entityId,
            record.metadataType,
            record.key,
            record.value,
            record.dataType,
            record.creator,
            record.createdAt,
            record.updatedAt,
            record.isActive
        );
    }

    /**
     * @dev Get metadata attribute value
     */
    function getMetadataAttribute(uint256 metadataId, string calldata attributeKey)
        external
        view
        returns (string memory)
    {
        require(_metadataExists(metadataId), "Metadata does not exist");
        return metadata[metadataId].attributes[attributeKey];
    }

    /**
     * @dev Get metadata tags
     */
    function getMetadataTags(uint256 metadataId)
        external
        view
        returns (string[] memory)
    {
        require(_metadataExists(metadataId), "Metadata does not exist");
        return metadata[metadataId].tags;
    }

    /**
     * @dev Get all metadata for an entity by type
     */
    function getEntityMetadata(uint256 entityId, MetadataType metadataType)
        external
        view
        returns (uint256[] memory)
    {
        return entityMetadata[entityId][metadataType];
    }

    /**
     * @dev Get metadata by key
     */
    function getMetadataByKey(string calldata key)
        external
        view
        returns (uint256[] memory)
    {
        return metadataByKey[key];
    }

    /**
     * @dev Search metadata by tag
     */
    function searchMetadataByTag(string calldata tag)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](totalMetadata);
        uint256 count = 0;

        for (uint256 i = 1; i < nextMetadataId; i++) {
            if (_metadataExists(i) && _hasTag(i, tag)) {
                result[count] = i;
                count++;
            }
        }

        // Resize array
        uint256[] memory taggedMetadata = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            taggedMetadata[i] = result[i];
        }

        return taggedMetadata;
    }

    /**
     * @dev Get metadata by value pattern (contains search)
     */
    function searchMetadataByValue(string calldata valuePattern)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](totalMetadata);
        uint256 count = 0;
        bytes32 patternHash = keccak256(bytes(valuePattern));

        for (uint256 i = 1; i < nextMetadataId; i++) {
            if (_metadataExists(i) && metadata[i].isActive) {
                // Simple contains check using hash comparison
                if (keccak256(bytes(metadata[i].value)) == patternHash) {
                    result[count] = i;
                    count++;
                }
            }
        }

        // Resize array
        uint256[] memory matchedMetadata = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            matchedMetadata[i] = result[i];
        }

        return matchedMetadata;
    }

    /**
     * @dev Get schema information
     */
    function getSchema(string calldata schemaName)
        external
        view
        returns (
            string memory description,
            string[] memory requiredFields,
            bool isActive,
            uint256 createdAt
        )
    {
        require(schemas[schemaName].isActive, "Schema does not exist");

        MetadataSchema storage schema = schemas[schemaName];
        return (
            schema.description,
            schema.requiredFields,
            schema.isActive,
            schema.createdAt
        );
    }

    /**
     * @dev Get field type from schema
     */
    function getSchemaFieldType(string calldata schemaName, string calldata fieldName)
        external
        view
        returns (string memory)
    {
        require(schemas[schemaName].isActive, "Schema does not exist");
        return schemas[schemaName].fieldTypes[fieldName];
    }

    /**
     * @dev Check if field is required in schema
     */
    function isSchemaFieldRequired(string calldata schemaName, string calldata fieldName)
        external
        view
        returns (bool)
    {
        require(schemas[schemaName].isActive, "Schema does not exist");
        return schemas[schemaName].fieldRequired[fieldName];
    }

    /**
     * @dev Get all active schemas
     */
    function getActiveSchemas() external view returns (string[] memory) {
        return activeSchemas;
    }

    /**
     * @dev Get metadata by user
     */
    function getUserMetadata(address user) external view returns (uint256[] memory) {
        return userMetadata[user];
    }

    /**
     * @dev Get metadata statistics
     */
    function getMetadataStats()
        external
        view
        returns (
            uint256 _totalMetadata,
            uint256 activeMetadata,
            uint256 totalSchemas
        )
    {
        _totalMetadata = totalMetadata;
        totalSchemas = activeSchemas.length;

        // Count active metadata
        for (uint256 i = 1; i < nextMetadataId; i++) {
            if (_metadataExists(i) && metadata[i].isActive) {
                activeMetadata++;
            }
        }
    }

    /**
     * @dev Batch create metadata records
     */
    function batchCreateMetadata(
        uint256[] calldata entityIds,
        MetadataType[] calldata metadataTypes,
        string[] calldata keys,
        string[] calldata values,
        string[] calldata dataTypes
    ) external onlyActiveStakeholder returns (uint256[] memory) {
        require(entityIds.length == metadataTypes.length, "Array length mismatch");
        require(entityIds.length == keys.length, "Array length mismatch");
        require(entityIds.length == values.length, "Array length mismatch");
        require(entityIds.length == dataTypes.length, "Array length mismatch");
        require(entityIds.length > 0, "No metadata to create");

        uint256[] memory metadataIds = new uint256[](entityIds.length);
        string[] memory emptyTags = new string[](0);

        for (uint256 i = 0; i < entityIds.length; i++) {
            metadataIds[i] = this.createMetadata(
                entityIds[i],
                metadataTypes[i],
                keys[i],
                values[i],
                dataTypes[i],
                emptyTags
            );
        }

        return metadataIds;
    }

    /**
     * @dev Check if metadata exists
     */
    function _metadataExists(uint256 metadataId) internal view returns (bool) {
        return metadataId > 0 && metadataId < nextMetadataId && metadata[metadataId].metadataId != 0;
    }

    /**
     * @dev Check if metadata has specific tag
     */
    function _hasTag(uint256 metadataId, string calldata tag) internal view returns (bool) {
        string[] storage tags = metadata[metadataId].tags;
        for (uint256 i = 0; i < tags.length; i++) {
            if (keccak256(bytes(tags[i])) == keccak256(bytes(tag))) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get metadata type name for display
     */
    function getMetadataTypeName(MetadataType metadataType)
        external
        pure
        returns (string memory)
    {
        if (metadataType == MetadataType.PRODUCT) return "Product";
        if (metadataType == MetadataType.SHIPMENT) return "Shipment";
        if (metadataType == MetadataType.STAKEHOLDER) return "Stakeholder";
        if (metadataType == MetadataType.CERTIFICATION) return "Certification";
        if (metadataType == MetadataType.QUALITY) return "Quality";
        if (metadataType == MetadataType.CUSTOM) return "Custom";
        return "Unknown";
    }

    /**
     * @dev Get recent metadata (last N records)
     */
    function getRecentMetadata(uint256 count) external view returns (uint256[] memory) {
        require(count > 0, "Count must be positive");

        uint256 actualCount = count;
        if (actualCount > totalMetadata) {
            actualCount = totalMetadata;
        }

        uint256[] memory result = new uint256[](actualCount);
        uint256 resultIndex = 0;

        // Start from most recent and work backwards
        for (uint256 i = nextMetadataId - 1; i >= 1 && resultIndex < actualCount; i--) {
            if (_metadataExists(i)) {
                result[resultIndex] = i;
                resultIndex++;
            }
        }

        return result;
    }

    /**
     * @dev Emergency function to deactivate all metadata for an entity (admin only)
     */
    function emergencyDeactivateEntityMetadata(uint256 entityId) external onlyAdmin {
        // Deactivate across all metadata types
        for (uint256 typeIndex = 0; typeIndex <= uint256(MetadataType.CUSTOM); typeIndex++) {
            MetadataType metadataType = MetadataType(typeIndex);
            uint256[] storage metadataIds = entityMetadata[entityId][metadataType];

            for (uint256 i = 0; i < metadataIds.length; i++) {
                if (metadata[metadataIds[i]].isActive) {
                    metadata[metadataIds[i]].isActive = false;
                    emit MetadataDeactivated(metadataIds[i], msg.sender);
                }
            }
        }
    }
}