import React, { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"
import { ethers } from "ethers"
import "./App.css"
import "./styles/pages.css"

// Import components and pages
import { Home } from "./pages"
import Stakeholders from "./pages/Stakeholders"
import StakeholderRegistration from "./pages/StakeholderRegistration"
import Farmer from "./pages/Farmer"
import Shipper from "./pages/Shipper"
import Processor from "./pages/Processor"
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

function App() {
    const [isConnected, setIsConnected] = useState(false)
    const [account, setAccount] = useState<string>("")
    const [chainId, setChainId] = useState<number>(0)

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
                    }
                } catch (error) {
                    console.error("Error checking connection:", error)
                }
            }
        }

        checkConnection()

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts: string[]) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0])
                    setIsConnected(true)
                } else {
                    setAccount("")
                    setIsConnected(false)
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

    // Connect wallet function is now handled by the AccountSwitcher component

    return (
        <Router>
            <div className="App">
                <header className="app-header">
                    <h1>Agricultural Supply Chain - Admin Portal</h1>
                    <div className="header-right">
                        <span className="network-badge">
                            ChainID: {chainId || "Not Connected"}
                        </span>
                    </div>
                </header>

                <main>
                    <div className="account-switcher-container">
                        <AccountSwitcher />
                    </div>
                    <nav className="nav-links">
                        <ul>
                            <li>
                                <Link to="/">Home</Link>
                            </li>
                            <li>
                                <Link to="/stakeholders">Stakeholder Management</Link>
                            </li>
                            <li>
                                <Link to="/register">Register as Stakeholder</Link>
                            </li>
                            <li>
                                <Link to="/farmer">Farmer Dashboard</Link>
                            </li>
                            <li>
                                <Link to="/shipper">Shipper Dashboard</Link>
                            </li>
                            <li>
                                <Link to="/processor">Processor Dashboard</Link>
                            </li>
                        </ul>
                    </nav>

                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/stakeholders" element={<Stakeholders />} />
                        <Route path="/register" element={<StakeholderRegistration />} />
                        <Route path="/farmer" element={<Farmer />} />
                        <Route path="/shipper" element={<Shipper />} />
                        <Route path="/processor" element={<Processor />} />
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
