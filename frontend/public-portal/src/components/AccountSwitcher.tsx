import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../styles/AccountSwitcher.css";

interface Account {
    address: string;
    balance?: string;
}

const AccountSwitcher: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [currentAccount, setCurrentAccount] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);

    useEffect(() => {
        // DON'T auto-connect - remove checkConnection()
        // checkConnection(); ← REMOVE THIS LINE

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts: string[]) => {
                if (accounts.length > 0) {
                    setCurrentAccount(accounts[0]);
                    setIsConnected(true);
                    loadAccounts();
                } else {
                    setCurrentAccount(null);
                    setIsConnected(false);
                    setAccounts([]);
                }
            });

            window.ethereum.on("chainChanged", () => {
                window.location.reload();
            });
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener("accountsChanged", () => {});
                window.ethereum.removeListener("chainChanged", () => {});
            }
        };
    }, []);

    const loadAccounts = async () => {
        if (!window.ethereum) return;

        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.listAccounts();

            const accountsWithInfo = await Promise.all(
                accounts.map(async (account) => {
                    const balance = await provider.getBalance(account.address);

                    return {
                        address: account.address,
                        balance: ethers.formatEther(balance).substring(0, 6) + " ETH"
                    };
                })
            );

            setAccounts(accountsWithInfo);
        } catch (error) {
            console.error("Failed to load accounts:", error);
        }
    };

    const connectWallet = async () => {
        if (!window.ethereum) {
            alert("MetaMask is not installed. Please install it to use this feature.");
            return;
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            if (accounts.length > 0) {
                setCurrentAccount(accounts[0]);
                setIsConnected(true);
                loadAccounts();
            }
        } catch (error) {
            console.error("User denied account access:", error);
        }
    };

    const switchAccount = async () => {
        try {
            await window.ethereum.request({
                method: "wallet_requestPermissions",
                params: [{ eth_accounts: {} }],
            });
            loadAccounts();
        } catch (error) {
            console.error("Failed to switch account:", error);
        }
    };

    const disconnectWallet = async () => {
        setIsConnected(false);
        setCurrentAccount(null);
        setAccounts([]);
        console.log("Wallet disconnected");
    };

    const formatAddress = (address: string): string => {
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

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
                        {accounts.find(acc => acc.address === currentAccount)?.balance && (
                            <div className="account-balance">
                                {accounts.find(acc => acc.address === currentAccount)?.balance}
                            </div>
                        )}
                    </div>
                    <div className="account-actions">
                        <button className="switch-btn" onClick={switchAccount}>
                            🔄 Switch
                        </button>
                        <button className="disconnect-btn" onClick={disconnectWallet}>
                            🚪 Disconnect
                        </button>
                    </div>
                </div>
            ) : (
                <div className="connect-container">
                    <button className="connect-btn" onClick={connectWallet}>
                        🦊 Connect Wallet
                    </button>
                </div>
            )}
        </div>
    );
};

export default AccountSwitcher;