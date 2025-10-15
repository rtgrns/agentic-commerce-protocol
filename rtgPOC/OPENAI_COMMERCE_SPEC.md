# OpenAI Commerce Feed Specification Compliance

## Overview

The rtgPOC Product Service now returns product feeds fully compliant with the **OpenAI Commerce Feed Specification**. The implementation uses an Adapter pattern to transform RTG's internal container/product schema into the OpenAI-required format.

**Specification**: https://developers.openai.com/commerce/specs/feed

## Architecture

```
MongoDB Container Data (RTG Format)
           ↓
   getAllProducts()
           ↓
   OpenAIProductMapper (Adapter)
           ↓
   OpenAI Commerce Feed Format
           ↓
   API Response
```

## Implementation

### **Files Created**

1. **[services/mappers/OpenAIProductMapper.js](rtgPOC/services/mappers/OpenAIProductMapper.js)** - Transformation adapter
2. **[services/ProductService.js](rtgPOC/services/ProductService.js)** - Updated to use mapper

### **Key Components**

#### OpenAIProductMapper
Transforms RTG containers (room sets) to OpenAI product format:
- Maps container data → OpenAI required fields
- Calculates total prices from slot items
- Builds product titles and descriptions
- Handles images and variants
- Determines availability per region

#### ProductService
Updated to use the mapper:
```javascript
async getProductFeed() {
  const containers = await this.dataSource.getAllProducts();
  const feed = this.mapper.transformFeed(containers);
  return feed;
}
```

## OpenAI Commerce Feed Format

### **Required Fields** ✅

| Field | Source | Example |
|-------|--------|---------|
| `id` | `container.container_id` | `"8725451P"` |
| `title` | Generated from collection + category + piece count | `"Belcourt Bedroom 5-Piece Set"` |
| `description` | Generated from container details | `"Complete 5-piece Belcourt bedroom set..."` |
| `link` | Generated from route or container ID | `"https://www.roomstogo.com/belcourt/..."` |
| `price` | Calculated from all slot items | `{"value": 1799.99, "currency": "USD"}` |
| `availability` | Based on catalog_availability per region | `"in_stock"` or `"out_of_stock"` |
| `inventory_quantity` | Conservative estimate (5 if available) | `5` |

### **Recommended Fields** ✅

| Field | Source | Example |
|-------|--------|---------|
| `brand` | Hardcoded | `"Rooms To Go"` |
| `image_link` | First slot item's primary image | `"https://assets.rtg-dev.com/..."` |
| `additional_image_links` | All alternate images (max 10) | `["url1", "url2", ...]` |

### **Optional Fields** ✅

| Field | Source | Example |
|-------|--------|---------|
| `product_type` | Category + piece count | `"Bedroom > 5-Piece Set"` |
| `google_product_category` | Mapped from category | `"Furniture > Bedroom Furniture"` |
| `condition` | Hardcoded | `"new"` |
| `custom_attributes` | Container metadata | See below |
| `variants` | Different colors/styles from slot items | Array of variant objects |
| `enable_search` | Hardcoded | `true` |
| `enable_checkout` | Hardcoded | `true` |
| `updated_at` | Container's updatedAt | ISO 8601 timestamp |

### **Custom Attributes**

Additional RTG-specific data included:
```javascript
{
  "collection": "belcourt",
  "slot_key": "dresser_mirror_bed",
  "piece_count": 5,
  "delivery_type": "D",
  "region": "FL",
  "savings": 211.97,
  "catalog": "adult",
  "category": "bedroom"
}
```

## Example Response

### **API Request**
```bash
GET /api/products/feed
```

