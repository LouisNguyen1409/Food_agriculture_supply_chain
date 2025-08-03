import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/pages.css";
import "../styles/farmer.css";

// Contract ABIs
const productBatchABI = [
  "function createBatch(string, string, uint256, uint256, string, string, uint8, address[], bool) external returns (uint256)",
  "function listForSale(uint256, uint256, uint8) external",
  "function transferOwnership(uint256, address) external",
  "function getBatchInfo(uint256) external view returns (address, address, string, string, uint256, uint256, string, uint8, uint256, uint256)",
  "function grantRole(address, uint8) external",
  "function hasRole(address, uint8) external view returns (bool)",
  "function isActive(address) external view returns (bool)",
  "function activateAccount(address) external",
  "event BatchCreated(uint256 indexed batchId, address indexed farmer, string name, uint8 tradingMode)",
  "event BatchListed(uint256 indexed batchId, uint256 price, uint8 tradingMode)"
];

const offerManagerABI = [
  "function acceptOffer(uint256) external",
  "function getAvailableOffers(address) external view returns (uint256[])",
  "function getOffersByType(uint8) external view returns (uint256[])",
  "function getOfferInfo(uint256) external view returns (address, address, uint256, uint256, uint256, uint8, uint8, string, uint256, address)",
  "function grantRole(address, uint8) external",
  "function hasRole(address, uint8) external view returns (bool)",
  "function isActive(address) external view returns (bool)",
  "function activateAccount(address) external",
  "event OfferAccepted(uint256 indexed offerId, address indexed acceptor, uint256 price)"
];

const registryAccessABI = [
  "function grantRole(address, uint8) external",
  "function hasRole(address, uint8) external view returns (bool)",
  "function isActive(address) external view returns (bool)",
  "function activateAccount(address) external"
];

const registryABI = [
  "function recordTransaction(uint256, address, address, uint256, uint256, string) external returns (uint256)",
  "event TransactionRecorded(uint256 indexed transactionId, uint256 indexed batchId, address indexed buyer, uint256 usdValue, uint256 localValue)"
];

const shipmentTrackerABI = [
  "function createShipment(uint256, uint256, address, address, string, string, string, string) external returns (uint256)",
  "function getUserShipmentsByStatus(address, uint8) external view returns (uint256[])",
  "event ShipmentCreated(uint256 indexed shipmentId, uint256 indexed batchId, address indexed receiver)"
];

const accessControlABI = [
  "function hasRole(address, uint8) external view returns (bool)",
  "function getRole(address) external view returns (uint8)",
  "function isActive(address) external view returns (bool)",
  "function grantRole(address, uint8) external",
  "function activateAccount(address) external",
  "function getStakeholderInfo(address) external view returns (uint8, string, string, string, string, bool, uint256)",
  "function isFullyActive(address) external view returns (bool)"
];

