import { ethers } from 'ethers';
import { useState, useEffect, useCallback } from 'react';
import contractAddresses from '../constants/contractAddresses.json';

interface ContractInstances {
  productBatch?: ethers.Contract;
  publicVerification?: ethers.Contract;
  transactionRegistry?: ethers.Contract;
}

interface UseContractsReturn {
  contracts: ContractInstances | null;
  signer: ethers.JsonRpcSigner | null;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  connectContracts: () => Promise<void>;
}

const contractABIs = {
  ProductBatch: [
    "function purchaseWithImmediateOwnership(uint256 batchId, address retailer, uint256 quantity, string calldata deliveryAddress) external payable returns (uint256)",
    "function getBatchInfo(uint256 batchId) external view returns (address, address, string memory, string memory, uint256, uint256, string memory, uint8, uint256, bool)",
    "function batchExists(uint256 batchId) external view returns (bool)",
    "function batchCount() external view returns (uint256)",
    "function getRetailerProducts() external view returns (uint256[] memory, address[] memory, string[] memory, string[] memory, uint256[] memory, uint256[] memory, string[] memory)"
  ],
  PublicVerification: [
    "function quickVerify(string calldata qrCode) external view returns (bool, string memory, string memory)",
    "function getConsumerSummary(string calldata qrCode) external view returns (bool, string memory, string memory, uint256, string memory, uint256, uint256, string memory)",
    "function verifyProduct(string calldata qrCode) external returns (tuple(string productName, string origin, uint256 productionDate, string currentLocation, string farmerInfo, uint256 supplyChainSteps, string qualityGrade, bool isOrganic), bool)"
  ],

  TransactionRegistry: [
    "function recordTransaction(uint256 batchId, address seller, address buyer, uint256 unitPrice, uint256 quantity, string calldata transactionType) external",
    "function getTransactionHistory(uint256 batchId) external view returns (tuple(uint256 transactionId, uint256 batchId, address seller, address buyer, uint256 unitPrice, uint256 quantity, string transactionType, uint256 timestamp)[] memory)",
    "function getUserTransactions(address user) external view returns (uint256[] memory)",
    "function getSupplyChainHistory(uint256 batchId) external view returns (tuple(address stakeholder, string stakeholderRole, string action, string location, uint256 timestamp, uint256 price)[] memory)"
  ]
};

export const useContracts = (): UseContractsReturn => {
  const [contracts, setContracts] = useState<ContractInstances | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const connectContracts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not installed');
      }

      // Get accounts first to ensure connection
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        throw new Error('Please connect your wallet first');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signerInstance = await provider.getSigner();
      setSigner(signerInstance);

      // Check network
      const network = await provider.getNetwork();
      console.log('[INFO] Connected to network:', network.name, 'Chain ID:', network.chainId);

      if (!contractAddresses) {
        throw new Error('Contract addresses not found. Please deploy contracts first.');
      }

      console.log('[INFO] Loading contract addresses:', contractAddresses);

      const contractInstances: ContractInstances = {};

      // Load ProductBatch contract
      if (contractAddresses.ProductBatch) {
        contractInstances.productBatch = new ethers.Contract(
          contractAddresses.ProductBatch,
          contractABIs.ProductBatch,
          signerInstance
        );
        console.log('[SUCCESS] ProductBatch contract loaded');
      }

      // Load PublicVerification contract
      if (contractAddresses.PublicVerification) {
        contractInstances.publicVerification = new ethers.Contract(
          contractAddresses.PublicVerification,
          contractABIs.PublicVerification,
          signerInstance
        );
        console.log('[SUCCESS] PublicVerification contract loaded');
      }

      // Load TransactionRegistry contract
      if (contractAddresses.Registry) {
        contractInstances.transactionRegistry = new ethers.Contract(
          contractAddresses.Registry,
          contractABIs.TransactionRegistry,
          signerInstance
        );
        console.log('[SUCCESS] TransactionRegistry contract loaded');
      } else {
        console.log('[WARNING] TransactionRegistry contract address not found');
      }

      setContracts(contractInstances);
      setIsConnected(true);
      setLoading(false);

      console.log('[SUCCESS] Contracts connected successfully');

    } catch (err: any) {
      console.error('[ERROR] Contract connection error:', err);
      setError(err.message);
      setLoading(false);
      setIsConnected(false);
    }
  }, []);

  // Auto-connect contracts when wallet is connected
  useEffect(() => {
    const checkAndConnect = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            console.log('[INFO] Wallet connected, loading contracts...');
            await connectContracts();
          }
        } catch (err) {
          console.log('No wallet connection found');
        }
      }
    };

    checkAndConnect();

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          connectContracts();
        } else {
          setContracts(null);
          setSigner(null);
          setIsConnected(false);
        }
      });
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', () => {});
      }
    };
  }, [connectContracts]);

  return {
    contracts,
    signer,
    loading,
    error,
    isConnected,
    connectContracts
  };
};