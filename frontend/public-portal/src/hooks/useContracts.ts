import { ethers } from 'ethers';
import { useState, useEffect } from 'react';

interface ContractInstances {
  productBatch?: ethers.Contract;
  publicVerification?: ethers.Contract;
}

interface UseContractsReturn {
  contracts: ContractInstances | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const contractABIs = {
  ProductBatch: [
    "function purchaseWithImmediateOwnership(uint256 batchId, address retailer, uint256 quantity, string calldata deliveryAddress) external payable returns (uint256)",
    "function getConsumerPurchase(uint256 purchaseId) external view returns (uint256, address, address, uint256, uint256, uint256, bool, bool, string memory)",
    "function getConsumerHistory(address consumer) external view returns (uint256[] memory)",
    "function getBatchInfo(uint256 batchId) external view returns (address, address, string memory, string memory, uint256, uint256, string memory, uint8, uint256, bool)",
    "function batchCount() external view returns (uint256)",
  ],
  PublicVerification: [
    "function quickVerify(string calldata qrCode) external view returns (bool, string memory, string memory)",
    "function getConsumerSummary(string calldata qrCode) external view returns (bool, string memory, string memory, uint256, string memory, uint256, uint256, string memory)",
    "function verifyProduct(string calldata qrCode) external returns (tuple(string productName, string origin, uint256 productionDate, string currentLocation, string farmerInfo, uint256 supplyChainSteps, string qualityGrade, bool isOrganic), bool)"
  ]
};

export const useContracts = (): UseContractsReturn => {
  const [contracts, setContracts] = useState<ContractInstances | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Check if MetaMask is already connected on page load
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            console.log('Found existing connection, initializing...');
            await initializeContracts();
          } else {
            console.log('No existing connection found');
          }
        } catch (err) {
          console.log('Error checking existing connection:', err);
        }
      }
    };

    checkExistingConnection();
  }, []);

  const initializeContracts = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('Please install MetaMask to use this application');
      }

      console.log('Initializing contracts...');
      setLoading(true);
      setError(null);

      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);

      const web3Signer = await web3Provider.getSigner();
      setSigner(web3Signer);

      const contractInstances: ContractInstances = {};

      // Load ProductBatch contract
      const productBatchAddress = process.env.REACT_APP_PRODUCT_BATCH_ADDRESS;
      console.log('ProductBatch address:', productBatchAddress);

      if (productBatchAddress &&
          productBatchAddress !== '0x...' &&
          productBatchAddress !== '' &&
          productBatchAddress !== undefined) {

        contractInstances.productBatch = new ethers.Contract(
          productBatchAddress,
          contractABIs.ProductBatch,
          web3Signer
        );
        console.log('✅ ProductBatch contract loaded');
      } else {
        console.warn('⚠️ ProductBatch contract address not configured');
      }

      // Load PublicVerification contract
      const publicVerificationAddress = process.env.REACT_APP_PUBLIC_VERIFICATION_ADDRESS;
      console.log('PublicVerification address:', publicVerificationAddress);

      if (publicVerificationAddress &&
          publicVerificationAddress !== '0x...' &&
          publicVerificationAddress !== '' &&
          publicVerificationAddress !== undefined) {

        contractInstances.publicVerification = new ethers.Contract(
          publicVerificationAddress,
          contractABIs.PublicVerification,
          web3Signer
        );
        console.log('✅ PublicVerification contract loaded');
      } else {
        console.warn('⚠️ PublicVerification contract address not configured');
      }

      setContracts(contractInstances);
      setIsConnected(true);
      setLoading(false);

      console.log('🎉 Contracts initialized successfully');
    } catch (err: any) {
      console.error('❌ Contract initialization error:', err);
      setError(err.message);
      setLoading(false);
      setIsConnected(false);
    }
  };

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('Please install MetaMask to use this application');
      }

      console.log('🔗 Requesting wallet connection...');
      setLoading(true);
      setError(null);

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Initialize contracts after successful connection
      await initializeContracts();

      console.log('✅ Wallet connected successfully');
    } catch (err: any) {
      console.error('❌ Wallet connection error:', err);
      setError(err.message);
      setLoading(false);
      setIsConnected(false);
    }
  };

  const disconnectWallet = () => {
    console.log('🔌 Disconnecting wallet...');
    setContracts(null);
    setProvider(null);
    setSigner(null);
    setIsConnected(false);
    setError(null);
    setLoading(false);
  };

  return {
    contracts,
    provider,
    signer,
    loading,
    error,
    isConnected,
    connectWallet,
    disconnectWallet
  };
};