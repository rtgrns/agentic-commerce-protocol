// Delegated Token Manager - Secure storage and validation of payment tokens
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class DelegatedTokenManager {
  constructor() {
    this.tokensPath = path.join(__dirname, "../data/orders.json");
  }

  /**
   * Read orders data (includes delegated tokens)
   */
  readData() {
    const data = fs.readFileSync(this.tokensPath, "utf8");
    const parsed = JSON.parse(data);

    // Ensure delegated_tokens exists
    if (!parsed.delegated_tokens) {
      parsed.delegated_tokens = {};
    }

    return parsed;
  }

  /**
   * Write orders data
   */
  writeData(data) {
    fs.writeFileSync(this.tokensPath, JSON.stringify(data, null, 2));
  }

  /**
   * Generate a vault token ID
   */
  generateVaultTokenId() {
    return `vt_${crypto.randomBytes(16).toString("hex")}`;
  }

  /**
   * Store a delegated payment token
   * @param {Object} params - Token parameters
   * @returns {Object} Stored token info
   */
  storeToken({
    stripeTokenId,
    paymentMethod,
    allowance,
    billingAddress = null,
    riskSignals,
    metadata,
  }) {
    const data = this.readData();

    const vaultTokenId = this.generateVaultTokenId();
    const now = new Date().toISOString();

    // Redact sensitive card data for storage
    const safeCardData = {
      type: paymentMethod.type,
      card_number_type: paymentMethod.card_number_type,
      display_brand: paymentMethod.display_brand,
      display_last4: paymentMethod.display_last4,
      display_card_funding_type: paymentMethod.display_card_funding_type,
      display_wallet_type: paymentMethod.display_wallet_type,
      exp_month: paymentMethod.exp_month,
      exp_year: paymentMethod.exp_year,
    };

    const token = {
      id: vaultTokenId,
      stripe_token_id: stripeTokenId,
      payment_method: safeCardData,
      allowance: {
        reason: allowance.reason,
        max_amount: allowance.max_amount,
        currency: allowance.currency,
        checkout_session_id: allowance.checkout_session_id,
        merchant_id: allowance.merchant_id,
        expires_at: allowance.expires_at,
      },
      billing_address: billingAddress,
      risk_signals: riskSignals,
      metadata: metadata,
      created: now,
      used: false,
      used_at: null,
    };

    data.delegated_tokens[vaultTokenId] = token;
    this.writeData(data);

    console.log(
      `🔐 Delegated token stored: ${vaultTokenId} for session ${allowance.checkout_session_id}`
    );

    return {
      id: vaultTokenId,
      created: now,
      metadata: metadata,
    };
  }

  /**
   * Get a delegated token by ID
   * @param {string} vaultTokenId - Vault token ID
   * @returns {Object|null} Token object or null
   */
  getToken(vaultTokenId) {
    const data = this.readData();
    return data.delegated_tokens[vaultTokenId] || null;
  }

  /**
   * Validate token allowance against checkout session
   * @param {string} vaultTokenId - Vault token ID
   * @param {string} checkoutSessionId - Checkout session ID
   * @param {number} amount - Amount in minor units
   * @param {string} currency - Currency code
   * @returns {Object} Validation result
   */
  validateAllowance(vaultTokenId, checkoutSessionId, amount, currency) {
    const token = this.getToken(vaultTokenId);

    if (!token) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "invalid_token",
          message: "Token not found",
        },
      };
    }

    // Check if already used
    if (token.used) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "token_already_used",
          message: "Token has already been used",
        },
      };
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(token.allowance.expires_at);
    if (now > expiresAt) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "token_expired",
          message: "Token has expired",
        },
      };
    }

    // Check checkout session match
    if (token.allowance.checkout_session_id !== checkoutSessionId) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "invalid_session",
          message: "Token is not valid for this checkout session",
        },
      };
    }

    // Check amount
    if (amount > token.allowance.max_amount) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "amount_exceeds_allowance",
          message: `Amount ${amount} exceeds maximum allowed ${token.allowance.max_amount}`,
        },
      };
    }

    // Check currency
    if (currency !== token.allowance.currency) {
      return {
        valid: false,
        error: {
          type: "invalid_request",
          code: "currency_mismatch",
          message: `Currency ${currency} does not match token currency ${token.allowance.currency}`,
        },
      };
    }

    return { valid: true, token };
  }

  /**
   * Mark a token as consumed (one-time use)
   * @param {string} vaultTokenId - Vault token ID
   */
  consumeToken(vaultTokenId) {
    const data = this.readData();
    const token = data.delegated_tokens[vaultTokenId];

    if (token) {
      token.used = true;
      token.used_at = new Date().toISOString();
      this.writeData(data);
      console.log(`✅ Token consumed: ${vaultTokenId}`);
    }
  }

  /**
   * Clean up expired tokens (maintenance task)
   */
  cleanupExpiredTokens() {
    const data = this.readData();
    const now = new Date();
    let cleaned = 0;

    for (const [tokenId, token] of Object.entries(data.delegated_tokens)) {
      const expiresAt = new Date(token.allowance.expires_at);
      // Delete tokens expired > 24 hours ago
      if (now - expiresAt > 24 * 60 * 60 * 1000) {
        delete data.delegated_tokens[tokenId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.writeData(data);
      console.log(`🧹 Cleaned up ${cleaned} expired tokens`);
    }
  }
}

module.exports = DelegatedTokenManager;