// Contract addresses
const CONTRACT_ADDRESSES = {
  productBatch: process.env.REACT_APP_PRODUCT_BATCH_ADDRESS || "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  offerManager: process.env.REACT_APP_OFFER_MANAGER_ADDRESS || "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  registry: process.env.REACT_APP_REGISTRY_ADDRESS || "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
  shipmentTracker: process.env.REACT_APP_SHIPMENT_TRACKER_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
  accessControl: process.env.REACT_APP_ACCESS_CONTROL_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707" // This is StakeholderManager
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
  ownsBatch?: boolean; // Added for BUY_OFFER
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

const Farmer = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
  const [batches, setBatches] = useState<Batch[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeTab, setActiveTab] = useState("batches");
  
  // Role checking states
  const [userRole, setUserRole] = useState<number>(0);
  const [isUserActive, setIsUserActive] = useState<boolean>(false);
  const [hasFarmerRole, setHasFarmerRole] = useState<boolean>(false);
  const [roleGrantFailed, setRoleGrantFailed] = useState<boolean>(false);
  
  const [newBatch, setNewBatch] = useState({
    name: "",
    description: "",
    quantity: "",
    basePrice: "",
    originLocation: "",
    metadataHash: "",
    tradingMode: "0",
    requiresWeatherVerification: false
  });
  
  const [listForSale, setListForSale] = useState({
    batchId: "",
    askingPrice: "",
    tradingMode: "0"
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
  
  const [newShipment, setNewShipment] = useState({
    batchId: "",
    offerId: "",
    receiver: "",
    shipper: "",
    trackingId: "",
    fromLocation: "",
    toLocation: "",
    metadataHash: ""
  });

  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
          console.log("Available accounts:", accounts);
          if (accounts.length > 0) {
            console.log("Setting account to:", accounts[0]);
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

  // Add effect to check role when account changes
  useEffect(() => {
    if (isConnected && account) {
      console.log("Account changed, checking role...");
      loadData();
    }
  }, [account, isConnected]);

  const loadData = async () => {
    if (!isConnected || !account) return;
    
    console.log("loadData called with account:", account);
    setLoading(true);
    setError("");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      console.log("Signer address:", await signer.getAddress());
      
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
      
      const accessControlContract = new ethers.Contract(
        CONTRACT_ADDRESSES.accessControl,
        accessControlABI,
        signer
      );
      
      // Check user role and permissions FIRST
      console.log("Calling checkUserRole...");
      await checkUserRole(accessControlContract);
      console.log("checkUserRole completed");
      
      // Check and grant ProductBatch role if needed
      await checkAndGrantProductBatchRole();
      await checkAndGrantOfferManagerRole();
      
      await loadBatches(productBatchContract);
      await loadOffers(offerManagerContract);
      
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const checkUserRole = async (contract: ethers.Contract) => {
    try {
      console.log("Starting role check for account:", account);
      console.log("Contract address:", CONTRACT_ADDRESSES.accessControl);
      
      const role = await contract.getRole(account);
      console.log("Raw role:", role);
      
      const isActive = await contract.isFullyActive(account);
      console.log("Is fully active:", isActive);
      
      const hasFarmer = await contract.hasRole(account, 1); // FARMER role = 1
      console.log("Has farmer role:", hasFarmer);
      
      // Try alternative function names
      try {
        const stakeholderInfo = await contract.getStakeholderInfo(account);
        console.log("Stakeholder info:", stakeholderInfo);
      } catch (error) {
        console.log("getStakeholderInfo failed:", error);
      }
      
      setUserRole(Number(role));
      setIsUserActive(isActive);
      setHasFarmerRole(hasFarmer);
      
      console.log("State updated with:", {
        role: Number(role),
        isActive,
        hasFarmer,
        account
      });
      
      console.log("Final role check results:", {
        role: Number(role),
        isActive,
        hasFarmer,
        account
      });
      
    } catch (error) {
      console.error("Error checking user role:", error);
      // Don't set default values - let the user see the actual error
      setUserRole(0);
      setIsUserActive(false);
      setHasFarmerRole(false);
      console.log("Role check failed - showing actual error state");
    }
  };

  const loadBatches = async (contract: ethers.Contract) => {
    try {
      const batchIds = [1, 2, 3]; // Placeholder - should come from contract
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

  const checkBatchOwnership = async (batchId: number): Promise<boolean> => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      const batchInfo = await contract.getBatchInfo(batchId);
      const currentOwner = batchInfo[1]; // currentOwner is at index 1
      const isOwner = currentOwner.toLowerCase() === account.toLowerCase();
      
      console.log(`Batch ${batchId} ownership check:`, {
        batchId,
        currentOwner,
        account,
        isOwner
      });
      
      return isOwner;
    } catch (error) {
      console.error("Error checking batch ownership:", error);
      return false;
    }
  };

  const loadOffers = async (contract: ethers.Contract) => {
    try {
      // Get all offer types that farmers might be interested in
      const buyOfferIds = await contract.getOffersByType(0); // BUY_OFFER = 0
      const sellOfferIds = await contract.getOffersByType(1); // SELL_OFFER = 1
      const contractOfferIds = await contract.getOffersByType(2); // CONTRACT_OFFER = 2
      
      // Combine all offer IDs
      const allOfferIds = [...buyOfferIds, ...sellOfferIds, ...contractOfferIds];
      const offerData: Offer[] = [];
      
      for (const offerId of allOfferIds) {
        try {
          const offerInfo = await contract.getOfferInfo(offerId);
          const offer: Offer = {
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
          };
          
          // Check if farmer owns the batch for BUY_OFFER
          if (offer.offerType === 0 && offer.batchId > 0) {
            offer.ownsBatch = await checkBatchOwnership(offer.batchId);
          }
          
          offerData.push(offer);
        } catch (error) {
          console.log(`Offer ${offerId} not found`);
        }
      }
      
      setOffers(offerData);
    } catch (error) {
      console.error("Error loading offers:", error);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
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
      
      const tx = await contract.createBatch(
        newBatch.name,
        newBatch.description,
        ethers.parseUnits(newBatch.quantity, 0),
        ethers.parseEther(newBatch.basePrice), // Changed from parseUnits to parseEther
        newBatch.originLocation,
        newBatch.metadataHash,
        parseInt(newBatch.tradingMode),
        [], // authorizedBuyers
        newBatch.requiresWeatherVerification
      );
      
      await tx.wait();
      
      setSuccess("Batch created successfully!");
      setNewBatch({
        name: "",
        description: "",
        quantity: "",
        basePrice: "",
        originLocation: "",
        metadataHash: "",
        tradingMode: "0",
        requiresWeatherVerification: false
      });
      
      await loadData();
      
    } catch (error) {
      console.error("Error creating batch:", error);
      setError("Failed to create batch. Please check your input and try again.");
    } finally {
      setLoading(false);
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
        ethers.parseEther(listForSale.askingPrice), // Changed from parseUnits to parseEther
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
      console.error("Error listing batch:", error);
      setError("Failed to list batch for sale. Please check your input and try again.");
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
      
      // Validate and format addresses
      let receiverAddress = newShipment.receiver.trim();
      let shipperAddress = newShipment.shipper.trim();
      
      console.log("Shipment address validation debug:");
      console.log("Raw receiver:", newShipment.receiver);
      console.log("Raw shipper:", newShipment.shipper);
      console.log("Is receiver valid address:", ethers.isAddress(receiverAddress));
      console.log("Is shipper valid address:", shipperAddress === "" || ethers.isAddress(shipperAddress));
      
      // Validate receiver address
      if (!ethers.isAddress(receiverAddress)) {
        console.log("Receiver address validation failed");
        setError("Invalid receiver address. Please enter a valid Ethereum address starting with 0x");
        setLoading(false);
        return;
      }
      
      // Validate shipper address if provided
      if (shipperAddress !== "" && !ethers.isAddress(shipperAddress)) {
        console.log("Shipper address validation failed");
        setError("Invalid shipper address. Please enter a valid Ethereum address starting with 0x or leave empty");
        setLoading(false);
        return;
      }
      
      // Format addresses
      receiverAddress = ethers.getAddress(receiverAddress);
      if (shipperAddress !== "") {
        shipperAddress = ethers.getAddress(shipperAddress);
      } else {
        shipperAddress = ethers.ZeroAddress; // Use zero address for self-delivery
      }
      
      console.log("Formatted addresses:");
      console.log("Receiver:", receiverAddress);
      console.log("Shipper:", shipperAddress);
      
      const tx = await contract.createShipment(
        parseInt(newShipment.batchId),
        parseInt(newShipment.offerId),
        receiverAddress,
        shipperAddress,
        newShipment.trackingId,
        newShipment.fromLocation,
        newShipment.toLocation,
        newShipment.metadataHash
      );
      
      await tx.wait();
      
      setSuccess("Shipment created successfully!");
      setNewShipment({
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
      
      // Validate and format the new owner address
      let newOwnerAddress = transferOwnership.newOwner.trim();
      
      console.log("Address validation debug:");
      console.log("Raw input:", transferOwnership.newOwner);
      console.log("Trimmed input:", newOwnerAddress);
      console.log("Is valid address:", ethers.isAddress(newOwnerAddress));
      console.log("Current account:", account);
      console.log("Target address:", newOwnerAddress);
      console.log("Self-transfer check:", newOwnerAddress.toLowerCase() === account.toLowerCase());
      
      // Check if it's a valid Ethereum address
      if (!ethers.isAddress(newOwnerAddress)) {
        console.log("Address validation failed");
        setError("Invalid Ethereum address. Please enter a valid address starting with 0x");
        setLoading(false);
        return;
      }
      
      // Ensure the address is checksummed
      newOwnerAddress = ethers.getAddress(newOwnerAddress);
      console.log("Checksummed address:", newOwnerAddress);
      
      // Prevent self-transfer
      if (newOwnerAddress.toLowerCase() === account.toLowerCase()) {
        console.log("Self-transfer detected");
        setError("Cannot transfer ownership to yourself");
        setLoading(false);
        return;
      }
      
      console.log(`Transferring ownership of batch ${transferOwnership.batchId} to ${newOwnerAddress}`);
      
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
      
      // Use the current user as the buyer if no buyer is specified
      const buyerAddress = recordTransaction.buyer === "" ? account : recordTransaction.buyer;
      
      const tx = await contract.recordTransaction(
        parseInt(recordTransaction.batchId),
        account, // seller (current user)
        buyerAddress, // buyer
        ethers.parseEther(recordTransaction.price), // Changed from parseUnits to parseEther
        ethers.parseUnits(recordTransaction.quantity, 0),
        "SPOT"
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
      setError("Failed to record transaction. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkAndGrantOfferManagerRole = async () => {
    if (!isConnected || !account) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const offerManagerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.offerManager,
        offerManagerABI,
        signer
      );
      
      // Check if user has role in OfferManager
      const hasFarmerInOfferManager = await offerManagerContract.hasRole(account, 1);
      const isActiveInOfferManager = await offerManagerContract.isActive(account);
      
      console.log("OfferManager role check for account", account, ":", {
        hasFarmer: hasFarmerInOfferManager,
        isActive: isActiveInOfferManager
      });
      
      // If user doesn't have role in OfferManager, show error
      if (!hasFarmerInOfferManager || !isActiveInOfferManager) {
        console.log("User doesn't have role in OfferManager");
        setError("You don't have the FARMER role in OfferManager. Please contact an admin to approve your registration.");
        setRoleGrantFailed(true);
      } else {
        console.log(" Account has FARMER role in OfferManager:", account);
      }
      
    } catch (error) {
      console.error("Error checking OfferManager role:", error);
      setError("Error checking role status. Please try again.");
    }
  };

  const checkAndGrantProductBatchRole = async () => {
    if (!isConnected || !account) return;
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const productBatchContract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
        signer
      );
      
      // Check if user has role in ProductBatch
      const hasFarmerInProductBatch = await productBatchContract.hasRole(account, 1);
      const isActiveInProductBatch = await productBatchContract.isActive(account);
      
      // Check if user has role in Registry
      const registryContract = new ethers.Contract(
        CONTRACT_ADDRESSES.registry,
        registryAccessABI,
        signer
      );
      const hasFarmerInRegistry = await registryContract.hasRole(account, 1);
      const isActiveInRegistry = await registryContract.isActive(account);
      
      console.log("ProductBatch role check for account", account, ":", {
        hasFarmer: hasFarmerInProductBatch,
        isActive: isActiveInProductBatch
      });
      
      console.log("Registry role check for account", account, ":", {
        hasFarmer: hasFarmerInRegistry,
        isActive: isActiveInRegistry
      });
      
      // If user doesn't have role in ProductBatch, show error
      if (!hasFarmerInProductBatch || !isActiveInProductBatch) {
        console.log("User doesn't have role in ProductBatch");
        setError("You don't have the FARMER role in ProductBatch. Please contact an admin to approve your registration.");
        setRoleGrantFailed(true);
      } else if (!hasFarmerInRegistry || !isActiveInRegistry) {
        console.log("User doesn't have role in Registry");
        setError("You don't have the FARMER role in Registry. Please contact an admin to approve your registration.");
        setRoleGrantFailed(true);
      } else {
        console.log(" Account has FARMER role in both ProductBatch and Registry:", account);
      }
      
    } catch (error) {
      console.error("Error checking ProductBatch role:", error);
      setError("Error checking role status. Please try again.");
    }
  };

  if (!isConnected) {
    return (
      <div className="farmer-page">
        <div className="connection-message">
          <h2>Farmer Dashboard</h2>
          <p>Please connect your wallet to access the Farmer dashboard.</p>
        </div>
      </div>
    );
  }

  // Check if user has proper permissions
  console.log("Rendering check - hasFarmerRole:", hasFarmerRole, "isUserActive:", isUserActive);
  if (!hasFarmerRole || !isUserActive) {
    console.log("Showing role status page because:", {
      hasFarmerRole,
      isUserActive,
      userRole
    });
    return (
      <div className="farmer-page">
        <div className="page-header">
          <h1>Farmer Dashboard</h1>
          <p>Welcome, {formatAddress(account)}</p>
        </div>

        <div className="role-status-section">
          <div className="role-status-card">
            <h2>Role Status</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Role:</span>
                <span className={`status-value ${userRole === 1 ? 'success' : 'error'}`}>
                  {userRole === 1 ? 'FARMER' : userRole === 0 ? 'NONE' : `ROLE_${userRole}`}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Active:</span>
                <span className={`status-value ${isUserActive ? 'success' : 'error'}`}>
                  {isUserActive ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Farmer Permission:</span>
                <span className={`status-value ${hasFarmerRole ? 'success' : 'error'}`}>
                  {hasFarmerRole ? 'GRANTED' : 'DENIED'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Account:</span>
                <span className="status-value">
                  {formatAddress(account)}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Access Control Contract:</span>
                <span className="status-value">
                  {formatAddress(CONTRACT_ADDRESSES.accessControl)}
                </span>
              </div>
            </div>
            
            <div className="role-instructions">
              <h3>How to Get Farmer Role</h3>
              <p>To use the Farmer dashboard, you need to be granted the FARMER role by an admin.</p>
              <ol>
                <li>Contact the system administrator</li>
                <li>Provide your wallet address: <code>{account}</code></li>
                <li>Request the FARMER role to be assigned</li>
                <li>Once granted, refresh this page</li>
              </ol>
              
              <div className="admin-actions">
                <h4>For Administrators</h4>
                <p>To grant the FARMER role to this user:</p>
                <code>grantRole({account}, 1)</code>
              </div>
              
              <div className="manual-registration">
                <h4>Manual Registration</h4>
                <p>If you need to register as a farmer:</p>
                <ol>
                  <li>Contact an admin through the Stakeholders page</li>
                  <li>Provide your wallet address: <code>{account}</code></li>
                  <li>Request the FARMER role to be assigned</li>
                  <li>Once approved, refresh this page</li>
                </ol>
              </div>
              
              {roleGrantFailed && (
                <div className="manual-role-grant">
                  <h4>Manual Registration</h4>
                  <p>Automatic registration failed. Please contact an admin to approve your registration:</p>
                  <ol>
                    <li>Go to the Stakeholders page</li>
                    <li>Submit a registration request</li>
                    <li>Wait for admin approval</li>
                    <li>Refresh this page once approved</li>
                  </ol>
                  
                  <div className="testing-actions">
                    <h4>For Testing (Admin Only)</h4>
                    <p>If you have admin privileges, you can manually grant roles:</p>
                    <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
                      <p><strong>ProductBatch:</strong> grantRole({account}, 1)</p>
                      <p><strong>Registry:</strong> grantRole({account}, 1)</p>
                      <p><strong>ShipmentTracker:</strong> grantRole({account}, 1)</p>
                      <p><strong>OfferManager:</strong> grantRole({account}, 1)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log("Showing dashboard because hasFarmerRole:", hasFarmerRole, "isUserActive:", isUserActive);
  return (
    <div className="farmer-page">
      <div className="page-header">
        <h1>Farmer Dashboard</h1>
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
          className={activeTab === "batches" ? "active" : ""}
          onClick={() => setActiveTab("batches")}
        >
          My Batches
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
      </div>

      <div className="tab-content">
        {activeTab === "batches" && (
          <div className="batches-tab">
            <div className="section-header">
              <h2>Create New Batch</h2>
            </div>
            
            <form onSubmit={handleCreateBatch} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch Name:</label>
                  <input
                    type="text"
                    value={newBatch.name}
                    onChange={(e) => setNewBatch({...newBatch, name: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description:</label>
                  <textarea
                    value={newBatch.description}
                    onChange={(e) => setNewBatch({...newBatch, description: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity:</label>
                  <input
                    type="number"
                    value={newBatch.quantity}
                    onChange={(e) => setNewBatch({...newBatch, quantity: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Base Price (ETH):</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newBatch.basePrice}
                    onChange={(e) => setNewBatch({...newBatch, basePrice: e.target.value})}
                    placeholder="0.01"
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Origin Location:</label>
                  <input
                    type="text"
                    value={newBatch.originLocation}
                    onChange={(e) => setNewBatch({...newBatch, originLocation: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Metadata Hash:</label>
                  <input
                    type="text"
                    value={newBatch.metadataHash}
                    onChange={(e) => setNewBatch({...newBatch, metadataHash: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Trading Mode:</label>
                  <select
                    value={newBatch.tradingMode}
                    onChange={(e) => setNewBatch({...newBatch, tradingMode: e.target.value})}
                  >
                    <option value="0">SPOT_MARKET</option>
                    <option value="1">CONTRACT_FARMING</option>
                    <option value="2">COOPERATIVE</option>
                    <option value="3">WEATHER_DEPENDENT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newBatch.requiresWeatherVerification}
                      onChange={(e) => setNewBatch({...newBatch, requiresWeatherVerification: e.target.checked})}
                    />
                    Requires Weather Verification
                  </label>
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Creating..." : "Create Batch"}
              </button>
            </form>

            <div className="section-header">
              <h2>List Batch for Sale</h2>
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
                    placeholder="0.015"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Trading Mode:</label>
                  <select
                    value={listForSale.tradingMode}
                    onChange={(e) => setListForSale({...listForSale, tradingMode: e.target.value})}
                  >
                    <option value="0">SPOT_MARKET</option>
                    <option value="1">CONTRACT_FARMING</option>
                    <option value="2">COOPERATIVE</option>
                    <option value="3">WEATHER_DEPENDENT</option>
                  </select>
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Listing..." : "List for Sale"}
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
                    placeholder="0x1234...5678 (valid Ethereum address)"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Transferring..." : "Transfer Ownership"}
              </button>
            </form>

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
                    placeholder="0x... (leave empty to use your address)"
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
                    placeholder="0.01"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Quantity:</label>
                  <input
                    type="number"
                    value={recordTransaction.quantity}
                    onChange={(e) => setRecordTransaction({...recordTransaction, quantity: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Recording..." : "Record Transaction"}
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
                      <td>
                        <button 
                          onClick={() => {
                            setRecordTransaction({
                              batchId: batch.id.toString(),
                              buyer: "",
                              price: ethers.formatEther(batch.basePrice.toString()),
                              quantity: batch.quantity.toString()
                            });
                            setSuccess(`Prepared transaction form for Batch #${batch.id}. Please fill in the buyer address and submit the form below.`);
                          }}
                          className="action-button"
                        >
                          Prepare Transaction
                        </button>
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
              <h2>Available Offers</h2>
            </div>
            <p>Showing all open offers in the marketplace. As a FARMER, you can only accept:</p>
            <ul style={{ marginBottom: '20px', color: '#666' }}>
              <li><strong>BUY_OFFER:</strong> Only if you own the batch being offered</li>
              <li><strong>CONTRACT_OFFER:</strong> Contract farming offers (you can accept these)</li>
              <li><strong>SELL_OFFER:</strong> You cannot accept these (only processors/distributors/retailers can)</li>
            </ul>
            
            <div style={{ background: '#f0f8ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h4>Your Owned Batches:</h4>
              {batches.length > 0 ? (
                <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
                  {batches.map(batch => (
                    <li key={batch.id}>
                      <strong>Batch #{batch.id}:</strong> {batch.name} - {batch.quantity} units at {ethers.formatEther(batch.basePrice.toString())} ETH
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: '#666', fontStyle: 'italic' }}>You don't own any batches yet. Create a batch first to accept BUY_OFFER.</p>
              )}
            </div>

            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Creator</th>
                    <th>Batch ID</th>
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
                      <td>{formatAddress(offer.creator)}</td>
                      <td>{offer.batchId}</td>
                      <td>{ethers.formatEther(offer.price.toString())}</td>
                      <td>{offer.quantity}</td>
                      <td>{getOfferStatusName(offer.status)}</td>
                      <td>{new Date(offer.expiresAt * 1000).toLocaleString()}</td>
                      <td>
                        {offer.status === 0 && offer.creator.toLowerCase() !== account.toLowerCase() && (
                          <>
                            {offer.offerType === 0 && (
                              <>
                                {offer.ownsBatch ? (
                                  <button 
                                    onClick={() => handleAcceptOffer(offer.id)}
                                    className="action-button accept"
                                    disabled={loading}
                                  >
                                    Accept Buy Offer
                                  </button>
                                ) : (
                                  <span className="offer-note error">You don't own batch #{offer.batchId}</span>
                                )}
                              </>
                            )}
                            {offer.offerType === 1 && (
                              <span className="offer-note error">Farmers cannot accept SELL_OFFER</span>
                            )}
                            {offer.offerType === 2 && (
                              <button 
                                onClick={() => handleAcceptOffer(offer.id)}
                                className="action-button accept"
                                disabled={loading}
                              >
                                Accept Contract
                              </button>
                            )}
                          </>
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
                <p className="no-data-message">No offers available in the marketplace. Create a batch and list it for sale to get started.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "shipments" && (
          <div className="shipments-tab">
            <div className="section-header">
              <h2>Create Shipment</h2>
            </div>
            
            <form onSubmit={handleCreateShipment} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Batch ID:</label>
                  <input
                    type="number"
                    value={newShipment.batchId}
                    onChange={(e) => setNewShipment({...newShipment, batchId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Offer ID:</label>
                  <input
                    type="number"
                    value={newShipment.offerId}
                    onChange={(e) => setNewShipment({...newShipment, offerId: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Receiver Address:</label>
                  <input
                    type="text"
                    value={newShipment.receiver}
                    onChange={(e) => setNewShipment({...newShipment, receiver: e.target.value})}
                    placeholder="0x..."
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Shipper Address (optional):</label>
                  <input
                    type="text"
                    value={newShipment.shipper}
                    onChange={(e) => setNewShipment({...newShipment, shipper: e.target.value})}
                    placeholder="0x... (leave empty for self-delivery)"
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Tracking ID:</label>
                  <input
                    type="text"
                    value={newShipment.trackingId}
                    onChange={(e) => setNewShipment({...newShipment, trackingId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>From Location:</label>
                  <input
                    type="text"
                    value={newShipment.fromLocation}
                    onChange={(e) => setNewShipment({...newShipment, fromLocation: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>To Location:</label>
                  <input
                    type="text"
                    value={newShipment.toLocation}
                    onChange={(e) => setNewShipment({...newShipment, toLocation: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Metadata Hash:</label>
                  <input
                    type="text"
                    value={newShipment.metadataHash}
                    onChange={(e) => setNewShipment({...newShipment, metadataHash: e.target.value})}
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Creating..." : "Create Shipment"}
              </button>
            </form>
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

export default Farmer; 