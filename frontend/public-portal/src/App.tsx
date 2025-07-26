import React, { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom"
import { ethers } from "ethers"
import "./App.css"
import "./styles/pages.css"

// Import components and pages
import { Home, Verify, Track, CreateProduct, CreateShipment } from "./pages"

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

    // Connect wallet function
    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = (await window.ethereum.request({
                    method: "eth_requestAccounts",
                })) as string[]
                setAccount(accounts[0])
                setIsConnected(true)
            } catch (error) {
                console.error("Error connecting wallet:", error)
            }
        } else {
            alert("Please install MetaMask or another Ethereum wallet")
        }
    }

    return (
        <Router>
            <div className="App">
                <header className="app-header">
                    <h1>Agricultural Supply Chain - Public Portal</h1>
                    <div className="header-right">
                        {isConnected ? (
                            <div className="wallet-info">
                                <span className="wallet-status connected">
                                    Connected: {account.substring(0, 6)}...
                                    {account.substring(38)}
                                </span>
                                <span className="network-badge">
                                    ChainID: {chainId}
                                </span>
                            </div>
                        ) : (
                            <button
                                className="connect-wallet"
                                onClick={connectWallet}
                            >
                                Connect Wallet
                            </button>
                        )}
                    </div>
                </header>

                <main>
                    <nav className="nav-links">
                        <ul>
                            <li>
                                <Link to="/">Home</Link>
                            </li>
                            <li>
                                <Link to="/create-product">Create Product</Link>
                            </li>
                            <li>
                                <Link to="/create-shipment">
                                    Create Shipment
                                </Link>
                            </li>
                            <li>
                                <Link to="/verify">Verify Product</Link>
                            </li>
                            <li>
                                <Link to="/track">Track Shipment</Link>
                            </li>
                        </ul>
                    </nav>

                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route
                            path="/create-product"
                            element={<CreateProduct />}
                        />
                        <Route
                            path="/create-shipment"
                            element={<CreateShipment />}
                        />
                        <Route path="/verify" element={<Verify />} />
                        <Route path="/track" element={<Track />} />
                    </Routes>
                </main>

                <footer>
                    <p>
                        © {new Date().getFullYear()} Agricultural Supply Chain -
                        Public Verification Portal
                    </p>
                </footer>
            </div>
        </Router>
    )
}

export default App
