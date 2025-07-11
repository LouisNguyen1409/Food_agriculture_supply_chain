const express = require("express")
const cors = require("cors")

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Simple route for testing
app.get("/", (req, res) => {
    res.json({
        message: "Welcome to Food Agriculture Supply Chain API",
        status: "Server is running successfully!",
        timestamp: new Date().toISOString(),
        endpoints: {
            health: "/health",
            api: "/api",
        },
    })
})

// Health check route
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    })
})

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
    console.log(`📡 Access your API at: http://localhost:${PORT}`)
    console.log(`🏥 Health check: http://localhost:${PORT}/health`)
})

module.exports = app
