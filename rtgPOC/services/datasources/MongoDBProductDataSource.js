/**
 * MongoDB Product Data Source Implementation
 *
 * Concrete implementation of ProductDataSource using MongoDB as the backend.
 * Connects to rtg-products database and queries the products collection.
 *
 * Design Patterns:
 * - Strategy: Concrete strategy for MongoDB data access
 * - Singleton: Uses shared MongoDB connection
 */

const ProductDataSource = require("./ProductDataSource");
const mongoDBService = require("../database/mongodb");

class MongoDBProductDataSource extends ProductDataSource {
  constructor() {
    super();
    this.collectionName = process.env.PRODUCTS_COLLECTION || "products";

    // Configure regions and excluded product classes from environment
    this.regions = process.env.PRODUCT_REGIONS?.split(",") || [
      "FL",
      "SE",
      "TX",
    ];
    this.excludedClasses = process.env.EXCLUDED_PRODUCT_CLASSES?.split(",") || [
      "SECTIONAL",
      "NESTEDTABLE",
      "END TABLE",
      "COCKTAIL TABLE",
      "CHAIRSIDE TABLE",
      "COCKTAIL OTTOMAN",
    ];
  }

  /**
   * Create living room package match filter
   * Filters packages based on catalog, category, region availability,
   * and excludes specific product classes and sectionals
   *
   * @returns {Object} MongoDB query filter
   */
  createLivingRoomPackageMatch() {
    const excludedClassesRegex = new RegExp(
      `.*(?:${this.excludedClasses.join("|")}).*`,
      "i"
    );

    return {
      catalog: "adult",
      type: "room",
      category: "livingroom",
      _collection: "marquee",
      single_item_room: false,
      $or: this.regions.map((region) => ({
        [`catalog_availability.${region}`]: true,
      })),
      $nor: [
        // Filter out products with excluded product classes for each region
        ...this.regions.map((region) => ({
          [`items_in_room.${region}`]: {
            $elemMatch: {
              product_class: excludedClassesRegex,
            },
          },
        })),
        // Filter out products with sectional styles
        {
          style: { $elemMatch: { $regex: /.*sectional.*/i } },
        },
      ],
    };
  }

  /**
   * Get collection instance
   * @returns {Collection}
   */
  getCollection() {
    return mongoDBService.getCollection(this.collectionName);
  }

  /**
   * Initialize connection
   */
  async connect() {
    await mongoDBService.connect();
  }

  /**
   * Close connection
   */
  async disconnect() {
    await mongoDBService.disconnect();
  }

  /**
   * Get all packages (with living room filter applied)
   * Uses createLivingRoomPackageMatch() to filter packages
   * @returns {Promise<Array>}
   */
  async getAllProducts() {
    try {
      const collection = this.getCollection();
      const matchFilter = this.createLivingRoomPackageMatch();

      const packages = await collection
        .find(matchFilter)
        .project({ _id: 0 }) // Exclude MongoDB _id field
        .toArray();

      console.log(
        `📦 Retrieved ${packages.length} living room packages from MongoDB`
      );
      console.log(
        `🔍 Filters applied: regions=[${this.regions.join(", ")}], excluded classes=[${this.excludedClasses.length}]`
      );
      return packages;
    } catch (error) {
      console.error("❌ Error fetching packages from MongoDB:", error);
      throw new Error(`Failed to fetch packages: ${error.message}`);
    }
  }

  /**
   * Get all packages without any filters (raw collection data)
   * Useful for admin/debugging purposes
   * @returns {Promise<Array>}
   */
  async getAllProductsUnfiltered() {
    try {
      const collection = this.getCollection();
      const packages = await collection.find({}).project({ _id: 0 }).toArray();

      console.log(
        `📦 Retrieved ${packages.length} total packages (unfiltered) from MongoDB`
      );
      return packages;
    } catch (error) {
      console.error(
        "❌ Error fetching unfiltered packages from MongoDB:",
        error
      );
      throw new Error(`Failed to fetch packages: ${error.message}`);
    }
  }

  /**
   * Get product by ID
   * @param {string} productId
   * @returns {Promise<Object|null>}
   */
  async getProductById(productId) {
    try {
      const collection = this.getCollection();
      const product = await collection.findOne(
        { id: productId },
        { projection: { _id: 0 } }
      );

      if (product) {
        console.log(`✅ Found product: ${product.name}`);
      } else {
        console.log(`❌ Product not found: ${productId}`);
      }

      return product;
    } catch (error) {
      console.error("❌ Error fetching product by ID:", error);
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
      const collection = this.getCollection();
      const searchRegex = new RegExp(query, "i"); // Case-insensitive search

      const products = await collection
        .find({
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { category: searchRegex },
            { brand: searchRegex },
          ],
        })
        .project({ _id: 0 })
        .toArray();

      console.log(`🔍 Search "${query}" found ${products.length} results`);
      return products;
    } catch (error) {
      console.error("❌ Error searching products:", error);
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
      const collection = this.getCollection();
      const count = await collection.countDocuments({ id: productId });
      return count > 0;
    } catch (error) {
      console.error("❌ Error checking product existence:", error);
      throw new Error(`Failed to check product existence: ${error.message}`);
    }
  }

  /**
   * Get products by category
   * @param {string} category
   * @returns {Promise<Array>}
   */
  async getProductsByCategory(category) {
    try {
      const collection = this.getCollection();
      const products = await collection
        .find({ category: new RegExp(category, "i") })
        .project({ _id: 0 })
        .toArray();

      console.log(
        `📂 Found ${products.length} products in category: ${category}`
      );
      return products;
    } catch (error) {
      console.error("❌ Error fetching products by category:", error);
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
        product.availability === "in_stock" &&
        product.stock_quantity >= quantity;

      return {
        available: isAvailable,
        stock: product.stock_quantity || 0,
      };
    } catch (error) {
      console.error("❌ Error checking product availability:", error);
      throw new Error(`Failed to check availability: ${error.message}`);
    }
  }

  /**
   * Health check
   * @returns {Promise<{healthy: boolean, message: string}>}
   */
  async healthCheck() {
    try {
      const isHealthy = await mongoDBService.isHealthy();

      if (isHealthy) {
        // Try to count documents as additional health check
        const collection = this.getCollection();
        const count = await collection.countDocuments();

        return {
          healthy: true,
          message: `MongoDB connected - ${count} products available`,
        };
      }

      return {
        healthy: false,
        message: "MongoDB connection unhealthy",
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error.message}`,
      };
    }
  }

  /**
   * Get products with filters (advanced query)
   * @param {Object} filters - Query filters
   * @param {Object} options - Query options (sort, limit, skip)
   * @returns {Promise<Array>}
   */
  async getProductsWithFilters(filters = {}, options = {}) {
    try {
      const collection = this.getCollection();
      const { sort = { created_at: -1 }, limit = 100, skip = 0 } = options;

      const products = await collection
        .find(filters)
        .project({ _id: 0 })
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .toArray();

      return products;
    } catch (error) {
      console.error("❌ Error fetching products with filters:", error);
      throw new Error(
        `Failed to fetch products with filters: ${error.message}`
      );
    }
  }
}

module.exports = MongoDBProductDataSource;
