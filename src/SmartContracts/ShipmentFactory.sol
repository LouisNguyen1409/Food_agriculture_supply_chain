// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ShipmentRegistry.sol";
import "./ProductRegistry.sol";
import "./StakeholderRegistry.sol";

contract ShipmentFactory {
    struct ShipmentTemplate {
        uint256 templateId;
        string templateName;
        string transportMode;
        string[] requiredConditions;
        uint256 estimatedDurationHours;
        bool temperatureControlled;
        int256 minTemperature;
        int256 maxTemperature;
        bool isActive;
        address creator;
        uint256 createdAt;
    }

    struct RouteTemplate {
        uint256 routeId;
        string routeName;
        string origin;
        string destination;
        string[] waypoints;
        uint256 estimatedDurationHours;
        string transportMode;
        bool isActive;
        uint256 usageCount;
    }

    struct BatchShipmentRequest {
        uint256 batchId;
        address distributor;
        uint256[] productIds;
        address[] receivers;
        uint256 templateId;
        uint256 routeId;
        string[] trackingNumbers;
        uint256 requestedAt;
        bool isProcessed;
        uint256[] createdShipmentIds;
    }

    // Storage
    mapping(uint256 => ShipmentTemplate) public shipmentTemplates;
    mapping(uint256 => RouteTemplate) public routeTemplates;
    mapping(uint256 => BatchShipmentRequest) public batchRequests;
    mapping(address => uint256[]) public distributorShipments;
    mapping(string => uint256) public templateNameToId;
    mapping(string => uint256) public routeNameToId;

    uint256 public nextTemplateId = 1;
    uint256 public nextRouteId = 1;
    uint256 public nextBatchId = 1;
    uint256 public totalShipmentsCreated;

    ShipmentRegistry public shipmentRegistry;
    ProductRegistry public productRegistry;
    StakeholderRegistry public stakeholderRegistry;
    address public factoryOwner;

    // Events
    event ShipmentTemplateCreated(
        uint256 indexed templateId,
        string templateName,
        address indexed creator,
        uint256 timestamp
    );

    event RouteTemplateCreated(
        uint256 indexed routeId,
        string routeName,
        string origin,
        string destination,
        uint256 timestamp
    );

    event ShipmentCreatedFromTemplate(
        uint256 indexed shipmentId,
        uint256 indexed templateId,
        uint256 indexed productId,
        address distributor,
        uint256 timestamp
    );

    event BatchShipmentRequested(
        uint256 indexed batchId,
        address indexed distributor,
        uint256 shipmentCount,
        uint256 timestamp
    );

    event BatchShipmentCompleted(
        uint256 indexed batchId,
        uint256[] shipmentIds,
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

    modifier onlyRegisteredDistributor() {
        require(
            stakeholderRegistry.isRegisteredStakeholder(
                msg.sender,
                StakeholderRegistry.StakeholderRole.DISTRIBUTOR
            ),
            "Only registered distributors can create shipments"
        );
        _;
    }

    modifier templateExists(uint256 _templateId) {
        require(
            shipmentTemplates[_templateId].isActive,
            "Template does not exist or is inactive"
        );
        _;
    }

    modifier routeExists(uint256 _routeId) {
        require(
            routeTemplates[_routeId].isActive,
            "Route does not exist or is inactive"
        );
        _;
    }

    constructor(
        address _shipmentRegistryAddress,
        address _productRegistryAddress,
        address _stakeholderRegistryAddress
    ) {
        shipmentRegistry = ShipmentRegistry(_shipmentRegistryAddress);
        productRegistry = ProductRegistry(_productRegistryAddress);
        stakeholderRegistry = StakeholderRegistry(_stakeholderRegistryAddress);
        factoryOwner = msg.sender;
    }

    // Create shipment template
    function createShipmentTemplate(
        string memory _templateName,
        string memory _transportMode,
        string[] memory _requiredConditions,
        uint256 _estimatedDurationHours,
        bool _temperatureControlled,
        int256 _minTemperature,
        int256 _maxTemperature
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

        shipmentTemplates[templateId] = ShipmentTemplate({
            templateId: templateId,
            templateName: _templateName,
            transportMode: _transportMode,
            requiredConditions: _requiredConditions,
            estimatedDurationHours: _estimatedDurationHours,
            temperatureControlled: _temperatureControlled,
            minTemperature: _minTemperature,
            maxTemperature: _maxTemperature,
            isActive: true,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        templateNameToId[_templateName] = templateId;

        emit ShipmentTemplateCreated(
            templateId,
            _templateName,
            msg.sender,
            block.timestamp
        );

        return templateId;
    }

    // Create route template
    function createRouteTemplate(
        string memory _routeName,
        string memory _origin,
        string memory _destination,
        string[] memory _waypoints,
        uint256 _estimatedDurationHours,
        string memory _transportMode
    ) external returns (uint256 routeId) {
        require(bytes(_routeName).length > 0, "Route name cannot be empty");
        require(routeNameToId[_routeName] == 0, "Route name already exists");

        routeId = nextRouteId++;

        routeTemplates[routeId] = RouteTemplate({
            routeId: routeId,
            routeName: _routeName,
            origin: _origin,
            destination: _destination,
            waypoints: _waypoints,
            estimatedDurationHours: _estimatedDurationHours,
            transportMode: _transportMode,
            isActive: true,
            usageCount: 0
        });

        routeNameToId[_routeName] = routeId;

        emit RouteTemplateCreated(
            routeId,
            _routeName,
            _origin,
            _destination,
            block.timestamp
        );

        return routeId;
    }

    // Create shipment from template
    function createShipmentFromTemplate(
        uint256 _templateId,
        uint256 _productId,
        address _receiver,
        string memory _trackingNumber
    )
        external
        onlyRegisteredDistributor
        templateExists(_templateId)
        returns (uint256 shipmentId)
    {
        ShipmentTemplate memory template = shipmentTemplates[_templateId];

        // Create shipment in registry
        shipmentId = shipmentRegistry.createShipment(
            _productId,
            _receiver,
            _trackingNumber,
            template.transportMode
        );

        distributorShipments[msg.sender].push(shipmentId);
        totalShipmentsCreated++;

        emit ShipmentCreatedFromTemplate(
            shipmentId,
            _templateId,
            _productId,
            msg.sender,
            block.timestamp
        );

        return shipmentId;
    }

    // Create shipment with route
    function createShipmentWithRoute(
        uint256 _productId,
        address _receiver,
        string memory _trackingNumber,
        uint256 _routeId,
        uint256 _templateId
    )
        external
        onlyRegisteredDistributor
        routeExists(_routeId)
        templateExists(_templateId)
        returns (uint256 shipmentId)
    {
        ShipmentTemplate memory template = shipmentTemplates[_templateId];
        RouteTemplate storage route = routeTemplates[_routeId];

        // Create shipment
        shipmentId = shipmentRegistry.createShipment(
            _productId,
            _receiver,
            _trackingNumber,
            template.transportMode
        );

        // Update route usage
        route.usageCount++;

        distributorShipments[msg.sender].push(shipmentId);
        totalShipmentsCreated++;

        emit ShipmentCreatedFromTemplate(
            shipmentId,
            _templateId,
            _productId,
            msg.sender,
            block.timestamp
        );

        return shipmentId;
    }

    // Batch create shipments
    function requestBatchShipmentCreation(
        uint256[] memory _productIds,
        address[] memory _receivers,
        string[] memory _trackingNumbers,
        uint256 _templateId,
        uint256 _routeId
    )
        external
        onlyRegisteredDistributor
        templateExists(_templateId)
        returns (uint256 batchId)
    {
        require(_productIds.length > 0, "Must specify at least one shipment");
        require(
            _productIds.length == _receivers.length &&
                _receivers.length == _trackingNumbers.length,
            "Array lengths must match"
        );

        batchId = nextBatchId++;

        batchRequests[batchId] = BatchShipmentRequest({
            batchId: batchId,
            distributor: msg.sender,
            productIds: _productIds,
            receivers: _receivers,
            templateId: _templateId,
            routeId: _routeId,
            trackingNumbers: _trackingNumbers,
            requestedAt: block.timestamp,
            isProcessed: false,
            createdShipmentIds: new uint256[](0)
        });

        emit BatchShipmentRequested(
            batchId,
            msg.sender,
            _productIds.length,
            block.timestamp
        );

        return batchId;
    }

    // Process batch shipment creation
    function processBatchShipmentCreation(uint256 _batchId) external {
        BatchShipmentRequest storage request = batchRequests[_batchId];
        require(!request.isProcessed, "Batch already processed");
        require(
            msg.sender == request.distributor || msg.sender == factoryOwner,
            "Only distributor or factory owner can process batch"
        );

        ShipmentTemplate memory template = shipmentTemplates[
            request.templateId
        ];
        uint256[] memory shipmentIds = new uint256[](request.productIds.length);

        for (uint256 i = 0; i < request.productIds.length; i++) {
            uint256 shipmentId = shipmentRegistry.createShipment(
                request.productIds[i],
                request.receivers[i],
                request.trackingNumbers[i],
                template.transportMode
            );

            shipmentIds[i] = shipmentId;
            distributorShipments[request.distributor].push(shipmentId);
            totalShipmentsCreated++;

            emit ShipmentCreatedFromTemplate(
                shipmentId,
                request.templateId,
                request.productIds[i],
                request.distributor,
                block.timestamp
            );
        }

        // Update route usage if specified
        if (request.routeId > 0 && routeTemplates[request.routeId].isActive) {
            routeTemplates[request.routeId].usageCount += shipmentIds.length;
        }

        request.createdShipmentIds = shipmentIds;
        request.isProcessed = true;

        emit BatchShipmentCompleted(_batchId, shipmentIds, block.timestamp);
    }

    // Create standard shipment (common transport modes)
    function createStandardShipment(
        uint256 _productId,
        address _receiver,
        string memory _trackingNumber,
        string memory _transportMode // "TRUCK", "AIR", "SEA", "RAIL"
    ) external onlyRegisteredDistributor returns (uint256 shipmentId) {
        shipmentId = shipmentRegistry.createShipment(
            _productId,
            _receiver,
            _trackingNumber,
            _transportMode
        );

        distributorShipments[msg.sender].push(shipmentId);
        totalShipmentsCreated++;

        emit ShipmentCreatedFromTemplate(
            shipmentId,
            0, // No template used
            _productId,
            msg.sender,
            block.timestamp
        );

        return shipmentId;
    }

    // Create express shipment (high priority)
    function createExpressShipment(
        uint256 _productId,
        address _receiver,
        string memory _trackingNumber
    ) external onlyRegisteredDistributor returns (uint256 shipmentId) {
        // Enhanced tracking number for express
        string memory expressTrackingNumber = string(
            abi.encodePacked("EXP-", _trackingNumber)
        );

        shipmentId = shipmentRegistry.createShipment(
            _productId,
            _receiver,
            expressTrackingNumber,
            "EXPRESS"
        );

        distributorShipments[msg.sender].push(shipmentId);
        totalShipmentsCreated++;

        emit ShipmentCreatedFromTemplate(
            shipmentId,
            0, // No template used
            _productId,
            msg.sender,
            block.timestamp
        );

        return shipmentId;
    }

    // Get optimal route suggestions
    function getOptimalRoutes(
        string memory _origin,
        string memory _destination,
        string memory _transportMode
    ) external view returns (uint256[] memory routeIds) {
        uint256[] memory tempArray = new uint256[](nextRouteId);
        uint256 count = 0;

        for (uint256 i = 1; i < nextRouteId; i++) {
            RouteTemplate memory route = routeTemplates[i];
            if (
                route.isActive &&
                keccak256(abi.encodePacked(route.origin)) ==
                keccak256(abi.encodePacked(_origin)) &&
                keccak256(abi.encodePacked(route.destination)) ==
                keccak256(abi.encodePacked(_destination)) &&
                keccak256(abi.encodePacked(route.transportMode)) ==
                keccak256(abi.encodePacked(_transportMode))
            ) {
                tempArray[count] = i;
                count++;
            }
        }

        routeIds = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            routeIds[j] = tempArray[j];
        }

        return routeIds;
    }

    // Query functions
    function getShipmentTemplate(
        uint256 _templateId
    )
        external
        view
        templateExists(_templateId)
        returns (ShipmentTemplate memory)
    {
        return shipmentTemplates[_templateId];
    }

    function getRouteTemplate(
        uint256 _routeId
    ) external view routeExists(_routeId) returns (RouteTemplate memory) {
        return routeTemplates[_routeId];
    }

    function getTemplateByName(
        string memory _templateName
    ) external view returns (ShipmentTemplate memory) {
        uint256 templateId = templateNameToId[_templateName];
        require(templateId != 0, "Template not found");
        return shipmentTemplates[templateId];
    }

    function getRouteByName(
        string memory _routeName
    ) external view returns (RouteTemplate memory) {
        uint256 routeId = routeNameToId[_routeName];
        require(routeId != 0, "Route not found");
        return routeTemplates[routeId];
    }

    function getDistributorShipments(
        address _distributor
    ) external view returns (uint256[] memory) {
        return distributorShipments[_distributor];
    }

    function getBatchRequest(
        uint256 _batchId
    ) external view returns (BatchShipmentRequest memory) {
        return batchRequests[_batchId];
    }

    function getFactoryStats()
        external
        view
        returns (
            uint256 totalTemplates,
            uint256 totalRoutes,
            uint256 totalShipmentsFromFactory,
            uint256 totalBatches
        )
    {
        totalTemplates = nextTemplateId - 1;
        totalRoutes = nextRouteId - 1;
        totalShipmentsFromFactory = totalShipmentsCreated;
        totalBatches = nextBatchId - 1;

        return (
            totalTemplates,
            totalRoutes,
            totalShipmentsFromFactory,
            totalBatches
        );
    }

    function getMostUsedRoutes(
        uint256 _limit
    )
        external
        view
        returns (uint256[] memory routeIds, uint256[] memory usageCounts)
    {
        // Simple implementation - in production, you'd want more sophisticated sorting
        uint256[] memory tempRouteIds = new uint256[](_limit);
        uint256[] memory tempUsageCounts = new uint256[](_limit);
        uint256 count = 0;

        for (uint256 i = 1; i < nextRouteId && count < _limit; i++) {
            if (
                routeTemplates[i].isActive && routeTemplates[i].usageCount > 0
            ) {
                tempRouteIds[count] = i;
                tempUsageCounts[count] = routeTemplates[i].usageCount;
                count++;
            }
        }

        routeIds = new uint256[](count);
        usageCounts = new uint256[](count);
        for (uint256 j = 0; j < count; j++) {
            routeIds[j] = tempRouteIds[j];
            usageCounts[j] = tempUsageCounts[j];
        }

        return (routeIds, usageCounts);
    }

    // Admin functions
    function updateShipmentRegistry(
        address _newShipmentRegistry
    ) external onlyFactoryOwner {
        require(_newShipmentRegistry != address(0), "Invalid address");
        shipmentRegistry = ShipmentRegistry(_newShipmentRegistry);
    }

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

    function deactivateTemplate(
        uint256 _templateId
    ) external templateExists(_templateId) {
        ShipmentTemplate storage template = shipmentTemplates[_templateId];
        require(
            template.creator == msg.sender || msg.sender == factoryOwner,
            "Not authorized"
        );
        template.isActive = false;
    }

    function deactivateRoute(
        uint256 _routeId
    ) external routeExists(_routeId) onlyFactoryOwner {
        routeTemplates[_routeId].isActive = false;
    }

    function transferOwnership(address _newOwner) external onlyFactoryOwner {
        require(_newOwner != address(0), "Invalid address");
        factoryOwner = _newOwner;
    }
}
