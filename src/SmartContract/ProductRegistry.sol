// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StakeholderRegistry.sol";

contract ProductRegistry {
    enum ProductStage {
        FARM,
        PROCESSING,
        DISTRIBUTION,
        RETAIL,
        CONSUMED
    }

    struct ProductInfo {
        uint256 productId;
        string productName;
        string batchNumber;
        address farmer;
        uint256 createdAt;
        ProductStage currentStage;
        bool isActive;
        bytes32 dataHash;
    }

    struct StageData {
        address stakeholder;
        uint256 timestamp;
        string data;
        bytes32 dataHash;
    }

    mapping(uint256 => ProductInfo) public products;
    mapping(uint256 => mapping(ProductStage => StageData)) public productStages;
    mapping(string => uint256) public batchToProductId;
    mapping(address => uint256[]) public stakeholderProducts;

    uint256 public nextProductId = 0;
    uint256 public totalProducts = 0;
    StakeholderRegistry public stakeholderRegistry;

    event ProductCreated(
        uint256 indexed productId,
        string productName,
        string batchNumber,
        address indexed farmer,
        uint256 timestamp
    );

    event ProductStageUpdated(
        uint256 indexed productId,
        ProductStage indexed stage,
        address indexed stakeholder,
        string data,
        uint256 timestamp
    );

    event ProductVerified(
        uint256 indexed productId,
        address indexed verifier,
        bool isValid,
        uint256 timestamp
    );

    modifier onlyRegisteredStakeholder(
        StakeholderRegistry.StakeholderRole _requiredRole
    ) {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                _requiredRole
            ),
            "Not registered for this role"
        );
        _;
    }

    modifier productExists(uint256 _productId) {
        require(
            _productId < nextProductId && products[_productId].isActive,
            "Product does not exist"
        );
        _;
    }

    modifier validStageTransition(uint256 _productId, ProductStage _newStage) {
        ProductStage currentStage = products[_productId].currentStage;
        require(
            uint(_newStage) == uint(currentStage) + 1,
            "Invalid stage transition"
        );
        _;
    }

    constructor(address _stakeholderRegistryAddress) {
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
    }

    function registerProduct(
        string memory _productName,
        string memory _batchNumber,
        string memory _farmData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
        returns (uint256)
    {
        require(
            batchToProductId[_batchNumber] == 0,
            "Batch number already exists"
        );
        require(bytes(_productName).length > 0, "Product name cannot be empty");
        require(bytes(_batchNumber).length > 0, "Batch number cannot be empty");

        uint256 productId = nextProductId++;

        products[productId] = ProductInfo({
            productId: productId,
            productName: _productName,
            batchNumber: _batchNumber,
            farmer: msg.sender,
            createdAt: block.timestamp,
            currentStage: ProductStage.FARM,
            isActive: true,
            dataHash: keccak256(
                abi.encodePacked(_productName, _batchNumber, _farmData)
            )
        });

        productStages[productId][ProductStage.FARM] = StageData({
            stakeholder: msg.sender,
            timestamp: block.timestamp,
            data: _farmData,
            dataHash: keccak256(abi.encodePacked(_farmData))
        });

        batchToProductId[_batchNumber] = productId;
        stakeholderProducts[msg.sender].push(productId);
        totalProducts++;

        stakeholderRegistry.updateLastActivity(msg.sender);

        emit ProductCreated(
            productId,
            _productName,
            _batchNumber,
            msg.sender,
            block.timestamp
        );
        emit ProductStageUpdated(
            productId,
            ProductStage.FARM,
            msg.sender,
            _farmData,
            block.timestamp
        );

        return productId;
    }

    function updateProcessingStage(
        uint256 _productId,
        string memory _processingData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.PROCESSOR)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.PROCESSING)
    {
        _updateProductStage(
            _productId,
            ProductStage.PROCESSING,
            _processingData
        );
    }

    function updateDistributionStage(
        uint256 _productId,
        string memory _distributionData
    )
        external
        onlyRegisteredStakeholder(
            StakeholderRegistry.StakeholderRole.DISTRIBUTOR
        )
        productExists(_productId)
        validStageTransition(_productId, ProductStage.DISTRIBUTION)
    {
        _updateProductStage(
            _productId,
            ProductStage.DISTRIBUTION,
            _distributionData
        );
    }

    function updateRetailStage(
        uint256 _productId,
        string memory _retailData
    )
        external
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.RETAILER)
        productExists(_productId)
        validStageTransition(_productId, ProductStage.RETAIL)
    {
        _updateProductStage(_productId, ProductStage.RETAIL, _retailData);
    }

    function markAsConsumed(
        uint256 _productId
    ) external productExists(_productId) {
        require(
            products[_productId].currentStage == ProductStage.RETAIL,
            "Product must be at retail stage"
        );

        products[_productId].currentStage = ProductStage.CONSUMED;

        emit ProductStageUpdated(
            _productId,
            ProductStage.CONSUMED,
            msg.sender,
            "Product consumed",
            block.timestamp
        );
    }

    function _updateProductStage(
        uint256 _productId,
        ProductStage _stage,
        string memory _data
    ) internal {
        require(bytes(_data).length > 0, "Stage data cannot be empty");

        products[_productId].currentStage = _stage;

        productStages[_productId][_stage] = StageData({
            stakeholder: msg.sender,
            timestamp: block.timestamp,
            data: _data,
            dataHash: keccak256(abi.encodePacked(_data))
        });

        stakeholderProducts[msg.sender].push(_productId);
        stakeholderRegistry.updateLastActivity(msg.sender);

        emit ProductStageUpdated(
            _productId,
            _stage,
            msg.sender,
            _data,
            block.timestamp
        );
    }

    function verifyProduct(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (bool isValid, ProductInfo memory productInfo)
    {
        ProductInfo memory product = products[_productId];

        bool dataValid = true;
        for (uint i = 0; i <= uint(product.currentStage); i++) {
            ProductStage stage = ProductStage(i);
            if (productStages[_productId][stage].timestamp > 0) {
                bytes32 expectedHash = keccak256(
                    abi.encodePacked(productStages[_productId][stage].data)
                );
                if (expectedHash != productStages[_productId][stage].dataHash) {
                    dataValid = false;
                    break;
                }
            }
        }

        return (dataValid, product);
    }

    function performVerification(
        uint256 _productId
    ) external productExists(_productId) returns (bool isValid) {
        (bool valid, ) = this.verifyProduct(_productId);

        emit ProductVerified(_productId, msg.sender, valid, block.timestamp);

        return valid;
    }

    function getProductInfo(
        uint256 _productId
    ) external view productExists(_productId) returns (ProductInfo memory) {
        return products[_productId];
    }

    function getProductStageData(
        uint256 _productId,
        ProductStage _stage
    ) external view productExists(_productId) returns (StageData memory) {
        return productStages[_productId][_stage];
    }

    function getProductJourney(
        uint256 _productId
    )
        external
        view
        productExists(_productId)
        returns (
            ProductInfo memory productInfo,
            StageData memory farmStage,
            StageData memory processingStage,
            StageData memory distributionStage,
            StageData memory retailStage
        )
    {
        return (
            products[_productId],
            productStages[_productId][ProductStage.FARM],
            productStages[_productId][ProductStage.PROCESSING],
            productStages[_productId][ProductStage.DISTRIBUTION],
            productStages[_productId][ProductStage.RETAIL]
        );
    }

    function getProductByBatch(
        string memory _batchNumber
    ) external view returns (uint256) {
        uint256 productId = batchToProductId[_batchNumber];
        require(
            productId != 0 ||
                (productId == 0 &&
                    keccak256(abi.encodePacked(products[0].batchNumber)) ==
                    keccak256(abi.encodePacked(_batchNumber))),
            "Product not found"
        );
        return productId;
    }

    function getStakeholderProducts(
        address _stakeholder
    ) external view returns (uint256[] memory) {
        return stakeholderProducts[_stakeholder];
    }

    function getProductsByStage(
        ProductStage _stage
    ) external view returns (uint256[] memory) {
        uint256[] memory tempArray = new uint256[](totalProducts);
        uint256 count = 0;

        for (uint256 i = 0; i < nextProductId; i++) {
            if (products[i].isActive && products[i].currentStage == _stage) {
                tempArray[count] = i;
                count++;
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            result[j] = tempArray[j];
        }

        return result;
    }

    function getSupplyChainStats()
        external
        view
        returns (
            uint256 totalProductsCount,
            uint256 productsAtFarm,
            uint256 productsInProcessing,
            uint256 productsInDistribution,
            uint256 productsAtRetail,
            uint256 productsConsumed
        )
    {
        uint256 farm = 0;
        uint256 processing = 0;
        uint256 distribution = 0;
        uint256 retail = 0;
        uint256 consumed = 0;

        for (uint256 i = 0; i < nextProductId; i++) {
            if (products[i].isActive) {
                if (products[i].currentStage == ProductStage.FARM) {
                    farm++;
                } else if (
                    products[i].currentStage == ProductStage.PROCESSING
                ) {
                    processing++;
                } else if (
                    products[i].currentStage == ProductStage.DISTRIBUTION
                ) {
                    distribution++;
                } else if (products[i].currentStage == ProductStage.RETAIL) {
                    retail++;
                } else if (products[i].currentStage == ProductStage.CONSUMED) {
                    consumed++;
                }
            }
        }

        return (
            totalProducts,
            farm,
            processing,
            distribution,
            retail,
            consumed
        );
    }

    function deactivateProduct(
        uint256 _productId
    )
        external
        productExists(_productId)
        onlyRegisteredStakeholder(StakeholderRegistry.StakeholderRole.FARMER)
    {
        require(
            products[_productId].farmer == msg.sender,
            "Only product farmer can deactivate"
        );

        products[_productId].isActive = false;
        totalProducts--;
    }

    function getTotalProducts() external view returns (uint256) {
        return totalProducts;
    }

    function getNextProductId() external view returns (uint256) {
        return nextProductId;
    }
}
