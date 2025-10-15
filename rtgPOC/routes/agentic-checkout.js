// Agentic Checkout API - OpenAI Agentic Commerce Protocol compliant endpoints
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Stripe = require("stripe");
const { agenticCommerceMiddleware } = require("../middleware/agentic-commerce");
const CartStateBuilder = require("../services/CartStateBuilder");
const WebhookSender = require("../services/WebhookSender");
const DelegatedTokenManager = require("../services/DelegatedTokenManager");

// Initialize services
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const cartBuilder = new CartStateBuilder();
const webhookSender = new WebhookSender();
const tokenManager = new DelegatedTokenManager();

// Apply middleware
router.use(agenticCommerceMiddleware());

// Helper functions
function readData() {
  const ordersPath = path.join(__dirname, "../data/orders.json");
  const data = fs.readFileSync(ordersPath, "utf8");
  const parsed = JSON.parse(data);

  // Ensure checkout_sessions exists
  if (!parsed.checkout_sessions) {
    parsed.checkout_sessions = {};
  }
  if (!parsed.orders) {
    parsed.orders = {};
  }

  return parsed;
}

function writeData(data) {
  const ordersPath = path.join(__dirname, "../data/orders.json");
  fs.writeFileSync(ordersPath, JSON.stringify(data, null, 2));
}

/**
 * POST /checkout_sessions
 * Create a new checkout session
 */
router.post("/", async (req, res) => {
  try {
    const { buyer, items, fulfillment_address } = req.body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        type: "invalid_request",
        code: "missing_required_field",
        message: "Required field: items (non-empty array)",
      });
    }

    // Generate session ID
    const sessionId = `cs_${uuidv4()}`;

    // Calculate expiration (30 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() +
        parseInt(process.env.CHECKOUT_SESSION_EXPIRY_MINUTES || "30")
    );

    // Build checkout session state
    const session = await cartBuilder.buildCheckoutSession({
      sessionId,
      buyer,
      items,
      fulfillmentAddress: fulfillment_address,
      fulfillmentOptionId: null,
      region: process.env.DEFAULT_REGION || "FL",
    });

    // Add timestamps
    session.created_at = new Date().toISOString();
    session.expires_at = expiresAt.toISOString();

    // Store session
    const data = readData();
    data.checkout_sessions[sessionId] = session;
    writeData(data);

    console.log(
      `✅ Checkout session created: ${sessionId} (${items.length} items)`
    );

    res.status(201).json(session);
  } catch (error) {
    console.error("❌ Error creating checkout session:", error);
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error creating checkout session",
      param: error.message,
    });
  }
});

/**
 * POST /checkout_sessions/:id
 * Update an existing checkout session
 */
router.post("/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { buyer, items, fulfillment_address, fulfillment_option_id } =
      req.body;

    // Get existing session
    const data = readData();
    const existingSession = data.checkout_sessions[sessionId];

    if (!existingSession) {
      return res.status(404).json({
        type: "invalid_request",
        code: "session_not_found",
        message: `Checkout session ${sessionId} not found`,
      });
    }

    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(existingSession.expires_at);
    if (now > expiresAt) {
      existingSession.status = "canceled";
      data.checkout_sessions[sessionId] = existingSession;
      writeData(data);

      return res.status(400).json({
        type: "invalid_request",
        code: "session_expired",
        message: "Checkout session has expired",
      });
    }

    // Check if session is already completed or canceled
    if (
      existingSession.status === "completed" ||
      existingSession.status === "canceled"
    ) {
      return res.status(400).json({
        type: "invalid_request",
        code: "session_already_finalized",
        message: `Checkout session is already ${existingSession.status}`,
      });
    }

    // Merge updates with existing session
    const updatedBuyer = buyer || existingSession.buyer;
    const updatedItems =
      items || existingSession.line_items.map((li) => li.item);
    const updatedAddress =
      fulfillment_address || existingSession.fulfillment_address;
    const updatedFulfillmentId =
      fulfillment_option_id || existingSession.fulfillment_option_id;

    // Rebuild session state
    const session = await cartBuilder.buildCheckoutSession({
      sessionId,
      buyer: updatedBuyer,
      items: updatedItems,
      fulfillmentAddress: updatedAddress,
      fulfillmentOptionId: updatedFulfillmentId,
      existingSession,
      region: process.env.DEFAULT_REGION || "FL",
    });

    // Preserve timestamps
    session.created_at = existingSession.created_at;
    session.expires_at = existingSession.expires_at;
    session.updated_at = new Date().toISOString();

    // Store updated session
    data.checkout_sessions[sessionId] = session;
    writeData(data);

    console.log(`✅ Checkout session updated: ${sessionId}`);

    res.json(session);
  } catch (error) {
    console.error("❌ Error updating checkout session:", error);
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error updating checkout session",
    });
  }
});

/**
 * POST /checkout_sessions/:id/complete
 * Complete checkout and process payment
 */
