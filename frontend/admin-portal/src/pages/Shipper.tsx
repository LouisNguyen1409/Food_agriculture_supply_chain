import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/pages.css";
import "../styles/shipper.css";

// Contract ABIs
const shipmentTrackerABI = [
  "function pickupShipment(uint256) external",
  "function updateLocation(uint256, string) external",
  "function markDelivered(uint256) external",
  "function confirmDelivery(uint256) external",
  "function getUserShipmentsByStatus(address, uint8) external view returns (uint256[])",
  "function getShipmentByTrackingId(string) external view returns (uint256, uint256, address, address, uint8, string, string, uint256, uint256)",
  "function getTrackingHistory(uint256) external view returns (string[], uint256[])",
  "function shipments(uint256) external view returns (uint256 id, uint256 batchId, uint256 offerId, address sender, address receiver, address shipper, string trackingId, string fromLocation, string toLocation, uint8 status, string metadataHash, uint256 createdAt, uint256 pickedUpAt, uint256 deliveredAt, uint256 confirmedAt)",
  "event ShipmentPickedUp(uint256 indexed shipmentId, address indexed shipper)",
  "event ShipmentInTransit(uint256 indexed shipmentId, string location)",
  "event ShipmentDelivered(uint256 indexed shipmentId, uint256 deliveredAt)",
  "event DeliveryConfirmed(uint256 indexed shipmentId, address indexed receiver)",
  "event LocationUpdated(uint256 indexed shipmentId, string location, uint256 timestamp)"
];

const productBatchABI = [
  "function transferOwnership(uint256, address) external",
  "function getBatchInfo(uint256) external view returns (address, address, string, string, uint256, uint256, string, uint8, uint256, uint256)",
  "function grantRole(address, uint8) external",
  "function hasRole(address, uint8) external view returns (bool)",
  "function isActive(address) external view returns (bool)"
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
  shipmentTracker: process.env.REACT_APP_SHIPMENT_TRACKER_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
  productBatch: process.env.REACT_APP_PRODUCT_BATCH_ADDRESS || "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  accessControl: process.env.REACT_APP_ACCESS_CONTROL_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707" // This is StakeholderManager
};

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

const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getShipmentStatusName = (status: number): string => {
  const statuses = ["CREATED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CONFIRMED"];
  return statuses[status] || "UNKNOWN";
};

