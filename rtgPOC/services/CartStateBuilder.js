// Cart State Builder - Transforms items into Agentic Checkout format
const ProductServiceFactory = require("./ProductServiceFactory");
const RTGCartService = require("./RTGCartService");

class CartStateBuilder {
  constructor() {
    this.productService = null;
    this.rtgCartService = new RTGCartService();
    this.taxRate = parseFloat(process.env.DEFAULT_TAX_RATE || "0.08");
    this.currency = (process.env.DEFAULT_CURRENCY || "USD").toLowerCase();
    this.baseUrl = process.env.BASE_URL || "https://www.roomstogo.com";
    this.useRTGCart = process.env.USE_RTG_CART === "true";
  }

  async initialize() {
    if (!this.productService) {
      this.productService = await ProductServiceFactory.createAndInitialize();
    }
  }

  /**
   * Build line items from cart items
   * @param {Array} items - Array of {id, quantity}
   * @param {string} region - Region code (e.g., 'FL')
   * @returns {Promise<Array>} Array of LineItem objects
   */
  async buildLineItems(items, region = "FL") {
    await this.initialize();

    const lineItems = [];
    const errors = [];

    for (const item of items) {
      try {
        const product = await this.productService.getProductById(item.id);

        if (!product) {
          errors.push({
            type: "error",
            code: "invalid",
            param: `$.items[?(@.id=='${item.id}')]`,
            content_type: "plain",
            content: `Product with ID ${item.id} not found`,
          });
          continue;
        }

        // Get pricing
        const pricing = product.pricing || {};
        const price =
          pricing[`${region}_0_sale_price`] ||
          pricing[`${region}_0_list_price`] ||
          pricing.default_price ||
          0;

        // Convert to minor units (cents)
        const baseAmount = Math.round(parseFloat(price) * item.quantity * 100);

        // Calculate discount (0 for now, can be enhanced)
        const discount = 0;
        const subtotal = baseAmount - discount;

        // Calculate tax
        const tax = Math.round(subtotal * this.taxRate);

        // Calculate total
        const total = subtotal + tax;

        lineItems.push({
          id: `line_${item.id}_${Date.now()}`,
          item: {
            id: item.id,
            quantity: item.quantity,
          },
          base_amount: baseAmount,
          discount: discount,
          subtotal: subtotal,
          tax: tax,
          total: total,
        });
      } catch (error) {
        console.error(`Error building line item for ${item.id}:`, error);
        errors.push({
          type: "error",
          code: "invalid",
          param: `$.items[?(@.id=='${item.id}')]`,
          content_type: "plain",
          content: `Error processing item ${item.id}: ${error.message}`,
        });
      }
    }

    return { lineItems, errors };
  }

  /**
   * Build line items from RTG Cart
   * @param {string} rtgCartId - RTG Cart ID
   * @returns {Promise<Object>} Line items and errors
   */
  async buildLineItemsFromRTGCart(rtgCartId) {
    try {
      // Get cart from RTG Cart API
      const rtgCart = await this.rtgCartService.getCart(rtgCartId);

      // Transform RTG cart items to OpenAI line items format
      const lineItems = this.rtgCartService.transformToLineItems(
        rtgCart,
        this.taxRate
      );

      console.log(
        `✅ Built ${lineItems.length} line items from RTG cart ${rtgCartId}`
      );

      return { lineItems, errors: [], rtgCart };
    } catch (error) {
      console.error("Error building line items from RTG cart:", error);
      return {
        lineItems: [],
        errors: [
          {
            type: "error",
            code: "cart_error",
            content_type: "plain",
            content: `Failed to load cart: ${error.message}`,
          },
        ],
        rtgCart: null,
      };
    }
  }

