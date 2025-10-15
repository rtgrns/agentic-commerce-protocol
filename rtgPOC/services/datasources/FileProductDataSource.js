/**
 * File-Based Product Data Source Implementation
 *
 * Concrete implementation of ProductDataSource using JSON files.
 * This is the original implementation, kept for backward compatibility
 * and as a fallback option.
 *
 * Design Patterns:
 * - Strategy: Concrete strategy for file-based data access
 * - Adapter: Adapts file system operations to ProductDataSource interface
 */

const ProductDataSource = require('./ProductDataSource');
const fs = require('fs');
const path = require('path');

class FileProductDataSource extends ProductDataSource {
  constructor() {
    super();
    this.productsPath = path.join(__dirname, '../../data/products.json');
    this.connected = false;
  }

  /**
   * Read products from file
   * @returns {Array}
   */
  readProductsFile() {
    try {
      const data = fs.readFileSync(this.productsPath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.products || [];
    } catch (error) {
      console.error('❌ Error reading products file:', error);
      throw new Error(`Failed to read products file: ${error.message}`);
    }
  }

  /**
   * Initialize (verify file exists)
   */
  async connect() {
    try {
      if (!fs.existsSync(this.productsPath)) {
        throw new Error(`Products file not found: ${this.productsPath}`);
      }
      this.connected = true;
      console.log('✅ File-based data source initialized');
    } catch (error) {
      console.error('❌ Error initializing file data source:', error);
      throw error;
    }
  }

  /**
   * No-op for file-based source
   */
  async disconnect() {
    this.connected = false;
    console.log('🔌 File-based data source disconnected');
  }

  /**
   * Get all products
   * @returns {Promise<Array>}
   */
  async getAllProducts() {
    try {
      const products = this.readProductsFile();
      console.log(`📦 Retrieved ${products.length} products from file`);
      return products;
    } catch (error) {
      console.error('❌ Error fetching products from file:', error);
      throw error;
    }
  }

  /**
   * Get product by ID
   * @param {string} productId
   * @returns {Promise<Object|null>}
   */
  async getProductById(productId) {
    try {
      const products = this.readProductsFile();
      const product = products.find((p) => p.id === productId);

      if (product) {
        console.log(`✅ Found product: ${product.name}`);
      } else {
        console.log(`❌ Product not found: ${productId}`);
      }

      return product || null;
    } catch (error) {
      console.error('❌ Error fetching product by ID:', error);
      throw error;
    }
  }

  /**
   * Search products by query
   * @param {string} query - Search term
   * @returns {Promise<Array>}
   */
  async searchProducts(query) {
    try {
      const products = this.readProductsFile();
      const lowerQuery = query.toLowerCase();

      const results = products.filter(
        (product) =>
          product.name.toLowerCase().includes(lowerQuery) ||
          product.description.toLowerCase().includes(lowerQuery) ||
          product.category.toLowerCase().includes(lowerQuery) ||
          product.brand.toLowerCase().includes(lowerQuery)
      );

      console.log(`🔍 Search "${query}" found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ Error searching products:', error);
      throw error;
    }
  }

  /**
   * Check if product exists
   * @param {string} productId
   * @returns {Promise<boolean>}
   */
  async productExists(productId) {
    try {
      const products = this.readProductsFile();
      return products.some((p) => p.id === productId);
    } catch (error) {
      console.error('❌ Error checking product existence:', error);
      throw error;
    }
  }

  /**
   * Get products by category
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async getProductsByCategory(category) {
    try {
      const products = this.readProductsFile();
      const lowerCategory = category.toLowerCase();

      const results = products.filter(
        (product) => product.category.toLowerCase() === lowerCategory
      );

      console.log(`📂 Found ${results.length} products in category: ${category}`);
      return results;
    } catch (error) {
      console.error('❌ Error fetching products by category:', error);
      throw error;
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
        product.stock_quantity >= quantity;

      return {
        available: isAvailable,
        stock: product.stock_quantity || 0,
      };
    } catch (error) {
      console.error('❌ Error checking product availability:', error);
      throw error;
    }
  }

  /**
   * Health check
   * @returns {Promise<{healthy: boolean, message: string}>}
   */
  async healthCheck() {
    try {
      if (!fs.existsSync(this.productsPath)) {
        return {
          healthy: false,
          message: 'Products file not found',
        };
      }

      const products = this.readProductsFile();
      return {
        healthy: true,
        message: `File data source healthy - ${products.length} products available`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`,
      };
    }
  }
}

module.exports = FileProductDataSource;
