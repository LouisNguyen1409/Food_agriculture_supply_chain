import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useContracts } from "../hooks/useContracts";
import '../styles/AccountSwitcher.css'; // Add this import

interface Account {
  address: string;
  ensName?: string;
  balance?: string;
}

const AccountSwitcher: React.FC = () => {
  const { isConnected, connectWallet, disconnectWallet, signer, loading } = useContracts();
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (isConnected && signer) {
      loadAccountInfo();
    } else {
      setCurrentAccount(null);
    }
  }, [isConnected, signer]);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          setTimeout(loadAccountInfo, 100);
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, [signer]);

  const loadAccountInfo = async () => {
    if (!signer) return;

    try {
      const address = await signer.getAddress();
      const balance = await signer.provider.getBalance(address);

      setCurrentAccount({
        address: address,
        balance: ethers.formatEther(balance)
      });
    } catch (err) {
      console.error('Error loading account info:', err);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    return `${parseFloat(balance).toFixed(4)} ETH`;
  };

  if (loading) {
    return (
      <div className="account-switcher">
        <div className="connect-container">
          <button className="connect-btn" disabled>
            🔄 Connecting...
          </button>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="account-switcher">
        <div className="connect-container">
          <button className="connect-btn" onClick={connectWallet}>
            🦊 Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="account-switcher">
      <div className="connected-container">
        <div className="current-account">
          <div className="account-indicator">
            <div className="status-dot connected"></div>
            <span className="status-text">Connected</span>
          </div>
          <div className="account-address">
            {currentAccount ? formatAddress(currentAccount.address) : 'Loading...'}
          </div>
          {currentAccount?.balance && (
            <div className="account-balance">
              {formatBalance(currentAccount.balance)}
            </div>
          )}
        </div>
        <div className="account-actions">
          <button className="disconnect-btn" onClick={disconnectWallet}>
            🚪 Disconnect
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountSwitcher;