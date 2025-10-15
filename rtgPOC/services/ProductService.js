/**
 * Product Service (Facade Pattern + Dependency Injection)
 *
 * Main service layer for product operations. Acts as a facade that:
 * 1. Accepts a data source strategy via dependency injection
 * 2. Provides business logic on top of data access
 * 3. Handles caching, validation, and error handling
 * 4. Formats responses according to OpenAI Commerce Feed Specification
 *
 * Design Patterns:
 * - Facade: Simplifies complex data source operations
 * - Dependency Injection: Data source is injected, not hardcoded
 * - Strategy: Works with any ProductDataSource implementation
 * - Adapter: Uses OpenAIProductMapper to transform data
 */

const OpenAIProductMapper = require('./mappers/OpenAIProductMapper');

class ProductService {
  /**
   * @param {ProductDataSource} dataSource - The data source strategy to use
   * @param {Object} config - Optional configuration for the service
   */
  constructor(dataSource, config = {}) {
    if (!dataSource) {
      throw new Error('ProductService requires a data source');
    }
    this.dataSource = dataSource;
    this.mapper = new OpenAIProductMapper(config);
  }

  /**
   * Initialize the service and its data source
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.dataSource.connect();
    console.log('✅ ProductService initialized');
  }

  /**
   * Shutdown the service
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.dataSource.disconnect();
    console.log('🔌 ProductService shut down');
  }

  /**
   * Get product feed with metadata (OpenAI Commerce Feed Specification compliant)
   * @returns {Promise<Object>}
   */
  async getProductFeed() {
    const containers = await this.dataSource.getAllProducts();

    // Transform RTG containers to OpenAI Commerce format
    const feed = this.mapper.transformFeed(containers);

    console.log(`📋 Transformed ${feed.total_products} containers to OpenAI Commerce Feed format`);

    return feed;
  }

  /**
   * Get all products (raw)
   * @returns {Promise<Array>}
   */
  async getAllProducts() {
    return await this.dataSource.getAllProducts();
  }

  /**
   * Get a single product by ID
   * @param {string} productId
   * @returns {Promise<Object|null>}
   */
  async getProductById(productId) {
    this.validateProductId(productId);
    return await this.dataSource.getProductById(productId);
  }

  /**
   * Search products
   * @param {string} query - Search term
   * @returns {Promise<Object>} Search results with metadata
   */
  async searchProducts(query) {
    if (!query || query.trim() === '') {
      throw new Error('Search query cannot be empty');
    }

    const results = await this.dataSource.searchProducts(query.trim());

    return {
      query: query.trim(),
      count: results.length,
      results: results,
    };
  }

  /**
   * Get products by category
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async getProductsByCategory(category) {
    if (!category || category.trim() === '') {
      throw new Error('Category cannot be empty');
    }

    return await this.dataSource.getProductsByCategory(category.trim());
  }

  /**
   * Validate product availability for purchase
   * @param {string} productId
   * @param {number} quantity
   * @returns {Promise<{valid: boolean, product?: Object, error?: string}>}
   */
  async validateProductForPurchase(productId, quantity) {
    try {
      // Get product details
      const product = await this.getProductById(productId);

      if (!product) {
        return {
          valid: false,
          error: 'Product not found',
        };
      }

      // Check availability
      if (product.availability !== 'in_stock') {
        return {
          valid: false,
          product,
          error: 'Product not available',
        };
      }

      // Check stock
      const { available, stock } = await this.dataSource.checkAvailability(
        productId,
        quantity
      );

      if (!available) {
        return {
          valid: false,
          product,
          error: `Insufficient stock. Available: ${stock}, Requested: ${quantity}`,
        };
      }

      return {
        valid: true,
        product,
      };
    } catch (error) {
      console.error('❌ Error validating product:', error);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculate price breakdown for product purchase
   * @param {Object} product - Product object
   * @param {number} quantity - Quantity to purchase
   * @returns {Object} Price breakdown
   */
  calculatePriceBreakdown(product, quantity) {
    const subtotal = product.price * quantity;
    const taxRate = parseFloat(process.env.TAX_RATE || '0.08');
    const tax = subtotal * taxRate;
    const shippingCost = parseFloat(process.env.SHIPPING_COST || '5.99');
    const total = subtotal + tax + shippingCost;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping: shippingCost,
      total: parseFloat(total.toFixed(2)),
      currency: product.currency,
    };
  }

  /**
   * Get service health status
   * @returns {Promise<Object>}
   */
  async getHealthStatus() {
    const dataSourceHealth = await this.dataSource.healthCheck();

    return {
      service: 'ProductService',
      status: dataSourceHealth.healthy ? 'healthy' : 'unhealthy',
      dataSource: dataSourceHealth,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate product ID format
   * @param {string} productId
   * @throws {Error} If product ID is invalid
   */
  validateProductId(productId) {
    if (!productId || typeof productId !== 'string' || productId.trim() === '') {
      throw new Error('Invalid product ID');
    }
  }

  /**
   * Get products with advanced filters (if supported by data source)
   * @param {Object} filters
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async getProductsWithFilters(filters, options) {
    // Check if data source supports advanced filtering
    if (typeof this.dataSource.getProductsWithFilters === 'function') {
      return await this.dataSource.getProductsWithFilters(filters, options);
    }

    // Fallback: get all and filter in-memory
    const allProducts = await this.dataSource.getAllProducts();
    return this.filterProductsInMemory(allProducts, filters, options);
  }

  /**
   * In-memory filtering fallback
   * @param {Array} products
   * @param {Object} filters
   * @param {Object} options
   * @returns {Array}
   */
  filterProductsInMemory(products, filters = {}, options = {}) {
    let filtered = [...products];

    // Apply filters
    if (filters.category) {
      filtered = filtered.filter(
        (p) => p.category.toLowerCase() === filters.category.toLowerCase()
      );
    }
    if (filters.brand) {
      filtered = filtered.filter(
        (p) => p.brand.toLowerCase() === filters.brand.toLowerCase()
      );
    }
    if (filters.minPrice !== undefined) {
      filtered = filtered.filter((p) => p.price >= filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      filtered = filtered.filter((p) => p.price <= filters.maxPrice);
    }
    if (filters.availability) {
      filtered = filtered.filter((p) => p.availability === filters.availability);
    }

    // Apply sorting
    if (options.sort) {
      const [field, order] = Object.entries(options.sort)[0];
      filtered.sort((a, b) => {
        if (order === 1) {
          return a[field] > b[field] ? 1 : -1;
        }
        return a[field] < b[field] ? 1 : -1;
      });
    }

    // Apply pagination
    const skip = options.skip || 0;
    const limit = options.limit || filtered.length;
    filtered = filtered.slice(skip, skip + limit);

    return filtered;
  }
}

module.exports = ProductService;
