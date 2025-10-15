# Product Filtering Documentation

## Overview

The MongoDB data source now includes **automatic product filtering** for living room products. This filtering is applied to all product queries by default to ensure only relevant products are returned through the Agentic Commerce Protocol.

## Filter Criteria

### Living Room Product Match

The `getAllProducts()` method applies the following filters:

1. **Catalog Type**: `adult`
2. **Product Type**: `room`
3. **Category**: `livingroom`
4. **Single Item Rooms**: Excluded (`single_item_room: false`)

### Region Availability

Products must be available in at least one of the configured regions:
- Default: `FL`, `SE`, `TX`
- Configurable via `PRODUCT_REGIONS` environment variable

**MongoDB Query**:
```javascript
$or: [
  { 'catalog_availability.FL': true },
  { 'catalog_availability.SE': true },
  { 'catalog_availability.TX': true }
]
```

### Excluded Product Classes

The following product classes are filtered out for each region:
- `SECTIONAL`
- `NESTEDTABLE`
- `END TABLE`
- `COCKTAIL TABLE`
- `CHAIRSIDE TABLE`
- `COCKTAIL OTTOMAN`

Configurable via `EXCLUDED_PRODUCT_CLASSES` environment variable.

**MongoDB Query**:
```javascript
$nor: [
  { 'items_in_room.FL': { $elemMatch: { product_class: /SECTIONAL|NESTEDTABLE|.../i } } },
  { 'items_in_room.SE': { $elemMatch: { product_class: /SECTIONAL|NESTEDTABLE|.../i } } },
  { 'items_in_room.TX': { $elemMatch: { product_class: /SECTIONAL|NESTEDTABLE|.../i } } }
]
```

### Excluded Styles

Products with "sectional" in their style array are also excluded:

**MongoDB Query**:
```javascript
$nor: [
  { style: { $elemMatch: { $regex: /.*sectional.*/i } } }
]
```

## Complete MongoDB Query

The complete filter applied by `createLivingRoomProductMatch()`:

```javascript
{
  catalog: 'adult',
  type: 'room',
  category: 'livingroom',
  single_item_room: false,
  $or: [
    { 'catalog_availability.FL': true },
    { 'catalog_availability.SE': true },
    { 'catalog_availability.TX': true }
  ],
  $nor: [
    // Exclude products with banned classes in FL
    { 'items_in_room.FL': {
        $elemMatch: {
          product_class: /.*(?:SECTIONAL|NESTEDTABLE|END TABLE|...)/i
        }
      }
    },
    // Exclude products with banned classes in SE
    { 'items_in_room.SE': {
        $elemMatch: {
          product_class: /.*(?:SECTIONAL|NESTEDTABLE|END TABLE|...)/i
        }
      }
    },
    // Exclude products with banned classes in TX
    { 'items_in_room.TX': {
        $elemMatch: {
          product_class: /.*(?:SECTIONAL|NESTEDTABLE|END TABLE|...)/i
        }
      }
    },
    // Exclude sectional styles
    { style: { $elemMatch: { $regex: /.*sectional.*/i } } }
  ]
}
```

## Configuration

### Environment Variables

**`.env` file**:
```bash
# Configure which regions to include
PRODUCT_REGIONS=FL,SE,TX

# Configure which product classes to exclude (comma-separated)
EXCLUDED_PRODUCT_CLASSES=SECTIONAL,NESTEDTABLE,END TABLE,COCKTAIL TABLE,CHAIRSIDE TABLE,COCKTAIL OTTOMAN
```

### Default Values

If environment variables are not set:
- **Regions**: `['FL', 'SE', 'TX']`
- **Excluded Classes**: 6 default classes (sectionals, tables, ottomans)

### Customization Examples

**Include only Florida products**:
```bash
PRODUCT_REGIONS=FL
```

**Add more regions**:
```bash
PRODUCT_REGIONS=FL,SE,TX,CA,NY
```

