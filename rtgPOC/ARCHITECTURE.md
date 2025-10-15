# rtgPOC Architecture Documentation

## Project Overview

**rtgPOC** is a Proof of Concept implementation of OpenAI's **Agentic Commerce Protocol (ACP)**, designed with extensibility and maintainability in mind. The architecture supports multiple data sources and follows SOLID principles and proven design patterns.

## Technology Stack

- **Runtime**: Bun (high-performance JavaScript runtime)
- **Framework**: Express.js 4.18.2
- **Database**: MongoDB 6.20.0 (optional - file-based fallback)
- **Payment**: Stripe 14.10.0
- **Protocol**: Agentic Commerce Protocol (OpenAI)

## Architectural Principles

### SOLID Principles Applied

1. **Single Responsibility Principle**
   - Each class has one reason to change
   - `ProductService` handles business logic
   - `ProductDataSource` handles data access
   - `MongoDBService` handles connections

2. **Open/Closed Principle**
   - System is open for extension (new data sources)
   - Closed for modification (existing code unchanged)

3. **Liskov Substitution Principle**
   - Any `ProductDataSource` can replace another
   - Routes work with any data source implementation

4. **Interface Segregation Principle**
   - Clean, focused interfaces
   - No forced implementation of unused methods

5. **Dependency Inversion Principle**
   - High-level modules depend on abstractions
   - `ProductService` depends on `ProductDataSource` interface, not concrete implementations

## Design Patterns Implemented

### 1. Strategy Pattern
**Location**: `services/datasources/ProductDataSource.js`

Defines interchangeable algorithms for data access:
- MongoDB strategy
- File-based strategy
- API strategy

**Benefits**:
- Runtime selection of data source
- Easy to add new sources
- No code changes in business logic

### 2. Factory Pattern
**Location**: `services/ProductServiceFactory.js`

Encapsulates service creation logic:
```javascript
const service = ProductServiceFactory.createAndInitialize();
// Auto-detects: MongoDB > API > File
```

**Benefits**:
- Centralized configuration
- Environment-based selection
- Simplified instantiation

### 3. Singleton Pattern
**Location**: `services/database/mongodb.js`

Ensures single database connection:
```javascript
const mongoDBService = new MongoDBService(); // Same instance everywhere
```

**Benefits**:
- Connection pooling
- Resource efficiency
- Consistent state

### 4. Facade Pattern
**Location**: `services/ProductService.js`

Simplifies complex operations:
```javascript
const feed = await productService.getProductFeed();
// Handles: data fetch, formatting, validation, metadata
```

**Benefits**:
- Simple API for routes
- Hides complexity
- Business logic centralization

### 5. Dependency Injection
**Throughout the system**

Services receive dependencies:
```javascript
class ProductService {
  constructor(dataSource) { // Injected, not created
    this.dataSource = dataSource;
  }
}
```

**Benefits**:
- Testability (easy mocking)
- Flexibility
- Loose coupling

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Client Layer                          │
│              (Web UI / AI Agents / APIs)                  │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Express Routes Layer                     │
│   ┌──────────────┬─────────────────┬─────────────────┐   │
│   │  products.js │  checkout.js    │  webhooks.js    │   │
│   └──────────────┴─────────────────┴─────────────────┘   │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Service Layer (Facade)                       │
│                                                           │
│   ┌──────────────────────────────────────────────────┐   │
│   │         ProductServiceFactory                     │   │
│   │         (Factory Pattern)                         │   │
│   └────────────────────┬─────────────────────────────┘   │
│                        │                                  │
│   ┌────────────────────▼─────────────────────────────┐   │
│   │         ProductService (Facade)                   │   │
│   │   • getProductFeed()                             │   │
│   │   • searchProducts()                             │   │
│   │   • validateProductForPurchase()                 │   │
│   │   • calculatePriceBreakdown()                    │   │
│   └──────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│           Data Source Layer (Strategy)                    │
│                                                           │
│   ┌──────────────────────────────────────────────────┐   │
│   │      ProductDataSource (Abstract Base)           │   │
│   │          (Strategy Interface)                     │   │
│   └───┬──────────────┬──────────────┬────────────────┘   │
│       │              │              │                     │
│       ▼              ▼              ▼                     │
│   ┌────────┐   ┌────────┐   ┌────────────┐              │
│   │MongoDB │   │  File  │   │    API     │              │
│   │DataSrc │   │DataSrc │   │  DataSrc   │              │
│   └───┬────┘   └────────┘   └────────────┘              │
│       │                                                   │
│       ▼                                                   │
│   ┌────────────────────────┐                             │
│   │  MongoDBService        │                             │
│   │  (Singleton)           │                             │
│   └────────────────────────┘                             │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  Data Storage Layer                       │
│   ┌──────────┬──────────────┬──────────────────────┐     │
│   │ MongoDB  │ JSON Files   │   External APIs      │     │
│   └──────────┴──────────────┴──────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

