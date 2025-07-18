// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ProductRegistry.sol";
import "./StakeholderRegistry.sol";

contract ProductFactory {
    struct ProductTemplate {
        uint256 templateId;
        string templateName;
        string productType;
        string[] requiredFields;
        string[] certificationTypes;
        uint256 expirationDays;
        bool isActive;
        address creator;
        uint256 createdAt;
    }

    struct BatchCreateRequest {
        uint256 batchId;
        address farmer;
        uint256 templateId;
        string[] productNames;
        string[] batchNumbers;
        string[] farmDataArray;
        uint256 requestedAt;
        bool isProcessed;
        uint256[] createdProductIds;
    }

    // Storage
    mapping(uint256 => ProductTemplate) public productTemplates;
    mapping(uint256 => BatchCreateRequest) public batchRequests;
    mapping(address => uint256[]) public farmerProducts;
    mapping(string => uint256) public templateNameToId;
    mapping(address => uint256[]) public farmerTemplates;

    uint256 public nextTemplateId = 1;
    uint256 public nextBatchId = 1;
    uint256 public totalProductsCreated;

    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    address public factoryOwner;

    // Events
    event ProductTemplateCreated(
        uint256 indexed templateId,
        string templateName,
        address indexed creator,
        uint256 timestamp
    );

    event ProductCreatedFromTemplate(
        uint256 indexed productId,
        uint256 indexed templateId,
        address indexed farmer,
        string productName,
        uint256 timestamp
    );

    event BatchProductCreationRequested(
        uint256 indexed batchId,
        address indexed farmer,
        uint256 productCount,
        uint256 timestamp
    );

    event BatchProductCreationCompleted(
        uint256 indexed batchId,
        uint256[] productIds,
        uint256 timestamp
    );

    event ProductTemplateUpdated(
        uint256 indexed templateId,
        string field,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyFactoryOwner() {
        require(
            msg.sender == factoryOwner,
            "Only factory owner can perform this action"
        );
        _;
    }

    modifier onlyRegisteredFarmer() {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                StakeholderRegistry.StakeholderRole.FARMER
            ),
            "Only registered farmers can create products"
        );
        _;
    }

    modifier templateExists(uint256 _templateId) {
        require(
            productTemplates[_templateId].isActive,
            "Template does not exist or is inactive"
        );
        _;
    }

    constructor(
        address _productRegistryAddress,
        address _stakeholderRegistryAddress
    ) {
        productRegistry = ProductRegistry(_productRegistryAddress);
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        factoryOwner = msg.sender;
    }

    // Create product template
    function createProductTemplate(
        string memory _templateName,
        string memory _productType,
        string[] memory _requiredFields,
        string[] memory _certificationTypes,
        uint256 _expirationDays
    ) external returns (uint256 templateId) {
        require(
            bytes(_templateName).length > 0,
            "Template name cannot be empty"
        );
        require(
            templateNameToId[_templateName] == 0,
            "Template name already exists"
        );

        templateId = nextTemplateId++;

        productTemplates[templateId] = ProductTemplate({
            templateId: templateId,
            templateName: _templateName,
            productType: _productType,
            requiredFields: _requiredFields,
            certificationTypes: _certificationTypes,
            expirationDays: _expirationDays,
            isActive: true,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        templateNameToId[_templateName] = templateId;
        farmerTemplates[msg.sender].push(templateId);

        emit ProductTemplateCreated(
            templateId,
            _templateName,
            msg.sender,
            block.timestamp
        );

        return templateId;
    }

    // Create product from template
    function createProductFromTemplate(
        uint256 _templateId,
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData
    )
        external
        onlyRegisteredFarmer
        templateExists(_templateId)
        returns (uint256 productId)
    {
        ProductTemplate memory template = productTemplates[_templateId];

        // Create product in registry
        productId = productRegistry.registerProduct(
            _productName,
            _batchNumber,
            _farmData
        );

        farmerProducts[msg.sender].push(productId);
        totalProductsCreated++;

        emit ProductCreatedFromTemplate(
            productId,
            _templateId,
            msg.sender,
            _productName,
            block.timestamp
        );

        return productId;
    }

    // Batch create products
    function requestBatchProductCreation(
        uint256 _templateId,
        string[] memory _productNames,
        string[] memory _batchNumbers,
        string[] memory _farmDataArray
    )
        external
        onlyRegisteredFarmer
        templateExists(_templateId)
        returns (uint256 batchId)
    {
        require(_productNames.length > 0, "Must specify at least one product");
        require(
            _productNames.length == _batchNumbers.length &&
                _batchNumbers.length == _farmDataArray.length,
            "Array lengths must match"
        );

        batchId = nextBatchId++;

        batchRequests[batchId] = BatchCreateRequest({
            batchId: batchId,
            farmer: msg.sender,
            templateId: _templateId,
            productNames: _productNames,
            batchNumbers: _batchNumbers,
            farmDataArray: _farmDataArray,
            requestedAt: block.timestamp,
            isProcessed: false,
            createdProductIds: new uint256[](0)
        });

        emit BatchProductCreationRequested(
            batchId,
            msg.sender,
            _productNames.length,
            block.timestamp
        );

        return batchId;
    }

    // Process batch creation (can be called by farmer or factory owner)
    function processBatchCreation(uint256 _batchId) external {
        BatchCreateRequest storage request = batchRequests[_batchId];
        require(!request.isProcessed, "Batch already processed");
        require(
            msg.sender == request.farmer || msg.sender == factoryOwner,
            "Only farmer or factory owner can process batch"
        );

        uint256[] memory productIds = new uint256[](
            request.productNames.length
        );

        for (uint256 i = 0; i < request.productNames.length; i++) {
            uint256 productId = productRegistry.registerProduct(
                request.productNames[i],
                request.batchNumbers[i],
                request.farmDataArray[i]
            );

            productIds[i] = productId;
            farmerProducts[request.farmer].push(productId);
            totalProductsCreated++;

            emit ProductCreatedFromTemplate(
                productId,
                request.templateId,
                request.farmer,
                request.productNames[i],
                block.timestamp
            );
        }

        request.createdProductIds = productIds;
        request.isProcessed = true;

        emit BatchProductCreationCompleted(
            _batchId,
            productIds,
            block.timestamp
        );
    }

    // Create standardized product (common products like "Organic Apples", "Wheat", etc.)
    function createStandardProduct(
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData,
        string memory _standardType // "ORGANIC", "CONVENTIONAL", "FAIR_TRADE"
    ) external onlyRegisteredFarmer returns (uint256 productId) {
        // Enhanced farm data with standard type
        string memory enhancedFarmData = string(
            abi.encodePacked(
                _farmData,
                "|STANDARD_TYPE:",
                _standardType,
                "|CREATED_BY:FACTORY"
            )
        );

        productId = productRegistry.registerProduct(
            _productName,
            _batchNumber,
            enhancedFarmData
        );

        farmerProducts[msg.sender].push(productId);
        totalProductsCreated++;

        emit ProductCreatedFromTemplate(
            productId,
            0, // No template used
            msg.sender,
            _productName,
            block.timestamp
        );

        return productId;
    }

    // Bulk create similar products with auto-generated batch numbers
    function bulkCreateSimilarProducts(
        string memory _baseProductName,
        string memory _baseBatchPrefix,
        string memory _farmData,
        uint256 _quantity
    ) external onlyRegisteredFarmer returns (uint256[] memory productIds) {
        require(
            _quantity > 0 && _quantity <= 100,
            "Quantity must be between 1 and 100"
        );

        productIds = new uint256[](_quantity);

        for (uint256 i = 0; i < _quantity; i++) {
            string memory productName = string(
                abi.encodePacked(_baseProductName, " #", toString(i + 1))
            );
            string memory batchNumber = string(
                abi.encodePacked(_baseBatchPrefix, "-", toString(i + 1))
            );

            uint256 productId = productRegistry.registerProduct(
                productName,
                batchNumber,
                _farmData
            );
            productIds[i] = productId;

            farmerProducts[msg.sender].push(productId);
            totalProductsCreated++;
        }

        return productIds;
    }

    // Update product template
    function updateProductTemplate(
        uint256 _templateId,
        string memory _templateName,
        string memory _productType,
        uint256 _expirationDays
    ) external templateExists(_templateId) {
        ProductTemplate storage template = productTemplates[_templateId];
        require(
            template.creator == msg.sender || msg.sender == factoryOwner,
            "Not authorized to update template"
        );

        if (bytes(_templateName).length > 0) {
            template.templateName = _templateName;
            emit ProductTemplateUpdated(
                _templateId,
                "templateName",
                block.timestamp
            );
        }

        if (bytes(_productType).length > 0) {
            template.productType = _productType;
            emit ProductTemplateUpdated(
                _templateId,
                "productType",
                block.timestamp
            );
        }

        if (_expirationDays > 0) {
            template.expirationDays = _expirationDays;
            emit ProductTemplateUpdated(
                _templateId,
                "expirationDays",
                block.timestamp
            );
        }
    }

    // Deactivate template
    function deactivateTemplate(
        uint256 _templateId
    ) external templateExists(_templateId) {
        ProductTemplate storage template = productTemplates[_templateId];
        require(
            template.creator == msg.sender || msg.sender == factoryOwner,
            "Not authorized to deactivate template"
        );

        template.isActive = false;
    }

    // Query functions
    function getProductTemplate(
        uint256 _templateId
    )
        external
        view
        templateExists(_templateId)
        returns (ProductTemplate memory)
    {
        return productTemplates[_templateId];
    }

    function getTemplateByName(
        string memory _templateName
    ) external view returns (ProductTemplate memory) {
        uint256 templateId = templateNameToId[_templateName];
        require(templateId != 0, "Template not found");
        return productTemplates[templateId];
    }

    function getFarmerProducts(
        address _farmer
    ) external view returns (uint256[] memory) {
        return farmerProducts[_farmer];
    }

    function getFarmerTemplates(
        address _farmer
    ) external view returns (uint256[] memory) {
        return farmerTemplates[_farmer];
    }

    function getBatchRequest(
        uint256 _batchId
    ) external view returns (BatchCreateRequest memory) {
        return batchRequests[_batchId];
    }

    function getFactoryStats()
        external
        view
        returns (
            uint256 totalTemplates,
            uint256 totalProductsFromFactory,
            uint256 totalBatches,
            uint256 activeFarmers
        )
    {
        totalTemplates = nextTemplateId - 1;
        totalProductsFromFactory = totalProductsCreated;
        totalBatches = nextBatchId - 1;

        // Note: activeFarmers would require additional tracking
        activeFarmers = 0; // Placeholder

        return (
            totalTemplates,
            totalProductsFromFactory,
            totalBatches,
            activeFarmers
        );
    }

    // Utility function to convert uint to string
    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // Admin functions
    function updateProductRegistry(
        address _newProductRegistry
    ) external onlyFactoryOwner {
        require(_newProductRegistry != address(0), "Invalid address");
        productRegistry = ProductRegistry(_newProductRegistry);
    }

    function updateStakeholderRegistry(
        address _newStakeholderRegistry
    ) external onlyFactoryOwner {
        require(_newStakeholderRegistry != address(0), "Invalid address");
        stakeholderRegistry = StakeholderRegistry(_newStakeholderRegistry);
    }

    function transferOwnership(address _newOwner) external onlyFactoryOwner {
        require(_newOwner != address(0), "Invalid address");
        factoryOwner = _newOwner;
    }
}
