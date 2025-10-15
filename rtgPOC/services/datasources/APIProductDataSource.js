/**
 * API Product Data Source Implementation
 *
 * Concrete implementation of ProductDataSource using external REST API.
 * This is a future-ready implementation that can be used to integrate
 * with external product APIs (e.g., RTG Product API, third-party services).
 *
 * Design Patterns:
 * - Strategy: Concrete strategy for API-based data access
 * - Adapter: Adapts external API responses to ProductDataSource interface
 * - Circuit Breaker: Can be extended to handle API failures gracefully
 */

const ProductDataSource = require('./ProductDataSource');

class APIProductDataSource extends ProductDataSource {
  constructor(config = {}) {
    super();
    this.baseURL = config.baseURL || process.env.PRODUCTS_API_URL;
    this.apiKey = config.apiKey || process.env.PRODUCTS_API_KEY;
    this.timeout = config.timeout || 10000;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'rtgapp',
      ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      ...config.headers,
    };
    this.connected = false;
  }

  /**
   * HTTP request helper with timeout
   * @param {string} endpoint
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async fetchWithTimeout(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: this.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('API request timeout');
      }
      throw error;
    }
  }

  /**
   * Initialize and verify API connection
   */
  async connect() {
    try {
      if (!this.baseURL) {
        throw new Error('API base URL not configured. Set PRODUCTS_API_URL environment variable.');
      }

      // Test connection with health check
      const healthCheck = await this.healthCheck();
      if (!healthCheck.healthy) {
        throw new Error(`API health check failed: ${healthCheck.message}`);
      }

      this.connected = true;
      console.log(`✅ Connected to Products API: ${this.baseURL}`);
    } catch (error) {
      console.error('❌ Error connecting to Products API:', error);
      throw error;
    }
  }

  /**
   * Close connection (no-op for stateless HTTP)
   */
  async disconnect() {
    this.connected = false;
    console.log('🔌 API data source disconnected');
  }

  /**
   * Get all products
   * @returns {Promise<Array>}
   */
  async getAllProducts() {
    try {
      // Adjust endpoint based on your API structure
      const data = await this.fetchWithTimeout('/products');
      const products = Array.isArray(data) ? data : data.products || [];

      console.log(`📦 Retrieved ${products.length} products from API`);
      return products;
    } catch (error) {
      console.error('❌ Error fetching products from API:', error);
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  /**
   * Get product by ID
   * @param {string} productId
   * @returns {Promise<Object|null>}
   */
  async getProductById(productId) {
    try {
      // Example: GET /products/:id or GET /products/:id.json (for RTG API)
      const product = await this.fetchWithTimeout(`/products/${productId}`);

      if (product) {
        console.log(`✅ Found product: ${product.name || productId}`);
      } else {
        console.log(`❌ Product not found: ${productId}`);
      }

      return product || null;
    } catch (error) {
      // Handle 404 as null, not an error
      if (error.message.includes('404')) {
        console.log(`❌ Product not found: ${productId}`);
        return null;
      }
      console.error('❌ Error fetching product by ID:', error);
      throw new Error(`Failed to fetch product: ${error.message}`);
    }
  }

  /**
   * Search products by query
   * @param {string} query - Search term
   * @returns {Promise<Array>}
   */
  async searchProducts(query) {
    try {
      // Adjust endpoint based on your API
      const data = await this.fetchWithTimeout(`/products/search?q=${encodeURIComponent(query)}`);
      const products = Array.isArray(data) ? data : data.results || [];

      console.log(`🔍 Search "${query}" found ${products.length} results`);
      return products;
    } catch (error) {
      console.error('❌ Error searching products:', error);
      throw new Error(`Failed to search products: ${error.message}`);
    }
  }

  /**
   * Check if product exists
   * @param {string} productId
   * @returns {Promise<boolean>}
   */
  async productExists(productId) {
    try {
      const product = await this.getProductById(productId);
      return product !== null;
    } catch (error) {
      console.error('❌ Error checking product existence:', error);
      return false;
    }
  }

  /**
   * Get products by category
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async getProductsByCategory(category) {
    try {
      const data = await this.fetchWithTimeout(`/products?category=${encodeURIComponent(category)}`);
      const products = Array.isArray(data) ? data : data.products || [];

      console.log(`📂 Found ${products.length} products in category: ${category}`);
      return products;
    } catch (error) {
      console.error('❌ Error fetching products by category:', error);
      throw new Error(`Failed to fetch products by category: ${error.message}`);
    }
  }

  /**
   * Check product availability and stock
   * @param {string} productId
   * @param {number} quantity
   * @returns {Promise<{available: boolean, stock: number}>}
   */
  async checkAvailability(productId, quantity) {
    try {
      const product = await this.getProductById(productId);

      if (!product) {
        return { available: false, stock: 0 };
      }

      const isAvailable =
        product.availability === 'in_stock' &&
        (product.stock_quantity || 0) >= quantity;

      return {
        available: isAvailable,
        stock: product.stock_quantity || 0,
      };
    } catch (error) {
      console.error('❌ Error checking product availability:', error);
      throw new Error(`Failed to check availability: ${error.message}`);
    }
  }

  /**
   * Health check
   * @returns {Promise<{healthy: boolean, message: string}>}
   */
  async healthCheck() {
    try {
      // Try to fetch a small endpoint or health endpoint
      await this.fetchWithTimeout('/health').catch(async () => {
        // Fallback: try to fetch products list
        await this.fetchWithTimeout('/products?limit=1');
      });

      return {
        healthy: true,
        message: `API connection healthy - ${this.baseURL}`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `API health check failed: ${error.message}`,
      };
    }
  }
}

module.exports = APIProductDataSource;