const Shipper = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeTab, setActiveTab] = useState("shipments");
  
  // Role checking states
  const [userRole, setUserRole] = useState<number>(0);
  const [isUserActive, setIsUserActive] = useState<boolean>(false);
  const [hasShipperRole, setHasShipperRole] = useState<boolean>(false);
  
  // Form states
  const [pickupShipment, setPickupShipment] = useState({
    shipmentId: ""
  });
  
  const [updateLocation, setUpdateLocation] = useState({
    shipmentId: "",
    location: ""
  });
  
  const [markDelivered, setMarkDelivered] = useState({
    shipmentId: ""
  });
  
  const [transferOwnership, setTransferOwnership] = useState({
    batchId: "",
    newOwner: ""
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
      
      const shipmentTrackerContract = new ethers.Contract(
        CONTRACT_ADDRESSES.shipmentTracker,
        shipmentTrackerABI,
        signer
      );
      
      const productBatchContract = new ethers.Contract(
        CONTRACT_ADDRESSES.productBatch,
        productBatchABI,
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
      
      await loadShipments(shipmentTrackerContract);
      await loadBatches(productBatchContract);
      
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
      
      const hasShipper = await contract.hasRole(account, 4); // SHIPPER role = 4
      console.log("Has shipper role:", hasShipper);
      
      // Try alternative function names
      try {
        const stakeholderInfo = await contract.getStakeholderInfo(account);
        console.log("Stakeholder info:", stakeholderInfo);
      } catch (error) {
        console.log("getStakeholderInfo failed:", error);
      }
      
      setUserRole(Number(role));
      setIsUserActive(isActive);
      setHasShipperRole(hasShipper);
      
      console.log("State updated with:", {
        role: Number(role),
        isActive,
        hasShipper,
        account
      });
      
      console.log("Final role check results:", {
        role: Number(role),
        isActive,
        hasShipper,
        account
      });
      
    } catch (error) {
      console.error("Error checking user role:", error);
      setUserRole(0);
      setIsUserActive(false);
      setHasShipperRole(false);
      console.log("Role check failed - showing actual error state");
    }
  };

  const loadShipments = async (contract: ethers.Contract) => {
    try {
      console.log("=== LOADING SHIPMENTS ===");
      console.log("Contract address:", CONTRACT_ADDRESSES.shipmentTracker);
      console.log("Account:", account);
      
      // Get shipments for different statuses
      const createdShipments = await contract.getUserShipmentsByStatus(account, 0); // CREATED
      const pickedUpShipments = await contract.getUserShipmentsByStatus(account, 1); // PICKED_UP
      const inTransitShipments = await contract.getUserShipmentsByStatus(account, 2); // IN_TRANSIT
      const deliveredShipments = await contract.getUserShipmentsByStatus(account, 3); // DELIVERED
      
      console.log("Found shipments:", {
        created: createdShipments,
        pickedUp: pickedUpShipments,
        inTransit: inTransitShipments,
        delivered: deliveredShipments
      });
      
      // Test direct shipment access
      try {
        console.log("Testing direct shipment access for ID 1...");
        const testShipment = await contract.shipments(1);
        console.log("Direct shipment 1 test:", {
          fromLocation: testShipment[7],
          toLocation: testShipment[8],
          trackingId: testShipment[6]
        });
      } catch (error) {
        console.log("Direct shipment test failed:", error);
      }
      
      // Use a Set to track unique shipment IDs
      const uniqueShipmentIds = new Set<number>();
      const shipmentData: Shipment[] = [];
      
      // Helper function to add shipment if not already added
      const addShipmentIfUnique = async (shipmentId: number, status: number) => {
        if (!uniqueShipmentIds.has(shipmentId)) {
          uniqueShipmentIds.add(shipmentId);
          
          try {
            console.log(`\n=== FETCHING SHIPMENT ${shipmentId} ===`);
            // Fetch actual shipment details from the contract
            const shipmentDetails = await contract.shipments(shipmentId);
            console.log(`Shipment ${shipmentId} details:`, shipmentDetails);
            console.log(`Shipment ${shipmentId} raw data:`, {
              id: shipmentDetails.id?.toString(),
              batchId: shipmentDetails.batchId?.toString(),
              offerId: shipmentDetails.offerId?.toString(),
              sender: shipmentDetails.sender,
              receiver: shipmentDetails.receiver,
              shipper: shipmentDetails.shipper,
              trackingId: shipmentDetails.trackingId,
              fromLocation: shipmentDetails.fromLocation,
              toLocation: shipmentDetails.toLocation,
              status: shipmentDetails.status?.toString(),
              metadataHash: shipmentDetails.metadataHash,
              createdAt: shipmentDetails.createdAt?.toString(),
              pickedUpAt: shipmentDetails.pickedUpAt?.toString(),
              deliveredAt: shipmentDetails.deliveredAt?.toString(),
              confirmedAt: shipmentDetails.confirmedAt?.toString()
            });
            
            // Based on the Shipment struct: id, batchId, offerId, sender, receiver, shipper, trackingId, fromLocation, toLocation, status, metadataHash, createdAt, pickedUpAt, deliveredAt, confirmedAt
            const shipment: Shipment = {
              id: shipmentId,
              batchId: Number(shipmentDetails.batchId), // batchId
              offerId: Number(shipmentDetails.offerId), // offerId
              sender: shipmentDetails.sender, // sender
              receiver: shipmentDetails.receiver, // receiver
              shipper: shipmentDetails.shipper, // shipper
              trackingId: shipmentDetails.trackingId || `TRK${shipmentId}`, // trackingId (fallback if empty)
              fromLocation: shipmentDetails.fromLocation || "", // fromLocation
              toLocation: shipmentDetails.toLocation || "", // toLocation
              status: Number(shipmentDetails.status), // status
              metadataHash: shipmentDetails.metadataHash || "", // metadataHash
              createdAt: Number(shipmentDetails.createdAt), // createdAt
              pickedUpAt: Number(shipmentDetails.pickedUpAt), // pickedUpAt
              deliveredAt: Number(shipmentDetails.deliveredAt), // deliveredAt
              confirmedAt: Number(shipmentDetails.confirmedAt), // confirmedAt
              locationUpdates: [], // Not returned by shipments function
              timestamps: [] // Not returned by shipments function
            };
            
            console.log(`Processed shipment ${shipmentId}:`, {
              fromLocation: shipment.fromLocation,
              toLocation: shipment.toLocation,
              trackingId: shipment.trackingId,
              batchId: shipment.batchId,
              status: shipment.status
            });
            
            console.log(`Final shipment object for ${shipmentId}:`, shipment);
            
            shipmentData.push(shipment);
          } catch (error) {
            console.log(`Failed to fetch details for shipment ${shipmentId}:`, error);
            // Fallback to basic shipment info if details can't be fetched
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
      
      // Add shipments from each status array, checking for duplicates
      for (const id of createdShipments) {
        await addShipmentIfUnique(Number(id), 0); // CREATED
      }
      for (const id of pickedUpShipments) {
        await addShipmentIfUnique(Number(id), 1); // PICKED_UP
      }
      for (const id of inTransitShipments) {
        await addShipmentIfUnique(Number(id), 2); // IN_TRANSIT
      }
      for (const id of deliveredShipments) {
        await addShipmentIfUnique(Number(id), 3); // DELIVERED
      }
      
      console.log("Final shipment data:", shipmentData);
      console.log("Setting shipments state with:", shipmentData.length, "shipments");
      setShipments(shipmentData);
    } catch (error) {
      console.error("Error loading shipments:", error);
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

  const handlePickupShipment = async (e: React.FormEvent) => {
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
      
      const tx = await contract.pickupShipment(parseInt(pickupShipment.shipmentId));
      await tx.wait();
      
      setSuccess("Shipment picked up successfully!");
      setPickupShipment({ shipmentId: "" });
      await loadData();
      
    } catch (error) {
      console.error("Error picking up shipment:", error);
      setError("Failed to pick up shipment. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
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
      
      const tx = await contract.updateLocation(
        parseInt(updateLocation.shipmentId),
        updateLocation.location
      );
      await tx.wait();
      
      setSuccess("Location updated successfully!");
      setUpdateLocation({ shipmentId: "", location: "" });
      await loadData();
      
    } catch (error) {
      console.error("Error updating location:", error);
      setError("Failed to update location. Please check your input and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (e: React.FormEvent) => {
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
      
      const tx = await contract.markDelivered(parseInt(markDelivered.shipmentId));
      await tx.wait();
      
      setSuccess("Shipment marked as delivered successfully!");
      setMarkDelivered({ shipmentId: "" });
      await loadData();
      
    } catch (error) {
      console.error("Error marking shipment as delivered:", error);
      setError("Failed to mark shipment as delivered. Please check your input and try again.");
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

  if (!isConnected) {
    return (
      <div className="shipper-page">
        <div className="connection-message">
          <h2>Shipper Dashboard</h2>
          <p>Please connect your wallet to access the Shipper dashboard.</p>
        </div>
      </div>
    );
  }

  // Check if user has proper permissions
  console.log("Rendering check - hasShipperRole:", hasShipperRole, "isUserActive:", isUserActive);
  if (!hasShipperRole || !isUserActive) {
    console.log("Showing role status page because:", {
      hasShipperRole,
      isUserActive,
      userRole
    });
    return (
      <div className="shipper-page">
        <div className="page-header">
          <h1>Shipper Dashboard</h1>
          <p>Welcome, {formatAddress(account)}</p>
        </div>

        <div className="role-status-section">
          <div className="role-status-card">
            <h2>Role Status</h2>
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Role:</span>
                <span className={`status-value ${userRole === 4 ? 'success' : 'error'}`}>
                  {userRole === 4 ? 'SHIPPER' : userRole === 0 ? 'NONE' : `ROLE_${userRole}`}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Active:</span>
                <span className={`status-value ${isUserActive ? 'success' : 'error'}`}>
                  {isUserActive ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Shipper Permission:</span>
                <span className={`status-value ${hasShipperRole ? 'success' : 'error'}`}>
                  {hasShipperRole ? 'GRANTED' : 'DENIED'}
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
              <h3>How to Get Shipper Role</h3>
              <p>To use the Shipper dashboard, you need to be granted the SHIPPER role by an admin.</p>
              <ol>
                <li>Contact the system administrator</li>
                <li>Provide your wallet address: <code>{account}</code></li>
                <li>Request the SHIPPER role to be assigned</li>
                <li>Once granted, refresh this page</li>
              </ol>
              
              <div className="admin-actions">
                <h4>For Administrators</h4>
                <p>To grant the SHIPPER role to this user:</p>
                <code>grantRole({account}, 4)</code>
              </div>
              
              <div className="manual-registration">
                <h4>Manual Registration</h4>
                <p>If you need to register as a shipper:</p>
                <ol>
                  <li>Contact an admin through the Stakeholders page</li>
                  <li>Provide your wallet address: <code>{account}</code></li>
                  <li>Request the SHIPPER role to be assigned</li>
                  <li>Once approved, refresh this page</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log("Showing dashboard because hasShipperRole:", hasShipperRole, "isUserActive:", isUserActive);
  return (
    <div className="shipper-page">
      <div className="page-header">
        <h1>Shipper Dashboard</h1>
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
          className={activeTab === "shipments" ? "active" : ""}
          onClick={() => setActiveTab("shipments")}
        >
          My Shipments
        </button>
        <button 
          className={activeTab === "batches" ? "active" : ""}
          onClick={() => setActiveTab("batches")}
        >
          Batches
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "shipments" && (
          <div className="shipments-tab">
            <div className="section-header">
              <h2>Pick Up Shipment</h2>
            </div>
            
            <form onSubmit={handlePickupShipment} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment ID:</label>
                  <input
                    type="number"
                    value={pickupShipment.shipmentId}
                    onChange={(e) => setPickupShipment({...pickupShipment, shipmentId: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Picking Up..." : "Pick Up Shipment"}
              </button>
            </form>

            <div className="section-header">
              <h2>Update Location</h2>
            </div>
            
            <form onSubmit={handleUpdateLocation} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment ID:</label>
                  <input
                    type="number"
                    value={updateLocation.shipmentId}
                    onChange={(e) => setUpdateLocation({...updateLocation, shipmentId: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Current Location:</label>
                  <input
                    type="text"
                    value={updateLocation.location}
                    onChange={(e) => setUpdateLocation({...updateLocation, location: e.target.value})}
                    placeholder="e.g., Sydney, Australia"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Updating..." : "Update Location"}
              </button>
            </form>

            <div className="section-header">
              <h2>Mark as Delivered</h2>
            </div>
            
            <form onSubmit={handleMarkDelivered} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment ID:</label>
                  <input
                    type="number"
                    value={markDelivered.shipmentId}
                    onChange={(e) => setMarkDelivered({...markDelivered, shipmentId: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? "Marking..." : "Mark as Delivered"}
              </button>
            </form>

            <div className="section-header">
              <h2>My Shipments</h2>
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
                  {shipments.map((shipment) => {
                    console.log(`Rendering shipment ${shipment.id}:`, {
                      fromLocation: shipment.fromLocation,
                      toLocation: shipment.toLocation,
                      trackingId: shipment.trackingId
                    });
                    return (
                      <tr key={shipment.id}>
                        <td>{shipment.id}</td>
                        <td>{shipment.batchId}</td>
                        <td>{shipment.trackingId}</td>
                        <td>{getShipmentStatusName(shipment.status)}</td>
                        <td>{shipment.fromLocation || "(empty)"}</td>
                        <td>{shipment.toLocation || "(empty)"}</td>
                        <td>
                          {shipment.status === 0 && (
                            <button 
                              onClick={() => {
                                setPickupShipment({ shipmentId: shipment.id.toString() });
                                setSuccess(`Prepared pickup form for Shipment #${shipment.id}. Submit the form above.`);
                              }}
                              className="action-button"
                            >
                              Pick Up
                            </button>
                          )}
                          {shipment.status === 1 && (
                            <button 
                              onClick={() => {
                                setUpdateLocation({ shipmentId: shipment.id.toString(), location: "" });
                                setSuccess(`Prepared location update form for Shipment #${shipment.id}. Enter location and submit.`);
                              }}
                              className="action-button"
                            >
                              Update Location
                            </button>
                          )}
                          {(shipment.status === 1 || shipment.status === 2) && (
                            <button 
                              onClick={() => {
                                setMarkDelivered({ shipmentId: shipment.id.toString() });
                                setSuccess(`Prepared delivery form for Shipment #${shipment.id}. Submit the form above.`);
                              }}
                              className="action-button"
                            >
                              Mark Delivered
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "batches" && (
          <div className="batches-tab">
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
              <h2>Available Batches</h2>
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
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{batch.id}</td>
                      <td>{batch.name}</td>
                      <td>{batch.quantity}</td>
                      <td>{ethers.formatEther(batch.basePrice.toString())}</td>
                      <td>{getShipmentStatusName(batch.status)}</td>
                      <td>{batch.originLocation}</td>
                      <td>{formatAddress(batch.currentOwner)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

export default Shipper; 