// Load environment variables from .env file
require("dotenv").config();

// Main server for Agentic Commerce Protocol POC
const express = require("express");
const cors = require("cors");
const path = require("path");

// Import routes
const productsRouter = require("./routes/products");
const webhooksRouter = require("./routes/webhooks");
const agenticCheckoutRouter = require("./routes/agentic-checkout");
const delegatedPaymentRouter = require("./routes/delegated-payment");

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

// API routes - OpenAI Agentic Commerce Protocol compliant endpoints
app.use("/checkout_sessions", agenticCheckoutRouter);
app.use("/agentic_commerce/delegate_payment", delegatedPaymentRouter);

// Product Feed and Webhooks
app.use("/api/products", productsRouter);
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
  console.log(`   Health Check:         http://localhost:${PORT}/health`);
  console.log(
    `   Product Feed:         http://localhost:${PORT}/api/products/feed`
  );
  console.log(`   Web Interface:        http://localhost:${PORT}/test.html`);
  console.log(`\n📦 Agentic Checkout Endpoints (OpenAI Spec Compliant):`);
  console.log(
    `   Create Session:       POST http://localhost:${PORT}/checkout_sessions`
  );
  console.log(
    `   Update Session:       POST http://localhost:${PORT}/checkout_sessions/:id`
  );
  console.log(
    `   Complete Checkout:    POST http://localhost:${PORT}/checkout_sessions/:id/complete`
  );
  console.log(
    `   Cancel Session:       POST http://localhost:${PORT}/checkout_sessions/:id/cancel`
  );
  console.log(
    `   Get Session:          GET  http://localhost:${PORT}/checkout_sessions/:id`
  );
  console.log(`\n💳 Delegated Payment Endpoint:`);
  console.log(
    `   Tokenize Payment:     POST http://localhost:${PORT}/agentic_commerce/delegate_payment`
  );
  console.log(`\n✨ Agentic Commerce Protocol v1.0 - Production Ready`);
  console.log(`🔧 Merchant ID: ${process.env.MERCHANT_ID}`);
  console.log(`📋 API Version: ${process.env.API_VERSION || "2025-09-12"}\n`);
});
