import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/pages.css";
import "../styles/stakeholders.css";

// Modal component for confirmations
const ConfirmationModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel} className="cancel-button">Cancel</button>
          <button onClick={onConfirm} className="confirm-button">Confirm</button>
        </div>
      </div>
    </div>
  );
};

// Loading spinner component
const LoadingSpinner: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  
  return (
    <div className="loading-spinner-overlay">
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Processing...</p>
      </div>
    </div>
  );
};

// Stakeholder Manager contract ABI (only the functions we need)
const stakeholderManagerABI = [
    // Stakeholder management
    "function isActive(address) view returns (bool)",
    "function getStakeholderInfo(address) view returns (uint8, string, string, string, string, bool, uint256)",
    "function getCompleteStakeholderInfo(address) view returns (uint8, string, string, string, string, bool, uint256, string, uint256)",
    "function reactivateStakeholder(address) external",
    "function deactivateStakeholder(address) external",
    "function updateStakeholderInfo(address, string, string, string) external",
    "function stakeholdersByRole(uint8) view returns (address[])",
    "function getAllStakeholders() view returns (address[])",
    "function getStakeholdersCount() view returns (uint256)",
    "function getStakeholdersCountByRole(uint8) view returns (uint256)",
    "function blacklistStakeholder(address) external",
    "function removeFromBlacklist(address) external",
    "function isBlacklisted(address) view returns (bool)",
    
    // Registration requests
    "function submitRegistrationRequest(uint8, string, string, string, string, string, string) external returns (uint256)",
    "function approveRegistrationRequest(uint256, string) external",
    "function rejectRegistrationRequest(uint256, string) external",
    "function getPendingRequests() view returns (uint256[])",
    "function getRegistrationRequest(uint256) view returns (uint256, address, uint8, string, string, string, string, string, string, uint256, uint8, address, uint256, string, string)",
    
    // License key management
    "function regenerateLicenseKey(address) external returns (string)",
    "function validateLicenseKey(address, string) view returns (bool)",
    "function getLicenseKeyGeneratedAt(address) view returns (uint256)",
    
    // Statistics
    "function getTotalStakeholders() external view returns (uint256)",
    "function getRoleStatistics() external view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
    "function getRegistrationStats() external view returns (uint256, uint256, uint256, uint256, uint256)",
    
    // Authorization
    "function isAdmin(address) view returns (bool)",
    "function getRole(address) view returns (uint8)",
    "function isActive(address) view returns (bool)",
    "function activate(address) external"
];

// ProductBatch contract ABI for role granting
const productBatchABI = [
    "function grantRole(address, uint8) external",
    "function hasRole(address, uint8) external view returns (bool)",
    "function isActive(address) external view returns (bool)",
    "function activateAccount(address) external"
];

// Registry contract ABI for role granting
const registryABI = [
    "function grantRole(address, uint8) external",
    "function hasRole(address, uint8) external view returns (bool)",
    "function isActive(address) external view returns (bool)",
    "function activateAccount(address) external"
];

// ShipmentTracker contract ABI for role granting
const shipmentTrackerABI = [
    "function grantRole(address, uint8) external",
    "function hasRole(address, uint8) external view returns (bool)",
    "function isActive(address) external view returns (bool)",
    "function activateAccount(address) external"
];

// OfferManager contract ABI for role granting
const offerManagerABI = [
    "function grantRole(address, uint8) external",
    "function hasRole(address, uint8) external view returns (bool)",
    "function isActive(address) external view returns (bool)",
    "function activateAccount(address) external"
];

// Contract address from environment variables
const stakeholderManagerAddress = process.env.REACT_APP_STAKEHOLDER_MANAGER_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // Fallback for local dev
const productBatchAddress = process.env.REACT_APP_PRODUCT_BATCH_ADDRESS || "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"; // ProductBatch contract address
const registryAddress = process.env.REACT_APP_REGISTRY_ADDRESS || "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"; // Registry contract address
const shipmentTrackerAddress = process.env.REACT_APP_SHIPMENT_TRACKER_ADDRESS || "0x610178dA211FEF7D417bC0e6FeD39F05609AD788"; // ShipmentTracker contract address
const offerManagerAddress = process.env.REACT_APP_OFFER_MANAGER_ADDRESS || "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"; // OfferManager contract address

interface RegistrationRequest {
    requestId: number;
    applicant: string;
    requestedRole: number;
    name: string;
    licenseId: string;
    location: string;
    certification: string;
    businessDescription: string;
    contactEmail: string;
    requestedAt: number;
    status: number; // 0: PENDING, 1: APPROVED, 2: REJECTED, 3: CANCELLED
    reviewedBy: string;
    reviewedAt: number;
    reviewNotes: string;
    generatedLicenseKey: string;
}

interface StakeholderInfo {
    address: string;
    role: number;
    name: string;
    licenseId: string;
    location: string;
    certification: string;
    contactEmail?: string;
    businessDescription?: string;
    registeredAt: number;
    isActive: boolean;
    licenseKey: string;
    licenseKeyGeneratedAt: number;
}

// Helper function to format Ethereum address for display
const formatAddress = (address: string): string => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Helper to map role IDs to strings
const getRoleName = (roleId: number): string => {
    const roleMap: { [key: number]: string } = {
        0: "None",
        1: "Farmer",
        2: "Processor",
        3: "Distributor",
        4: "Shipper",
        5: "Retailer",
        6: "Admin"
    };
    return roleMap[roleId] || "Unknown";
};

