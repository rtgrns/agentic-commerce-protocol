/**
 * MongoDB Connection Service (Singleton Pattern)
 *
 * Provides a single, shared connection to MongoDB across the application.
 * Implements lazy initialization and connection pooling.
 *
 * Design Pattern: Singleton
 */

const { MongoClient } = require('mongodb');

class MongoDBService {
  constructor() {
    if (MongoDBService.instance) {
      return MongoDBService.instance;
    }

    this.client = null;
    this.db = null;
    this.connected = false;
    MongoDBService.instance = this;
  }

  /**
   * Connect to MongoDB
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      console.log('ℹ️  Already connected to MongoDB');
      return;
    }

    try {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGO_DB_NAME || 'rtg-products';

      console.log(`🔌 Connecting to MongoDB at ${uri}...`);

      this.client = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      this.connected = true;

      console.log(`✅ Connected to MongoDB database: ${dbName}`);

      // Handle process termination
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });
    } catch (error) {
      console.error('❌ MongoDB connection error:', error.message);
      throw error;
    }
  }

  /**
   * Get database instance
   * @returns {Db} MongoDB database instance
   */
  getDB() {
    if (!this.connected || !this.db) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get a collection
   * @param {string} collectionName - Name of the collection
   * @returns {Collection} MongoDB collection
   */
  getCollection(collectionName) {
    return this.getDB().collection(collectionName);
  }

  /**
   * Close MongoDB connection
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      this.db = null;
      this.client = null;
      console.log('🔌 MongoDB connection closed');
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error.message);
      throw error;
    }
  }

  /**
   * Check connection health
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.db('admin').command({ ping: 1 });
      return true;
    } catch (error) {
      console.error('❌ MongoDB health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get MongoDB stats
   * @returns {Promise<Object>}
   */
  async getStats() {
    const db = this.getDB();
    return await db.stats();
  }
}

// Export singleton instance
const mongoDBService = new MongoDBService();
module.exports = mongoDBService;
