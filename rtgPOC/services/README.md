# Product Service Architecture

## Overview

This service layer implements a flexible, extensible architecture for product data access using multiple design patterns. It allows seamless switching between different data sources (MongoDB, File, API) without changing business logic.

## Design Patterns Used

### 1. **Strategy Pattern** (`ProductDataSource`)
- Defines a family of interchangeable algorithms for data access
- Each data source (MongoDB, File, API) is a concrete strategy
- Allows runtime selection of data source

### 2. **Dependency Injection** (`ProductService`)
- Service accepts any `ProductDataSource` implementation
- Decouples business logic from data access
- Makes testing and switching data sources easy

### 3. **Factory Pattern** (`ProductServiceFactory`)
- Encapsulates object creation logic
- Auto-detects best data source from environment
- Simplifies service instantiation

### 4. **Singleton Pattern** (`MongoDBService`)
- Ensures single database connection pool
- Manages connection lifecycle
- Provides shared access to database

### 5. **Facade Pattern** (`ProductService`)
- Simplifies complex data operations
- Provides clean API for routes
- Handles business logic and validation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     API Routes Layer                         │
│                  (routes/products.js)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ProductServiceFactory (Factory)                 │
│            Auto-detects & creates service                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                ProductService (Facade)                       │
│           Business Logic & Validation Layer                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────┴──────────┐
              │ ProductDataSource   │ (Strategy - Abstract)
              │    (Interface)      │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   MongoDB    │  │     File     │  │     API      │
│ DataSource   │  │ DataSource   │  │ DataSource   │
└──────┬───────┘  └──────────────┘  └──────────────┘
       │
       ▼
┌──────────────┐
│ MongoDBService│ (Singleton)
│ Connection   │
└──────────────┘
```

## Data Sources

### 1. MongoDB Data Source
**File**: `datasources/MongoDBProductDataSource.js`

- Connects to MongoDB using the singleton connection service
- Queries the `products` collection (configurable via `PRODUCTS_COLLECTION` env var)
- Supports full-text search with regex
- Optimized queries with projections

**Environment Variables**:
```bash
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=rtg-products
PRODUCTS_COLLECTION=products
```

### 2. File Data Source
**File**: `datasources/FileProductDataSource.js`

- Reads from `data/products.json`
- Original implementation (backward compatible)
- No external dependencies
- Good for development/testing

**No configuration needed** - uses local file

### 3. API Data Source
**File**: `datasources/APIProductDataSource.js`

- Future-ready for external REST APIs
- Supports authentication (Bearer token)
- Configurable timeout and headers
- Circuit breaker ready

**Environment Variables**:
```bash
PRODUCTS_API_URL=https://api.example.com
PRODUCTS_API_KEY=your_api_key
```

## Usage

### Automatic Data Source Selection

The factory automatically selects the best data source:

```javascript
const ProductServiceFactory = require('./services/ProductServiceFactory');

// Auto-detect from environment
const service = await ProductServiceFactory.createAndInitialize();
```

**Priority**:
1. `PRODUCT_DATA_SOURCE` env var (explicit)
2. `MONGO_URI` present → MongoDB
3. `PRODUCTS_API_URL` present → API
4. Fallback → File

### Manual Data Source Selection

```javascript
const { DataSourceTypes } = require('./services/ProductServiceFactory');

// Use MongoDB explicitly
const service = await ProductServiceFactory.createAndInitialize(
  DataSourceTypes.MONGODB
);

// Use API with custom config
const service = await ProductServiceFactory.createAndInitialize(
  DataSourceTypes.API,
  {
    baseURL: 'https://api.example.com',
    apiKey: 'your_key',
    timeout: 5000
  }
);
```

### In Routes

```javascript
const ProductServiceFactory = require('../services/ProductServiceFactory');

let productService = null;

async function getProductService() {
  if (!productService) {
    productService = await ProductServiceFactory.createAndInitialize();
  }
  return productService;
}

