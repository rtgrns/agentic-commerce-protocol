// Delegated Payment API - Secure payment credential tokenization
const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const { agenticCommerceMiddleware } = require("../middleware/agentic-commerce");
const DelegatedTokenManager = require("../services/DelegatedTokenManager");

// Initialize services
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const tokenManager = new DelegatedTokenManager();

// Apply middleware
router.use(agenticCommerceMiddleware());

/**
 * Additional validation for API version (delegated payment requires 2025-09-29)
 */
function validateDelegatedPaymentVersion(req, res, next) {
  const apiVersion = req.apiVersion;

  if (apiVersion !== "2025-09-29") {
    return res.status(400).json({
      type: "invalid_request",
      code: "unsupported_api_version",
      message: "Delegated payment requires API-Version: 2025-09-29",
    });
  }

  next();
}

/**
 * POST /agentic_commerce/delegate_payment
 * Tokenize payment credential with allowance constraints
 */
router.post("/", validateDelegatedPaymentVersion, async (req, res) => {
  try {
    const {
      payment_method,
      allowance,
      billing_address,
      risk_signals,
      metadata,
    } = req.body;

    // Validation
    const errors = [];

    if (!payment_method) {
      errors.push({
        param: "payment_method",
        message: "Required field: payment_method",
      });
    } else {
      if (payment_method.type !== "card") {
        errors.push({
          param: "payment_method.type",
          message: "Only card payment method is supported",
        });
      }
      if (!payment_method.card_number_type) {
        errors.push({
          param: "payment_method.card_number_type",
          message: "Required field: card_number_type",
        });
      }
      if (!payment_method.number) {
        errors.push({
          param: "payment_method.number",
          message: "Required field: number",
        });
      }
      if (!payment_method.display_card_funding_type) {
        errors.push({
          param: "payment_method.display_card_funding_type",
          message: "Required field: display_card_funding_type",
        });
      }
      if (!payment_method.metadata) {
        errors.push({
          param: "payment_method.metadata",
          message: "Required field: metadata",
        });
      }
    }

    if (!allowance) {
      errors.push({ param: "allowance", message: "Required field: allowance" });
    } else {
      if (allowance.reason !== "one_time") {
        errors.push({
          param: "allowance.reason",
          message: "Only one_time allowance is supported",
        });
      }
      if (!allowance.max_amount || typeof allowance.max_amount !== "number") {
        errors.push({
          param: "allowance.max_amount",
          message: "Required field: max_amount (integer)",
        });
      }
      if (!allowance.currency || !allowance.currency.match(/^[a-z]{3}$/)) {
        errors.push({
          param: "allowance.currency",
          message: "Required field: currency (3-letter lowercase ISO-4217)",
        });
      }
      if (!allowance.checkout_session_id) {
        errors.push({
          param: "allowance.checkout_session_id",
          message: "Required field: checkout_session_id",
        });
      }
      if (!allowance.merchant_id) {
        errors.push({
          param: "allowance.merchant_id",
          message: "Required field: merchant_id",
        });
      }
      if (!allowance.expires_at) {
        errors.push({
          param: "allowance.expires_at",
          message: "Required field: expires_at",
        });
      }
    }

    if (
      !risk_signals ||
      !Array.isArray(risk_signals) ||
      risk_signals.length === 0
    ) {
      errors.push({
        param: "risk_signals",
        message: "Required field: risk_signals (non-empty array)",
      });
    }

    if (!metadata) {
      errors.push({ param: "metadata", message: "Required field: metadata" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        type: "invalid_request",
        code: "missing_required_fields",
        message: "Validation failed",
        param: errors[0].param,
      });
    }

    // Validate expiry if provided
    if (payment_method.exp_month && payment_method.exp_year) {
      const month = parseInt(payment_method.exp_month);
      const year = parseInt(payment_method.exp_year);

      if (month < 1 || month > 12) {
        return res.status(400).json({
          type: "invalid_request",
          code: "invalid_card",
          message: "Invalid expiry date (exp_month must be 01-12)",
          param: "payment_method.exp_month",
        });
      }

      // Check if card is expired
      const now = new Date();
      const expiry = new Date(year, month, 0); // Last day of expiry month
      if (expiry < now) {
        return res.status(400).json({
          type: "invalid_request",
          code: "invalid_card",
          message: "Card has expired",
          param: "payment_method.exp_month",
        });
      }
    }

    // Create Stripe token from card details
    let stripeToken;
    try {
      const tokenParams = {
        card: {
          number: payment_method.number,
          exp_month: payment_method.exp_month,
          exp_year: payment_method.exp_year,
          cvc: payment_method.cvc,
          name: payment_method.name,
        },
      };

      // Add billing address if provided
      if (billing_address) {
        tokenParams.card.address_line1 = billing_address.line_one;
        tokenParams.card.address_line2 = billing_address.line_two;
        tokenParams.card.address_city = billing_address.city;
        tokenParams.card.address_state = billing_address.state;
        tokenParams.card.address_country = billing_address.country;
        tokenParams.card.address_zip = billing_address.postal_code;
      }

      stripeToken = await stripe.tokens.create(tokenParams);

      console.log(`💳 Stripe token created: ${stripeToken.id}`);
    } catch (stripeError) {
      console.error("❌ Stripe tokenization error:", stripeError.message);

      // Redact sensitive info from logs
      const safeError = stripeError.message.replace(/\d{4,}/g, "****");

      return res.status(400).json({
        type: "invalid_request",
        code: "invalid_card",
        message: `Card tokenization failed: ${safeError}`,
        param: "payment_method.number",
      });
    }

    // Store the vault token with allowance constraints
    const result = tokenManager.storeToken({
      stripeTokenId: stripeToken.id,
      paymentMethod: payment_method,
      allowance,
      billingAddress: billing_address,
      riskSignals: risk_signals,
      metadata: metadata,
    });

    console.log(`✅ Delegated payment token created: ${result.id}`);

    res.status(201).json(result);
  } catch (error) {
    console.error("❌ Error creating delegated payment token:", error);

    // Don't leak sensitive information
    res.status(500).json({
      type: "processing_error",
      code: "internal_error",
      message: "Error processing payment credential",
    });
  }
});

module.exports = router;
