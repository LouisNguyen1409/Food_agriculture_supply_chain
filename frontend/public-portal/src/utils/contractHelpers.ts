import { ethers } from 'ethers';

// Define network configurations
export const NETWORK_CONFIGS: {
  [key: string]: {
    name: string;
    chainId: number;
    contractAddress: string;
    rpcUrl: string;
    currencySymbol: string;
    blockExplorer: string;
  };
} = {
  localhost: {
    name: 'Localhost (Hardhat)',
    chainId: 31337,
    contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Default Hardhat first deployment address
    rpcUrl: 'http://localhost:8545',
    currencySymbol: 'ETH',
    blockExplorer: '',
  },
  mumbai: {
    name: 'Polygon Mumbai',
    chainId: 80001,
    contractAddress: '0x0000000000000000000000000000000000000000', // Replace with actual address when deployed
    rpcUrl: 'https://rpc-mumbai.maticvigil.com',
    currencySymbol: 'MATIC',
    blockExplorer: 'https://mumbai.polygonscan.com',
  },
  polygon: {
    name: 'Polygon Mainnet',
    chainId: 137,
    contractAddress: '0x0000000000000000000000000000000000000000', // Replace with actual address when deployed
    rpcUrl: 'https://polygon-rpc.com',
    currencySymbol: 'MATIC',
    blockExplorer: 'https://polygonscan.com',
  }
};

// ABI for the SupplyChainVerification contract
// Replace this with your actual contract ABI when available
export const CONTRACT_ABI = [
  "function getCompleteTraceabilityReport(address productAddress) external view returns (tuple(string productName, string originFarm, uint256 harvestDate, string[] processingSteps, string[] certifications))",
  "function trackShipmentByTrackingNumber(string trackingNumber) external view returns (tuple(string status, string currentLocation, uint256 lastUpdated, string carrier))",
  "function verifyProductAuthenticity(address productAddress) external view returns (bool isAuthentic, string details)",
  "function getShipmentInfo(address shipmentAddress) external view returns (tuple(string productId, string origin, string destination, uint256 departureDate, uint256 estimatedArrival))"
];

// Get the appropriate network config based on connected chain
export const getCurrentNetworkConfig = async (): Promise<typeof NETWORK_CONFIGS[keyof typeof NETWORK_CONFIGS]> => {
  if (!window.ethereum) {
    return NETWORK_CONFIGS.localhost; // Default to localhost
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    // Find matching network config
    for (const key in NETWORK_CONFIGS) {
      if (NETWORK_CONFIGS[key].chainId === chainId) {
        return NETWORK_CONFIGS[key];
      }
    }

    // Default to localhost if no match
    return NETWORK_CONFIGS.localhost;
  } catch (error) {
    console.error("Error getting network:", error);
    return NETWORK_CONFIGS.localhost;
  }
};

// Get contract instance
export const getContract = async () => {
  if (!window.ethereum) {
    throw new Error("Ethereum provider not found");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const networkConfig = await getCurrentNetworkConfig();
  
  return new ethers.Contract(
    networkConfig.contractAddress,
    CONTRACT_ABI,
    signer
  );
};

// Contract interaction functions
export interface TraceabilityReport {
  productName: string;
  originFarm: string;
  harvestDate: Date;
  processingSteps: string[];
  certifications: string[];
}

export interface ShipmentTracking {
  status: string;
  currentLocation: string;
  lastUpdated: Date;
  carrier: string;
}

export interface ShipmentInfo {
  productId: string;
  origin: string;
  destination: string;
  departureDate: Date;
  estimatedArrival: Date;
}

// Get product traceability information
export async function getProductTraceability(productAddress: string): Promise<TraceabilityReport> {
  const contract = await getContract();
  
  try {
    const result = await contract.getCompleteTraceabilityReport(productAddress);
    
    return {
      productName: result.productName,
      originFarm: result.originFarm,
      harvestDate: new Date(Number(result.harvestDate) * 1000), // Convert from Unix timestamp
      processingSteps: result.processingSteps,
      certifications: result.certifications
    };
  } catch (error) {
    console.error("Error getting traceability report:", error);
    throw error;
  }
}

// Track a shipment by tracking number
export async function trackShipment(trackingNumber: string): Promise<ShipmentTracking> {
  const contract = await getContract();
  
  try {
    const result = await contract.trackShipmentByTrackingNumber(trackingNumber);
    
    return {
      status: result.status,
      currentLocation: result.currentLocation,
      lastUpdated: new Date(Number(result.lastUpdated) * 1000), // Convert from Unix timestamp
      carrier: result.carrier
    };
  } catch (error) {
    console.error("Error tracking shipment:", error);
    throw error;
  }
}

// Verify product authenticity
export async function verifyProduct(productAddress: string): Promise<{isAuthentic: boolean, details: string}> {
  const contract = await getContract();
  
  try {
    const result = await contract.verifyProductAuthenticity(productAddress);
    
    return {
      isAuthentic: result.isAuthentic,
      details: result.details
    };
  } catch (error) {
    console.error("Error verifying product:", error);
    throw error;
  }
}

// Get shipment information
export async function getShipmentInfo(shipmentAddress: string): Promise<ShipmentInfo> {
  const contract = await getContract();
  
  try {
    const result = await contract.getShipmentInfo(shipmentAddress);
    
    return {
      productId: result.productId,
      origin: result.origin,
      destination: result.destination,
      departureDate: new Date(Number(result.departureDate) * 1000), // Convert from Unix timestamp
      estimatedArrival: new Date(Number(result.estimatedArrival) * 1000) // Convert from Unix timestamp
    };
  } catch (error) {
    console.error("Error getting shipment info:", error);
    throw error;
  }
}