router.post("/:id/complete", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { payment_data, buyer } = req.body;

    // Validation
    if (!payment_data || !payment_data.token || !payment_data.provider) {
      return res.status(400).json({
        type: "invalid_request",
        code: "missing_payment_data",
        message: "Required: payment_data with token and provider",
      });
    }

    // Get existing session
    const data = readData();
    const session = data.checkout_sessions[sessionId];

    if (!session) {
      return res.status(404).json({
        type: "invalid_request",
        code: "session_not_found",
        message: `Checkout session ${sessionId} not found`,
      });
    }

    // Check status
    if (session.status !== "ready_for_payment") {
      return res.status(400).json({
        type: "invalid_request",
        code: "session_not_ready",
        message: `Session status is ${session.status}, expected ready_for_payment`,
      });
    }

    // Get total amount
    const totalObj = session.totals.find((t) => t.type === "total");
    const totalAmount = totalObj ? totalObj.amount : 0;

    // Check if payment token is a delegated token
    const isDelegatedToken = payment_data.token.startsWith("vt_");
    let stripeChargeSource = payment_data.token;

    if (isDelegatedToken) {
      // Validate delegated token
      const validation = tokenManager.validateAllowance(
        payment_data.token,
        sessionId,
        totalAmount,
        session.currency
      );

      if (!validation.valid) {
        return res.status(400).json(validation.error);
      }

      // Use the Stripe token from the vault token
      stripeChargeSource = validation.token.stripe_token_id;
    }

    // Process payment with Stripe
    let charge;
    try {
      charge = await stripe.charges.create({
        amount: totalAmount,
        currency: session.currency,
        source: stripeChargeSource,
        description: `Order for checkout session ${sessionId}`,
        metadata: {
          checkout_session_id: sessionId,
          merchant_id: process.env.MERCHANT_ID || "merchant_rtg",
        },
      });

      console.log(`💳 Payment processed: ${charge.id}`);
    } catch (stripeError) {
      console.error("❌ Stripe payment error:", stripeError.message);
      return res.status(400).json({
        type: "processing_error",
        code: "payment_declined",
        message: stripeError.message,
      });
    }

    // Mark delegated token as used
    if (isDelegatedToken) {
      tokenManager.consumeToken(payment_data.token);
    }

    // Generate order ID
    const orderId = `ord_${uuidv4()}`;
    const baseUrl = process.env.BASE_URL || "https://www.roomstogo.com";
    const permalinkUrl = `${baseUrl}/orders/${orderId}`;

    // Create order
    const order = {
      id: orderId,
      checkout_session_id: sessionId,
      permalink_url: permalinkUrl,
      status: "confirmed",
      buyer: buyer || session.buyer,
      line_items: session.line_items,
      fulfillment_address: session.fulfillment_address,
      fulfillment_option_id: session.fulfillment_option_id,
      totals: session.totals,
      currency: session.currency,
      payment: {
        provider: payment_data.provider,
        charge_id: charge.id,
        status: charge.status,
      },
      created_at: new Date().toISOString(),
    };

    // Store order
    data.orders[orderId] = order;

    // Update session
    session.status = "completed";
    session.completed_at = new Date().toISOString();
    session.order = {
      id: orderId,
      checkout_session_id: sessionId,
      permalink_url: permalinkUrl,
    };
    data.checkout_sessions[sessionId] = session;

    writeData(data);

    console.log(`✅ Order created: ${orderId}`);

    // Send webhook to OpenAI
    webhookSender
      .sendOrderCreated({
        orderId,
        checkoutSessionId: sessionId,
        permalinkUrl,
        status: "created",
      })
      .catch((err) => console.error("Webhook error:", err));

    // Return session with order
    res.status(201).json(session);
  } catch (error) {
    console.error("❌ Error completing checkout:", error);
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error completing checkout",
    });
  }
});

/**
 * POST /checkout_sessions/:id/cancel
 * Cancel a checkout session
 */
router.post("/:id/cancel", async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Get existing session
    const data = readData();
    const session = data.checkout_sessions[sessionId];

    if (!session) {
      return res.status(404).json({
        type: "invalid_request",
        code: "session_not_found",
        message: `Checkout session ${sessionId} not found`,
      });
    }

    // Check if already finalized
    if (session.status === "completed") {
      return res.status(400).json({
        type: "invalid_request",
        code: "session_already_completed",
        message: "Cannot cancel a completed session",
      });
    }

    if (session.status === "canceled") {
      // Already canceled, return current state
      return res.json(session);
    }

    // Update status
    session.status = "canceled";
    session.canceled_at = new Date().toISOString();
    data.checkout_sessions[sessionId] = session;

    writeData(data);

    console.log(`✅ Checkout session canceled: ${sessionId}`);

    res.json(session);
  } catch (error) {
    console.error("❌ Error canceling checkout session:", error);
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error canceling checkout session",
    });
  }
});

/**
 * GET /checkout_sessions/:id
 * Get checkout session status
 */
router.get("/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;

    // Get session
    const data = readData();
    const session = data.checkout_sessions[sessionId];

    if (!session) {
      return res.status(404).json({
        type: "invalid_request",
        code: "session_not_found",
        message: `Checkout session ${sessionId} not found`,
      });
    }

    console.log(`✅ Checkout session retrieved: ${sessionId}`);

    res.json(session);
  } catch (error) {
    console.error("❌ Error retrieving checkout session:", error);
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error retrieving checkout session",
    });
  }
});

module.exports = router;