### **OpenAI-Compliant Response**
```json
{
  "version": "1.0",
  "merchant_id": "merchant_rtg",
  "last_updated": "2025-10-15T12:00:00.000Z",
  "total_products": 45,
  "products": [
    {
      "id": "8725451P",
      "title": "Belcourt Bedroom 5-Piece Set",
      "description": "Complete 5-piece Belcourt bedroom set. Includes: dresser, mirror, bed. Delivery available. Available in brown cherry. Style: 6 drawer dresser.",
      "link": "https://www.roomstogo.com/belcourt-brown-cherry-dresser/32155409",
      "price": {
        "value": 1799.95,
        "currency": "USD"
      },
      "availability": "in_stock",
      "inventory_quantity": 5,
      "brand": "Rooms To Go",
      "image_link": "https://assets.rtg-dev.com/product/belcourt-brown-cherry-dresser_32155409_image-item",
      "additional_image_links": [
        "https://assets.rtg-dev.com/product/belcourt-brown-cherry-5-pc-queen...",
        "https://assets.rtg-dev.com/product/belcourt-brown-cherry-dresser_32155409_alt..."
      ],
      "product_type": "Bedroom > 5-Piece Set",
      "google_product_category": "Furniture > Bedroom Furniture",
      "condition": "new",
      "custom_attributes": {
        "collection": "belcourt",
        "slot_key": "dresser_mirror_bed",
        "piece_count": 5,
        "delivery_type": "D",
        "region": "FL",
        "savings": 0,
        "catalog": "adult",
        "category": "bedroom"
      },
      "variants": [
        {
          "id": "32155447",
          "color": "black",
          "image_link": "https://assets.rtg-dev.com/product/belcourt-black-dresser...",
          "price": {
            "value": 599.99,
            "currency": "USD"
          }
        },
        {
          "id": "32155423",
          "color": "white",
          "image_link": "https://assets.rtg-dev.com/product/belcourt-white-dresser...",
          "price": {
            "value": 599.99,
            "currency": "USD"
          }
        }
      ],
      "enable_search": true,
      "enable_checkout": true,
      "updated_at": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

## Transformation Logic

### **Price Calculation**
Sums prices from all slot items:
```javascript
// For each slot in container
slots.forEach(slot => {
  slot.filler_skus.forEach(filler => {
    const price = filler.price[region]['0_sale_price'];
    const quantity = filler.quantity;
    total += price * quantity;
  });
});
```

### **Title Generation**
Format: `{Collection} {Category} {PieceCount}-Piece Set`
- Collection: Capitalized from `_collection`
- Category: Capitalized from `category`
- Piece Count: From `piece_count`

Example: `"Belcourt Bedroom 5-Piece Set"`

### **Description Generation**
Includes:
1. Piece count and collection/category
2. List of items (from slot sub_categories)
3. Delivery information
4. Savings amount (if > 0)
5. Color and style information

Truncated to 5000 characters per spec.

### **Availability Determination**
Checks `catalog_availability` for all items in all slots:
```javascript
allAvailable = slots.every(slot =>
  slot.filler_skus.every(filler =>
    filler.catalog_availability[region] === true
  )
);
```

### **Variants Handling**
If first slot has multiple filler SKUs with different colors:
- Each color becomes a variant
- Includes variant-specific pricing and image

## Configuration

### **Environment Variables**

```bash
# Required for OpenAI feed
MERCHANT_ID=merchant_rtg
BASE_URL=https://www.roomstogo.com
DEFAULT_REGION=FL

# MongoDB connection
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=rtg-products
PRODUCTS_COLLECTION=containers-local
```

### **Mapper Configuration**

The mapper can be configured programmatically:
```javascript
const mapper = new OpenAIProductMapper({
  merchantId: 'merchant_rtg',
  baseUrl: 'https://www.roomstogo.com',
  defaultRegion: 'FL',
  currency: 'USD'
});
```

## Validation

### **OpenAI Requirements Met**

✅ **Required Fields**: All 7 required fields present
✅ **Data Types**: Correct types (strings, numbers, objects)
✅ **Character Limits**: Title ≤ 150 chars, Description ≤ 5000 chars
✅ **Price Format**: Object with value and currency
✅ **Availability Values**: "in_stock" or "out_of_stock"
✅ **URLs**: Fully qualified HTTPS URLs
✅ **Timestamps**: ISO 8601 format

### **Best Practices Implemented**

✅ Brand information included
✅ High-quality images provided
✅ Product categorization (Google taxonomy)
✅ Variant support for colors/styles
✅ Custom attributes for rich data
✅ Search and checkout enabled

## Testing

### **Test Feed Endpoint**

```bash
# Start server with MongoDB
export MONGO_URI=mongodb://localhost:27017
export MONGO_DB_NAME=rtg-products
export PRODUCTS_COLLECTION=containers-local
cd rtgPOC
bun run dev

