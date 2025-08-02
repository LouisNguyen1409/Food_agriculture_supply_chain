// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IOfferManager {
    enum OfferStatus {
        OPEN,
        ACCEPTED,
        EXPIRED,
        CANCELLED
    }

    enum OfferType {
        FARMER_TO_PROCESSOR,
        PROCESSOR_TO_DISTRIBUTOR,
        DISTRIBUTOR_TO_RETAILER
    }

    struct OfferInfo {
        uint256 id;
        address offerer;
        uint256 batchId;
        address[] candidates;
        string termsHash;
        uint256 pricePerUnit;
        uint256 quantity;
        uint256 expirationTime;
        OfferStatus status;
        OfferType offerType;
        address acceptedBy;
        uint256 createdAt;
    }

    function createOffer(
        uint256 batchId,
        address[] calldata candidates,
        string calldata termsHash,
        uint256 pricePerUnit,
        uint256 quantity,
        uint256 duration,
        OfferType offerType
    ) external returns (uint256);

    function acceptOffer(uint256 offerId) external;
    function getOfferInfo(uint256 offerId) external view returns (OfferInfo memory);
    function getOfferForClaim(uint256 offerId) external view returns (uint256 batchId, OfferStatus status, address acceptedBy);
}