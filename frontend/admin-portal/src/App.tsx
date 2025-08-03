import React, { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"
import { ethers } from "ethers"
import "./App.css"
import "./styles/pages.css"
import "./styles/stakeholders.css";
import "./styles/farmer.css";
import "./styles/shipper.css";
import "./styles/processor.css";
import "./styles/distributor.css";
import "./styles/retailer.css";

// Import components and pages
import { Home } from "./pages"
import Stakeholders from "./pages/Stakeholders"
import StakeholderRegistration from "./pages/StakeholderRegistration"
import Farmer from "./pages/Farmer"
import Shipper from "./pages/Shipper"
import Processor from "./pages/Processor"
import Distributor from "./pages/Distributor";
import Retailer from "./pages/Retailer";
import AccountSwitcher from "./components/AccountSwitcher"

// Network configuration
const NETWORK_CONFIGS = {
    hardhat: {
        chainId: 31337,
        name: "Hardhat Local",
        rpcUrl: "http://localhost:8545",
    },
    // Add other networks as needed
}

const getCurrentNetworkConfig = () => {
    return NETWORK_CONFIGS.hardhat // Default to Hardhat local network
}

// Contract addresses for role checking
const CONTRACT_ADDRESSES = {
    accessControl: process.env.REACT_APP_ACCESS_CONTROL_ADDRESS || "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
};

const accessControlABI = [
    "function hasRole(address, uint8) external view returns (bool)",
    "function getRole(address) external view returns (uint8)",
    "function isActive(address) external view returns (bool)",
    "function isFullyActive(address) external view returns (bool)"
];

function App() {
    const [isConnected, setIsConnected] = useState(false)
    const [account, setAccount] = useState<string>("")
    const [chainId, setChainId] = useState<number>(0)
    const [userRole, setUserRole] = useState<number>(0)
    const [isUserActive, setIsUserActive] = useState<boolean>(false)

    // Check if wallet is connected on load
    useEffect(() => {
        const checkConnection = async () => {
            if (window.ethereum) {
                try {
                    // Get accounts
                    const accounts = (await window.ethereum.request({
                        method: "eth_accounts",
                    })) as string[]
                    if (accounts.length > 0) {
                        setAccount(accounts[0])
                        setIsConnected(true)

                        // Get chain ID
                        const provider = new ethers.BrowserProvider(
                            window.ethereum
                        )
                        const network = await provider.getNetwork()
                        setChainId(Number(network.chainId))
                        
                        // Check user role
                        await checkUserRole(accounts[0])
                    }
                } catch (error) {
                    console.error("Error checking connection:", error)
                }
            }
        }

        checkConnection()

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", async (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0])
                    setIsConnected(true)
                    await checkUserRole(accounts[0])
                } else {
                    setAccount("")
                    setIsConnected(false)
                    setUserRole(0)
                    setIsUserActive(false)
                }
            })

            // Listen for chain changes
            window.ethereum.on("chainChanged", () => {
                window.location.reload()
            })
        }

        return () => {
            // Clean up listeners
            if (window.ethereum) {
                window.ethereum.removeListener("accountsChanged", () => {})
                window.ethereum.removeListener("chainChanged", () => {})
            }
        }
    }, [])

    const checkUserRole = async (userAccount: string) => {
        if (!userAccount) return;
        
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(
                CONTRACT_ADDRESSES.accessControl,
                accessControlABI,
                signer
            );
            
            const role = await contract.getRole(userAccount);
            const isActive = await contract.isFullyActive(userAccount);
            
            setUserRole(Number(role));
            setIsUserActive(isActive);
            
        } catch (error) {
            console.error("Error checking user role:", error);
            setUserRole(0);
            setIsUserActive(false);
        }
    };

    // Get role name for display
    const getRoleName = (role: number): string => {
        const roles = {
            0: "NONE",
            1: "FARMER",
            2: "PROCESSOR", 
            3: "DISTRIBUTOR",
            4: "SHIPPER",
            5: "RETAILER",
            6: "ADMIN"
        };
        return roles[role as keyof typeof roles] || "UNKNOWN";
    };

    // Get navigation links based on role
    const getNavigationLinks = () => {
        if (!isConnected) {
            return [
                { to: "/", label: "Home" },
                { to: "/registration", label: "Register Stakeholder" }
            ];
        }

        if (!isUserActive) {
            return [
                { to: "/", label: "Home" },
                { to: "/registration", label: "Register Stakeholder" }
            ];
        }

        const role = getRoleName(userRole);
        
        switch (role) {
            case "ADMIN":
                return [
                    { to: "/", label: "Home" },
                    { to: "/stakeholders", label: "Stakeholder Management" }
                ];
            case "FARMER":
                return [
                    { to: "/", label: "Home" },
                    { to: "/farmer", label: "Farmer Dashboard" }
                ];
            case "PROCESSOR":
                return [
                    { to: "/", label: "Home" },
                    { to: "/processor", label: "Processor Dashboard" }
                ];
            case "DISTRIBUTOR":
                return [
                    { to: "/", label: "Home" },
                    { to: "/distributor", label: "Distributor Dashboard" }
                ];
            case "SHIPPER":
                return [
                    { to: "/", label: "Home" },
                    { to: "/shipper", label: "Shipper Dashboard" }
                ];
            case "RETAILER":
                return [
                    { to: "/", label: "Home" },
                    { to: "/retailer", label: "Retailer Dashboard" }
                ];
            default:
                return [
                    { to: "/", label: "Home" },
                    { to: "/registration", label: "Register Stakeholder" }
                ];
        }
    };

    const navigationLinks = getNavigationLinks();

    return (
        <Router>
            <div className="App">
                <header className="app-header">
                    <h1>Agricultural Supply Chain - Admin Portal</h1>
                    <div className="header-right">
                        <span className="network-badge">
                            ChainID: {chainId || "Not Connected"}
                        </span>
                        {isConnected && isUserActive && (
                            <span className="role-badge">
                                {getRoleName(userRole)}
                            </span>
                        )}
                    </div>
                </header>

                <main>
                    <div className="account-switcher-container">
                        <AccountSwitcher />
                    </div>
                    
                    <nav className="nav-menu">
                        {navigationLinks.map((link, index) => (
                            <Link 
                                key={index} 
                                to={link.to} 
                                className="nav-link"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/stakeholders" element={<Stakeholders />} />
                        <Route path="/registration" element={<StakeholderRegistration />} />
                        <Route path="/farmer" element={<Farmer />} />
                        <Route path="/shipper" element={<Shipper />} />
                        <Route path="/processor" element={<Processor />} />
                        <Route path="/distributor" element={<Distributor />} />
                        <Route path="/retailer" element={<Retailer />} />
                    </Routes>
                </main>

                <footer>
                    <p>
                        © {new Date().getFullYear()} Agricultural Supply Chain -
                        Admin Portal
                    </p>
                </footer>
            </div>
        </Router>
    )
}

export default App
