/**
 * Product Service Factory (Factory Pattern)
 *
 * Creates and configures ProductService instances with the appropriate
 * data source strategy based on environment configuration.
 *
 * Design Pattern: Factory Method
 * - Encapsulates object creation logic
 * - Makes it easy to switch between data sources
 * - Centralizes configuration
 */

const ProductService = require('./ProductService');
const MongoDBProductDataSource = require('./datasources/MongoDBProductDataSource');
const FileProductDataSource = require('./datasources/FileProductDataSource');
const APIProductDataSource = require('./datasources/APIProductDataSource');

/**
 * Data source types
 */
const DataSourceTypes = {
  MONGODB: 'mongodb',
  FILE: 'file',
  API: 'api',
};

class ProductServiceFactory {
  /**
   * Create a ProductService instance with the specified data source
   * @param {string} sourceType - Type of data source ('mongodb', 'file', 'api')
   * @param {Object} config - Optional configuration for the data source
   * @returns {ProductService}
   */
  static create(sourceType = null, config = {}) {
    // Auto-detect source type from environment if not specified
    if (!sourceType) {
      sourceType = this.detectDataSource();
    }

    console.log(`🏭 Creating ProductService with ${sourceType} data source`);

    let dataSource;

    switch (sourceType.toLowerCase()) {
      case DataSourceTypes.MONGODB:
        dataSource = new MongoDBProductDataSource();
        break;

      case DataSourceTypes.FILE:
        dataSource = new FileProductDataSource();
        break;

      case DataSourceTypes.API:
        dataSource = new APIProductDataSource(config);
        break;

      default:
        throw new Error(
          `Unknown data source type: ${sourceType}. Valid types: ${Object.values(DataSourceTypes).join(', ')}`
        );
    }

    return new ProductService(dataSource);
  }

  /**
   * Auto-detect which data source to use based on environment
   * Priority: MONGO_URI > PRODUCTS_API_URL > FILE (fallback)
   * @returns {string}
   */
  static detectDataSource() {
    const explicitSource = process.env.PRODUCT_DATA_SOURCE;
    if (explicitSource) {
      console.log(`📌 Using explicit data source from env: ${explicitSource}`);
      return explicitSource;
    }

    // Check for MongoDB connection string
    if (process.env.MONGO_URI) {
      console.log('🔍 Detected MONGO_URI - using MongoDB data source');
      return DataSourceTypes.MONGODB;
    }

    // Check for API URL
    if (process.env.PRODUCTS_API_URL) {
      console.log('🔍 Detected PRODUCTS_API_URL - using API data source');
      return DataSourceTypes.API;
    }

    // Fallback to file-based
    console.log('🔍 No data source configured - using file-based fallback');
    return DataSourceTypes.FILE;
  }

  /**
   * Create and initialize a ProductService instance
   * @param {string} sourceType - Type of data source
   * @param {Object} config - Optional configuration
   * @returns {Promise<ProductService>}
   */
  static async createAndInitialize(sourceType = null, config = {}) {
    const service = this.create(sourceType, config);
    await service.initialize();
    return service;
  }

  /**
   * Get available data source types
   * @returns {Object}
   */
  static getAvailableTypes() {
    return DataSourceTypes;
  }
}

module.exports = ProductServiceFactory;
module.exports.DataSourceTypes = DataSourceTypes;
