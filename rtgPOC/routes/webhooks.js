// Webhooks API - Event notifications
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const WebhookSender = require("../services/WebhookSender");

// Initialize WebhookSender
const webhookSender = new WebhookSender();

// Helper function to read orders
function readOrders() {
  const ordersPath = path.join(__dirname, "../data/orders.json");
  const data = fs.readFileSync(ordersPath, "utf8");
  return JSON.parse(data);
}

// Helper function to write orders
function writeOrders(data) {
  const ordersPath = path.join(__dirname, "../data/orders.json");
  fs.writeFileSync(ordersPath, JSON.stringify(data, null, 2));
}

// POST /api/webhooks/order-updates - Receive status change notifications
router.post("/order-updates", (req, res) => {
  try {
    const { order_id, event_type, data } = req.body;

    // Validations
    if (!order_id || !event_type) {
      return res.status(400).json({
        error: "Required fields: order_id, event_type",
      });
    }

    // Verify order exists
    const ordersData = readOrders();
    const order = ordersData.orders[order_id];

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
        order_id,
      });
    }

    // Process event by type
    const timestamp = new Date().toISOString();
    let updatedStatus = order.status;

    switch (event_type) {
      case "shipped":
        updatedStatus = "shipped";
        order.status = "shipped";
        order.shipped_at = timestamp;
        if (data?.tracking_number) {
          order.tracking_number = data.tracking_number;
        }
        console.log("📦 Order shipped:", order_id);
        break;

      case "delivered":
        updatedStatus = "delivered";
        order.status = "delivered";
        order.delivered_at = timestamp;
        console.log("✅ Order delivered:", order_id);
        break;

      case "cancelled":
        updatedStatus = "cancelled";
        order.status = "cancelled";
        order.cancelled_at = timestamp;
        if (data?.reason) {
          order.cancellation_reason = data.reason;
        }
        console.log("❌ Order cancelled:", order_id);
        break;

      default:
        return res.status(400).json({
          error: "Invalid event type",
          valid_types: ["shipped", "delivered", "cancelled"],
        });
    }

    // Add event log if it doesn't exist
    if (!order.events) {
      order.events = [];
    }

    order.events.push({
      type: event_type,
      timestamp,
      data: data || {},
    });

    // Save changes
    ordersData.orders[order_id] = order;
    writeOrders(ordersData);

    console.log("📨 Webhook processed:", event_type, "for order", order_id);

    // Send webhook notification to OpenAI (fire and forget)
    const checkoutId = order.checkout_id || `chk_${order_id}`;
    const permalinkUrl =
      order.tracking_url || `https://tracking.example.com/order/${order_id}`;

    if (event_type === "shipped") {
      webhookSender
        .sendOrderShipped({
          orderId: order_id,
          checkoutSessionId: checkoutId,
          permalinkUrl: permalinkUrl,
          trackingNumber: data?.tracking_number,
        })
        .catch((err) =>
          console.error("⚠️  Webhook delivery failed:", err.message)
        );
    } else if (event_type === "delivered") {
      webhookSender
        .sendOrderFulfilled({
          orderId: order_id,
          checkoutSessionId: checkoutId,
          permalinkUrl: permalinkUrl,
        })
        .catch((err) =>
          console.error("⚠️  Webhook delivery failed:", err.message)
        );
    } else if (event_type === "cancelled") {
      webhookSender
        .sendOrderCanceled({
          orderId: order_id,
          checkoutSessionId: checkoutId,
          permalinkUrl: permalinkUrl,
        })
        .catch((err) =>
          console.error("⚠️  Webhook delivery failed:", err.message)
        );
    }

    res.json({
      success: true,
      order_id,
      event_type,
      new_status: updatedStatus,
      timestamp,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    res.status(500).json({
      error: "Error processing webhook",
      details: error.message,
    });
  }
});

// GET /api/webhooks/events/:order_id - Get order event history
router.get("/events/:order_id", (req, res) => {
  try {
    const orderId = req.params.order_id;
    const ordersData = readOrders();
    const order = ordersData.orders[orderId];

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
        order_id: orderId,
      });
    }

    res.json({
      order_id: orderId,
      current_status: order.status,
      events: order.events || [],
    });
  } catch (error) {
    console.error("❌ Error getting events:", error);
    res.status(500).json({
      error: "Error retrieving order events",
    });
  }
});

module.exports = router;
