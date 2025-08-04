import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/pages.css";
import "../styles/retailer.css";

// Contract ABIs
const productBatchABI = [
  "function listForSale(uint256, uint256, uint8) external",
  "function transferOwnership(uint256, address) external",
  "function getBatchInfo(uint256) external view returns (address, address, string, string, uint256, uint256, string, uint8, uint256, uint256)",
  "event BatchListed(uint256 indexed batchId, uint256 price, uint8 tradingMode)"
];

const offerManagerABI = [
  "function createBuyOffer(uint256, uint256, uint256, string, uint256, address) external returns (uint256)",
  "function acceptOffer(uint256) external",
  "function getAvailableOffers(address) external view returns (uint256[])",
  "function getOffersByType(uint8) external view returns (uint256[])",
  "function getOfferInfo(uint256) external view returns (address, address, uint256, uint256, uint256, uint8, uint8, string, uint256, address)",
  "event OfferCreated(uint256 indexed offerId, address indexed creator, uint256 indexed batchId, uint8 offerType)",
  "event OfferAccepted(uint256 indexed offerId, address indexed acceptor, uint256 price)"
];

const registryABI = [
  "function recordTransaction(uint256, address, address, uint256, uint256, string) external returns (uint256)",
  "event TransactionRecorded(uint256 indexed transactionId, uint256 indexed batchId, address indexed buyer, uint256 usdValue, uint256 localValue)"
];

const shipmentTrackerABI = [
  "function confirmDelivery(uint256) external",
  "function createShipment(uint256, uint256, address, address, string, string, string, string) external returns (uint256)",
  "function getUserShipmentsByStatus(address, uint8) external view returns (uint256[])",
  "function shipments(uint256) external view returns (uint256 id, uint256 batchId, uint256 offerId, address sender, address receiver, address shipper, string trackingId, string fromLocation, string toLocation, uint8 status, string metadataHash, uint256 createdAt, uint256 pickedUpAt, uint256 deliveredAt, uint256 confirmedAt)",
  "event DeliveryConfirmed(uint256 indexed shipmentId, address indexed receiver)",
  "event ShipmentCreated(uint256 indexed shipmentId, uint256 indexed batchId, address indexed receiver)"
];

const accessControlABI = [
  "function hasRole(address, uint8) external view returns (bool)",
  "function getRole(address) external view returns (uint8)",
  "function isActive(address) external view returns (bool)",
  "function getStakeholderInfo(address) external view returns (uint8, string, string, string, string, bool, uint256)",
  "function isFullyActive(address) external view returns (bool)"
];

const qrCodeVerifierABI = [
  "function generateQRCode(uint256) external returns (string)",
  "function verifyQRCode(string) external returns (tuple(bool isValid, string productName, string origin, uint256 batchId, address currentOwner, address farmer, uint256 productionDate, uint8 status, uint8 tradingMode, string lastLocation, uint256 lastUpdate, uint256 provenanceRecords, bool isProvenanceComplete))",
  "function verifyQRCodeView(string) external view returns (tuple(bool isValid, string productName, string origin, uint256 batchId, address currentOwner, address farmer, uint256 productionDate, uint8 status, uint8 tradingMode, string lastLocation, uint256 lastUpdate, uint256 provenanceRecords, bool isProvenanceComplete))",
  "function getQRCodeForBatch(uint256) external view returns (string)",
  "function isQRCodeValid(string) external view returns (bool)",
  "function deactivateQRCode(string) external",
  "function getQRAnalytics() external view returns (uint256 totalGenerated, uint256 totalActive, uint256 totalDeactivated)",
  "event QRCodeGenerated(string indexed qrCode, uint256 indexed batchId, address indexed farmer)",
  "event QRCodeVerified(string indexed qrCode, address indexed verifier, bool isValid)",
  "event QRCodeDeactivated(string indexed qrCode, uint256 indexed batchId)"
];

// Contract addresses
const CONTRACT_ADDRESSES = {
  productBatch: process.env.REACT_APP_PRODUCT_BATCH_ADDRESS || "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  offerManager: process.env.REACT_APP_OFFER_MANAGER_ADDRESS || "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  registry: process.env.REACT_APP_REGISTRY_ADDRESS || "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  shipmentTracker: process.env.REACT_APP_SHIPMENT_TRACKER_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
  accessControl: process.env.REACT_APP_ACCESS_CONTROL_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  qrCodeVerifier: process.env.REACT_APP_QR_CODE_VERIFIER_ADDRESS || "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE" // Updated to match error address
};

interface Batch {
  id: number;
  farmer: string;
  currentOwner: string;
  name: string;
  description: string;
  quantity: number;
  basePrice: number;
  originLocation: string;
  status: number;
  createdAt: number;
  lastUpdated: number;
}

interface Offer {
  id: number;
  creator: string;
  counterparty: string;
  batchId: number;
  price: number;
  quantity: number;
  offerType: number;
  status: number;
  terms: string;
  expiresAt: number;
  acceptedBy: string;
}

interface Shipment {
  id: number;
  batchId: number;
  offerId: number;
  sender: string;
  receiver: string;
  shipper: string;
  trackingId: string;
  fromLocation: string;
  toLocation: string;
  status: number;
  metadataHash: string;
  createdAt: number;
  pickedUpAt: number;
  deliveredAt: number;
  confirmedAt: number;
  locationUpdates: string[];
  timestamps: number[];
}

interface VerificationResult {
  isValid: boolean;
  productName: string;
  origin: string;
  batchId: number;
  currentOwner: string;
  farmer: string;
  productionDate: number;
  status: number;
  tradingMode: number;
  lastLocation: string;
  lastUpdate: number;
  provenanceRecords: number;
  isProvenanceComplete: boolean;
}

interface QRAnalytics {
  totalGenerated: number;
  totalActive: number;
  totalDeactivated: number;
}

const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getBatchStatusName = (status: number): string => {
  const statuses = ["CREATED", "LISTED", "OFFERED", "SOLD", "SHIPPED", "RECEIVED", "PROCESSED", "QUALITY_CHECKED", "FINALIZED"];
  return statuses[status] || "UNKNOWN";
};

const getOfferStatusName = (status: number): string => {
  const statuses = ["OPEN", "ACCEPTED", "EXPIRED", "CANCELLED"];
  return statuses[status] || "UNKNOWN";
};

const getOfferTypeName = (type: number): string => {
  const types = ["BUY_OFFER", "SELL_OFFER", "CONTRACT_OFFER"];
  return types[type] || "UNKNOWN";
};