// Helper to generate a random string for license keys
const generateRandomString = (length: number): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const Stakeholders = () => {
    // Basic component state
    const [isAdmin, setIsAdmin] = useState(false);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [activeTab, setActiveTab] = useState("requests"); // "requests", "stakeholders", "stats", "license"
    
    // Confirmation modal state
    const [showModal, setShowModal] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [modalMessage, setModalMessage] = useState("");
    const [modalConfirmAction, setModalConfirmAction] = useState<() => void>(() => {});
    
    // Stakeholder lists and filtering
    const [stakeholdersList, setStakeholdersList] = useState<StakeholderInfo[]>([]);
    const [filteredStakeholders, setFilteredStakeholders] = useState<StakeholderInfo[]>([]);
    const [selectedRole, setSelectedRole] = useState(0); // 0 means all roles
    const [selectedStatus, setSelectedStatus] = useState(0); // 0 means all statuses
    const [searchQuery, setSearchQuery] = useState("");
    
    // Registration requests
    const [pendingRequests, setPendingRequests] = useState<RegistrationRequest[]>([]);
    const [currentRequest, setCurrentRequest] = useState<RegistrationRequest | null>(null);
    const [reviewNotes, setReviewNotes] = useState("");
    const [licenseKeyNotes, setLicenseKeyNotes] = useState("");
    
    // License key management
    const [licenseKeyAddress, setLicenseKeyAddress] = useState("");
    const [licenseKey, setLicenseKey] = useState("");
    
    // New registration form
    const [newRegistration, setNewRegistration] = useState({
        role: 1, // Default to FARMER
        name: "",
        licenseId: "",
        location: "",
        certification: "",
        businessDescription: "",
        contactEmail: ""
    });
    
    // Statistics
    const [totalStakeholders, setTotalStakeholders] = useState(0);
    const [stakeholdersByRoleCount, setStakeholdersByRoleCount] = useState<{[key: number]: number}>({});
    const [requestStats, setRequestStats] = useState({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0
    });
    
    // Request status names
    const requestStatusNames: {[key: number]: string} = {
        0: "PENDING",
        1: "APPROVED",
        2: "REJECTED",
        3: "CANCELLED"
    };

    // Function to apply filters to stakeholders list
    const applyFilters = () => {
        if (!stakeholdersList) return;
        
        let filteredList = [...stakeholdersList];
        
        // Apply role filter if selected
        if (selectedRole !== 0) {
            filteredList = filteredList.filter(s => s.role === selectedRole);
        }
        
        // Apply status filter
        if (selectedStatus === 1) { // Active only
            filteredList = filteredList.filter(s => s.isActive);
        } else if (selectedStatus === 2) { // Inactive only
            filteredList = filteredList.filter(s => !s.isActive);
        }
        
        // Apply search filter if provided
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            filteredList = filteredList.filter(s => 
                s.name.toLowerCase().includes(query) ||
                s.address.toLowerCase().includes(query) ||
                s.licenseId.toLowerCase().includes(query) ||
                s.location.toLowerCase().includes(query)
            );
        }
        
        setFilteredStakeholders(filteredList);
    };

    useEffect(() => {
        const initializeContractAndData = async () => {
            setIsProcessing(true);
            setError("");
            
            try {
                // Get browser provider
                if (!window.ethereum) {
                    throw new Error("MetaMask not detected. Please install MetaMask.");
                }
                
                const provider = new ethers.BrowserProvider(window.ethereum);
                // Get the signer
                const signer = await provider.getSigner();
                
                // Initialize contract with signer for write operations
                const stakeholderContract = new ethers.Contract(
                    stakeholderManagerAddress,
                    stakeholderManagerABI,
                    signer
                );
                
                // Check if the user is an admin
                try {
                    console.log("Checking admin status...");
                    const userAddress = await signer.getAddress();
                    console.log("User address:", userAddress);
                    
                    // Simple check for admin status using isAdmin function
                    const isUserAdmin = await stakeholderContract.isAdmin(userAddress);
                    console.log("Is admin:", isUserAdmin);
                    
                    // Set admin status in state
                    setIsAdmin(isUserAdmin);
                    
                    // Attempt to get additional info for debugging
                    try {
                        const userRole = await stakeholderContract.getRole(userAddress);
                        const isActive = await stakeholderContract.isActive(userAddress);
                        console.log("Raw role:", userRole.toString());
                        console.log("Is active:", isActive);
                        
                        // If we have admin role but not active, try to activate
                        if (userRole.toString() === "6" && !isActive && !isUserAdmin) {
                            console.log("Admin role detected but not activated. Attempting activation...");
                            try {
                                const activateTx = await stakeholderContract.activate(userAddress);
                                await activateTx.wait();
                                console.log("Admin account activated successfully!");
                                
                                // Refresh admin status after activation
                                const isUserAdminNow = await stakeholderContract.isAdmin(userAddress);
                                setIsAdmin(isUserAdminNow);
                                console.log("Admin status after activation:", isUserAdminNow);
                            } catch (activationErr: any) {
                                console.warn("Could not activate account:", activationErr.message);
                            }
                        }
                    } catch (debugErr) {
                        console.warn("Could not get additional role info (non-critical):", debugErr);
                        // This is just debug info, so don't fail if it doesn't work
                    }
                    
                    // Proceed with loading data if we're an admin
                    if (isUserAdmin) {
                        console.log("User is admin, loading admin data...");
                        // First load stakeholders and statistics which don't have the onlyAdmin modifier
                        await loadStakeholders(stakeholderContract);
                        await loadStatistics(stakeholderContract);
                        
                        // Then load pending requests which has the onlyAdmin modifier
                        await loadPendingRequests(stakeholderContract);
                    } else {
                        console.log("User is not admin");
                        setError("You do not have admin privileges.");
                    }
                } catch (adminError: any) {
                    console.error("Error checking admin status:", adminError);
                    setError("Error checking admin status: " + adminError.message);
                }
            } catch (err: any) {
                setError("Error initializing: " + err.message);
                console.error(err);
            } finally {
                setIsProcessing(false);
            }
        };

        initializeContractAndData();
    }, []);
    
    // Function to load stakeholders data
    const loadStakeholders = async (contract: ethers.Contract) => {
        try {
            // Get all stakeholders addresses
            const stakeholdersAddresses = await contract.getAllStakeholders();
            
            const stakeholdersList: StakeholderInfo[] = [];
            
            // Get details for each stakeholder
            for (const address of stakeholdersAddresses) {
                try {
                    // Use getCompleteStakeholderInfo which returns more details (including license key)
                    const info = await contract.getCompleteStakeholderInfo(address);
                    
                    // Format the stakeholder info from the contract return values
                    const stakeholder: StakeholderInfo = {
                        address: address,  // Address is not returned by the function, we use the one from the loop
                        role: info[0],     // Role index
                        name: info[1],     // Name
                        licenseId: info[2], // License ID
                        location: info[3],  // Location
                        certification: info[4], // Certification
                        isActive: info[5],  // Active status
                        registeredAt: Number(info[6]), // Registration timestamp
                        licenseKey: info[7], // License key
                        licenseKeyGeneratedAt: Number(info[8]) // License key generation timestamp
                    };
                    
                    stakeholdersList.push(stakeholder);
                } catch (error) {
                    console.warn(`Failed to get complete info for ${address}, falling back to basic info`);
                    
                    // Fallback to basic stakeholder info (no license key)
                    try {
                        const basicInfo = await contract.getStakeholderInfo(address);
                        
                        const stakeholder: StakeholderInfo = {
                            address: address,
                            role: basicInfo[0],
                            name: basicInfo[1],
                            licenseId: basicInfo[2],
                            location: basicInfo[3],
                            certification: basicInfo[4],
                            isActive: basicInfo[5],
                            registeredAt: Number(basicInfo[6]),
                            licenseKey: '', // No license key available from basic info
                            licenseKeyGeneratedAt: 0
                        };
                        
                        stakeholdersList.push(stakeholder);
                    } catch (infoError) {
                        console.error(`Failed to get any info for stakeholder ${address}`, infoError);
                    }
                }
            }
            
            setStakeholdersList(stakeholdersList);
            setFilteredStakeholders(stakeholdersList);
        } catch (err: any) {
            setError("Error loading stakeholders: " + err.message);
            console.error(err);
        }
    };
    
    // Function to load pending registration requests
    const loadPendingRequests = async (contract: ethers.Contract) => {
        try {
            console.log("Attempting to load pending requests...");
            
            // First check if we're admin directly from the contract, don't rely on state
            try {
                // Get signer address
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const userAddress = await signer.getAddress();
                
                // Check admin status directly (don't trust state)
                const isUserAdmin = await contract.isAdmin(userAddress);
                console.log("Admin check result for pending requests:", isUserAdmin);
                
                if (!isUserAdmin) {
                    console.log("User is not admin, skipping pending requests load");
                    setPendingRequests([]);
                    return;
                }
            } catch (adminCheckError) {
                console.error("Error checking admin status for pending requests:", adminCheckError);
                setPendingRequests([]);
                return;
            }

            console.log("Loading pending requests as admin");
            const pendingIds = await contract.getPendingRequests();
            console.log("Found pending request IDs:", pendingIds);
            
            const requests: RegistrationRequest[] = [];
            
            // Fetch details for each request
            for (let i = 0; i < pendingIds.length; i++) {
                try {
                    const requestId = Number(pendingIds[i]);
                    console.log("Getting details for request ID:", requestId);
                    
                    // Get the request details
                    const requestDetails = await contract.getRegistrationRequest(requestId);
                    
                    // Format the request data
                    const request: RegistrationRequest = {
                        requestId: Number(requestDetails[0]),
                        applicant: requestDetails[1],
                        requestedRole: Number(requestDetails[2]),
                        name: requestDetails[3],
                        licenseId: requestDetails[4],
                        location: requestDetails[5],
                        certification: requestDetails[6],
                        businessDescription: requestDetails[7],
                        contactEmail: requestDetails[8],
                        requestedAt: Number(requestDetails[9]),
                        status: Number(requestDetails[10]),
                        reviewedBy: requestDetails[11],
                        reviewedAt: Number(requestDetails[12]),
                        reviewNotes: requestDetails[13],
                        generatedLicenseKey: requestDetails[14]
                    };
                    
                    requests.push(request);
                } catch (err) {
                    console.warn(`Error fetching details for request ${pendingIds[i]}:`, err);
                    // Continue with other requests
                }
            }
            
            console.log("Setting pending requests:", requests);
            setPendingRequests(requests);
        } catch (error) {
            console.error("Error loading pending requests:", error);
            setPendingRequests([]);
        }
    };
    
    // Function to load statistics
    const loadStatistics = async (contract: ethers.Contract) => {
        try {
            // Get total stakeholders count
            const total = await contract.getTotalStakeholders();
            setTotalStakeholders(Number(total));
            
            // Get role statistics in a single call
            const roleStats = await contract.getRoleStatistics();
            
            // Map the returned values to the role counts
            // The order based on contract: totalFarmers, totalProcessors, totalDistributors, totalShippers, totalRetailers, totalAdmins
            const roleCounts: {[key: number]: number} = {
                1: Number(roleStats[0]), // FARMER
                2: Number(roleStats[1]), // PROCESSOR
                3: Number(roleStats[2]), // DISTRIBUTOR
                4: Number(roleStats[3]), // SHIPPER
                5: Number(roleStats[4]), // RETAILER
                6: Number(roleStats[5])  // ADMIN
            };
            
            console.log("Role statistics:", roleStats);
            console.log("Role counts:", roleCounts);
            setStakeholdersByRoleCount(roleCounts);
            
            // Get request statistics using the getRegistrationStats function
            const requestStats = await contract.getRegistrationStats();
            
            // Map the returned values from getRegistrationStats
            // Order: totalRequests, pendingRequests, approvedRequests, rejectedRequests, cancelledRequests
            setRequestStats({
                total: Number(requestStats[0]),
                pending: Number(requestStats[1]),
                approved: Number(requestStats[2]),
                rejected: Number(requestStats[3]),
                cancelled: Number(requestStats[4])
            });
            
            console.log("Request statistics:", requestStats);
        } catch (err: any) {
            setError("Error loading statistics: " + err.message);
            console.error(err);
        }
    };
    
    // Function to filter stakeholders list
    const filterStakeholders = () => {
        let filtered = [...stakeholdersList];
        
        // Filter by role if specified
        if (selectedRole !== 0) {
            filtered = filtered.filter(stakeholder => stakeholder.role === selectedRole);
        }
        
        // Filter by active status
        if (selectedStatus === 1) {
            filtered = filtered.filter(stakeholder => stakeholder.isActive);
        } else if (selectedStatus === 2) {
            filtered = filtered.filter(stakeholder => !stakeholder.isActive);
        }
        
        setFilteredStakeholders(filtered);
    };
    
    // Apply filters whenever filter criteria change
    useEffect(() => {
        applyFilters();
    }, [selectedRole, selectedStatus, stakeholdersList]);
    
    // Auto-dismiss success/error messages after a timeout
    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => {
                if (success) setSuccess("");
                if (error) setError("");
            }, 5000); // 5 seconds
            
            return () => clearTimeout(timer);
        }
    }, [success, error]);
    
    // Function to handle viewing a registration request details
    const viewRequest = (request: RegistrationRequest) => {
        setCurrentRequest(request);
    };
    
    // Function to show confirmation modal
    const showConfirmationModal = (title: string, message: string, onConfirm: () => void) => {
        setModalTitle(title);
        setModalMessage(message);
        setModalConfirmAction(() => onConfirm);
        setShowModal(true);
    };

    // Function to approve a registration request
    const handleApproveRequest = async (requestId: number) => {
        try {
            setIsProcessing(true);
            
            // Find the request from state to get details
            const requestToApprove = pendingRequests.find(r => r.requestId === requestId);
            if (!requestToApprove) {
                throw new Error("Request not found");
            }
            
            if (!window.ethereum) {
                throw new Error("MetaMask not detected. Please install MetaMask.");
            }
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Initialize contract with signer for write operations
            const stakeholderContract = new ethers.Contract(
                stakeholderManagerAddress,
                stakeholderManagerABI,
                signer
            );
            
            // Initialize ProductBatch contract for role granting
            const productBatchContract = new ethers.Contract(
                productBatchAddress,
                productBatchABI,
                signer
            );

            // Initialize Registry contract for role granting
            const registryContract = new ethers.Contract(
                registryAddress,
                registryABI,
                signer
            );

            // Initialize ShipmentTracker contract for role granting
            const shipmentTrackerContract = new ethers.Contract(
                shipmentTrackerAddress,
                shipmentTrackerABI,
                signer
            );

            // Initialize OfferManager contract for role granting
            const offerManagerContract = new ethers.Contract(
                offerManagerAddress,
                offerManagerABI,
                signer
            );
            
            console.log(`Approving request ID: ${requestId}`);
            
            // Generate approval parameters - in a real app, you'd have UI to input these
            const approvalNotes = "Approved by admin";
            const licenseKey = generateRandomString(16); // Generate a random license key
            const generatedAt = Math.floor(Date.now() / 1000); // Current timestamp in seconds
            const validUntil = generatedAt + 31536000; // Valid for 1 year
            const licenseInfo = `License issued to ${requestToApprove.name}`;
            
            // Call contract function to approve the request
            // The contract only expects requestId and reviewNotes
            const tx = await stakeholderContract.approveRegistrationRequest(
                requestId,
                approvalNotes
            );
            
            console.log("Approval transaction sent, hash:", tx.hash);
            await tx.wait();
            console.log("Approval transaction confirmed");
            
            // Grant the requested role to the applicant in ProductBatch
            const requestedRoleId = requestToApprove.requestedRole;
            console.log(`Granting role ${requestedRoleId} to ${requestToApprove.applicant} in ProductBatch`);
            
            try {
                const grantRoleTx = await productBatchContract.grantRole(requestToApprove.applicant, requestedRoleId);
                console.log("Role grant transaction sent, hash:", grantRoleTx.hash);
                await grantRoleTx.wait();
                console.log("Role grant transaction confirmed");
            } catch (roleGrantError) {
                console.error("Failed to grant role in ProductBatch:", roleGrantError);
                // Don't fail the entire approval if role granting fails
                // The user can still be approved in StakeholderManager
            }

            // Grant the requested role to the applicant in Registry
            console.log(`Granting role ${requestedRoleId} to ${requestToApprove.applicant} in Registry`);
            try {
                const grantRoleTx = await registryContract.grantRole(requestToApprove.applicant, requestedRoleId);
                console.log("Role grant transaction sent, hash:", grantRoleTx.hash);
                await grantRoleTx.wait();
                console.log("Role grant transaction confirmed");
            } catch (roleGrantError) {
                console.error("Failed to grant role in Registry:", roleGrantError);
                // Don't fail the entire approval if role granting fails
                // The user can still be approved in StakeholderManager
            }

            // Grant the requested role to the applicant in ShipmentTracker
            console.log(`Granting role ${requestedRoleId} to ${requestToApprove.applicant} in ShipmentTracker`);
            try {
                const grantRoleTx = await shipmentTrackerContract.grantRole(requestToApprove.applicant, requestedRoleId);
                console.log("Role grant transaction sent, hash:", grantRoleTx.hash);
                await grantRoleTx.wait();
                console.log("Role grant transaction confirmed");
            } catch (roleGrantError) {
                console.error("Failed to grant role in ShipmentTracker:", roleGrantError);
                // Don't fail the entire approval if role granting fails
                // The user can still be approved in StakeholderManager
            }

            // Grant the requested role to the applicant in OfferManager
            console.log(`Granting role ${requestedRoleId} to ${requestToApprove.applicant} in OfferManager`);
            try {
                const grantRoleTx = await offerManagerContract.grantRole(requestToApprove.applicant, requestedRoleId);
                console.log("Role grant transaction sent, hash:", grantRoleTx.hash);
                await grantRoleTx.wait();
                console.log("Role grant transaction confirmed");
            } catch (roleGrantError) {
                console.error("Failed to grant role in OfferManager:", roleGrantError);
                // Don't fail the entire approval if role granting fails
                // The user can still be approved in StakeholderManager
            }
            
            // Remove the approved request from the pending list
            const updatedPendingRequests = pendingRequests.filter(r => r.requestId !== requestId);
            setPendingRequests(updatedPendingRequests);
            
            // Update statistics
            await loadStatistics(stakeholderContract);
            await loadStakeholders(stakeholderContract);
            
            // Show success message
            setSuccessMessage(`Successfully approved request for ${requestToApprove.name}`);
            setTimeout(() => setSuccessMessage(''), 5000);
            
        } catch (error: any) {
            console.error("Error approving request:", error);
            setError(`Error approving request: ${error.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Function to reject a registration request
    const handleRejectRequest = async (requestId: number) => {
        try {
            setIsProcessing(true);
            
            // Find the request from state
            const requestToReject = pendingRequests.find(r => r.requestId === requestId);
            if (!requestToReject) {
                throw new Error("Request not found");
            }
            
            if (!window.ethereum) {
                throw new Error("MetaMask not detected. Please install MetaMask.");
            }
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Initialize contract with signer
            const stakeholderContract = new ethers.Contract(
                stakeholderManagerAddress,
                stakeholderManagerABI,
                signer
            );
            
            console.log(`Rejecting request ID: ${requestId}`);
            
            // Call contract function to reject with reason
            const rejectionReason = "Rejected by admin"; // In a real app, you'd have UI to input this
            const tx = await stakeholderContract.rejectRegistrationRequest(requestId, rejectionReason);
            
            console.log("Rejection transaction sent, hash:", tx.hash);
            await tx.wait();
            console.log("Rejection transaction confirmed");
            
            // Remove the rejected request from the pending list
            const updatedPendingRequests = pendingRequests.filter(r => r.requestId !== requestId);
            setPendingRequests(updatedPendingRequests);
            
            // Update statistics
            await loadStatistics(stakeholderContract);
            
            // Show success message
            setSuccessMessage(`Successfully rejected request for ${requestToReject.name}`);
            setTimeout(() => setSuccessMessage(''), 5000);
            
        } catch (error: any) {
            console.error("Error rejecting request:", error);
            setError(`Error rejecting request: ${error.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Function to toggle stakeholder active status
    const toggleStakeholderStatus = async (stakeholder: StakeholderInfo) => {
        try {
            setIsProcessing(true);
            
            if (!window.ethereum) {
                throw new Error("MetaMask not detected. Please install MetaMask.");
            }
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            // Initialize contract with signer for write operations
            const stakeholderContract = new ethers.Contract(
                stakeholderManagerAddress,
                stakeholderManagerABI,
                signer
            );
            
            console.log(`Toggling status for stakeholder ${stakeholder.address} (current status: ${stakeholder.isActive})`);
            
            // Call the appropriate contract function based on current status
            let tx;
            if (stakeholder.isActive) {
                // Deactivate stakeholder
                tx = await stakeholderContract.deactivateStakeholder(stakeholder.address);
                console.log("Deactivating stakeholder - tx hash:", tx.hash);
            } else {
                // Reactivate stakeholder
                tx = await stakeholderContract.reactivateStakeholder(stakeholder.address);
                console.log("Reactivating stakeholder - tx hash:", tx.hash);
            }
            
            // Wait for transaction to be mined
            await tx.wait();
            console.log("Status update transaction confirmed");
            
            // Update stakeholder in the local list
            const updatedStakeholders = stakeholdersList.map(s => {
                if (s.address === stakeholder.address) {
                    return { ...s, isActive: !s.isActive };
                }
                return s;
            });
            
            setStakeholdersList(updatedStakeholders);
            applyFilters(); // Re-apply filters to update the filtered list
            
            // Show success message
            setSuccessMessage(`Successfully ${stakeholder.isActive ? 'deactivated' : 'activated'} stakeholder ${stakeholder.name}`);
            setTimeout(() => setSuccessMessage(''), 5000);
            
        } catch (error: any) {
            console.error("Error toggling stakeholder status:", error);
            setError(`Error updating stakeholder status: ${error.message}`);
            setTimeout(() => setError(''), 5000);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Function to regenerate license key
    const regenerateLicenseKey = async () => {
        if (!isAdmin || !licenseKeyAddress) {
            setError("You do not have admin privileges or no address specified.");
            return;
        }
        
        showConfirmationModal(
            "Regenerate License Key",
            `Are you sure you want to regenerate the license key for ${licenseKeyAddress}? This will invalidate any previous key and cannot be undone.`,
            async () => {
                setShowModal(false);
                setIsProcessing(true);
                setError("");
                setSuccess("");
                setLicenseKey("");
                
                try {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    
                    const contract = new ethers.Contract(
                        stakeholderManagerAddress,
                        stakeholderManagerABI,
                        signer
                    );
                    
                    // Call the contract to regenerate a license key
                    const generatedKey = await contract.regenerateLicenseKey(licenseKeyAddress);
                    
                    setSuccess(`License key for ${licenseKeyAddress} regenerated successfully!`);
                    setLicenseKey(generatedKey);
                    
                } catch (err: any) {
                    setError("Error regenerating license key: " + err.message);
                    console.error(err);
                } finally {
                    setIsProcessing(false);
                }
            }
        );
    };
    
    // Function to handle new registration form changes
    const handleRegistrationChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewRegistration(prev => ({ ...prev, [name]: name === "role" ? parseInt(value) : value }));
    };
    
    // Function to handle new registration submission
    const handleNewRegistration = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setIsProcessing(true);
        setError("");
        setSuccess("");
        
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            const contract = new ethers.Contract(
                stakeholderManagerAddress,
                stakeholderManagerABI,
                signer
            );
            
            // Call the contract to submit a registration request
            const tx = await contract.submitRegistrationRequest(
                newRegistration.role,
                newRegistration.name,
                newRegistration.licenseId,
                newRegistration.location,
                newRegistration.certification,
                newRegistration.businessDescription,
                newRegistration.contactEmail
            );
            
            await tx.wait();
            
            setSuccess("Registration request submitted successfully!");
            
            // Reset form
            setNewRegistration({
                role: 1,
                name: "",
                licenseId: "",
                location: "",
                certification: "",
                businessDescription: "",
                contactEmail: ""
            });
            
        } catch (err: any) {
            setError("Error submitting registration request: " + err.message);
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    // CSS styles for improved tab navigation and stakeholder display
    const tabStyles = `
        /* Tab Navigation Styles */
        .tab-navigation {
            display: flex;
            flex-wrap: wrap;
            gap: 0;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            width: 100%;
        }
        
        .tab-navigation button {
            padding: 12px 20px;
            font-size: 15px;
            background: transparent;
            border: none;
            border-bottom: 3px solid transparent;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
            font-weight: 500;
            outline: none;
            color: #666;
        }
        
        .tab-navigation button:hover {
            background-color: #f5f5f5;
            color: #333;
        }
        
        .tab-navigation button.active {
            border-bottom: 3px solid #0066cc;
            color: #0066cc;
            font-weight: 600;
        }
        
        .tab-navigation .badge {
            background-color: #ff4d4f;
            color: white;
            border-radius: 10px;
            padding: 2px 8px;
            font-size: 12px;
            margin-left: 8px;
            font-weight: bold;
        }
        
        /* Stakeholders Tab Styles */
        .filters {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f7f9fc;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .filter-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .filter-group label {
            font-weight: 500;
            color: #555;
            min-width: 60px;
        }
        
        .filter-group select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background-color: white;
            min-width: 150px;
            font-size: 14px;
            transition: border-color 0.2s;
        }
        
        .filter-group select:focus {
            border-color: #0066cc;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0,102,204,0.2);
        }
        
        .filters button {
            background-color: #0066cc;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.2s;
        }
        
        .filters button:hover {
            background-color: #0055aa;
        }
        
        .filters button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        
        /* Table Styles */
        .stakeholders-container {
            overflow-x: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .stakeholders-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .stakeholders-table thead th {
            background-color: #f0f5ff;
            color: #333;
            font-weight: 600;
            text-align: left;
            padding: 12px 16px;
            border-bottom: 2px solid #e6e9f0;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        
        .stakeholders-table tbody tr {
            border-bottom: 1px solid #eee;
            transition: background-color 0.2s;
        }
        
        .stakeholders-table tbody tr:hover {
            background-color: #f5faff;
        }
        
        .stakeholders-table td {
            padding: 12px 16px;
            vertical-align: middle;
        }
        
        .address-display {
            font-family: monospace;
            cursor: pointer;
        }
        
        .stakeholders-table button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .stakeholders-table button.activate-button {
            background-color: #52c41a;
            color: white;
        }
        
        .stakeholders-table button.deactivate-button {
            background-color: #ff4d4f;
            color: white;
        }
        
        .stakeholders-table button:hover {
            opacity: 0.85;
            transform: translateY(-1px);
        }
        
        /* Refresh Button */
        button.refresh-button {
            background-color: #1890ff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            margin-top: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        }
        
        button.refresh-button:hover {
            background-color: #40a9ff;
            transform: translateY(-1px);
        }
        
        /* Statistics Tab Styles */
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .stats-card {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            padding: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .stats-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.12);
        }
        
        .stats-card h3 {
            color: #333;
            font-size: 18px;
            margin-top: 0;
            margin-bottom: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 16px;
        }
        
        .stat-item {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .stat-label {
            color: #666;
            font-size: 14px;
        }
        
        .stat-value {
            color: #0066cc;
            font-size: 24px;
            font-weight: 600;
        }
        
        .refresh-section {
            margin-top: 20px;
            display: flex;
            justify-content: flex-start;
        }
    `;

    return (
        <div className="page-container stakeholders-page">
            <style>{tabStyles}</style>
            
            {/* Message banners */}
            <div className="message-container">
                {error && <div className="error-message">{error}</div>}
                {successMessage && <div className="success-message">{successMessage}</div>}
                {success && <div className="success-message">{success}</div>}
            </div>
            
            {/* Loading spinner */}
            <LoadingSpinner show={isProcessing} />
            
            {/* Confirmation modal */}
            <ConfirmationModal 
                isOpen={showModal}
                title={modalTitle}
                message={modalMessage}
                onConfirm={modalConfirmAction}
                onCancel={() => setShowModal(false)}
            />
            
            {!isAdmin ? (
                <div className="error-message">You need admin privileges to access this page.</div>
            ) : (
                <div>
                    {/* Tab navigation */}
                    <div className="tab-navigation">
                        <button 
                            className={activeTab === "requests" ? "active" : ""} 
                            onClick={() => setActiveTab("requests")}
                        >
                            Registration Requests
                            {requestStats.pending > 0 && (
                                <span className="badge">{requestStats.pending}</span>
                            )}
                        </button>
                        <button 
                            className={activeTab === "stakeholders" ? "active" : ""} 
                            onClick={() => setActiveTab("stakeholders")}
                        >
                            Stakeholders
                        </button>
                        <button 
                            className={activeTab === "stats" ? "active" : ""} 
                            onClick={() => setActiveTab("stats")}
                        >
                            Statistics
                        </button>
                        <button 
                            className={activeTab === "license" ? "active" : ""} 
                            onClick={() => setActiveTab("license")}
                        >
                            License Key Management
                        </button>
                    </div>
                    
                    {/* Registration Requests Tab */}
                    {activeTab === "requests" && (
                        <div className="section">
                            <h2>Pending Registration Requests</h2>
                            {pendingRequests.length === 0 ? (
                                <p>No pending registration requests.</p>
                            ) : (
                                <div className="requests-container">
                                    <div className="requests-list">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Request ID</th>
                                                    <th>Applicant</th>
                                                    <th>Role</th>
                                                    <th>Business Name</th>
                                                    <th>Date</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pendingRequests.map((request) => (
                                                <tr key={request.requestId} className={currentRequest?.requestId === request.requestId ? "selected" : ""}>
                                                    <td>{request.requestId}</td>
                                                    <td>
                                                        <span 
                                                            className="address-display" 
                                                            data-full-address={request.applicant}
                                                        >
                                                            {formatAddress(request.applicant)}
                                                        </span>
                                                    </td>
                                                    <td>{getRoleName(request.requestedRole)}</td>
                                                    <td>{request.name}</td>
                                                    <td>{new Date(request.requestedAt * 1000).toLocaleDateString()}</td>
                                                    <td>
                                                        <button onClick={() => viewRequest(request)}>View Details</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                {currentRequest && (
                                    <div className="request-details">
                                        <h3>Request Details</h3>
                                        <div className="details-grid">
                                            <div className="detail-item">
                                                <strong>Business Name:</strong> {currentRequest.name}
                                            </div>
                                            <div className="detail-item">
                                                <strong>Role:</strong> {getRoleName(currentRequest.requestedRole)}
                                            </div>
                                            <div className="detail-item">
                                                <strong>License ID:</strong> {currentRequest.licenseId}
                                            </div>
                                            <div className="detail-item">
                                                <strong>Location:</strong> {currentRequest.location}
                                            </div>
                                            <div className="detail-item">
                                                <strong>Certification:</strong> {currentRequest.certification}
                                            </div>
                                            <div className="detail-item">
                                                <strong>Contact:</strong> {currentRequest.contactEmail}
                                            </div>
                                            <div className="detail-item full-width">
                                                <strong>Business Description:</strong>
                                                <p>{currentRequest.businessDescription}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="review-form">
                                            <div className="form-group">
                                                <label>Review Notes:</label>
                                                <textarea 
                                                    value={reviewNotes} 
                                                    onChange={(e) => setReviewNotes(e.target.value)} 
                                                    placeholder="Enter your review notes here..."
                                                />
                                            </div>
                                            
                                            <div className="form-group">
                                                <label>License Key Notes:</label>
                                                <textarea 
                                                    value={licenseKeyNotes} 
                                                    onChange={(e) => setLicenseKeyNotes(e.target.value)} 
                                                    placeholder="Enter notes for license key generation..."
                                                />
                                            </div>
                                            
                                            <div className="button-group">
                                                <button 
                                                    className="approve-button" 
                                                    onClick={() => handleApproveRequest(currentRequest.requestId)}
                                                    disabled={isProcessing}
                                                >
                                                    Approve Request
                                                </button>
                                                <button 
                                                    className="reject-button" 
                                                    onClick={() => handleRejectRequest(currentRequest.requestId)}
                                                    disabled={isProcessing}
                                                >
                                                    Reject Request
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                
                {/* Stakeholders Tab */}
                {activeTab === "stakeholders" && (
                    <div className="section">
                        <h2>Stakeholders</h2>
                        
                        <div className="filters">
                            <div className="filter-group">
                                <label>Role:</label>
                                <select 
                                    value={selectedRole} 
                                    onChange={(e) => setSelectedRole(parseInt(e.target.value))}
                                >
                                    <option value="0">All Roles</option>
                                    <option value="1">Farmer</option>
                                    <option value="2">Processor</option>
                                    <option value="3">Distributor</option>
                                    <option value="4">Retailer</option>
                                    <option value="5">Consumer</option>
                                    <option value="6">Admin</option>
                                </select>
                            </div>
                            
                            <div className="filter-group">
                                <label>Status:</label>
                                <select 
                                    value={selectedStatus} 
                                    onChange={(e) => setSelectedStatus(parseInt(e.target.value))}
                                >
                                    <option value="0">All</option>
                                    <option value="1">Active</option>
                                    <option value="2">Inactive</option>
                                </select>
                            </div>
                            
                            <button 
                                onClick={() => applyFilters()}
                                disabled={isProcessing}
                            >
                                Apply Filters
                            </button>
                        </div>
                        
                        <div className="stakeholders-container">
                            <table className="stakeholders-table">
                                <thead>
                                    <tr>
                                        <th>Address</th>
                                        <th>Name</th>
                                        <th>Role</th>
                                        <th>License ID</th>
                                        <th>Location</th>
                                        <th>Registered</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStakeholders.map((stakeholder) => (
                                        <tr key={stakeholder.address}>
                                            <td>
                                                <span 
                                                    className="address-display" 
                                                    data-full-address={stakeholder.address}
                                                >
                                                    {formatAddress(stakeholder.address)}
                                                </span>
                                            </td>
                                            <td>{stakeholder.name}</td>
                                            <td>{getRoleName(stakeholder.role)}</td>
                                            <td>{stakeholder.licenseId}</td>
                                            <td>{stakeholder.location}</td>
                                            <td>{new Date(stakeholder.registeredAt * 1000).toLocaleDateString()}</td>
                                            <td>
                                                <span className={stakeholder.isActive ? "status-active" : "status-inactive"}>
                                                    {stakeholder.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td>
                                                <button 
                                                    className={stakeholder.isActive ? "deactivate-button" : "activate-button"}
                                                    onClick={() => toggleStakeholderStatus(stakeholder)}
                                                    disabled={isProcessing}
                                                >
                                                    {stakeholder.isActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {filteredStakeholders.length === 0 && (
                                <p className="no-data-message">No stakeholders found matching the selected filters.</p>
                            )}
                        </div>
                        
                        <div className="action-buttons">
                            <button 
                                onClick={() => {
                                    const refreshList = async () => {
                                        if (!window.ethereum) return;
                                        const provider = new ethers.BrowserProvider(window.ethereum);
                                        const signer = await provider.getSigner();
                                        const contract = new ethers.Contract(
                                            stakeholderManagerAddress,
                                            stakeholderManagerABI,
                                            signer
                                        );
                                        await loadStakeholders(contract);
                                    };
                                    refreshList();
                                }}
                                className="refresh-button"
                                disabled={isProcessing}
                            >
                                <span>↻</span> Refresh List
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Statistics Tab */}
                {activeTab === "stats" && (
                    <div className="section">
                        <h2>Stakeholder Statistics</h2>
                        
                        <div className="stats-container">
                            <div className="stats-card">
                                <h3>Stakeholders</h3>
                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <span className="stat-label">Total Stakeholders:</span>
                                        <span className="stat-value">{totalStakeholders}</span>
                                    </div>
                                    
                                    <div className="stat-item">
                                        <span className="stat-label">Farmers:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[1] || 0}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Processors:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[2] || 0}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Distributors:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[3] || 0}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Retailers:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[4] || 0}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Consumers:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[5] || 0}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Admins:</span>
                                        <span className="stat-value">{stakeholdersByRoleCount[6] || 0}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="stats-card">
                                <h3>Registration Requests</h3>
                                <div className="stats-grid">
                                    <div className="stat-item">
                                        <span className="stat-label">Total Requests:</span>
                                        <span className="stat-value">{requestStats.total}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Pending:</span>
                                        <span className="stat-value">{requestStats.pending}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Approved:</span>
                                        <span className="stat-value">{requestStats.approved}</span>
                                    </div>
                                    <div className="stat-item">
                                        <span className="stat-label">Rejected:</span>
                                        <span className="stat-value">{requestStats.rejected}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="refresh-section">
                            <button 
                                className="refresh-button"
                                onClick={() => {
                                    const refreshStats = async () => {
                                        if (!window.ethereum) return;
                                        const provider = new ethers.BrowserProvider(window.ethereum);
                                        const signer = await provider.getSigner();
                                        const contract = new ethers.Contract(
                                            stakeholderManagerAddress,
                                            stakeholderManagerABI,
                                            signer
                                        );
                                        await loadStatistics(contract);
                                    };
                                    refreshStats();
                                }}
                                disabled={isProcessing}
                            >
                                <span>↻</span> Refresh Statistics
                            </button>
                        </div>
                    </div>
                )}
                
                {/* License Key Management Tab */}
                {activeTab === "license" && (
                        <div className="section">
                            <h2>License Key Management</h2>
                            
                            <div className="license-key-form">
                                <div className="form-group">
                                    <label>Stakeholder Address:</label>
                                    <input 
                                        type="text" 
                                        value={licenseKeyAddress} 
                                        onChange={(e) => setLicenseKeyAddress(e.target.value)}
                                        placeholder="Enter stakeholder's Ethereum address"
                                    />
                                </div>
                                
                                <button 
                                    onClick={regenerateLicenseKey}
                                    disabled={!licenseKeyAddress || isProcessing}
                                >
                                    Regenerate License Key
                                </button>
                            </div>
                            
                            {licenseKey && (
                                <div className="license-key-result">
                                    <h3>Generated License Key</h3>
                                    <div className="key-display">
                                        <pre>{licenseKey}</pre>
                                    </div>
                                    <p className="key-note">
                                        This key has been generated for {licenseKeyAddress} and stored in the contract.
                                        Please provide this key to the stakeholder securely.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Stakeholders;