**Exclude additional product classes**:
```bash
EXCLUDED_PRODUCT_CLASSES=SECTIONAL,NESTEDTABLE,END TABLE,SOFA,LOVESEAT
```

**No exclusions** (empty string):
```bash
EXCLUDED_PRODUCT_CLASSES=
```

## API Behavior

### GET /api/products/feed

Returns only filtered living room products:

```bash
curl http://localhost:3000/api/products/feed
```

**Response**:
```json
{
  "version": "1.0",
  "last_updated": "2025-10-15T12:00:00Z",
  "merchant_id": "merchant_rtg",
  "total_products": 45,  // Only living room products matching criteria
  "products": [...]
}
```

**Console Output**:
```
📦 Retrieved 45 living room products from MongoDB
🔍 Filters applied: regions=[FL, SE, TX], excluded classes=[6]
```

### GET /api/products/search?q=query

Search also applies the living room filter:

```bash
curl "http://localhost:3000/api/products/search?q=sofa"
```

Only returns sofas that match the living room criteria.

### GET /api/products/:id

Single product lookup **does not apply the filter** - returns the product if it exists, regardless of criteria.

## Unfiltered Access

For administrative or debugging purposes, the data source includes an unfiltered method:

### Code Usage

```javascript
const dataSource = new MongoDBProductDataSource();
await dataSource.connect();

// Filtered (default behavior)
const filteredProducts = await dataSource.getAllProducts();
console.log(`Filtered: ${filteredProducts.length} products`);

// Unfiltered (all products in collection)
const allProducts = await dataSource.getAllProductsUnfiltered();
console.log(`Unfiltered: ${allProducts.length} products`);
```

## Expected Product Schema

For the filter to work correctly, products in MongoDB should have this structure:

```javascript
{
  "_id": ObjectId("..."),
  "catalog": "adult",
  "type": "room",
  "category": "livingroom",
  "single_item_room": false,

  // Region availability
  "catalog_availability": {
    "FL": true,
    "SE": true,
    "TX": false
  },

  // Items in room per region
  "items_in_room": {
    "FL": [
      {
        "product_class": "SOFA",
        "sku": "12345",
        // ... other fields
      },
      {
        "product_class": "ACCENT CHAIR",
        "sku": "67890",
        // ... other fields
      }
    ],
    "SE": [...],
    "TX": [...]
  },

  // Style array
  "style": ["modern", "transitional"],

  // Other ACP-required fields
  "id": "prod_001",
  "name": "Modern Living Room Set",
  "price": 1299.99,
  "currency": "USD",
  // ...
}
```

## Performance Considerations

### Indexes

For optimal query performance, create these MongoDB indexes:

```javascript
// In MongoDB shell or via application
db.products.createIndex({ "catalog": 1, "type": 1, "category": 1 });
db.products.createIndex({ "catalog_availability.FL": 1 });
db.products.createIndex({ "catalog_availability.SE": 1 });
db.products.createIndex({ "catalog_availability.TX": 1 });
db.products.createIndex({ "items_in_room.FL.product_class": 1 });
db.products.createIndex({ "items_in_room.SE.product_class": 1 });
db.products.createIndex({ "items_in_room.TX.product_class": 1 });
db.products.createIndex({ "style": 1 });
```

**Create all indexes at once**:
```bash
mongosh rtg-products --eval '
db.products.createIndex({ "catalog": 1, "type": 1, "category": 1 });
db.products.createIndex({ "catalog_availability.FL": 1 });
db.products.createIndex({ "catalog_availability.SE": 1 });
db.products.createIndex({ "catalog_availability.TX": 1 });
db.products.createIndex({ "items_in_room.FL.product_class": 1 });
db.products.createIndex({ "items_in_room.SE.product_class": 1 });
db.products.createIndex({ "items_in_room.TX.product_class": 1 });
db.products.createIndex({ "style": 1 });
'
```