const getShipmentStatusName = (status: number): string => {
  const statuses = ["CREATED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CONFIRMED"];
  return statuses[status] || "UNKNOWN";
};

const Retailer = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
  const [batches, setBatches] = useState<Batch[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [activeTab, setActiveTab] = useState("trading");
  
  // Role checking states
  const [userRole, setUserRole] = useState<number>(0);
  const [isUserActive, setIsUserActive] = useState<boolean>(false);
  const [hasRetailerRole, setHasRetailerRole] = useState<boolean>(false);
  
  // Form states
  const [listForSale, setListForSale] = useState({
    batchId: "",
    askingPrice: "",
    tradingMode: "0"
  });
  
  const [createBuyOffer, setCreateBuyOffer] = useState({
    batchId: "",
    offeredPrice: "",
    quantity: "",
    terms: "",
    duration: "",
    seller: ""
  });
  
  const [createShipment, setCreateShipment] = useState({
    batchId: "",
    offerId: "",
    receiver: "",
    shipper: "",
    trackingId: "",
    fromLocation: "",
    toLocation: "",
    metadataHash: ""
  });
  
  const [transferOwnership, setTransferOwnership] = useState({
    batchId: "",
    newOwner: ""
  });
  
  const [recordTransaction, setRecordTransaction] = useState({
    batchId: "",
    buyer: "",
    price: "",
    quantity: ""
  });

  // QR Code related states
  const [qrCodes, setQrCodes] = useState<{[batchId: number]: string}>({});
  const [verificationResults, setVerificationResults] = useState<{[qrCode: string]: VerificationResult}>({});
  const [qrAnalytics, setQrAnalytics] = useState<QRAnalytics>({
    totalGenerated: 0,
    totalActive: 0,
    totalDeactivated: 0
  });
  
  const [generateQRCode, setGenerateQRCode] = useState({
    batchId: ""
  });
  
  const [verifyQRCode, setVerifyQRCode] = useState({
    qrCode: ""
  });
  
  const [deactivateQRCode, setDeactivateQRCode] = useState({
    qrCode: ""
  });

  // QR Code permission state
  const [hasQRCodePermission, setHasQRCodePermission] = useState<boolean>(false);

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            setIsConnected(true);
            await loadData();
          }
        } catch (error) {
          console.error("Error checking connection:", error);
        }
      }
    };

    checkConnection();

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setIsConnected(true);
          loadData();
        } else {
          setAccount("");
          setIsConnected(false);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (isConnected && account) {
      loadData();
    }
  }, [account, isConnected]);

  const loadData = async () => {
    if (!isConnected || !account) return;
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const productBatchContract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      const offerManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.offerManager,
        offerManagerABI,
        signer
      );
      
      const shipmentTrackerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.shipmentTracker,
        shipmentTrackerABI,
        signer
      );
      
      const accessControlContract = new ethers.Contract(
        CONTRACT_ADDRESSES.accessControl,
        accessControlABI,
        signer
      );
      
      await checkUserRole(accessControlContract);
      await loadBatches(productBatchContract);
      await loadOffers(offerManagerContract);
      await loadShipments(shipmentTrackerContract);
      await loadQRAnalytics();
      await loadQRCodesForBatches();
      await checkQRCodePermission();
      
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const checkUserRole = async (contract: ethers.Contract) => {
    try {
      const role = await contract.getRole(account);
      const isActive = await contract.isFullyActive(account);
      const hasRetailer = await contract.hasRole(account, 5); // RETAILER role = 5
      
      setUserRole(Number(role));
      setIsUserActive(isActive);
      setHasRetailerRole(hasRetailer);
      
    } catch (error) {
      console.error("Error checking user role:", error);
      setUserRole(0);
      setIsUserActive(false);
      setHasRetailerRole(false);
    }
  };

  const loadBatches = async (contract: ethers.Contract) => {
    try {
      const batchIds = [1, 2, 3]; // Placeholder
      const batchData: Batch[] = [];
      
      for (const batchId of batchIds) {
        try {
          const batchInfo = await contract.getBatchInfo(batchId);
          batchData.push({
            id: batchId,
            farmer: batchInfo[0],
            currentOwner: batchInfo[1],
            name: batchInfo[2],
            description: batchInfo[3],
            quantity: Number(batchInfo[4]),
            basePrice: Number(batchInfo[5]),
            originLocation: batchInfo[6],
            status: Number(batchInfo[7]),
            createdAt: Number(batchInfo[8]),
            lastUpdated: Number(batchInfo[9])
          });
        } catch (error) {
          console.log(`Batch ${batchId} not found`);
        }
      }
      
      setBatches(batchData);
    } catch (error) {
      console.error("Error loading batches:", error);
    }
  };

  const loadOffers = async (contract: ethers.Contract) => {
    try {
      // Get all buy offers (offers that processors can accept)
      const buyOfferIds = await contract.getOffersByType(0); // BUY_OFFER = 0
      const sellOfferIds = await contract.getOffersByType(1); // SELL_OFFER = 1
      
      // Combine all offer IDs
      const allOfferIds = [...buyOfferIds, ...sellOfferIds];
      const offerData: Offer[] = [];
      
      for (const offerId of allOfferIds) {
        try {
          const offerInfo = await contract.getOfferInfo(offerId);
          offerData.push({
            id: Number(offerId),
            creator: offerInfo[0],
            counterparty: offerInfo[1],
            batchId: Number(offerInfo[2]),
            price: Number(offerInfo[3]),
            quantity: Number(offerInfo[4]),
            offerType: Number(offerInfo[5]),
            status: Number(offerInfo[6]),
            terms: offerInfo[7],
            expiresAt: Number(offerInfo[8]),
            acceptedBy: offerInfo[9]
          });
        } catch (error) {
          console.log(`Offer ${offerId} not found`);
        }
      }
      
      setOffers(offerData);
    } catch (error) {
      console.error("Error loading offers:", error);
    }
  };

  const loadShipments = async (contract: ethers.Contract) => {
    try {
      const deliveredShipments = await contract.getUserShipmentsByStatus(account, 3); // DELIVERED
      
      const uniqueShipmentIds = new Set<number>();
      const shipmentData: Shipment[] = [];
      
      const addShipmentIfUnique = async (shipmentId: number, status: number) => {
        if (!uniqueShipmentIds.has(shipmentId)) {
          uniqueShipmentIds.add(shipmentId);
          
          try {
            const shipmentDetails = await contract.shipments(shipmentId);
            
            const shipment: Shipment = {
              id: shipmentId,
              batchId: Number(shipmentDetails.batchId),
              offerId: Number(shipmentDetails.offerId),
              sender: shipmentDetails.sender,
              receiver: shipmentDetails.receiver,
              shipper: shipmentDetails.shipper,
              trackingId: shipmentDetails.trackingId || `TRK${shipmentId}`,
              fromLocation: shipmentDetails.fromLocation || "",
              toLocation: shipmentDetails.toLocation || "",
              status: Number(shipmentDetails.status),
              metadataHash: shipmentDetails.metadataHash || "",
              createdAt: Number(shipmentDetails.createdAt),
              pickedUpAt: Number(shipmentDetails.pickedUpAt),
              deliveredAt: Number(shipmentDetails.deliveredAt),
              confirmedAt: Number(shipmentDetails.confirmedAt),
              locationUpdates: [],
              timestamps: []
            };
            
            shipmentData.push(shipment);
          } catch (error) {
            console.log(`Failed to fetch details for shipment ${shipmentId}:`, error);
            const shipment: Shipment = {
              id: shipmentId,
              batchId: 0,
              offerId: 0,
              sender: "",
              receiver: "",
              shipper: account,
              trackingId: `TRK${shipmentId}`,
              fromLocation: "",
              toLocation: "",
              status: status,
              metadataHash: "",
              createdAt: 0,
              pickedUpAt: 0,
              deliveredAt: 0,
              confirmedAt: 0,
              locationUpdates: [],
              timestamps: []
            };
            shipmentData.push(shipment);
          }
        }
      };
      
      for (const id of deliveredShipments) {
        await addShipmentIfUnique(Number(id), 3); // DELIVERED
      }
      
      setShipments(shipmentData);
    } catch (error) {
      console.error("Error loading shipments:", error);
    }
  };

  const handleListForSale = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      const tx = await contract.listForSale(
        parseInt(listForSale.batchId),
        ethers.parseEther(listForSale.askingPrice),
        parseInt(listForSale.tradingMode)
      );
      
      await tx.wait();
      
      setSuccess("Batch listed for sale successfully!");
      setListForSale({
        batchId: "",
        askingPrice: "",
        tradingMode: "0"
      });
      await loadData();
      
    } catch (error) {
      console.error("Error listing batch for sale:", error);
      setError("Failed to list batch for sale. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBuyOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.offerManager,
        offerManagerABI,
        signer
      );
      
      // Validate seller address
      let sellerAddress = createBuyOffer.seller.trim();
      if (!ethers.isAddress(sellerAddress)) {
        setError("Invalid seller address. Please enter a valid Ethereum address starting with 0x");
        setLoading(false);
        return;
      }
      sellerAddress = ethers.getAddress(sellerAddress);
      
      const tx = await contract.createBuyOffer(
        parseInt(createBuyOffer.batchId),
        ethers.parseEther(createBuyOffer.offeredPrice),
        parseInt(createBuyOffer.quantity),
        createBuyOffer.terms,
        parseInt(createBuyOffer.duration),
        sellerAddress
      );
      
      await tx.wait();
      
      setSuccess("Buy offer created successfully!");
      setCreateBuyOffer({
        batchId: "",
        offeredPrice: "",
        quantity: "",
        terms: "",
        duration: "",
        seller: ""
      });
      await loadData();
      
    } catch (error) {
      console.error("Error creating buy offer:", error);
      setError("Failed to create buy offer. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.shipmentTracker,
        shipmentTrackerABI,
        signer
      );
      
      // Validate addresses
      let receiverAddress = createShipment.receiver.trim();
      let shipperAddress = createShipment.shipper.trim();
      
      if (!ethers.isAddress(receiverAddress)) {
        setError("Invalid receiver address. Please enter a valid Ethereum address starting with 0x");
        setLoading(false);
        return;
      }
      receiverAddress = ethers.getAddress(receiverAddress);
      
      // Shipper can be empty (address(0)) for self-delivery
      if (shipperAddress && !ethers.isAddress(shipperAddress)) {
        setError("Invalid shipper address. Please enter a valid Ethereum address starting with 0x or leave empty for self-delivery");
        setLoading(false);
        return;
      }
      
      const shipper = shipperAddress ? ethers.getAddress(shipperAddress) : ethers.ZeroAddress;
      
      const tx = await contract.createShipment(
        parseInt(createShipment.batchId),
        parseInt(createShipment.offerId),
        receiverAddress,
        shipper,
        createShipment.trackingId,
        createShipment.fromLocation,
        createShipment.toLocation,
        createShipment.metadataHash
      );
      
      await tx.wait();
      
      setSuccess("Shipment created successfully!");
      setCreateShipment({
        batchId: "",
        offerId: "",
        receiver: "",
        shipper: "",
        trackingId: "",
        fromLocation: "",
        toLocation: "",
        metadataHash: ""
      });
      await loadData();
      
    } catch (error) {
      console.error("Error creating shipment:", error);
      setError("Failed to create shipment. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      // Validate new owner address
      let newOwnerAddress = transferOwnership.newOwner.trim();
      if (!ethers.isAddress(newOwnerAddress)) {
        setError("Invalid new owner address. Please enter a valid Ethereum address starting with 0x");
        setLoading(false);
        return;
      }
      newOwnerAddress = ethers.getAddress(newOwnerAddress);
      
      // Prevent self-transfer
      if (newOwnerAddress.toLowerCase() === account.toLowerCase()) {
        setError("Cannot transfer ownership to yourself");
        setLoading(false);
        return;
      }
      
      console.log("Transferring ownership:", {
        batchId: transferOwnership.batchId,
        currentOwner: account,
        newOwner: newOwnerAddress
      });
      
      const tx = await contract.transferOwnership(
        parseInt(transferOwnership.batchId),
        newOwnerAddress
      );
      
      await tx.wait();
      
      setSuccess("Ownership transferred successfully!");
      setTransferOwnership({
        batchId: "",
        newOwner: ""
      });
      await loadData();
      
    } catch (error) {
      console.error("Error transferring ownership:", error);
      setError("Failed to transfer ownership. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptOffer = async (offerId: number) => {
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.offerManager,
        offerManagerABI,
        signer
      );
      
      const tx = await contract.acceptOffer(offerId);
      await tx.wait();
      
      setSuccess("Offer accepted successfully!");
      await loadData();
      
    } catch (error) {
      console.error("Error accepting offer:", error);
      setError("Failed to accept offer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async (shipmentId: number) => {
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.shipmentTracker,
        shipmentTrackerABI,
        signer
      );
      
      const tx = await contract.confirmDelivery(shipmentId);
      await tx.wait();
      
      setSuccess("Delivery confirmed successfully!");
      await loadData();
      
    } catch (error) {
      console.error("Error confirming delivery:", error);
      setError("Failed to confirm delivery. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.registry,
        registryABI,
        signer
      );
      
      // Validate buyer address
      let buyerAddress = recordTransaction.buyer.trim();
      if (!ethers.isAddress(buyerAddress)) {
        setError("Invalid buyer address. Please enter a valid Ethereum address starting with 0x");
        setLoading(false);
        return;
      }
      buyerAddress = ethers.getAddress(buyerAddress);
      
      const tx = await contract.recordTransaction(
        parseInt(recordTransaction.batchId),
        account, // seller (current user)
        buyerAddress,
        ethers.parseEther(recordTransaction.price),
        parseInt(recordTransaction.quantity),
        "RETAILER_SALE"
      );
      
      await tx.wait();
      
      setSuccess("Transaction recorded successfully!");
      setRecordTransaction({
        batchId: "",
        buyer: "",
        price: "",
        quantity: ""
      });
      await loadData();
      
    } catch (error) {
      console.error("Error recording transaction:", error);
      setError("Failed to record transaction. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  // QR Code related functions
  const handleGenerateQRCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // First, check if user has the required role
      const accessControlContract = new ethers.Contract(
        CONTRACT_ADDRESSES.accessControl,
        accessControlABI,
        signer
      );
      
      const userRole = await accessControlContract.getRole(account);
      const isActive = await accessControlContract.isFullyActive(account);
      
      console.log("User role check:", {
        account,
        userRole: Number(userRole),
        isActive,
        hasRetailerRole: Number(userRole) === 5
      });
      
      // Check if batch exists
      const productBatchContract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      try {
        const batchInfo = await productBatchContract.getBatchInfo(parseInt(generateQRCode.batchId));
        console.log("Batch info:", {
          batchId: generateQRCode.batchId,
          farmer: batchInfo[0],
          currentOwner: batchInfo[1],
          name: batchInfo[2]
        });
        
        if (batchInfo[0] === ethers.ZeroAddress) {
          setError("The specified batch does not exist. Please check the batch ID.");
          setLoading(false);
          return;
        }
      } catch (batchError) {
        console.error("Error checking batch:", batchError);
        setError("The specified batch does not exist or cannot be accessed. Please check the batch ID.");
        setLoading(false);
        return;
      }
      
      // Now try to generate QR code
      const qrContract = new ethers.Contract(
        CONTRACT_ADDRESSES.qrCodeVerifier,
        qrCodeVerifierABI,
        signer
      );
      
      const qrCode = await qrContract.generateQRCode(parseInt(generateQRCode.batchId));
      
      setSuccess(`QR Code generated successfully: ${qrCode}`);
      setGenerateQRCode({ batchId: "" });
      
      // Update QR codes mapping
      setQrCodes(prev => ({
        ...prev,
        [parseInt(generateQRCode.batchId)]: qrCode
      }));
      
      await loadQRAnalytics();
      
    } catch (error: any) {
      console.error("Error generating QR code:", error);
      if (error.message && error.message.includes("could not decode result data")) {
        setError("QR Code Verifier contract is not deployed or not accessible. Please check the contract address.");
      } else if (error.message && error.message.includes("Unauthorized")) {
        setError("You don't have permission to generate QR codes. Only authorized roles (FARMER, PROCESSOR, DISTRIBUTOR, RETAILER) can generate QR codes.");
      } else if (error.message && error.message.includes("Batch does not exist")) {
        setError("The specified batch does not exist. Please check the batch ID.");
      } else if (error.message && error.message.includes("execution reverted")) {
        setError("Transaction failed. This could be due to insufficient permissions or the batch not existing. Please check your role and the batch ID.");
      } else {
        setError("Failed to generate QR code. Please check your input and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyQRCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.qrCodeVerifier,
        qrCodeVerifierABI,
        signer
      );
      
      const result = await contract.verifyQRCode(verifyQRCode.qrCode);
      
      const verificationResult: VerificationResult = {
        isValid: result.isValid,
        productName: result.productName,
        origin: result.origin,
        batchId: Number(result.batchId),
        currentOwner: result.currentOwner,
        farmer: result.farmer,
        productionDate: Number(result.productionDate),
        status: Number(result.status),
        tradingMode: Number(result.tradingMode),
        lastLocation: result.lastLocation,
        lastUpdate: Number(result.lastUpdate),
        provenanceRecords: Number(result.provenanceRecords),
        isProvenanceComplete: result.isProvenanceComplete
      };
      
      setVerificationResults(prev => ({
        ...prev,
        [verifyQRCode.qrCode]: verificationResult
      }));
      
      setSuccess(`QR Code verification completed. Valid: ${verificationResult.isValid}`);
      setVerifyQRCode({ qrCode: "" });
      
    } catch (error: any) {
      console.error("Error verifying QR code:", error);
      if (error.message && error.message.includes("could not decode result data")) {
        setError("QR Code Verifier contract is not deployed or not accessible. Please check the contract address.");
      } else {
        setError("Failed to verify QR code. Please check your input and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateQRCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.qrCodeVerifier,
        qrCodeVerifierABI,
        signer
      );
      
      await contract.deactivateQRCode(deactivateQRCode.qrCode);
      
      setSuccess("QR Code deactivated successfully!");
      setDeactivateQRCode({ qrCode: "" });
      
      // Remove from verification results
      setVerificationResults(prev => {
        const newResults = { ...prev };
        delete newResults[deactivateQRCode.qrCode];
        return newResults;
      });
      
      await loadQRAnalytics();
      
    } catch (error: any) {
      console.error("Error deactivating QR code:", error);
      if (error.message && error.message.includes("could not decode result data")) {
        setError("QR Code Verifier contract is not deployed or not accessible. Please check the contract address.");
      } else if (error.message && error.message.includes("Unauthorized")) {
        setError("You don't have permission to deactivate this QR code. Only admins or the QR code creator can deactivate it.");
      } else if (error.message && error.message.includes("QR code not active")) {
        setError("This QR code is already deactivated.");
      } else {
        setError("Failed to deactivate QR code. Please check your input and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadQRAnalytics = async () => {
    if (!isConnected || !account) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.qrCodeVerifier,
        qrCodeVerifierABI,
        provider
      );
      
      const analytics = await contract.getQRAnalytics();
      
      setQrAnalytics({
        totalGenerated: Number(analytics.totalGenerated),
        totalActive: Number(analytics.totalActive),
        totalDeactivated: Number(analytics.totalDeactivated)
      });
      
    } catch (error) {
      console.error("Error loading QR analytics:", error);
      // Set default values if contract is not deployed
      setQrAnalytics({
        totalGenerated: 0,
        totalActive: 0,
        totalDeactivated: 0
      });
    }
  };

  const loadQRCodesForBatches = async () => {
    if (!isConnected || !account) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.qrCodeVerifier,
        qrCodeVerifierABI,
        provider
      );
      
      const qrCodesMap: {[batchId: number]: string} = {};
      
      // Check for QR codes for existing batches
      for (const batch of batches) {
        try {
          const qrCode = await contract.getQRCodeForBatch(batch.id);
          if (qrCode && qrCode !== "") {
            qrCodesMap[batch.id] = qrCode;
          }
        } catch (error) {
          // No QR code exists for this batch
        }
      }
      
      setQrCodes(qrCodesMap);
      
    } catch (error) {
      console.error("Error loading QR codes:", error);
      // Set empty map if contract is not deployed
      setQrCodes({});
    }
  };

  const checkQRCodePermission = async () => {
    if (!isConnected || !account) return false;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accessControlContract = new ethers.Contract(
        CONTRACT_ADDRESSES.accessControl,
        accessControlABI,
        provider
      );
      
      const userRole = await accessControlContract.getRole(account);
      const isActive = await accessControlContract.isFullyActive(account);
      
      // Check if user has any of the required roles: FARMER(1), PROCESSOR(2), DISTRIBUTOR(3), RETAILER(5)
      const hasPermission = (Number(userRole) === 1 || Number(userRole) === 2 || Number(userRole) === 3 || Number(userRole) === 5) && isActive;
      
      setHasQRCodePermission(hasPermission);
      return hasPermission;
    } catch (error) {
      console.error("Error checking QR code permission:", error);
      return false;
    }
  };

  if (!isConnected) {
    return (
      <div className="retailer-page">
        <div className="connection-message">
          <h2>Retailer Dashboard</h2>
          <p>Please connect your wallet to access the Retailer dashboard.</p>
        </div>
      </div>
    );
  }

  if (!hasRetailerRole || !isUserActive) {
    return (
      <div className="retailer-page">
        <div className="page-header">
          <h1>Retailer Dashboard</h1>
          <p>Welcome, {formatAddress(account)}</p>
        </div>

        <div className="role-status-section">
          <div className="role-status-card">
            <h2>Role Status</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Role:</span>
                <span className={`status-value ${userRole === 5 ? 'success' : 'error'}`}>
                  {userRole === 5 ? 'RETAILER' : userRole === 0 ? 'NONE' : `ROLE_${userRole}`}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Active:</span>
                <span className={`status-value ${isUserActive ? 'success' : 'error'}`}>
                  {isUserActive ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Retailer Permission:</span>
                <span className={`status-value ${hasRetailerRole ? 'success' : 'error'}`}>
                  {hasRetailerRole ? 'GRANTED' : 'DENIED'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Account:</span>
                <span className="status-value">
                  {formatAddress(account)}
                </span>
              </div>
            </div>
            
            <div className="role-instructions">
              <h3>How to Get Retailer Role</h3>
              <p>To use the Retailer dashboard, you need to be granted the RETAILER role by an admin.</p>
              <ol>
                <li>Contact the system administrator</li>
                <li>Provide your wallet address: <code>{account}</code></li>
                <li>Request the RETAILER role to be assigned</li>
                <li>Once granted, refresh this page</li>
              </ol>
              
              <div className="admin-actions">
                <h4>For Administrators</h4>
                <p>To grant the RETAILER role to this user:</p>
                <code>grantRole({account}, 5)</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="retailer-page">
      <div className="page-header">
        <h1>Retailer Dashboard</h1>
        <p>Welcome, {formatAddress(account)}</p>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError("")}>✕</button>
        </div>
      )}

      {success && (
        <div className="success-message">
          <p>{success}</p>
          <button onClick={() => setSuccess("")}>✕</button>
        </div>
      )}

      <div className="tab-navigation">
        <button 
          className={activeTab === "trading" ? "active" : ""}
          onClick={() => setActiveTab("trading")}
        >
          Trading
        </button>
        <button 
          className={activeTab === "offers" ? "active" : ""}
          onClick={() => setActiveTab("offers")}
        >
          Offers
        </button>
        <button 
          className={activeTab === "shipments" ? "active" : ""}
          onClick={() => setActiveTab("shipments")}
        >
          Shipments
        </button>
        <button 
          className={activeTab === "transactions" ? "active" : ""}
          onClick={() => setActiveTab("transactions")}
        >
          Transactions
        </button>
        <button 
          className={activeTab === "qrcodes" ? "active" : ""}
          onClick={() => setActiveTab("qrcodes")}
        >
          QR Codes
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "trading" && (
          <div className="trading-tab">
            <div className="section-header">
              <h2>List for Sale</h2>
            </div>
            
            <form onSubmit={handleListForSale} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={listForSale.batchId}
                    onChange={(e) => setListForSale({...listForSale, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Asking Price (ETH):</label>
                  <input
                    type="number"
                    step="0.001"
                    value={listForSale.askingPrice}
                    onChange={(e) => setListForSale({...listForSale, askingPrice: e.target.value})}
                    placeholder="0.05"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Trading Mode:</label>
                  <select
                    value={listForSale.tradingMode}
                    onChange={(e) => setListForSale({...listForSale, tradingMode: e.target.value})}
                  >
                    <option value="0">Auction</option>
                    <option value="1">Fixed Price</option>
                    <option value="2">Negotiable</option>
                  </select>
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Listing..." : "List for Sale"}
              </button>
            </form>

            <div className="section-header">
              <h2>Create Shipment</h2>
            </div>
            
            <form onSubmit={handleCreateShipment} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={createShipment.batchId}
                    onChange={(e) => setCreateShipment({...createShipment, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Offer ID:</label>
                  <input
                    type="number"
                    value={createShipment.offerId}
                    onChange={(e) => setCreateShipment({...createShipment, offerId: e.target.value})}
                    placeholder="0 for direct shipment"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Receiver Address:</label>
                  <input
                    type="text"
                    value={createShipment.receiver}
                    onChange={(e) => setCreateShipment({...createShipment, receiver: e.target.value})}
                    placeholder="0x1234...5678"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Shipper Address (optional):</label>
                  <input
                    type="text"
                    value={createShipment.shipper}
                    onChange={(e) => setCreateShipment({...createShipment, shipper: e.target.value})}
                    placeholder="0x1234...5678 (leave empty for self-delivery)"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tracking ID:</label>
                  <input
                    type="text"
                    value={createShipment.trackingId}
                    onChange={(e) => setCreateShipment({...createShipment, trackingId: e.target.value})}
                    placeholder="TRK123456"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>From Location:</label>
                  <input
                    type="text"
                    value={createShipment.fromLocation}
                    onChange={(e) => setCreateShipment({...createShipment, fromLocation: e.target.value})}
                    placeholder="e.g., Sydney, Australia"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>To Location:</label>
                  <input
                    type="text"
                    value={createShipment.toLocation}
                    onChange={(e) => setCreateShipment({...createShipment, toLocation: e.target.value})}
                    placeholder="e.g., Melbourne, Australia"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Metadata Hash (optional):</label>
                  <input
                    type="text"
                    value={createShipment.metadataHash}
                    onChange={(e) => setCreateShipment({...createShipment, metadataHash: e.target.value})}
                    placeholder="IPFS hash for additional data"
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Creating..." : "Create Shipment"}
              </button>
            </form>

            <div className="section-header">
              <h2>Transfer Ownership</h2>
            </div>
            
            <form onSubmit={handleTransferOwnership} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={transferOwnership.batchId}
                    onChange={(e) => setTransferOwnership({...transferOwnership, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>New Owner Address:</label>
                  <input
                    type="text"
                    value={transferOwnership.newOwner}
                    onChange={(e) => setTransferOwnership({...transferOwnership, newOwner: e.target.value})}
                    placeholder="0x1234...5678"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Transferring..." : "Transfer Ownership"}
              </button>
            </form>

            <div className="section-header">
              <h2>My Batches</h2>
            </div>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Quantity</th>
                    <th>Price (ETH)</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Current Owner</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.id}</td>
                      <td>{batch.name}</td>
                      <td>{batch.quantity}</td>
                      <td>{ethers.formatEther(batch.basePrice.toString())}</td>
                      <td>{getBatchStatusName(batch.status)}</td>
                      <td>{batch.originLocation}</td>
                      <td>{formatAddress(batch.currentOwner)}</td>
                      <td>
                        {batch.currentOwner.toLowerCase() === account.toLowerCase() && (
                          <>
                            <button 
                              onClick={() => {
                                setListForSale({ ...listForSale, batchId: batch.id.toString() });
                                setSuccess(`Prepared listing form for Batch #${batch.id}. Enter price and submit.`);
                              }}
                              className="action-button"
                            >
                              List
                            </button>
                            <button 
                              onClick={() => {
                                setCreateShipment({ ...createShipment, batchId: batch.id.toString() });
                                setSuccess(`Prepared shipment form for Batch #${batch.id}. Enter details and submit.`);
                              }}
                              className="action-button"
                            >
                              Create Shipment
                            </button>
                            <button 
                              onClick={() => {
                                setTransferOwnership({ ...transferOwnership, batchId: batch.id.toString() });
                                setSuccess(`Prepared transfer form for Batch #${batch.id}. Enter new owner address and submit.`);
                              }}
                              className="action-button"
                            >
                              Transfer
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "offers" && (
          <div className="offers-tab">
            <div className="section-header">
              <h2>Create Buy Offer</h2>
            </div>
            
            <form onSubmit={handleCreateBuyOffer} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={createBuyOffer.batchId}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Offered Price (ETH):</label>
                  <input
                    type="number"
                    step="0.001"
                    value={createBuyOffer.offeredPrice}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, offeredPrice: e.target.value})}
                    placeholder="0.05"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity:</label>
                  <input
                    type="number"
                    value={createBuyOffer.quantity}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, quantity: e.target.value})}
                    placeholder="Amount to buy"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Seller Address:</label>
                  <input
                    type="text"
                    value={createBuyOffer.seller}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, seller: e.target.value})}
                    placeholder="0x1234...5678"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Terms:</label>
                  <input
                    type="text"
                    value={createBuyOffer.terms}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, terms: e.target.value})}
                    placeholder="Payment terms, delivery conditions"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Duration (seconds):</label>
                  <input
                    type="number"
                    value={createBuyOffer.duration}
                    onChange={(e) => setCreateBuyOffer({...createBuyOffer, duration: e.target.value})}
                    placeholder="86400 (24 hours)"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Creating..." : "Create Buy Offer"}
              </button>
            </form>

            <div className="section-header">
              <h2>Available Offers</h2>
            </div>
            <p>Showing all open offers that you can accept based on your role.</p>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Batch ID</th>
                    <th>Creator</th>
                    <th>Price (ETH)</th>
                    <th>Quantity</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((offer) => (
                    <tr key={offer.id}>
                      <td>{offer.id}</td>
                      <td>{getOfferTypeName(offer.offerType)}</td>
                      <td>{offer.batchId}</td>
                      <td>{formatAddress(offer.creator)}</td>
                      <td>{ethers.formatEther(offer.price.toString())}</td>
                      <td>{offer.quantity}</td>
                      <td>{getOfferStatusName(offer.status)}</td>
                      <td>{new Date(offer.expiresAt * 1000).toLocaleString()}</td>
                      <td>
                        {offer.status === 0 && offer.creator.toLowerCase() !== account.toLowerCase() && (
                          <button 
                            onClick={() => handleAcceptOffer(offer.id)}
                            className="action-button"
                            disabled={loading}
                          >
                            Accept
                          </button>
                        )}
                        {offer.creator.toLowerCase() === account.toLowerCase() && (
                          <span className="own-offer">Your Offer</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {offers.length === 0 && (
                <p className="no-data-message">No offers available. Create a buy offer above to get started.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "shipments" && (
          <div className="shipments-tab">
            <div className="section-header">
              <h2>Confirm Delivery</h2>
            </div>
            <p>Select a delivered shipment below to confirm receipt.</p>
            
            <div className="section-header">
              <h2>Delivered Shipments</h2>
            </div>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Batch ID</th>
                    <th>Tracking ID</th>
                    <th>Status</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>{shipment.id}</td>
                      <td>{shipment.batchId}</td>
                      <td>{shipment.trackingId}</td>
                      <td>{getShipmentStatusName(shipment.status)}</td>
                      <td>{shipment.fromLocation || "(empty)"}</td>
                      <td>{shipment.toLocation || "(empty)"}</td>
                      <td>
                        {shipment.status === 3 && shipment.receiver.toLowerCase() === account.toLowerCase() && (
                          <button 
                            onClick={() => handleConfirmDelivery(shipment.id)}
                            className="action-button"
                            disabled={loading}
                          >
                            Confirm Delivery
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="transactions-tab">
            <div className="section-header">
              <h2>Record Transaction</h2>
            </div>
            
            <form onSubmit={handleRecordTransaction} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={recordTransaction.batchId}
                    onChange={(e) => setRecordTransaction({...recordTransaction, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Buyer Address:</label>
                  <input
                    type="text"
                    value={recordTransaction.buyer}
                    onChange={(e) => setRecordTransaction({...recordTransaction, buyer: e.target.value})}
                    placeholder="0x1234...5678"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Price (ETH):</label>
                  <input
                    type="number"
                    step="0.001"
                    value={recordTransaction.price}
                    onChange={(e) => setRecordTransaction({...recordTransaction, price: e.target.value})}
                    placeholder="0.05"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Quantity:</label>
                  <input
                    type="number"
                    value={recordTransaction.quantity}
                    onChange={(e) => setRecordTransaction({...recordTransaction, quantity: e.target.value})}
                    placeholder="Amount sold"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Recording..." : "Record Transaction"}
              </button>
            </form>

            <div className="section-header">
              <h2>Transaction History</h2>
            </div>
            <p>Transaction history will be displayed here once transactions are recorded.</p>
          </div>
        )}

        {activeTab === "qrcodes" && (
          <div className="qrcodes-tab">
            <div className="section-header">
              <h2>QR Code Management</h2>
              <p className="contract-status-note">
                Note: QR Code functionality requires the QRCodeVerifier contract to be deployed. 
                If you encounter errors, please ensure the contract is deployed at the correct address.
              </p>
            </div>

            {!hasQRCodePermission && (
              <div className="permission-warning">
                <h3>⚠️ Permission Required</h3>
                <p>You need to have one of the following roles to generate QR codes:</p>
                <ul>
                  <li>FARMER (Role 1)</li>
                  <li>PROCESSOR (Role 2)</li>
                  <li>DISTRIBUTOR (Role 3)</li>
                  <li>RETAILER (Role 5)</li>
                </ul>
                <p>Your current role: <strong>{userRole === 1 ? 'FARMER' : userRole === 2 ? 'PROCESSOR' : userRole === 3 ? 'DISTRIBUTOR' : userRole === 5 ? 'RETAILER' : `ROLE_${userRole}`}</strong></p>
                <p>Account active: <strong>{isUserActive ? 'YES' : 'NO'}</strong></p>
                <button 
                  onClick={async () => {
                    try {
                      const provider = new ethers.BrowserProvider(window.ethereum);
                      const signer = await provider.getSigner();
                      const userAddress = await signer.getAddress();
                      
                      // List of possible QRCodeVerifier addresses to check
                      const possibleAddresses = [
                        "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", // Current address
                        "0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE", // Address from error
                        "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707", // StakeholderManager address (for comparison)
                        "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853", // ProductBatch address (for comparison)
                      ];
                      
                      console.log("Checking multiple possible QRCodeVerifier addresses...");
                      
                      for (const address of possibleAddresses) {
                        try {
                          const qrContract = new ethers.Contract(
                            address,
                            qrCodeVerifierABI,
                            provider
                          );
                          
                          // Try to call a simple function to check if it's a QRCodeVerifier
                          const totalQRCodes = await qrContract.totalQRCodes();
                          const hasRole = await qrContract.hasRole(userAddress, 5);
                          
                          console.log(`Address ${address}:`, {
                            totalQRCodes: totalQRCodes.toString(),
                            hasRetailerRole: hasRole,
                            isQRCodeVerifier: true
                          });
                          
                          if (hasRole) {
                            alert(`Found QRCodeVerifier with RETAILER role at: ${address}\n\nThis might be the correct address to use!`);
                            return;
                          }
                          
                        } catch (error) {
                          console.log(`Address ${address}: Not a QRCodeVerifier or not accessible`);
                        }
                      }
                      
                      alert("Checked all addresses. No QRCodeVerifier found with RETAILER role for your account.");
                      
                    } catch (error: any) {
                      console.error("Error checking addresses:", error);
                      alert("Error checking addresses: " + error.message);
                    }
                  }}
                  className="debug-button"
                  style={{ marginLeft: '10px' }}
                >
                  Find Correct QRCodeVerifier Address
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const provider = new ethers.BrowserProvider(window.ethereum);
                      const signer = await provider.getSigner();
                      const userAddress = await signer.getAddress();
                      
                      // Check role in QRCodeVerifier contract
                      const qrContract = new ethers.Contract(
                        CONTRACT_ADDRESSES.qrCodeVerifier,
                        qrCodeVerifierABI,
                        provider
                      );
                      
                      // First, let's check if the contract exists and is accessible
                      try {
                        const totalQRCodes = await qrContract.totalQRCodes();
                        console.log("Contract is accessible, total QR codes:", totalQRCodes.toString());
                      } catch (contractError) {
                        console.error("Contract access error:", contractError);
                        alert("Error: Contract at " + CONTRACT_ADDRESSES.qrCodeVerifier + " is not accessible. It may not be deployed or the address is incorrect.");
                        return;
                      }
                      
                      const hasRole = await qrContract.hasRole(userAddress, 5); // Check for RETAILER role
                      const isActive = await qrContract.isActive(userAddress);
                      const userRole = await qrContract.getRole(userAddress);
                      
                      // Also check roles in other contracts for comparison
                      const accessControlContract = new ethers.Contract(
                        CONTRACT_ADDRESSES.accessControl,
                        accessControlABI,
                        provider
                      );
                      
                      const otherContractRole = await accessControlContract.getRole(userAddress);
                      const otherContractActive = await accessControlContract.isActive(userAddress);
                      
                      console.log("Comprehensive Role Check:", {
                        address: userAddress,
                        qrCodeVerifierAddress: CONTRACT_ADDRESSES.qrCodeVerifier,
                        qrCodeVerifier: {
                          hasRetailerRole: hasRole,
                          isActive: isActive,
                          userRole: Number(userRole)
                        },
                        otherContracts: {
                          role: Number(otherContractRole),
                          isActive: otherContractActive
                        }
                      });
                      
                      alert(`Comprehensive Role Check:\n\nAddress: ${userAddress}\nQRCodeVerifier Address: ${CONTRACT_ADDRESSES.qrCodeVerifier}\n\nQRCodeVerifier:\n- Has RETAILER Role: ${hasRole}\n- Is Active: ${isActive}\n- User Role: ${userRole === 1 ? 'FARMER' : userRole === 2 ? 'PROCESSOR' : userRole === 3 ? 'DISTRIBUTOR' : userRole === 5 ? 'RETAILER' : userRole === 6 ? 'ADMIN' : `ROLE_${userRole}`}\n\nOther Contracts:\n- Role: ${otherContractRole === 1 ? 'FARMER' : otherContractRole === 2 ? 'PROCESSOR' : otherContractRole === 3 ? 'DISTRIBUTOR' : otherContractRole === 5 ? 'RETAILER' : `ROLE_${otherContractRole}`}\n- Is Active: ${otherContractActive}`);
                    } catch (error: any) {
                      console.error("Error checking QR code role:", error);
                      alert("Error checking role: " + error.message);
                    }
                  }}
                  className="debug-button"
                >
                  Check QR Code Role Status
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const provider = new ethers.BrowserProvider(window.ethereum);
                      const signer = await provider.getSigner();
                      const userAddress = await signer.getAddress();
                      
                      // Check role in QRCodeVerifier contract
                      const qrContract = new ethers.Contract(
                        CONTRACT_ADDRESSES.qrCodeVerifier,
                        qrCodeVerifierABI,
                        signer
                      );
                      
                      // Try to grant RETAILER role to self (only works if user is admin)
                      const tx = await qrContract.grantRole(userAddress, 5); // RETAILER role
                      await tx.wait();
                      
                      alert(`Successfully granted RETAILER role to ${userAddress} in QRCodeVerifier!`);
                      
                      // Refresh the page to update permissions
                      window.location.reload();
                      
                    } catch (error: any) {
                      console.error("Error granting role:", error);
                      if (error.message.includes("AccessControl: admin role required")) {
                        alert("You don't have admin privileges to grant roles. Please contact an administrator.");
                      } else {
                        alert("Error granting role: " + error.message);
                      }
                    }
                  }}
                  className="debug-button"
                  style={{ marginLeft: '10px' }}
                >
                  Grant Self RETAILER Role (Admin Only)
                </button>
              </div>
            )}
            
            <div className="section-header">
              <h2>Generate QR Code</h2>
            </div>
            
            <form onSubmit={handleGenerateQRCode} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={generateQRCode.batchId}
                    onChange={(e) => setGenerateQRCode({...generateQRCode, batchId: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Generating..." : "Generate QR Code"}
              </button>
            </form>

            <div className="section-header">
              <h2>Verify QR Code</h2>
            </div>
            
            <form onSubmit={handleVerifyQRCode} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>QR Code:</label>
                  <input
                    type="text"
                    value={verifyQRCode.qrCode}
                    onChange={(e) => setVerifyQRCode({...verifyQRCode, qrCode: e.target.value})}
                    placeholder="Paste QR code string here"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Verifying..." : "Verify QR Code"}
              </button>
            </form>

            <div className="section-header">
              <h2>Deactivate QR Code</h2>
            </div>
            
            <form onSubmit={handleDeactivateQRCode} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>QR Code:</label>
                  <input
                    type="text"
                    value={deactivateQRCode.qrCode}
                    onChange={(e) => setDeactivateQRCode({...deactivateQRCode, qrCode: e.target.value})}
                    placeholder="Enter QR code string to deactivate"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Deactivating..." : "Deactivate QR Code"}
              </button>
            </form>

            <div className="section-header">
              <h2>QR Code Analytics</h2>
            </div>
            <div className="analytics-grid">
              <div className="analytics-item">
                <span className="analytics-label">Total Generated:</span>
                <span className="analytics-value">{qrAnalytics.totalGenerated}</span>
              </div>
              <div className="analytics-item">
                <span className="analytics-label">Total Active:</span>
                <span className="analytics-value">{qrAnalytics.totalActive}</span>
              </div>
              <div className="analytics-item">
                <span className="analytics-label">Total Deactivated:</span>
                <span className="analytics-value">{qrAnalytics.totalDeactivated}</span>
              </div>
            </div>

            <div className="section-header">
              <h2>Generated QR Codes</h2>
            </div>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>QR Code</th>
                    <th>Product Name</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(qrCodes).map(([batchId, qrCode]) => (
                    <tr key={batchId}>
                      <td>{batchId}</td>
                      <td>
                        <code className="qr-code-display">{qrCode}</code>
                      </td>
                      <td>
                        {batches.find(b => b.id === parseInt(batchId))?.name || "Unknown"}
                      </td>
                      <td>
                        <span className="status-active">Active</span>
                      </td>
                      <td>
                        <button 
                          onClick={() => {
                            setDeactivateQRCode({ qrCode });
                            setSuccess(`Prepared deactivation form for QR Code: ${qrCode}`);
                          }}
                          className="action-button"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {Object.keys(qrCodes).length === 0 && (
                <p className="no-data-message">No QR codes generated yet. Generate a QR code above to get started.</p>
              )}
            </div>

            <div className="section-header">
              <h2>Verification Results</h2>
            </div>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>QR Code</th>
                    <th>Valid</th>
                    <th>Product Name</th>
                    <th>Origin</th>
                    <th>Current Owner</th>
                    <th>Status</th>
                    <th>Provenance Records</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(verificationResults).map(([qrCode, result]) => (
                    <tr key={qrCode}>
                      <td>
                        <code className="qr-code-display">{qrCode}</code>
                      </td>
                      <td>
                        <span className={`status-${result.isValid ? 'active' : 'inactive'}`}>
                          {result.isValid ? 'Valid' : 'Invalid'}
                        </span>
                      </td>
                      <td>{result.productName || "N/A"}</td>
                      <td>{result.origin || "N/A"}</td>
                      <td>{formatAddress(result.currentOwner)}</td>
                      <td>{getBatchStatusName(result.status)}</td>
                      <td>{result.provenanceRecords}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {Object.keys(verificationResults).length === 0 && (
                <p className="no-data-message">No verification results yet. Verify a QR code above to see results.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-spinner-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Processing...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Retailer; 