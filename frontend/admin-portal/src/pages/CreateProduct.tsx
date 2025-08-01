import React, { useState } from "react"
import { ethers } from "ethers"

const CreateProduct: React.FC = () => {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        minCTemperature: 0,
        maxCTemperature: 30,
        location: "",
        farmData: "",
    })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [successMessage, setSuccessMessage] = useState("")
    const [createdProductAddress, setCreatedProductAddress] = useState("")

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target
        setFormData((prev) => ({
            ...prev,
            [name]:
                name === "minCTemperature" || name === "maxCTemperature"
                    ? Number(value)
                    : value,
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

            // Get the ProductFactory contract
            const productFactoryAddress =
                "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"
            const productFactoryABI = [
                "function createProduct(string memory name, string memory description, uint256 minCTemperature, uint256 maxCTemperature, string memory location, string memory farmData) returns (address)",
            ]

            // Connect to the contract with signer - using ethers.js v6 syntax
            const productFactory = new ethers.Contract(
                productFactoryAddress,
                productFactoryABI,
                signer
            )

            // Call the createProduct function
            const tx = await productFactory.createProduct(
                formData.name,
                formData.description,
                formData.minCTemperature,
                formData.maxCTemperature,
                formData.location,
                formData.farmData
            )

            // Wait for transaction to be mined - using ethers.js v6 syntax
            setSuccessMessage(
                "Transaction submitted! Waiting for confirmation..."
            )
            const receipt = await tx.wait()

            // Get the product address from the transaction receipt
            // Extract the product address from the transaction logs
            try {
                if (receipt && receipt.logs && receipt.logs.length > 0) {
                    // The product address is likely in the first log's address field
                    // This assumes the contract emits an event when creating a product
                    console.log("Transaction receipt logs:", receipt.logs)

                    // In factory pattern contracts, usually the created contract address is in the logs
                    // For ProductFactory, the created product address is often in logs[0].address
                    const productAddress = receipt.logs[0].address
                    setCreatedProductAddress(productAddress)

                    console.log("Extracted product address:", productAddress)
                    setSuccessMessage(
                        `Product created successfully! Product address: ${productAddress}`
                    )
                }
            } catch (error) {
                console.error(
                    "Could not parse product address from logs:",
                    error
                )
            }

            setSuccessMessage("Product created successfully!")

            // Reset form
            setFormData({
                name: "",
                description: "",
                minCTemperature: 0,
                maxCTemperature: 30,
                location: "",
                farmData: "",
            })
        } catch (err) {
            console.error("Error creating product:", err)
            setError(
                `Error creating product: ${
                    err instanceof Error ? err.message : String(err)
                }`
            )
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="container">
            <div className="page-header">
                <h1>Create Product</h1>
                <p>Register a new agricultural product on the blockchain.</p>
            </div>

            <div className="create-product-form">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="name">Product Name</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="description">Description</label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="minCTemperature">
                            Minimum Temperature (°C)
                        </label>
                        <input
                            type="number"
                            id="minCTemperature"
                            name="minCTemperature"
                            value={formData.minCTemperature}
                            onChange={handleChange}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="maxCTemperature">
                            Maximum Temperature (°C)
                        </label>
                        <input
                            type="number"
                            id="maxCTemperature"
                            name="maxCTemperature"
                            value={formData.maxCTemperature}
                            onChange={handleChange}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="location">Location</label>
                        <input
                            type="text"
                            id="location"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="farmData">Farm Data</label>
                        <textarea
                            id="farmData"
                            name="farmData"
                            value={formData.farmData}
                            onChange={handleChange}
                            required
                            className="form-control"
                            placeholder="Enter information about farming practices, certifications, etc."
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary"
                    >
                        {isLoading ? "Creating..." : "Create Product"}
                    </button>
                </form>
            </div>

            {error && <div className="error-message">{error}</div>}

            {successMessage && (
                <div className="success-message">
                    <p>{successMessage}</p>
                    {createdProductAddress && (
                        <div className="created-product-info">
                            <p>
                                <strong>Product Address:</strong>
                            </p>
                            <div className="address-container">
                                <code>{createdProductAddress}</code>
                                <button
                                    className="copy-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            createdProductAddress
                                        )
                                        alert("Address copied to clipboard!")
                                    }}
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="tip-text">
                                Save this address to verify your product later.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CreateProduct