  /**
   * Build totals array from line items and fulfillment
   * @param {Array} lineItems - Array of LineItem objects
   * @param {Object} selectedFulfillment - Selected fulfillment option
   * @returns {Array} Array of Total objects
   */
  buildTotals(lineItems, selectedFulfillment = null) {
    const totals = [];

    // Calculate items base amount
    const itemsBaseAmount = lineItems.reduce(
      (sum, item) => sum + item.base_amount,
      0
    );
    totals.push({
      type: "items_base_amount",
      display_text: "Items Subtotal",
      amount: itemsBaseAmount,
    });

    // Calculate items discount
    const itemsDiscount = lineItems.reduce(
      (sum, item) => sum + item.discount,
      0
    );
    if (itemsDiscount > 0) {
      totals.push({
        type: "items_discount",
        display_text: "Items Discount",
        amount: itemsDiscount,
      });
    }

    // Calculate subtotal (after item discounts)
    const subtotalAmount = itemsBaseAmount - itemsDiscount;
    totals.push({
      type: "subtotal",
      display_text: "Subtotal",
      amount: subtotalAmount,
    });

    // Cart-level discount (0 for now)
    const cartDiscount = 0;
    if (cartDiscount > 0) {
      totals.push({
        type: "discount",
        display_text: "Discount",
        amount: cartDiscount,
      });
    }

    // Fulfillment cost
    const fulfillmentCost = selectedFulfillment
      ? selectedFulfillment.subtotal
      : 0;
    totals.push({
      type: "fulfillment",
      display_text: "Shipping",
      amount: fulfillmentCost,
    });

    // Tax
    const itemsTax = lineItems.reduce((sum, item) => sum + item.tax, 0);
    const fulfillmentTax = selectedFulfillment ? selectedFulfillment.tax : 0;
    const totalTax = itemsTax + fulfillmentTax;
    totals.push({
      type: "tax",
      display_text: "Tax",
      amount: totalTax,
    });

    // Fees (0 for now)
    const fees = 0;
    if (fees > 0) {
      totals.push({
        type: "fee",
        display_text: "Service Fee",
        amount: fees,
      });
    }

    // Calculate grand total
    const grandTotal =
      subtotalAmount - cartDiscount + fulfillmentCost + totalTax + fees;
    totals.push({
      type: "total",
      display_text: "Total",
      amount: grandTotal,
    });

    return totals;
  }

  /**
   * Build fulfillment options based on address and items
   * @param {Object} address - Delivery address
   * @param {Array} items - Cart items
   * @returns {Array} Array of FulfillmentOption objects
   */
  buildFulfillmentOptions(address, items) {
    const options = [];

    // Standard shipping
    const standardCost = 599; // $5.99 in cents
    const standardTax = Math.round(standardCost * this.taxRate);

    const today = new Date();
    const standardEarliest = new Date(today);
    standardEarliest.setDate(standardEarliest.getDate() + 5);
    const standardLatest = new Date(today);
    standardLatest.setDate(standardLatest.getDate() + 7);

    options.push({
      type: "shipping",
      id: "shipping_standard",
      title: "Standard Shipping",
      subtitle: "5-7 business days",
      carrier: "USPS",
      earliest_delivery_time: standardEarliest.toISOString(),
      latest_delivery_time: standardLatest.toISOString(),
      subtotal: standardCost,
      tax: standardTax,
      total: standardCost + standardTax,
    });

    // Express shipping
    const expressCost = 1999; // $19.99 in cents
    const expressTax = Math.round(expressCost * this.taxRate);

    const expressEarliest = new Date(today);
    expressEarliest.setDate(expressEarliest.getDate() + 2);
    const expressLatest = new Date(today);
    expressLatest.setDate(expressLatest.getDate() + 3);

    options.push({
      type: "shipping",
      id: "shipping_express",
      title: "Express Shipping",
      subtitle: "2-3 business days",
      carrier: "FedEx",
      earliest_delivery_time: expressEarliest.toISOString(),
      latest_delivery_time: expressLatest.toISOString(),
      subtotal: expressCost,
      tax: expressTax,
      total: expressCost + expressTax,
    });

    return options;
  }

  /**
   * Build messages array for user communication
   * @param {Array} validationErrors - Array of error messages
   * @param {Array} infoMessages - Array of info messages
   * @returns {Array} Array of Message objects
   */
  buildMessages(validationErrors = [], infoMessages = []) {
    const messages = [];

    // Add validation errors
    for (const error of validationErrors) {
      messages.push(error);
    }

    // Add info messages
    for (const info of infoMessages) {
      if (typeof info === "string") {
        messages.push({
          type: "info",
          content_type: "plain",
          content: info,
        });
      } else {
        messages.push(info);
      }
    }

    return messages;
  }

