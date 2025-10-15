// Webhook Sender - Sends order events to OpenAI
const crypto = require("crypto");

class WebhookSender {
  constructor() {
    this.webhookUrl = process.env.OPENAI_WEBHOOK_URL;
    this.webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  /**
   * Generate HMAC signature for webhook payload
   * @param {Object} payload - Webhook payload
   * @returns {string} Base64 encoded signature
   */
  generateSignature(payload) {
    if (!this.webhookSecret) {
      console.warn("⚠️  OPENAI_WEBHOOK_SECRET not configured");
      return "";
    }

    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac("sha256", this.webhookSecret);
    hmac.update(payloadString);
    return hmac.digest("base64");
  }

  /**
   * Send webhook with retry logic
   * @param {Object} payload - Webhook payload
   * @param {number} attempt - Current attempt number
   * @returns {Promise<boolean>} Success status
   */
  async sendWebhook(payload, attempt = 1) {
    if (!this.webhookUrl) {
      console.warn("⚠️  OPENAI_WEBHOOK_URL not configured, skipping webhook");
      return false;
    }

    try {
      const signature = this.generateSignature(payload);
      const timestamp = new Date().toISOString();

      console.log(
        `📤 Sending webhook (attempt ${attempt}/${this.maxRetries}):`,
        payload.type
      );

      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Merchant-Signature": signature,
          Timestamp: timestamp,
          "User-Agent": "RTG-ACP/1.0",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Webhook failed with status ${response.status}: ${response.statusText}`
        );
      }

      console.log(`✅ Webhook delivered successfully: ${payload.type}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Webhook delivery failed (attempt ${attempt}):`,
        error.message
      );

      // Retry with exponential backoff
      if (attempt < this.maxRetries) {
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        console.log(`   Retrying in ${delay}ms...`);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendWebhook(payload, attempt + 1);
      }

      console.error(
        `❌ Webhook delivery failed after ${this.maxRetries} attempts`
      );
      return false;
    }
  }

  /**
   * Send order.created event
   * @param {Object} params - Order parameters
   * @returns {Promise<boolean>} Success status
   */
  async sendOrderCreated({
    orderId,
    checkoutSessionId,
    permalinkUrl,
    status = "created",
  }) {
    const payload = {
      type: "order_created",
      data: {
        type: "order",
        checkout_session_id: checkoutSessionId,
        permalink_url: permalinkUrl,
        status: status,
        refunds: [],
      },
    };

    return this.sendWebhook(payload);
  }

  /**
   * Send order.updated event
   * @param {Object} params - Order parameters
   * @returns {Promise<boolean>} Success status
   */
  async sendOrderUpdated({
    orderId,
    checkoutSessionId,
    permalinkUrl,
    status,
    refunds = [],
  }) {
    const payload = {
      type: "order_updated",
      data: {
        type: "order",
        checkout_session_id: checkoutSessionId,
        permalink_url: permalinkUrl,
        status: status,
        refunds: refunds,
      },
    };

    return this.sendWebhook(payload);
  }

  /**
   * Send order cancellation event
   * @param {Object} params - Order parameters
   * @returns {Promise<boolean>} Success status
   */
  async sendOrderCanceled({ orderId, checkoutSessionId, permalinkUrl }) {
    return this.sendOrderUpdated({
      orderId,
      checkoutSessionId,
      permalinkUrl,
      status: "canceled",
      refunds: [],
    });
  }

  /**
   * Send order shipped event
   * @param {Object} params - Order parameters
   * @returns {Promise<boolean>} Success status
   */
  async sendOrderShipped({
    orderId,
    checkoutSessionId,
    permalinkUrl,
    trackingNumber = null,
  }) {
    return this.sendOrderUpdated({
      orderId,
      checkoutSessionId,
      permalinkUrl,
      status: "shipped",
      refunds: [],
    });
  }

  /**
   * Send order fulfilled event
   * @param {Object} params - Order parameters
   * @returns {Promise<boolean>} Success status
   */
  async sendOrderFulfilled({ orderId, checkoutSessionId, permalinkUrl }) {
    return this.sendOrderUpdated({
      orderId,
      checkoutSessionId,
      permalinkUrl,
      status: "fulfilled",
      refunds: [],
    });
  }
}

module.exports = WebhookSender;