# Test feed
curl http://localhost:3000/api/products/feed | jq
```

### **Validate Response**

Check for:
1. ✅ All required fields present in each product
2. ✅ Prices are positive numbers
3. ✅ Images are valid HTTPS URLs
4. ✅ Availability is "in_stock" or "out_of_stock"
5. ✅ Title and description are non-empty
6. ✅ Total products count matches array length

### **Sample Validation Script**

```javascript
// validate-feed.js
async function validateFeed(feed) {
  const requiredFields = ['id', 'title', 'description', 'link', 'price', 'availability', 'inventory_quantity'];

  feed.products.forEach((product, index) => {
    requiredFields.forEach(field => {
      if (!product[field]) {
        console.error(`Product ${index} missing required field: ${field}`);
      }
    });

    if (product.title.length > 150) {
      console.warn(`Product ${product.id} title exceeds 150 characters`);
    }

    if (product.description.length > 5000) {
      console.warn(`Product ${product.id} description exceeds 5000 characters`);
    }

    if (product.price.value <= 0) {
      console.error(`Product ${product.id} has invalid price: ${product.price.value}`);
    }
  });

  console.log(`✅ Validated ${feed.products.length} products`);
}
```

## Differences from Previous Format

### **Before (Generic ACP Format)**
```json
{
  "version": "1.0",
  "last_updated": "2025-10-15T12:00:00Z",
  "merchant_id": "merchant_rtg",
  "total_products": 45,
  "products": [
    {
      "container_id": "8725451P",
      "region": "FL",
      "slots": [...],
      // Raw MongoDB data
    }
  ]
}
```

### **After (OpenAI Commerce Spec)**
```json
{
  "version": "1.0",
  "merchant_id": "merchant_rtg",
  "last_updated": "2025-10-15T12:00:00Z",
  "total_products": 45,
  "products": [
    {
      "id": "8725451P",
      "title": "Belcourt Bedroom 5-Piece Set",
      "description": "Complete 5-piece...",
      "link": "https://www.roomstogo.com/...",
      "price": {"value": 1799.95, "currency": "USD"},
      "availability": "in_stock",
      "inventory_quantity": 5,
      "brand": "Rooms To Go",
      "image_link": "https://...",
      // Transformed to OpenAI format
    }
  ]
}
```

## Benefits

1. **ChatGPT Integration Ready**: Feed can be consumed by ChatGPT for product discovery
2. **Search Optimized**: Proper titles, descriptions, and categorization
3. **Rich Product Data**: Images, variants, custom attributes
4. **Flexible**: Adapter pattern makes it easy to adjust mapping
5. **Maintainable**: Clear separation between data access and transformation
6. **Extensible**: Easy to add new fields or modify existing ones

## Troubleshooting

### Problem: Prices showing as 0

**Solution**: Check that slot items have price data for the region:
```javascript
filler.price[region]['0_sale_price']
```

### Problem: No images in feed

**Solution**: Verify slot items have `images.primary_image` or `image` field:
```javascript
filler.images?.primary_image || filler.image
```

### Problem: All products out of stock

**Solution**: Check `catalog_availability` for the region:
```javascript
filler.catalog_availability[region] === true
```

### Problem: Title too long

**Solution**: Mapper automatically truncates to 150 characters. Adjust `buildTitle()` if needed.

## Future Enhancements

- [ ] Add real-time inventory integration
- [ ] Include shipping cost calculations
- [ ] Add product review/rating data
- [ ] Implement promotional pricing support
- [ ] Add product dimensions to feed
- [ ] Include warranty information
- [ ] Add bundle/package deals

## References

- **OpenAI Commerce Spec**: https://developers.openai.com/commerce/specs/feed
- **Google Product Category**: https://support.google.com/merchants/answer/6324436
- **Adapter Pattern**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Service Documentation**: [services/README.md](services/README.md)

## Summary

✅ **Fully compliant** with OpenAI Commerce Feed Specification
✅ **All required fields** mapped from RTG container data
✅ **Recommended fields** included (brand, images)
✅ **Best practices** implemented (variants, categories, custom data)
✅ **Adapter pattern** for clean transformation
✅ **Well documented** with examples and validation
✅ **Production ready** for ChatGPT integration

The feed is now ready to be consumed by OpenAI's ChatGPT for product discovery and commerce features.
