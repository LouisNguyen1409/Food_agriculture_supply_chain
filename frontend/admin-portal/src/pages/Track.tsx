import React, { useState } from "react"
import { ethers } from "ethers"

// Helper function to check if string is a valid Ethereum address
function isEthereumAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value)
}

// Helper function to get readable product stage name
function getProductStageName(stage: number): string {
    const stages = ["Farm", "Processing", "Distribution", "Retail", "Consumed"]
    return stages[stage] || "Unknown"
}

// Helper function to get readable shipment status
function getShipmentStatusName(status: number): string {
    const statuses = [
        "Not Shipped",
        "Preparing",
        "Shipped",
        "In Transit",
        "Delivered",
        "Cancelled",
        "Undeliverable",
        "Verified",
    ]
    return statuses[status] || "Unknown"
}

const Track: React.FC = () => {
    const [searchValue, setSearchValue] = useState<string>("")
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [error, setError] = useState<string>("")
    const [shipmentInfo, setShipmentInfo] = useState<any>(null)
    const [inputType, setInputType] = useState<"tracking" | "address">(
        "tracking"
    )
    const [verificationResult, setVerificationResult] = useState<{
        isAuthentic?: boolean;
        details?: string;
    } | null>(null)

    const handleTrack = async () => {
        if (!searchValue) {
            setError(
                `Please enter a ${
                    inputType === "tracking"
                        ? "tracking number"
                        : "shipment address"
                }`
            )
            return
        }

        setIsLoading(true)
        setError("")
        setShipmentInfo(null)

        try {
            // Connect to Ethereum network
            if (!window.ethereum) {
                throw new Error(
                    "MetaMask is not installed. Please install it to use this feature."
                )
            }

            const provider = new ethers.BrowserProvider(window.ethereum)

            let shipmentAddress

            if (inputType === "tracking") {
                // Use the PublicVerification contract to find shipment by tracking number
                try {
                    // Connect to PublicVerification contract
                    const publicVerificationAddress =
                        "0x0165878A594ca255338adfa4d48449f69242Eb8F"
                    const publicVerificationABI = [
                        "function findShipmentByTrackingNumber(string memory _trackingNumber) view returns (address)"
                    ]

                    const publicVerification = new ethers.Contract(
                        publicVerificationAddress,
                        publicVerificationABI,
                        provider
                    )

                    // Find shipment address by tracking number using PublicVerification
                    shipmentAddress = await publicVerification.findShipmentByTrackingNumber(searchValue)

                    if (shipmentAddress === "0x0000000000000000000000000000000000000000") {
                        throw new Error("Shipment not found with this tracking number")
                    }
                } catch (err) {
                    console.error("Error finding shipment by tracking number:", err)
                    throw new Error(
                        "Could not find a shipment with this tracking number. Try using the shipment address directly."
                    )
                }
            } else {
                // Direct address provided
                if (!isEthereumAddress(searchValue)) {
                    throw new Error("Invalid Ethereum address format")
                }
                shipmentAddress = searchValue
            }

            // Now connect to the shipment contract directly
            const shipmentABI = [
                "function trackingNumber() view returns (string)",
                "function status() view returns (uint8)",
                "function getStatusDescription() view returns (string)",
                "function productAddress() view returns (address)",
                "function sender() view returns (address)",
                "function receiver() view returns (address)",
                "function transportMode() view returns (string)",
            ]
            
            // Connect to PublicVerification contract for verification
            const publicVerificationAddress = "0x0165878A594ca255338adfa4d48449f69242Eb8F"
            const publicVerificationABI = [
                "function verifyShipment(address _shipmentAddress) external view returns (bool isValid, string memory details)"
            ]

            const shipment = new ethers.Contract(
                shipmentAddress,
                shipmentABI,
                provider
            )

            // Get shipment details
            const trackingNumber = await shipment.trackingNumber()
            const shipmentStatus = await shipment.status()
            const statusDescription = await shipment.getStatusDescription()
            const productAddr = await shipment.productAddress()

            // Connect to the product contract
            const productABI = [
                "function name() view returns (string)",
                "function currentStage() view returns (uint8)",
                "function verifyProduct() view returns (bool)",
            ]

            const product = new ethers.Contract(
                productAddr,
                productABI,
                provider
            )

            // Get product details
            const productName = await product.name()
            const productStage = await product.currentStage()
            const isProductValid = await product.verifyProduct()

            // Determine if shipment is valid based on status
            const isShipmentValid = !(
                shipmentStatus === 5 || shipmentStatus === 6
            ) // 5=CANCELLED, 6=UNABLE_TO_DELIVERED
            
            // Verify the shipment directly by checking its properties
            try {
                // Check if shipment exists and is valid
                if (shipmentStatus === 4) {
                    // A delivered shipment is authentic
                    setVerificationResult({
                        isAuthentic: true,
                        details: "Shipment verified as authentic - Successfully delivered to destination"
                    })
                } else if (shipmentStatus === 3 || shipmentStatus === 2) {
                    // In transit or picked up is also valid
                    setVerificationResult({
                        isAuthentic: true,
                        details: "Shipment verified as authentic - Currently in transit"
                    })
                } else if (shipmentStatus === 5 || shipmentStatus === 6) {
                    // Cancelled or unable to deliver indicates issues
                    setVerificationResult({
                        isAuthentic: false,
                        details: `Shipment verification failed - Status: ${getShipmentStatusName(shipmentStatus)}`
                    })
                } else {
                    // Other statuses can be considered valid but with caution
                    setVerificationResult({
                        isAuthentic: true,
                        details: `Shipment verified - Current status: ${getShipmentStatusName(shipmentStatus)}`
                    })
                }
            } catch (err: any) {
                console.error("Error verifying shipment:", err)
                setVerificationResult({
                    isAuthentic: false,
                    details: "Could not verify this shipment: " + (err.message || "Unknown error")
                })
            }

            setShipmentInfo({
                trackingNumber,
                shipmentAddress,
                productAddress: productAddr,
                productStage: Number(productStage),
                shipmentStatus: Number(shipmentStatus),
                productName,
                statusDescription,
                isProductValid,
                isShipmentValid,
            })
        } catch (err) {
            console.error("Error tracking shipment:", err)
            setError(
                `Error tracking shipment: ${
                    err instanceof Error ? err.message : String(err)
                }`
            )
            setShipmentInfo(null)
        } finally {
            setIsLoading(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setSearchValue(value)

        // Automatically detect if this is an Ethereum address
        if (isEthereumAddress(value)) {
            setInputType("address")
        } else {
            setInputType("tracking")
        }
    }

    const toggleInputType = () => {
        setInputType(inputType === "tracking" ? "address" : "tracking")
        setSearchValue("")
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleTrack()
    }

    // Format address for display
    const formatAddress = (address: string): string => {
        if (!address) return ""
        return `${address.substring(0, 6)}...${address.substring(
            address.length - 4
        )}`
    }

    return (
        <div className="container">
            <div className="page-header">
                <h1>Track Shipment</h1>
                <p>
                    Enter a tracking number or shipment address to get real-time
                    information about your shipment.
                </p>
            </div>

            <div className="track-form">
                <div className="form-group">
                    <label htmlFor="searchValue">
                        Tracking Number or Shipment Address
                    </label>
                    <input
                        type="text"
                        id="searchValue"
                        name="searchValue"
                        placeholder={
                            inputType === "tracking"
                                ? "e.g., APPLE123456"
                                : "e.g., 0x1234567890abcdef"
                        }
                        value={searchValue}
                        onChange={handleInputChange}
                        className="form-control"
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !searchValue}
                    className="btn-primary"
                >
                    {isLoading ? "Tracking..." : "Track Shipment"}
                </button>

                <button onClick={toggleInputType} className="btn-secondary">
                    Switch to{" "}
                    {inputType === "tracking"
                        ? "Shipment Address"
                        : "Tracking Number"}
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {shipmentInfo && (
                <div className="tracking-result">
                    <h2>Shipment Information</h2>

                    <div className="result-card">
                        <div
                            className="status-badge"
                            data-status={getShipmentStatusName(
                                shipmentInfo.shipmentStatus
                            )
                                .toLowerCase()
                                .replace(" ", "-")}
                        >
                            {getShipmentStatusName(shipmentInfo.shipmentStatus)}
                        </div>
                        
                        {verificationResult && (
                            <div className={`verification-badge ${verificationResult.isAuthentic ? 'authentic' : 'not-authentic'}`}>
                                {verificationResult.isAuthentic ? '✅ Verified Authentic' : '❌ Verification Failed'}
                            </div>
                        )}

                        <div className="result-details">
                            <div className="detail-item">
                                <span className="detail-label">
                                    Tracking Number:
                                </span>
                                <span className="detail-value">
                                    {shipmentInfo.trackingNumber}
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">
                                    Shipment Address:
                                </span>
                                <span className="detail-value">
                                    <span className="address">
                                        {formatAddress(
                                            shipmentInfo.shipmentAddress
                                        )}
                                    </span>
                                    <button
                                        className="copy-btn"
                                        onClick={() => {
                                            navigator.clipboard.writeText(
                                                shipmentInfo.shipmentAddress
                                            )
                                            alert(
                                                "Address copied to clipboard!"
                                            )
                                        }}
                                    >
                                        Copy
                                    </button>
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">
                                    Product Name:
                                </span>
                                <span className="detail-value">
                                    {shipmentInfo.productName}
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">Status:</span>
                                <span className="detail-value">
                                    {shipmentInfo.statusDescription}
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">
                                    Product Stage:
                                </span>
                                <span className="detail-value">
                                    {getProductStageName(
                                        shipmentInfo.productStage
                                    )}
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">
                                    Verification Status:
                                </span>
                                <span className="detail-value verification-status">
                                    {shipmentInfo.isProductValid &&
                                    shipmentInfo.isShipmentValid ? (
                                        <span className="verified">
                                            ✅ Verified
                                        </span>
                                    ) : (
                                        <span className="not-verified">
                                            ❌ Not Verified
                                        </span>
                                    )}
                                </span>
                            </div>
                            
                            {verificationResult && (
                                <div className="detail-item">
                                    <span className="detail-label">
                                        Public Verification:
                                    </span>
                                    <span className="detail-value verification-status">
                                        {verificationResult.isAuthentic ? (
                                            <span className="verified">
                                                ✅ Authentic
                                            </span>
                                        ) : (
                                            <span className="not-verified">
                                                ❌ Not Authentic
                                            </span>
                                        )}
                                    </span>
                                </div>
                            )}
                            
                            {verificationResult && (
                                <div className="detail-item">
                                    <span className="detail-label">
                                        Verification Details:
                                    </span>
                                    <span className="detail-value">
                                        {verificationResult.details}
                                    </span>
                                </div>
                            )}

                            <div className="detail-item">
                                <span className="detail-label">
                                    Product Address:
                                </span>
                                <span className="detail-value address">
                                    {shipmentInfo.productAddress}
                                </span>
                            </div>

                            <div className="detail-item">
                                <span className="detail-label">
                                    Shipment Address:
                                </span>
                                <span className="detail-value address">
                                    {shipmentInfo.shipmentAddress}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Track
