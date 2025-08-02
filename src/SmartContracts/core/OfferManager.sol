// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../access/AccessControl.sol";
import "./ProductBatch.sol";

contract OfferManager is AccessControl {

    enum OfferStatus {
        OPEN,
        ACCEPTED,
        EXPIRED,
        CANCELLED
    }

    enum OfferType {
        BUY_OFFER,      // Buyer makes offer to buy
        SELL_OFFER,     // Seller lists product for sale
        CONTRACT_OFFER  // Contract farming offer
    }

    struct Offer {
        uint256 id;
        address creator;        // Who created the offer
        address counterparty;   // Who the offer is for (can be address(0) for open offers)
        uint256 batchId;
        uint256 offeredPrice;
        uint256 quantity;
        OfferType offerType;
        OfferStatus status;
        string terms;           // IPFS hash of terms
        uint256 createdAt;
        uint256 expiresAt;
        address acceptedBy;
        uint256 acceptedAt;
    }

    mapping(uint256 => Offer) public offers;
    mapping(uint256 => uint256[]) public batchOffers;  // batchId => offerIds[]
    mapping(address => uint256[]) public userOffers;   // user => offerIds[]
    mapping(OfferType => uint256[]) public offersByType;

    uint256 public nextOfferId = 1;
    ProductBatch public productBatch;

    // Events
    event OfferCreated(uint256 indexed offerId, address indexed creator, uint256 indexed batchId, OfferType offerType);
    event OfferAccepted(uint256 indexed offerId, address indexed acceptor, uint256 price);
    event OfferCancelled(uint256 indexed offerId);

    constructor(address _productBatch) {
        require(_productBatch != address(0), "Invalid ProductBatch address");
        productBatch = ProductBatch(_productBatch);
    }

    /**
     * @dev Create a buy offer (processor/distributor/retailer wants to buy)
     */
    function createBuyOffer(
        uint256 batchId,
        uint256 offeredPrice,
        uint256 quantity,
        string calldata terms,
        uint256 duration,
        address seller // address(0) for open offer
    ) external onlyActiveStakeholder returns (uint256) {
        require(duration > 0, "Duration must be positive");
        require(quantity > 0, "Quantity must be positive");

        // Validate buyer role
        require(
            hasRole(msg.sender, Role.PROCESSOR) ||
            hasRole(msg.sender, Role.DISTRIBUTOR) ||
            hasRole(msg.sender, Role.RETAILER),
            "Invalid buyer role"
        );

        return _createOffer(
            msg.sender,
            seller,
            batchId,
            offeredPrice,
            quantity,
            OfferType.BUY_OFFER,
            terms,
            duration
        );
    }

    /**
     * @dev Create a sell offer (farmer/processor/distributor lists for sale)
     */
    function createSellOffer(
        uint256 batchId,
        uint256 askingPrice,
        uint256 quantity,
        string calldata terms,
        uint256 duration,
        address buyer // address(0) for open offer
    ) external onlyActiveStakeholder returns (uint256) {
        // Verify ownership
        (address owner,,,,,,,,) = productBatch.getBatchMarketInfo(batchId);
        require(msg.sender == owner, "Only batch owner can create sell offer");

        return _createOffer(
            msg.sender,
            buyer,
            batchId,
            askingPrice,
            quantity,
            OfferType.SELL_OFFER,
            terms,
            duration
        );
    }

    /**
     * @dev Create contract farming offer (processor pre-orders from farmer)
     */
    function createContractOffer(
        string calldata cropType,
        uint256 expectedQuantity,
        uint256 pricePerUnit,
        string calldata farmingInstructions,
        uint256 duration,
        address farmer
    ) external onlyActiveStakeholder returns (uint256) {
        require(hasRole(msg.sender, Role.PROCESSOR), "Only processors can create contract offers");
        require(hasRole(farmer, Role.FARMER), "Invalid farmer address");

        // Create temporary batch ID 0 for contract offers (no batch exists yet)
        return _createOffer(
            msg.sender,
            farmer,
            0, // No batch exists yet
            pricePerUnit,
            expectedQuantity,
            OfferType.CONTRACT_OFFER,
            farmingInstructions,
            duration
        );
    }

    /**
     * @dev Accept an offer
     */
    function acceptOffer(uint256 offerId) external onlyActiveStakeholder {
        require(_offerExists(offerId), "Offer does not exist");
        Offer storage offer = offers[offerId];

        require(offer.status == OfferStatus.OPEN, "Offer not available");
        require(block.timestamp < offer.expiresAt, "Offer expired");
        require(msg.sender != offer.creator, "Cannot accept own offer");

        // Check if offer is for specific counterparty
        if (offer.counterparty != address(0)) {
            require(msg.sender == offer.counterparty, "Offer not for you");
        }

        // Validate acceptor based on offer type
        _validateAcceptor(msg.sender, offer.offerType, offer.batchId);

        // Update offer
        offer.status = OfferStatus.ACCEPTED;
        offer.acceptedBy = msg.sender;
        offer.acceptedAt = block.timestamp;

        // Update batch status if applicable
        if (offer.batchId != 0) {
            productBatch.markAsSold(offer.batchId, msg.sender, offer.offeredPrice);
        }

        // Track acceptor's involvement
        userOffers[msg.sender].push(offerId);

        emit OfferAccepted(offerId, msg.sender, offer.offeredPrice);
    }

    /**
     * @dev Cancel an offer
     */
    function cancelOffer(uint256 offerId) external {
        require(_offerExists(offerId), "Offer does not exist");
        Offer storage offer = offers[offerId];

        require(msg.sender == offer.creator, "Only creator can cancel");
        require(offer.status == OfferStatus.OPEN, "Offer not cancellable");

        offer.status = OfferStatus.CANCELLED;
        emit OfferCancelled(offerId);
    }

    /**
     * @dev Get offers available to a specific user
     */
    function getAvailableOffers(address user) external view returns (uint256[] memory) {
        Role userRole = getRole(user);
        uint256 count = 0;

        // Count available offers
        for (uint256 i = 1; i < nextOfferId; i++) {
            if (_isOfferAvailableToUser(i, user, userRole)) {
                count++;
            }
        }

        // Fill result array
        uint256[] memory availableOffers = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i < nextOfferId; i++) {
            if (_isOfferAvailableToUser(i, user, userRole)) {
                availableOffers[index] = i;
                index++;
            }
        }

        return availableOffers;
    }

    /**
     * @dev Get offers by type (for marketplace browsing)
     */
    function getOffersByType(OfferType offerType) external view returns (uint256[] memory) {
        uint256[] memory typeOffers = offersByType[offerType];
        uint256 count = 0;

        // Count active offers
        for (uint256 i = 0; i < typeOffers.length; i++) {
            if (offers[typeOffers[i]].status == OfferStatus.OPEN &&
                block.timestamp < offers[typeOffers[i]].expiresAt) {
                count++;
            }
        }

        // Fill result array
        uint256[] memory activeOffers = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < typeOffers.length; i++) {
            if (offers[typeOffers[i]].status == OfferStatus.OPEN &&
                block.timestamp < offers[typeOffers[i]].expiresAt) {
                activeOffers[index] = typeOffers[i];
                index++;
            }
        }

        return activeOffers;
    }

    /**
     * @dev Get offer details
     */
    function getOfferInfo(uint256 offerId) external view returns (
        address creator,
        address counterparty,
        uint256 batchId,
        uint256 price,
        uint256 quantity,
        OfferType offerType,
        OfferStatus status,
        string memory terms,
        uint256 expiresAt,
        address acceptedBy
    ) {
        require(_offerExists(offerId), "Offer does not exist");
        Offer storage offer = offers[offerId];

        return (
            offer.creator,
            offer.counterparty,
            offer.batchId,
            offer.offeredPrice,
            offer.quantity,
            offer.offerType,
            offer.status,
            offer.terms,
            offer.expiresAt,
            offer.acceptedBy
        );
    }

    // Internal functions
    function _createOffer(
        address creator,
        address counterparty,
        uint256 batchId,
        uint256 price,
        uint256 quantity,
        OfferType offerType,
        string calldata terms,
        uint256 duration
    ) internal returns (uint256) {
        uint256 offerId = nextOfferId++;

        offers[offerId] = Offer({
            id: offerId,
            creator: creator,
            counterparty: counterparty,
            batchId: batchId,
            offeredPrice: price,
            quantity: quantity,
            offerType: offerType,
            status: OfferStatus.OPEN,
            terms: terms,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            acceptedBy: address(0),
            acceptedAt: 0
        });

        // Update indexes
        if (batchId != 0) {
            batchOffers[batchId].push(offerId);
        }
        userOffers[creator].push(offerId);
        offersByType[offerType].push(offerId);

        emit OfferCreated(offerId, creator, batchId, offerType);
        return offerId;
    }

    function _validateAcceptor(address acceptor, OfferType offerType, uint256 batchId) internal view {
        if (offerType == OfferType.BUY_OFFER) {
            // For buy offers, acceptor should be the seller (batch owner)
            if (batchId != 0) {
                (address owner,,,,,,,,) = productBatch.getBatchMarketInfo(batchId);
                require(acceptor == owner, "Only batch owner can accept buy offer");
            }
        } else if (offerType == OfferType.SELL_OFFER) {
            // For sell offers, acceptor should be a valid buyer
            require(
                hasRole(acceptor, Role.PROCESSOR) ||
                hasRole(acceptor, Role.DISTRIBUTOR) ||
                hasRole(acceptor, Role.RETAILER),
                "Invalid buyer role for sell offer"
            );
        } else if (offerType == OfferType.CONTRACT_OFFER) {
            // For contract offers, acceptor should be the farmer
            require(hasRole(acceptor, Role.FARMER), "Only farmers can accept contract offers");
        }
    }

    function _isOfferAvailableToUser(uint256 offerId, address user, Role userRole) internal view returns (bool) {
        Offer storage offer = offers[offerId];

        // Basic checks
        if (offer.status != OfferStatus.OPEN) return false;
        if (block.timestamp >= offer.expiresAt) return false;
        if (offer.creator == user) return false;
        if (offer.counterparty != address(0) && offer.counterparty != user) return false;

        // Role-based checks
        if (offer.offerType == OfferType.BUY_OFFER) {
            // User should be seller (owner of the batch)
            if (offer.batchId != 0) {
                (address owner,,,,,,,,) = productBatch.getBatchMarketInfo(offer.batchId);
                return user == owner;
            }
            return false;
        } else if (offer.offerType == OfferType.SELL_OFFER) {
            // User should be a valid buyer
            return (userRole == Role.PROCESSOR || userRole == Role.DISTRIBUTOR || userRole == Role.RETAILER);
        } else if (offer.offerType == OfferType.CONTRACT_OFFER) {
            // User should be a farmer
            return userRole == Role.FARMER;
        }

        return false;
    }

    function _offerExists(uint256 offerId) internal view returns (bool) {
        return offerId > 0 && offerId < nextOfferId;
    }
}