## Data Flow Example

### Request: Get Product Feed

```
1. Client → GET /api/products/feed

2. Route Handler (products.js:19)
   ↓
   const service = await getProductService()

3. Factory (ProductServiceFactory.js)
   ↓
   • Detects MONGO_URI exists
   • Creates MongoDBProductDataSource
   • Wraps in ProductService
   • Returns initialized service

4. ProductService.getProductFeed()
   ↓
   • Calls dataSource.getAllProducts()
   • Adds ACP metadata
   • Returns formatted response

5. Data Source (MongoDBProductDataSource)
   ↓
   • Gets MongoDB collection
   • Executes find({})
   • Projects fields (excludes _id)
   • Returns products array

6. MongoDB (rtg-products.products)
   ↓
   • Query execution
   • Returns documents

7. Response flows back up
   ↓
   Client ← JSON Response with ACP format
```

## Directory Structure

```
rtgPOC/
├── server.js                          # Express app entry point
├── package.json                       # Dependencies & scripts
├── .env.example                       # Environment template
├── ARCHITECTURE.md                    # This file
│
├── routes/                            # API endpoints
│   ├── products.js                    # Product Feed API (refactored)
│   ├── checkout.js                    # Checkout & payment flow
│   └── webhooks.js                    # Order status webhooks
│
├── services/                          # Business logic layer
│   ├── README.md                      # Service architecture docs
│   ├── ProductService.js              # Main product service (Facade)
│   ├── ProductServiceFactory.js       # Service factory
│   │
│   ├── database/                      # Database connections
│   │   └── mongodb.js                 # MongoDB singleton
│   │
│   └── datasources/                   # Data access strategies
│       ├── ProductDataSource.js       # Abstract base class
│       ├── MongoDBProductDataSource.js    # MongoDB impl
│       ├── FileProductDataSource.js       # File impl
│       └── APIProductDataSource.js        # API impl (future)
│
├── data/                              # File-based storage
│   ├── products.json                  # Test products
│   └── orders.json                    # Orders & checkouts
│
└── public/                            # Static files
    └── test.html                      # Web test interface
```

## Configuration & Data Source Selection

### Automatic Detection

The system automatically selects the best data source:

```javascript
// Priority order:
1. PRODUCT_DATA_SOURCE env var (explicit override)
2. MONGO_URI present → MongoDB
3. PRODUCTS_API_URL present → API
4. Fallback → File
```

### Configuration Files

**For MongoDB**:
```bash
# .env
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=rtg-products
PRODUCTS_COLLECTION=products
```

**For API**:
```bash
# .env
PRODUCTS_API_URL=https://api.example.com
PRODUCTS_API_KEY=your_key
```

**For File** (default):
No configuration needed - uses `data/products.json`

## Key Components

### ProductService (Facade)

**Purpose**: Main business logic layer

**Responsibilities**:
- Product retrieval and search
- Validation for purchases
- Price calculations
- ACP format conversion
- Health monitoring

**Methods**:
```javascript
await service.getProductFeed()           // Get all with metadata
await service.getProductById(id)         // Single product
await service.searchProducts(query)      // Search
await service.validateProductForPurchase(id, qty)  // Validate
service.calculatePriceBreakdown(product, qty)      // Calculate
await service.getHealthStatus()          // Health check
```

### ProductDataSource (Strategy)

**Purpose**: Abstract interface for data access

**Required Methods**:
```javascript
async getAllProducts()
async getProductById(productId)
async searchProducts(query)
async productExists(productId)
async getProductsByCategory(category)
async checkAvailability(productId, quantity)
async connect()
async disconnect()
async healthCheck()
```

### MongoDBService (Singleton)

**Purpose**: Shared database connection

