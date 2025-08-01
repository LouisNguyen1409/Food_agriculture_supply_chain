import React, { useState, useEffect } from "react"
import { ethers } from "ethers"
import "../styles/AccountSwitcher.css"

interface Account {
    address: string
    ensName?: string
    balance?: string
}

const AccountSwitcher: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [currentAccount, setCurrentAccount] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState<boolean>(false)

    useEffect(() => {
        // Check if already connected
        checkConnection()

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts: string[]) => {
                if (accounts.length > 0) {
                    setCurrentAccount(accounts[0])
                    setIsConnected(true)
                } else {
                    setCurrentAccount(null)
                    setIsConnected(false)
                }
                loadAccounts()
            })
        }

        return () => {
            // Clean up listeners
            if (window.ethereum) {
                window.ethereum.removeListener("accountsChanged", () => {})
            }
        }
    }, [])

    const checkConnection = async () => {
        if (window.ethereum) {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum)
                const accounts = await provider.listAccounts()
                if (accounts.length > 0) {
                    setCurrentAccount(accounts[0].address)
                    setIsConnected(true)
                    loadAccounts()
                }
            } catch (error) {
                console.error("Failed to check connection:", error)
            }
        }
    }

    const loadAccounts = async () => {
        if (!window.ethereum) return

        try {
            // This will prompt the user to connect if not connected
            await window.ethereum.request({ method: "eth_requestAccounts" })
            const provider = new ethers.BrowserProvider(window.ethereum)
            const accounts = await provider.listAccounts()

            // Format and display accounts
            const accountsWithInfo = await Promise.all(
                accounts.map(async (account) => {
                    const balance = await provider.getBalance(account.address)
                    return {
                        address: account.address,
                        balance: ethers.formatEther(balance).substring(0, 6) + " ETH",
                    }
                })
            )

            setAccounts(accountsWithInfo)
        } catch (error) {
            console.error("Failed to load accounts:", error)
        }
    }

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert("MetaMask is not installed. Please install it to use this feature.")
            return
        }

        try {
            // Request account access
            await window.ethereum.request({ method: "eth_requestAccounts" })
            loadAccounts()
        } catch (error) {
            console.error("User denied account access:", error)
        }
    }

    const switchAccount = async () => {
        try {
            // This will open the MetaMask popup to select an account
            await window.ethereum.request({
                method: "wallet_requestPermissions",
                params: [{ eth_accounts: {} }],
            })
            // After switching, reload accounts
            loadAccounts()
        } catch (error) {
            console.error("Failed to switch account:", error)
        }
    }

    const disconnectWallet = async () => {
        setIsConnected(false)
        setCurrentAccount(null)
        setAccounts([])
        // Note: There is no standard way to disconnect in MetaMask
        // The user has to disconnect from MetaMask UI
        alert("Please disconnect manually from your MetaMask extension if needed.")
    }

    const formatAddress = (address: string): string => {
        return `${address.substring(0, 6)}...${address.substring(
            address.length - 4
        )}`
    }

    return (
        <div className="account-switcher">
            {isConnected && currentAccount ? (
                <div className="connected-container">
                    <div className="current-account">
                        <div className="account-indicator">
                            <div className="status-dot connected"></div>
                            <span className="status-text">Connected</span>
                        </div>
                        <div className="account-address">
                            {formatAddress(currentAccount)}
                        </div>
                    </div>
                    <div className="account-actions">
                        <button className="switch-btn" onClick={switchAccount}>
                            Switch Account
                        </button>
                        <button
                            className="disconnect-btn"
                            onClick={disconnectWallet}
                        >
                            Disconnect
                        </button>
                    </div>
                    {accounts.length > 0 && (
                        <div className="accounts-list">
                            <h3>Available Accounts</h3>
                            <ul>
                                {accounts.map((account, index) => (
                                    <li
                                        key={account.address}
                                        className={
                                            account.address === currentAccount
                                                ? "active"
                                                : ""
                                        }
                                    >
                                        <span className="account-number">
                                            Account {index}:
                                        </span>
                                        <span className="account-address">
                                            {formatAddress(account.address)}
                                        </span>
                                        <span className="account-balance">
                                            {account.balance}
                                        </span>
                                        {account.address === currentAccount && (
                                            <span className="active-indicator">
                                                ✓ Active
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            ) : (
                <div className="connect-container">
                    <button className="connect-btn" onClick={connectWallet}>
                        Connect Wallet
                    </button>
                </div>
            )}
        </div>
    )
}

export default AccountSwitcher
