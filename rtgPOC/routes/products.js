// Products API - Product Feed
const express = require('express');
const router = express.Router();
const ProductServiceFactory = require('../services/ProductServiceFactory');

// Initialize ProductService (will be set on first request or in server.js)
let productService = null;

// Lazy initialization of product service
async function getProductService() {
  if (!productService) {
    console.log('🔄 Initializing ProductService...');
    productService = await ProductServiceFactory.createAndInitialize();
  }
  return productService;
}

// GET /api/products/feed - Get complete catalog
router.get('/feed', async (req, res) => {
  try {
    const service = await getProductService();
    const productFeed = await service.getProductFeed();

    console.log('✅ Product feed requested - Total products:', productFeed.total_products);
    res.json(productFeed);
  } catch (error) {
    console.error('❌ Error getting product feed:', error);
    res.status(500).json({
      error: 'Error retrieving product catalog',
      details: error.message
    });
  }
});

// GET /api/products/search?q=query - Search products (must come before /:id)
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query) {
      return res.status(400).json({
        error: 'Search parameter "q" required'
      });
    }

    const service = await getProductService();
    const searchResults = await service.searchProducts(query);

    console.log(`✅ Search: "${query}" - ${searchResults.count} results`);
    res.json(searchResults);
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Error searching products',
      details: error.message
    });
  }
});

// GET /api/products/:id - Get specific product
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const service = await getProductService();
    const product = await service.getProductById(productId);

    if (!product) {
      console.log('❌ Product not found:', productId);
      return res.status(404).json({
        error: 'Product not found',
        product_id: productId
      });
    }

    console.log('✅ Product found:', product.name);
    res.json(product);
  } catch (error) {
    console.error('❌ Error getting product:', error);
    res.status(500).json({
      error: 'Error retrieving product',
      details: error.message
    });
  }
});

// GET /api/products/category/:category - Get products by category
router.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const service = await getProductService();
    const products = await service.getProductsByCategory(category);

    console.log(`✅ Found ${products.length} products in category: ${category}`);
    res.json({
      category,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('❌ Error getting products by category:', error);
    res.status(500).json({
      error: 'Error retrieving products by category',
      details: error.message
    });
  }
});

// GET /api/products/health - Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const service = await getProductService();
    const health = await service.getHealthStatus();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(503).json({
      service: 'ProductService',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