### Query Optimization

The filter uses:
- **Compound index** for catalog/type/category lookup
- **Individual indexes** for region availability
- **Regex matching** for product class exclusion (may be slower on large datasets)

Expected query performance:
- **Small datasets** (<1000 products): < 10ms
- **Medium datasets** (1000-10000 products): < 50ms
- **Large datasets** (>10000 products): < 200ms with proper indexes

## Testing

### Test Filtered Products

```bash
# Start with MongoDB connection
export MONGO_URI=mongodb://localhost:27017
export MONGO_DB_NAME=rtg-products
export PRODUCTS_COLLECTION=containers-local

# Start server
bun run dev

# Test filtered endpoint
curl http://localhost:3000/api/products/feed | jq '.total_products'
```

### Test with Different Regions

```bash
# Test with only Florida
export PRODUCT_REGIONS=FL
bun run dev

# Check how many products are returned
curl http://localhost:3000/api/products/feed | jq '.total_products'
```

### Test with Different Exclusions

```bash
# Exclude only sectionals
export EXCLUDED_PRODUCT_CLASSES=SECTIONAL
bun run dev

# Should return more products
curl http://localhost:3000/api/products/feed | jq '.total_products'
```

### Verify Filter in MongoDB

```bash
mongosh rtg-products --eval '
db.containers-local.countDocuments({
  catalog: "adult",
  type: "room",
  category: "livingroom",
  single_item_room: false,
  $or: [
    { "catalog_availability.FL": true },
    { "catalog_availability.SE": true },
    { "catalog_availability.TX": true }
  ]
})
'
```

## Troubleshooting

### Problem: No products returned

**Possible causes**:
1. Collection name incorrect
2. Products don't match the catalog/type/category criteria
3. No products available in configured regions

**Solution**:
```bash
# Check collection has products
mongosh rtg-products --eval "db.containers-local.countDocuments()"

# Check product structure
mongosh rtg-products --eval "db.containers-local.findOne()"

# Try without region filter
export PRODUCT_REGIONS=
bun run dev
```

### Problem: Too many exclusions

**Solution**: Review and adjust `EXCLUDED_PRODUCT_CLASSES`:
```bash
# Start with no exclusions
export EXCLUDED_PRODUCT_CLASSES=
bun run dev
```

### Problem: Wrong collection

**Solution**: Verify collection name matches your data:
```bash
# Use containers-local instead of products
export PRODUCTS_COLLECTION=containers-local
bun run dev
```

## Migration Notes

### Updating from Unfiltered Version

If you were using the service without filters:

**Before**:
```javascript
// Returned ALL products from collection
const products = await getAllProducts();
```

**After**:
```javascript
// Returns only living room products matching criteria
const products = await getAllProducts();

// To get all products (admin use)
const allProducts = await getAllProductsUnfiltered();
```

### Disabling Filters (if needed)

To disable filtering while keeping MongoDB data source, you would need to:

1. Create a custom data source extending `MongoDBProductDataSource`
2. Override `getAllProducts()` to use `getAllProductsUnfiltered()`
3. Or modify the constructor to accept a `useFilters` flag

**Example**:
```javascript
class UnfilteredMongoDBDataSource extends MongoDBProductDataSource {
  async getAllProducts() {
    return this.getAllProductsUnfiltered();
  }
}
```

## Summary

- ✅ **Automatic filtering** applied to all product queries
- ✅ **Configurable** via environment variables
- ✅ **Living room focus** - adult catalog, room type, living room category
- ✅ **Region-based** - filters by catalog availability
- ✅ **Class exclusions** - removes specific furniture types
- ✅ **Style exclusions** - removes sectionals by style tag
- ✅ **Performance optimized** - uses MongoDB indexes
- ✅ **Unfiltered access** available for admin use

The filtering ensures the Agentic Commerce Protocol only exposes relevant living room products that are available in your target regions and exclude unwanted product classes.
