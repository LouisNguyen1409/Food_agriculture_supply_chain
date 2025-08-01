import React, { useState } from "react"
import { ethers } from "ethers"
import "../styles/pages.css"

const CreateShipment: React.FC = () => {
    const [formData, setFormData] = useState({
        productAddress: "",
        receiverAddress: "",
        trackingNumber: "",
        transportMode: "",
    })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [successMessage, setSuccessMessage] = useState("")
    const [createdTrackingNumber, setCreatedTrackingNumber] = useState("")
    const [createdShipmentAddress, setCreatedShipmentAddress] = useState("")

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!window.ethereum) {
            setError(
                "MetaMask is not installed. Please install it to use this feature."
            )
            return
        }

        try {
            setIsLoading(true)
            setError("")
            setSuccessMessage("")

            // Get provider and signer - using ethers.js v6 syntax
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()

            // Get the ShipmentFactory contract
            const shipmentFactoryAddress =
                "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"
            const shipmentFactoryABI = [
                "function createShipment(address productAddress, address receiver, string memory trackingNumber, string memory transportMode) returns (address)",
            ]

            // Connect to the contract with signer - using ethers.js v6 syntax
            const shipmentFactory = new ethers.Contract(
                shipmentFactoryAddress,
                shipmentFactoryABI,
                signer
            )

            // Call the createShipment function
            const tx = await shipmentFactory.createShipment(
                formData.productAddress,
                formData.receiverAddress,
                formData.trackingNumber,
                formData.transportMode
            )

            // Wait for transaction to be mined - using ethers.js v6 syntax
            setSuccessMessage(
                "Transaction submitted! Waiting for confirmation..."
            )
            const receipt = await tx.wait()
            
            // Try to extract shipment address directly from transaction events
            let shipmentAddress = "";
            try {
                // The ShipmentFactory typically emits an event with the new shipment address
                // This event would be something like ShipmentCreated(address indexed shipmentAddress)
                if (receipt && receipt.logs && receipt.logs.length > 0) {
                    // We need to directly parse the event logs to extract the address
                    console.log("Transaction receipt logs:", receipt.logs);
                    
                    // ShipmentCreated event should contain the address in topics[1] if properly formatted
                    // First try to find the event by examining logs from the ShipmentFactory
                    for (let i = 0; i < receipt.logs.length; i++) {
                        const log = receipt.logs[i];
                        // Check if the log is from the ShipmentFactory
                        if (log.address.toLowerCase() === shipmentFactoryAddress.toLowerCase()) {
                            // In typical event format for 'ShipmentCreated(address indexed shipmentAddress)',
                            // the second topic contains the indexed address parameter
                            if (log.topics && log.topics.length > 1) {
                                // Format the address (extract from the 32-byte topic data)
                                const addressBytes = log.topics[1];
                                if (addressBytes.startsWith('0x')) {
                                    // Convert the 32-byte value to an Ethereum address (20 bytes)
                                    shipmentAddress = '0x' + addressBytes.slice(26);
                                    console.log("Extracted shipment address from event:", shipmentAddress);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // If we couldn't extract the address from topics, try one more approach
                    if (!shipmentAddress && receipt.logs.length > 0) {
                        // As a last resort, try to find any log that might contain an address in its data
                        // This is less reliable but might work depending on the event structure
                        const lastLog = receipt.logs[receipt.logs.length - 1];
                        if (lastLog.data && lastLog.data.length >= 66) {
                            // This assumes the first 32 bytes of the data might contain the address
                            const dataWithoutPrefix = lastLog.data.slice(2); // Remove '0x'
                            const potentialAddress = '0x' + dataWithoutPrefix.slice(24, 64);
                            
                            if (ethers.isAddress(potentialAddress)) {
                                shipmentAddress = potentialAddress;
                                console.log("Extracted potential shipment address from data:", shipmentAddress);
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("Could not extract shipment address from transaction logs:", err);
            }
            
            // If we couldn't get the address from logs, just display a note about it
            if (!shipmentAddress) {
                console.log("Could not extract shipment address from transaction logs");
                // We'll still show the tracking number so users can try to track it later
            }

            setCreatedTrackingNumber(formData.trackingNumber)
            setCreatedShipmentAddress(shipmentAddress)
            setSuccessMessage("Shipment created successfully!")

            // Reset form
            setFormData({
                productAddress: "",
                receiverAddress: "",
                trackingNumber: "",
                transportMode: "",
            })
            // Keep the shipment address visible for reference
        } catch (err) {
            console.error("Error creating shipment:", err)
            setError(
                `Error creating shipment: ${
                    err instanceof Error ? err.message : String(err)
                }`
            )
        } finally {
            setIsLoading(false)
        }
    }

    // Generate a random tracking number
    const generateTrackingNumber = () => {
        const prefix = "SHIP"
        const randomNum = Math.floor(Math.random() * 1000000)
            .toString()
            .padStart(6, "0")
        const newTrackingNumber = `${prefix}${randomNum}`

        setFormData((prev) => ({
            ...prev,
            trackingNumber: newTrackingNumber,
        }))
    }

    return (
        <div className="container">
            <div className="page-header">
                <h1>Create Shipment</h1>
                <p>Register a new shipment on the blockchain for tracking.</p>
            </div>

            <div className="create-shipment-form">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="productAddress">
                            Product Address (on blockchain)
                        </label>
                        <input
                            type="text"
                            id="productAddress"
                            name="productAddress"
                            placeholder="0x..."
                            value={formData.productAddress}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="receiverAddress">
                            Receiver Address (on blockchain)
                        </label>
                        <input
                            type="text"
                            id="receiverAddress"
                            name="receiverAddress"
                            placeholder="0x..."
                            value={formData.receiverAddress}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="trackingNumber">Tracking Number</label>
                        <div className="input-with-button">
                            <input
                                type="text"
                                id="trackingNumber"
                                name="trackingNumber"
                                value={formData.trackingNumber}
                                onChange={handleChange}
                                required
                            />
                            <button
                                type="button"
                                onClick={generateTrackingNumber}
                                className="button secondary"
                            >
                                Generate
                            </button>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="transportMode">Transport Mode</label>
                        <input
                            type="text"
                            id="transportMode"
                            name="transportMode"
                            placeholder="Truck, Ship, Air..."
                            value={formData.transportMode}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary"
                    >
                        {isLoading ? "Creating..." : "Create Shipment"}
                    </button>
                </form>
            </div>

            {error && <div className="error-message">{error}</div>}

            {successMessage && (
                <div className="success-message">
                    <p>{successMessage}</p>
                    {createdTrackingNumber && (
                        <div className="created-shipment-info">
                            <p>
                                <strong>Tracking Number:</strong>
                            </p>
                            <div className="tracking-container">
                                <code>{createdTrackingNumber}</code>
                                <button
                                    className="copy-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            createdTrackingNumber
                                        )
                                        alert(
                                            "Tracking number copied to clipboard!"
                                        )
                                    }}
                                >
                                    Copy
                                </button>
                            </div>
                            {createdShipmentAddress && createdShipmentAddress !== "0x0000000000000000000000000000000000000000" && (
                                <div className="info-box">
                                    <h4>Shipment Address:</h4>
                                    <div className="code-with-copy">
                                        <code>{createdShipmentAddress}</code>
                                        <button
                                            className="copy-btn"
                                            onClick={() => {
                                                navigator.clipboard.writeText(
                                                    createdShipmentAddress
                                                )
                                                alert(
                                                    "Shipment address copied to clipboard!"
                                                )
                                            }}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                            <p className="tip-text">
                                Save this tracking number to monitor your
                                shipment later.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CreateShipment
