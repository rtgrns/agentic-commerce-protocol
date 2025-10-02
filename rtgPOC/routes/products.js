// Products API - Product Feed
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Helper function to read products
function readProducts() {
  const productsPath = path.join(__dirname, '../data/products.json');
  const data = fs.readFileSync(productsPath, 'utf8');
  return JSON.parse(data);
}

// Helper function to get a specific product
function getProduct(productId) {
  const { products } = readProducts();
  return products.find(p => p.id === productId);
}

// GET /api/products/feed - Get complete catalog
router.get('/feed', (req, res) => {
  try {
    const data = readProducts();

    const response = {
      version: '1.0',
      last_updated: new Date().toISOString(),
      merchant_id: process.env.MERCHANT_ID,
      products: data.products
    };

    console.log('✅ Product feed requested - Total products:', data.products.length);
    res.json(response);
  } catch (error) {
    console.error('❌ Error getting product feed:', error);
    res.status(500).json({
      error: 'Error retrieving product catalog'
    });
  }
});

// GET /api/products/:id - Get specific product
router.get('/:id', (req, res) => {
  try {
    const productId = req.params.id;
    const product = getProduct(productId);

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
      error: 'Error retrieving product'
    });
  }
});

// GET /api/products/search?q=query - Search products
router.get('/search', (req, res) => {
  try {
    const query = req.query.q?.toLowerCase() || '';

    if (!query) {
      return res.status(400).json({
        error: 'Search parameter "q" required'
      });
    }

    const { products } = readProducts();

    // Search in name and description (case insensitive)
    const results = products.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      product.brand.toLowerCase().includes(query)
    );

    console.log(`✅ Search: "${query}" - ${results.length} results`);

    res.json({
      query,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Error searching products'
    });
  }
});

module.exports = router;