**Features**:
- Connection pooling (10 max, 2 min)
- Auto-reconnection
- Health checks
- Graceful shutdown on SIGINT

## API Endpoints

### Products API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/feed` | Complete catalog (ACP format) |
| GET | `/api/products/search?q=query` | Search products |
| GET | `/api/products/:id` | Get product by ID |
| GET | `/api/products/category/:category` | Filter by category |
| GET | `/api/products/health` | Health check |

### Response Formats

**Product Feed** (ACP compliant):
```json
{
  "version": "1.0",
  "last_updated": "2025-10-15T12:00:00Z",
  "merchant_id": "merchant_rtg",
  "total_products": 150,
  "products": [...]
}
```

**Search Results**:
```json
{
  "query": "keyboard",
  "count": 5,
  "results": [...]
}
```

**Health Check**:
```json
{
  "service": "ProductService",
  "status": "healthy",
  "dataSource": {
    "healthy": true,
    "message": "MongoDB connected - 150 products available"
  },
  "timestamp": "2025-10-15T12:00:00Z"
}
```

## Testing Strategy

### 1. Test with File Data Source (Default)
```bash
bun run dev
# Uses data/products.json
```

### 2. Test with MongoDB
```bash
export MONGO_URI=mongodb://localhost:27017
bun run dev
# Connects to rtg-products database
```

### 3. Test with API (Future)
```bash
export PRODUCTS_API_URL=https://api.example.com
export PRODUCTS_API_KEY=your_key
bun run dev
```

### 4. Switch at Runtime
```bash
export PRODUCT_DATA_SOURCE=file
# Forces file-based even if MONGO_URI is set
```

## Extending the System

### Adding a New Data Source

1. **Create new data source class**:
```javascript
// services/datasources/GraphQLProductDataSource.js
const ProductDataSource = require('./ProductDataSource');

class GraphQLProductDataSource extends ProductDataSource {
  async getAllProducts() {
    // Implement GraphQL query
  }
  // ... implement all required methods
}

module.exports = GraphQLProductDataSource;
```

2. **Update factory**:
```javascript
// services/ProductServiceFactory.js
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

3. **Use it**:
```bash
export PRODUCT_DATA_SOURCE=graphql
export GRAPHQL_ENDPOINT=https://api.example.com/graphql
```

## Benefits of This Architecture

1. **Flexibility**: Switch data sources without code changes
2. **Testability**: Easy to mock dependencies
3. **Maintainability**: Clear separation of concerns
4. **Extensibility**: Add new features without breaking existing code
5. **Scalability**: MongoDB for production, file for dev
6. **Future-Proof**: Ready for external APIs, microservices
7. **SOLID Compliance**: Clean, professional codebase
8. **ACP Compliant**: Follows OpenAI's specification

## Migration Paths

### Current State → MongoDB
```bash
# 1. Import data to MongoDB
mongoimport --db rtg-products --collection products \
  --file data/products.json --jsonArray

# 2. Set env var
export MONGO_URI=mongodb://localhost:27017

# 3. Restart server (auto-detects MongoDB)
bun run dev
```

### MongoDB → External API
```bash
# 1. Set API URL
export PRODUCTS_API_URL=https://api.rtg.com

# 2. Remove MongoDB URI
unset MONGO_URI

# 3. Restart server (auto-detects API)
bun run dev
```

## Performance Considerations

- MongoDB: Connection pooling (10 connections)
- File: In-memory reads (fast for small datasets)
- API: Timeout protection (10s default)
- All: Lazy initialization (on first request)

## Error Handling

- Graceful degradation on data source failure
- Health checks for monitoring
- Detailed error messages in responses
- Connection retry logic in MongoDB singleton

## Security Considerations

- Environment-based configuration (no hardcoded secrets)
- API authentication support (Bearer tokens)
- MongoDB connection string in env vars
- Input validation in ProductService

## Next Steps

1. ✅ Implement checkout service with similar pattern
2. ✅ Add caching layer (Redis strategy)
3. ✅ Implement API data source for RTG Product API
4. ✅ Add integration tests
5. ✅ Add monitoring/observability

## References

- [OpenAI Agentic Commerce Protocol](https://openai.com)
- [Design Patterns Catalog](services/README.md)
- [MongoDB Documentation](https://docs.mongodb.com)
- [Express.js Best Practices](https://expressjs.com)
