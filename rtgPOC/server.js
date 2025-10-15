// Load environment variables from .env file
require("dotenv").config();

// Main server for Agentic Commerce Protocol POC
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import routes
const productsRouter = require("./routes/products");
const checkoutRouter = require("./routes/checkout");
const webhooksRouter = require("./routes/webhooks");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Agentic Commerce Protocol POC",
    version: "1.0.0",
  });
});

// API routes
app.use("/api/products", productsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/webhooks", webhooksRouter);

// Handle 404 - Route not found
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log("\n🚀 ACP POC Server started successfully\n");
  console.log(`📍 Main URLs:`);
  console.log(`   Health Check:    http://localhost:${PORT}/health`);
  console.log(`   Product Feed:    http://localhost:${PORT}/api/products/feed`);
  console.log(`   Web Interface:   http://localhost:${PORT}/test.html`);
  console.log(`\n✨ Agentic Commerce Protocol v1.0`);
  console.log(`🔧 Merchant ID: ${process.env.MERCHANT_ID}\n`);
});
