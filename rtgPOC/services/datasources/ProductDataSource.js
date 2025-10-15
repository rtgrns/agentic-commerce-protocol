/**
 * Product Data Source Interface (Strategy Pattern)
 *
 * This abstract class defines the contract for all product data sources.
 * Implementations can be: MongoDB, File-based, REST API, GraphQL, etc.
 *
 * Design Patterns:
 * - Strategy: Allows switching between different data source implementations
 * - Dependency Inversion: High-level modules depend on abstractions, not concrete implementations
 */

class ProductDataSource {
  /**
   * Get all products from the data source
   * @returns {Promise<Array>} Array of product objects
   */
  async getAllProducts() {
    throw new Error('Method getAllProducts() must be implemented');
  }

  /**
   * Get a single product by ID
   * @param {string} productId - The product identifier
   * @returns {Promise<Object|null>} Product object or null if not found
   */
  async getProductById(productId) {
    throw new Error('Method getProductById() must be implemented');
  }

  /**
   * Search products by query
   * @param {string} query - Search query string
   * @returns {Promise<Array>} Array of matching products
   */
  async searchProducts(query) {
    throw new Error('Method searchProducts() must be implemented');
  }

  /**
   * Check if product exists
   * @param {string} productId - The product identifier
   * @returns {Promise<boolean>} True if product exists
   */
  async productExists(productId) {
    throw new Error('Method productExists() must be implemented');
  }

  /**
   * Get products by category
   * @param {string} category - Category name
   * @returns {Promise<Array>} Array of products in category
   */
  async getProductsByCategory(category) {
    throw new Error('Method getProductsByCategory() must be implemented');
  }

  /**
   * Check product availability and stock
   * @param {string} productId - The product identifier
   * @param {number} quantity - Requested quantity
   * @returns {Promise<{available: boolean, stock: number}>} Availability info
   */
  async checkAvailability(productId, quantity) {
    throw new Error('Method checkAvailability() must be implemented');
  }

  /**
   * Initialize the data source connection
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('Method connect() must be implemented');
  }

  /**
   * Close the data source connection
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('Method disconnect() must be implemented');
  }

  /**
   * Health check for the data source
   * @returns {Promise<{healthy: boolean, message: string}>}
   */
  async healthCheck() {
    throw new Error('Method healthCheck() must be implemented');
  }
}

module.exports = ProductDataSource;
