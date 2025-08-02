import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/stakeholders.css";

// Define ABI for StakeholderManager contract
const StakeholderManagerABI = [
    // Registration request function
    "function submitRegistrationRequest(uint8, string, string, string, string, string, string) external returns (uint256)"
];

// Role enum to match Solidity contract
enum Role {
    NONE = 0,
    FARMER = 1,
    PROCESSOR = 2,
    DISTRIBUTOR = 3,
    SHIPPER = 4,
    RETAILER = 5,
    ADMIN = 6
}

// Role names mapping
const roleNames: { [key: number]: string } = {
    1: "FARMER",
    2: "PROCESSOR",
    3: "DISTRIBUTOR",
    4: "SHIPPER",
    5: "RETAILER"
};

const StakeholderRegistration: React.FC = () => {
    // Contract address from environment variables
    const stakeholderManagerAddress = process.env.REACT_APP_STAKEHOLDER_MANAGER_ADDRESS || 
        "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // Fallback for local dev
    
    // Form state
    const [formData, setFormData] = useState({
        role: Role.FARMER,
        name: "",
        licenseId: "",
        location: "",
        certification: "",
        businessDescription: "",
        contactEmail: ""
    });
    
    // UI state
    const [connected, setConnected] = useState(false);
    const [account, setAccount] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionStatus, setSubmissionStatus] = useState<{
        type: "success" | "error" | null;
        message: string;
    }>({ type: null, message: "" });

    // Check wallet connection
    useEffect(() => {
        const checkConnection = async () => {
            if (window.ethereum) {
                try {
                    const accounts = await window.ethereum.request({
                        method: "eth_accounts"
                    }) as string[];
                    
                    if (accounts.length > 0) {
                        setAccount(accounts[0]);
                        setConnected(true);
                    }
                } catch (error) {
                    console.error("Error checking connection:", error);
                }
            }
        };
        
        checkConnection();
        
        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    setConnected(true);
                } else {
                    setAccount("");
                    setConnected(false);
                }
            });
        }
        
        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener("accountsChanged", () => {});
            }
        };
    }, []);
    
    // Connect wallet function
    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({
                    method: "eth_requestAccounts"
                }) as string[];
                
                setAccount(accounts[0]);
                setConnected(true);
            } catch (error) {
                console.error("Error connecting wallet:", error);
            }
        } else {
            alert("MetaMask is not installed. Please install it to use this app.");
        }
    };
    
    // Handle form changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: name === "role" ? parseInt(value) : value
        });
    };
    
    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmissionStatus({ type: null, message: "" });
        
        try {
            if (!window.ethereum || !connected) {
                throw new Error("Please connect your wallet first");
            }
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            
            const contract = new ethers.Contract(
                stakeholderManagerAddress,
                StakeholderManagerABI,
                signer
            );
            
            // Submit registration request
            const tx = await contract.submitRegistrationRequest(
                formData.role,
                formData.name,
                formData.licenseId,
                formData.location,
                formData.certification,
                formData.businessDescription,
                formData.contactEmail
            );
            
            console.log("Transaction sent:", tx.hash);
            await tx.wait();
            
            setSubmissionStatus({
                type: "success",
                message: "Registration request submitted successfully! Your request is now pending review by an admin."
            });
            
            // Reset form
            setFormData({
                role: Role.FARMER,
                name: "",
                licenseId: "",
                location: "",
                certification: "",
                businessDescription: "",
                contactEmail: ""
            });
        } catch (error: any) {
            console.error("Error submitting registration:", error);
            setSubmissionStatus({
                type: "error",
                message: `Error submitting registration: ${error.message || "Unknown error"}`
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="stakeholder-registration-container">
            <h2>Register as a Stakeholder</h2>
            
            {!connected ? (
                <div className="connect-wallet-prompt">
                    <p>Please connect your wallet to continue</p>
                    <button className="connect-btn" onClick={connectWallet}>
                        Connect Wallet
                    </button>
                </div>
            ) : (
                <>
                    <div className="registration-intro">
                        <p>Complete the form below to submit your registration request to become a stakeholder in the supply chain.</p>
                        <p className="connected-address">Connected Address: <span className="address">{account}</span></p>
                    </div>
                    
                    {submissionStatus.type && (
                        <div className={`status-message ${submissionStatus.type}`}>
                            {submissionStatus.message}
                        </div>
                    )}
                    
                    <form onSubmit={handleSubmit} className="registration-form">
                        <div className="form-group">
                            <label htmlFor="role">Stakeholder Role</label>
                            <select
                                id="role"
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                required
                            >
                                {Object.entries(roleNames).map(([value, name]) => (
                                    <option key={value} value={value}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="name">Organization/Company Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Your business name"
                                required
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="licenseId">License ID</label>
                            <input
                                type="text"
                                id="licenseId"
                                name="licenseId"
                                value={formData.licenseId}
                                onChange={handleChange}
                                placeholder="Your business license ID"
                                required
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="location">Location</label>
                            <input
                                type="text"
                                id="location"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                placeholder="Business location"
                                required
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="certification">Certifications (Optional)</label>
                            <input
                                type="text"
                                id="certification"
                                name="certification"
                                value={formData.certification}
                                onChange={handleChange}
                                placeholder="Any relevant certifications"
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="businessDescription">Business Description (Optional)</label>
                            <textarea
                                id="businessDescription"
                                name="businessDescription"
                                value={formData.businessDescription}
                                onChange={handleChange}
                                placeholder="Describe your business..."
                                rows={4}
                            />
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="contactEmail">Contact Email</label>
                            <input
                                type="email"
                                id="contactEmail"
                                name="contactEmail"
                                value={formData.contactEmail}
                                onChange={handleChange}
                                placeholder="contact@example.com"
                                required
                            />
                        </div>
                        
                        <div className="form-actions">
                            <button 
                                type="submit" 
                                className="submit-btn"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Submitting..." : "Submit Registration"}
                            </button>
                        </div>
                    </form>
                </>
            )}
        </div>
    );
};

export default StakeholderRegistration;