router.get('/feed', async (req, res) => {
  const service = await getProductService();
  const feed = await service.getProductFeed();
  res.json(feed);
});
```

## ProductService API

### Methods

#### `async getProductFeed()`
Returns complete product catalog with ACP metadata.

#### `async getAllProducts()`
Returns raw array of all products.

#### `async getProductById(productId)`
Returns single product or `null`.

#### `async searchProducts(query)`
Searches products by name, description, category, brand.

#### `async getProductsByCategory(category)`
Filters products by category.

#### `async validateProductForPurchase(productId, quantity)`
Validates product availability and stock for checkout.

#### `calculatePriceBreakdown(product, quantity)`
Calculates subtotal, tax, shipping, total.

#### `async getHealthStatus()`
Returns health status of service and data source.

## Environment Variables

### Required for MongoDB
```bash
MONGO_URI=mongodb://localhost:27017          # MongoDB connection string
MONGO_DB_NAME=rtg-products                   # Database name (default: rtg-products)
PRODUCTS_COLLECTION=products                 # Collection name (default: products)
```

### Required for API
```bash
PRODUCTS_API_URL=https://api.example.com     # API base URL
PRODUCTS_API_KEY=your_api_key                # Optional API key
```

### Optional
```bash
PRODUCT_DATA_SOURCE=mongodb                  # Explicit: mongodb|file|api
MERCHANT_ID=merchant_rtg                     # Merchant identifier
TAX_RATE=0.08                               # Tax rate (default: 8%)
SHIPPING_COST=5.99                          # Flat shipping cost
```

## MongoDB Product Schema

Products in MongoDB should have this structure:

```javascript
{
  "id": "prod_001",                    // Required: unique product ID
  "name": "Product Name",              // Required
  "description": "Description text",    // Required
  "price": 79.99,                      // Required: number
  "currency": "USD",                   // Required
  "availability": "in_stock",          // Required: "in_stock" | "out_of_stock"
  "stock_quantity": 50,                // Required: number
  "images": ["url"],                   // Required: array of image URLs
  "category": "Electronics",           // Required
  "brand": "BrandName",                // Required

  // Optional fields
  "sku": "SKU-001",
  "weight": 0.5,
  "dimensions": { "length": 10, "width": 5, "height": 2 },
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-15T00:00:00Z"
}
```

**Note**: The `_id` field is automatically excluded from responses.

## Adding a New Data Source

1. Create a new class extending `ProductDataSource`
2. Implement all required methods
3. Add to `ProductServiceFactory`
4. Add new type to `DataSourceTypes`

Example:

```javascript
// datasources/GraphQLProductDataSource.js
const ProductDataSource = require('./ProductDataSource');

class GraphQLProductDataSource extends ProductDataSource {
  async getAllProducts() {
    const query = `{ products { id name price } }`;
    const response = await this.graphqlClient.query(query);
    return response.data.products;
  }

  // ... implement other methods
}

module.exports = GraphQLProductDataSource;
```

Then update factory:

```javascript
// ProductServiceFactory.js
const GraphQLProductDataSource = require('./datasources/GraphQLProductDataSource');

const DataSourceTypes = {
  MONGODB: 'mongodb',
  FILE: 'file',
  API: 'api',
  GRAPHQL: 'graphql'  // Add new type
};

// In create() method:
case DataSourceTypes.GRAPHQL:
  dataSource = new GraphQLProductDataSource(config);
  break;
```

## Testing

### Test with File Data Source
```bash
# Default - uses file
bun run dev
```

### Test with MongoDB
```bash
export MONGO_URI=mongodb://localhost:27017
export MONGO_DB_NAME=rtg-products
bun run dev
```

### Test with API
```bash
export PRODUCTS_API_URL=https://productss3.rtg-dev.com
bun run dev
```

## Benefits

1. **Flexibility**: Switch data sources without code changes
2. **Testability**: Easy to mock data sources
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Add new data sources easily
5. **SOLID Principles**:
   - Single Responsibility
   - Open/Closed (open for extension)
   - Liskov Substitution (any data source works)
   - Interface Segregation
   - Dependency Inversion (depend on abstractions)

## File Structure

```
services/
├── README.md                           # This file
├── ProductService.js                   # Main service (Facade)
├── ProductServiceFactory.js            # Factory for creating services
├── database/
│   └── mongodb.js                      # MongoDB singleton connection
└── datasources/
    ├── ProductDataSource.js            # Abstract base class (Strategy)
    ├── MongoDBProductDataSource.js     # MongoDB implementation
    ├── FileProductDataSource.js        # File-based implementation
    └── APIProductDataSource.js         # REST API implementation
```

## Migration Guide

### From File to MongoDB

1. Ensure MongoDB is running and accessible
2. Import your products to MongoDB:
   ```bash
   mongoimport --db rtg-products --collection products --file data/products.json --jsonArray
   ```
3. Set environment variables:
   ```bash
   export MONGO_URI=mongodb://localhost:27017
   ```
4. Restart the server - it will auto-detect MongoDB

### From MongoDB to API

1. Set API URL:
   ```bash
   export PRODUCTS_API_URL=https://your-api.com
   export PRODUCTS_API_KEY=your_key
   ```
2. Remove or comment out `MONGO_URI`
3. Restart the server

## Health Check

Monitor data source health:

```bash
curl http://localhost:3000/api/products/health
```

Response:
```json
{
  "service": "ProductService",
  "status": "healthy",
  "dataSource": {
    "healthy": true,
    "message": "MongoDB connected - 150 products available"
  },
  "timestamp": "2025-10-15T12:00:00.000Z"
}
```
