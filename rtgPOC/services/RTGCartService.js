// RTG Cart Service - Integration with RTG Cart API (carts.rtg-dev.com)
const crypto = require("crypto");

class RTGCartService {
  constructor() {
    this.baseUrl = process.env.RTG_CART_API_URL || "https://carts.rtg-dev.com";
    this.apiKey = process.env.RTG_CART_API_KEY;
    this.defaultRegion = process.env.DEFAULT_REGION || "FL";
    this.defaultZone = process.env.DEFAULT_ZONE || "0";
    this.defaultDistributionIndex = parseInt(
      process.env.DEFAULT_DISTRIBUTION_INDEX || "10"
    );
  }

  /**
   * Make API request to RTG Cart API
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    // Add API key if configured
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`RTG Cart API error (${response.status}):`, data);
        throw new Error(data.message || `Cart API error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("RTG Cart API request failed:", error.message);
      throw error;
    }
  }

  /**
   * Create a new cart
   * @param {Object} params - Cart creation parameters
   * @returns {Promise<Object>} Created cart
   */
  async createCart({
    lineItems = [],
    region = null,
    zone = null,
    distributionIndex = null,
    zipCode = null,
    type = "online",
    source = "desktop-web",
    accountId = null,
  }) {
    const payload = {
      lineItems,
      region: region || this.defaultRegion,
      zone: zone || this.defaultZone,
      distributionIndex: distributionIndex || this.defaultDistributionIndex,
      zipCode: zipCode || "00000",
      type,
      source,
    };

    if (accountId) {
      payload.accountId = accountId;
    }

    console.log(`🛒 Creating RTG cart with ${lineItems.length} items`);

    const cart = await this.makeRequest("/cart", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    console.log(`✅ RTG cart created: ${cart._id}`);
    return cart;
  }

  /**
   * Get cart by ID
   * @param {string} cartId - Cart ID
   * @param {boolean} updateStoreCart - Whether to update from source
   * @returns {Promise<Object>} Cart data
   */
  async getCart(cartId, updateStoreCart = false) {
    const query = updateStoreCart ? "?updateStoreCart=true" : "";
    return this.makeRequest(`/cart/${cartId}${query}`, {
      method: "GET",
    });
  }

  /**
   * Update cart metadata (region, zone, zipCode, etc.)
   * @param {string} cartId - Cart ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated cart
   */
  async updateCart(cartId, updates) {
    console.log(`🔄 Updating RTG cart: ${cartId}`);

    const cart = await this.makeRequest(`/cart/${cartId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    console.log(`✅ RTG cart updated`);
    return cart;
  }

  /**
   * Add items to cart
   * @param {string} cartId - Cart ID
   * @param {Array} lineItems - Items to add
   * @returns {Promise<Object>} Updated cart
   */
  async addItems(cartId, lineItems) {
    console.log(`➕ Adding ${lineItems.length} items to cart ${cartId}`);

    const cart = await this.makeRequest(`/cart/${cartId}/items`, {
      method: "POST",
      body: JSON.stringify({ lineItems }),
    });

    console.log(`✅ Items added to cart`);
    return cart;
  }

  /**
   * Get all items in cart
   * @param {string} cartId - Cart ID
   * @returns {Promise<Array>} Cart items
   */
  async getCartItems(cartId) {
    return this.makeRequest(`/cart/${cartId}/items`, {
      method: "GET",
    });
  }

  /**
   * Update cart item
   * @param {string} cartId - Cart ID
   * @param {string} itemId - Line item ID
   * @param {Object} updates - Fields to update (quantity, warrantyEnabled)
   * @returns {Promise<Object>} Updated cart
   */
  async updateCartItem(cartId, itemId, updates) {
    console.log(`🔄 Updating item ${itemId} in cart ${cartId}`);

    const cart = await this.makeRequest(`/cart/${cartId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    console.log(`✅ Item updated`);
    return cart;
  }

  /**
   * Remove item from cart
   * @param {string} cartId - Cart ID
   * @param {string} itemId - Line item ID
   * @returns {Promise<Object>} Updated cart
   */
  async removeCartItem(cartId, itemId) {
    console.log(`➖ Removing item ${itemId} from cart ${cartId}`);

    const cart = await this.makeRequest(`/cart/${cartId}/items/${itemId}`, {
      method: "DELETE",
    });

    console.log(`✅ Item removed`);
    return cart;
  }

  /**
   * Clear all items from cart
   * @param {string} cartId - Cart ID
   * @param {Array} itemIds - Optional array of specific item IDs to remove
   * @returns {Promise<Object>} Updated cart
   */
  async clearCartItems(cartId, itemIds = null) {
    const payload = itemIds ? { itemIds } : {};

    console.log(`🗑️  Clearing items from cart ${cartId}`);

    const cart = await this.makeRequest(`/cart/${cartId}/items`, {
      method: "DELETE",
      body: JSON.stringify(payload),
    });

    console.log(`✅ Cart items cleared`);
    return cart;
  }

  /**
   * Close a cart (mark as submitted)
   * @param {string} cartId - Cart ID
   * @returns {Promise<Object>} Success response
   */
  async closeCart(cartId) {
    console.log(`🔒 Closing RTG cart: ${cartId}`);

    const result = await this.makeRequest(`/cart/${cartId}/close`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    console.log(`✅ RTG cart closed`);
    return result;
  }

  /**
   * Delete a cart permanently
   * @param {string} cartId - Cart ID
   * @returns {Promise<Object>} Success response
   */
  async deleteCart(cartId) {
    console.log(`🗑️  Deleting RTG cart: ${cartId}`);

    const result = await this.makeRequest(`/cart/${cartId}`, {
      method: "DELETE",
    });

    console.log(`✅ RTG cart deleted`);
    return result;
  }

  /**
   * Check if cart can be split into multiple deliveries
   * @param {string} cartId - Cart ID
   * @param {string} zipCode - Delivery zip code
   * @returns {Promise<Object>} Split delivery status
   */
  async checkSplitDelivery(cartId, zipCode) {
    return this.makeRequest(`/cart/${cartId}/split-check/${zipCode}`, {
      method: "GET",
    });
  }

  /**
   * Transform RTG cart to Agentic Checkout line items format
   * @param {Object} rtgCart - RTG cart response
   * @param {number} taxRate - Tax rate to apply
   * @returns {Array} Line items in OpenAI format
   */
  transformToLineItems(rtgCart, taxRate = 0.08) {
    const lineItems = [];

    for (const item of rtgCart.lineItems) {
      // Get unit price in cents
      const unitPriceCents = Math.round(item.unitPrice * 100);
      const baseAmount = unitPriceCents * item.quantity;

      // Calculate discount (from strike price)
      let discount = 0;
      if (item.strikePrice && item.strikePrice > item.unitPrice) {
        const savingsPerUnit = Math.round(
          (item.strikePrice - item.unitPrice) * 100
        );
        discount = savingsPerUnit * item.quantity;
      }

      const subtotal = baseAmount - discount;
      const tax = Math.round(subtotal * taxRate);
      const total = subtotal + tax;

      lineItems.push({
        id: item.lineItemId,
        item: {
          id: item.sku,
          quantity: item.quantity,
        },
        base_amount: baseAmount,
        discount: discount,
        subtotal: subtotal,
        tax: tax,
        total: total,
        // Store RTG-specific metadata
        metadata: {
          rtg_line_item_id: item.lineItemId,
          is_container_sku: item.isContainerSku || false,
          delivery_type: item.deliveryType,
          warranty_enabled: item.warrantyEnabled,
          on_promotion: item.onPromotion || false,
          friendly_name: item.friendlyName,
        },
      });
    }

    return lineItems;
  }

  /**
   * Calculate totals from RTG cart
   * @param {Object} rtgCart - RTG cart response
   * @returns {Object} Cart totals summary
   */
  getCartTotals(rtgCart) {
    return {
      subtotal: Math.round((rtgCart.cartSubtotal || 0) * 100), // Convert to cents
      total: Math.round((rtgCart.cartTotal || 0) * 100),
      savings: Math.round((rtgCart.totalSavings || 0) * 100),
      promotions: rtgCart.promotions || [],
      coupon: rtgCart.couponInfo || null,
    };
  }

  /**
   * Create cart from items (helper method)
   * @param {Array} items - Array of {id, quantity}
   * @param {Object} metadata - Cart metadata (region, zone, zipCode)
   * @returns {Promise<Object>} Created cart
   */
  async createCartFromItems(items, metadata = {}) {
    const lineItems = items.map((item) => ({
      sku: item.id,
      quantity: item.quantity,
      warrantyEnabled: false,
      additionalOptions: {
        selections: [],
        addons: [],
        completeYourSleep: [],
      },
    }));

    return this.createCart({
      lineItems,
      region: metadata.region,
      zone: metadata.zone,
      distributionIndex: metadata.distributionIndex,
      zipCode: metadata.zipCode,
      accountId: metadata.accountId,
    });
  }
}

module.exports = RTGCartService;