  /**
   * Build links for ToS, privacy policy, etc.
   * @returns {Array} Array of Link objects
   */
  buildLinks() {
    return [
      {
        type: "terms_of_use",
        url: `${this.baseUrl}/customer-care/terms-conditions`,
      },
      {
        type: "privacy_policy",
        url: `${this.baseUrl}/customer-care/privacy-policy`,
      },
    ];
  }

  /**
   * Calculate checkout session status based on completeness
   * @param {Object} params - Session parameters
   * @returns {string} Status: 'not_ready_for_payment', 'ready_for_payment', etc.
   */
  calculateStatus({ hasAddress, hasItems, hasSelectedShipping, messages }) {
    // Check for blocking errors
    const hasErrors = messages.some((m) => m.type === "error");
    if (hasErrors) {
      return "not_ready_for_payment";
    }

    // Must have items
    if (!hasItems) {
      return "not_ready_for_payment";
    }

    // Must have address for physical items
    if (!hasAddress) {
      return "not_ready_for_payment";
    }

    // Must have selected shipping
    if (!hasSelectedShipping) {
      return "not_ready_for_payment";
    }

    return "ready_for_payment";
  }

  /**
   * Build complete checkout session state
   * @param {Object} params - Session parameters
   * @returns {Promise<Object>} Complete CheckoutSession object
   */
  async buildCheckoutSession({
    sessionId,
    buyer = null,
    items = [],
    rtgCartId = null,
    fulfillmentAddress = null,
    fulfillmentOptionId = null,
    existingSession = null,
    region = "FL",
  }) {
    // Build line items from RTG cart or from items
    let lineItems, errors, rtgCart;

    if (rtgCartId) {
      // Use RTG Cart API
      const result = await this.buildLineItemsFromRTGCart(rtgCartId);
      lineItems = result.lineItems;
      errors = result.errors;
      rtgCart = result.rtgCart;
    } else {
      // Build from items directly
      const result = await this.buildLineItems(items, region);
      lineItems = result.lineItems;
      errors = result.errors;
    }

    // Build fulfillment options
    const fulfillmentOptions = fulfillmentAddress
      ? this.buildFulfillmentOptions(fulfillmentAddress, items)
      : [];

    // Get selected fulfillment option
    let selectedFulfillment = null;
    if (fulfillmentOptionId && fulfillmentOptions.length > 0) {
      selectedFulfillment = fulfillmentOptions.find(
        (opt) => opt.id === fulfillmentOptionId
      );
      if (!selectedFulfillment) {
        errors.push({
          type: "error",
          code: "invalid",
          param: "$.fulfillment_option_id",
          content_type: "plain",
          content: `Invalid fulfillment option: ${fulfillmentOptionId}`,
        });
      }
    }

    // Build totals
    const totals = this.buildTotals(lineItems, selectedFulfillment);

    // Build messages
    const infoMessages = [];
    if (!fulfillmentAddress) {
      infoMessages.push("Please provide a shipping address to continue.");
    } else if (!fulfillmentOptionId) {
      infoMessages.push("Please select a shipping method to continue.");
    }
    const messages = this.buildMessages(errors, infoMessages);

    // Build links
    const links = this.buildLinks();

    // Calculate status
    const status = this.calculateStatus({
      hasAddress: !!fulfillmentAddress,
      hasItems: lineItems.length > 0,
      hasSelectedShipping: !!selectedFulfillment,
      messages,
    });

    // Build complete session
    const session = {
      id: sessionId,
      payment_provider: {
        provider: "stripe",
        supported_payment_methods: ["card"],
      },
      status,
      currency: this.currency,
      line_items: lineItems,
      totals,
      fulfillment_options: fulfillmentOptions,
      messages,
      links,
    };

    // Add optional fields
    if (buyer) {
      session.buyer = buyer;
    }
    if (fulfillmentAddress) {
      session.fulfillment_address = fulfillmentAddress;
    }
    if (fulfillmentOptionId) {
      session.fulfillment_option_id = fulfillmentOptionId;
    }
    if (rtgCartId) {
      session.rtg_cart_id = rtgCartId;
      session.rtg_cart_region = rtgCart?.region;
      session.rtg_cart_zone = rtgCart?.zone;
      session.rtg_cart_total = rtgCart?.cartTotal;
      session.rtg_cart_savings = rtgCart?.totalSavings;
    }

    return session;
  }
}

module.exports = CartStateBuilder;
