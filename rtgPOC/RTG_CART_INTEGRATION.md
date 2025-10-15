# RTG Cart API Integration

## Overview

The Agentic Checkout implementation now integrates with the RTG Cart API (https://carts.rtg-dev.com), allowing you to create checkout sessions from existing RTG carts or create standalone sessions.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Two Integration Modes                      │
└──────────────────────────────────────────────────────────────┘

Mode 1: Direct Items (Original)
  Items → Agentic Checkout Session → Payment → Order

Mode 2: RTG Cart Integration (NEW)
  RTG Cart → Agentic Checkout Session → Payment → Order → Close RTG Cart
```

## RTG Cart API Endpoints

Base URL: `https://carts.rtg-dev.com`

| Endpoint                           | Method | Description                                  |
| ---------------------------------- | ------ | -------------------------------------------- |
| `/cart`                            | POST   | Create new cart with line items              |
| `/cart/{id}`                       | GET    | Get cart by ID                               |
| `/cart/{id}`                       | PUT    | Update cart metadata (region, zone, zipCode) |
| `/cart/{id}`                       | DELETE | Delete cart permanently                      |
| `/cart/{id}/items`                 | GET    | Get all cart items                           |
| `/cart/{id}/items`                 | POST   | Add items to cart                            |
| `/cart/{id}/items`                 | DELETE | Clear cart items                             |
| `/cart/{id}/items/{itemId}`        | GET    | Get specific item                            |
| `/cart/{id}/items/{itemId}`        | PUT    | Update item (quantity, warranty)             |
| `/cart/{id}/items/{itemId}`        | DELETE | Remove specific item                         |
| `/cart/{id}/close`                 | POST   | Close cart (mark as submitted)               |
| `/cart/{id}/split-check/{zipCode}` | GET    | Check split delivery                         |

## Implementation

### Files Created/Modified

**New File:** `services/RTGCartService.js`
- Complete wrapper for RTG Cart API
- Methods for all cart operations
- Transform RTG cart to OpenAI line items format
- Handle cart lifecycle (create, update, close)

**Modified:** `services/CartStateBuilder.js`
- Added `buildLineItemsFromRTGCart(rtgCartId)` method
- Integrated RTGCartService
- Supports both direct items and RTG cart

**Modified:** `routes/agentic-checkout.js`
- Accepts `rtg_cart_id` in create session request
- Automatically closes RTG cart on checkout completion
- Closes RTG cart on session cancellation

**Modified:** `.env` and `.env.example`
- Added RTG cart configuration variables

## Configuration

### Environment Variables

```bash
# RTG Cart API Configuration
RTG_CART_API_URL=https://carts.rtg-dev.com
RTG_CART_API_KEY=your_api_key_here  # Optional - if API requires auth
USE_RTG_CART=false  # Set to true to enable by default
DEFAULT_ZONE=0
DEFAULT_DISTRIBUTION_INDEX=10
```

### Cart API Authentication

If the RTG Cart API requires authentication, set:
```bash
RTG_CART_API_KEY=your_bearer_token
```

The service will automatically include it in requests:
```http
Authorization: Bearer your_bearer_token
```

## Usage

### Option 1: Create Session from RTG Cart ID

If you already have an RTG cart (from your website shopping cart):

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d '{
    "rtg_cart_id": "e0718ca8-955d-40d6-8ab0-f53e4bac5403",
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    }
  }'
```

**What happens:**
1. Fetches cart from RTG Cart API
2. Transforms items to OpenAI line items format
3. Creates checkout session with cart data
4. Preserves RTG cart ID in session

**Response includes:**
```json
{
  "id": "cs_abc123",
  "rtg_cart_id": "e0718ca8-955d-40d6-8ab0-f53e4bac5403",
  "rtg_cart_region": "SE",
  "rtg_cart_zone": "0",
  "rtg_cart_total": 2742.99,
  "rtg_cart_savings": 100.99,
  "line_items": [...],
  "totals": [...],
  ...
}
```

### Option 2: Create Session from Items (Original)

Create session without RTG cart (standalone):

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "1537992P", "quantity": 1}
    ]
  }'
```

This works as before - builds line items from product data directly.

## Complete Flow with RTG Cart

### Scenario: User shops on website, checks out via ChatGPT

```javascript
// 1. User adds items to cart on your website
//    Your website uses RTG Cart API
const cart = await fetch('https://carts.rtg-dev.com/cart', {
  method: 'POST',
  body: JSON.stringify({
    lineItems: [
      {
        sku: '1537992P',
        quantity: 1,
        warrantyEnabled: false,
        additionalOptions: {
          selections: [],
          addons: [],
          completeYourSleep: []
        }
      }
    ],
    region: 'FL',
    zone: '0',
    distributionIndex: 10,
    zipCode: '33101'
  })
});

const rtgCartId = cart._id;  // e.g., "e0718ca8-955d-40d6-8ab0-f53e4bac5403"

// 2. User goes to ChatGPT to checkout
//    ChatGPT calls your API with cart ID
POST /checkout_sessions
{
  "rtg_cart_id": "e0718ca8-955d-40d6-8ab0-f53e4bac5403",
  "buyer": {...}
}

// 3. Your API fetches RTG cart and creates session
//    Session includes all cart items, prices, promotions, savings

// 4. User completes checkout in ChatGPT
POST /checkout_sessions/cs_abc123/complete
{
  "payment_data": {"token": "tok_visa", "provider": "stripe"}
}

// 5. Your API:
//    - Processes payment ✅
//    - Creates order ✅
//    - Closes RTG cart ✅ (status = "closed")
//    - Sends webhook to OpenAI ✅

// Result: RTG cart is closed, order is created, ChatGPT gets confirmation
```

## RTG Cart Features Supported

### Line Items
- ✅ Basic items (SKU, quantity, price)
- ✅ Container SKUs (furniture sets with slot fillers)
- ✅ Gift cards
- ✅ Warranties
- ✅ Additional options (selections, addons, completeYourSleep)
- ✅ Promotions and savings
- ✅ Strike-through pricing

### Cart Metadata
- ✅ Region (SE, FL, TX, OOM)
- ✅ Zone (0-6)
- ✅ Distribution index (warehouse routing)
- ✅ Zip code
- ✅ Account ID
- ✅ Store cart details
- ✅ Finance details
- ✅ Coupons

### Transformations to OpenAI Format

The RTGCartService automatically transforms:

**RTG Cart Item:**
```json
{
  "lineItemId": "m9cz5smpofjz",
  "sku": "4243233P",
  "quantity": 1,
  "unitPrice": 799.99,
  "strikePrice": 899.99,
  "deliveryType": "D",
  "warrantyEnabled": true,
  "isContainerSku": false
}
```

**To OpenAI Line Item:**
```json
{
  "id": "m9cz5smpofjz",
  "item": {
    "id": "4243233P",
    "quantity": 1
  },
  "base_amount": 79999,  // $799.99 in cents
  "discount": 10000,     // $100 savings from strike price
  "subtotal": 69999,
  "tax": 5600,           // 8% tax
  "total": 75599,
  "metadata": {
    "rtg_line_item_id": "m9cz5smpofjz",
    "is_container_sku": false,
    "delivery_type": "D",
    "warranty_enabled": true
  }
}
```

## Testing

### Test 1: Create Session from RTG Cart

```bash
# First, create an RTG cart (use actual RTG Cart API)
RTG_CART_ID=$(curl -s -X POST https://carts.rtg-dev.com/cart \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [{
      "sku": "1537992P",
      "quantity": 1,
      "warrantyEnabled": false,
      "additionalOptions": {
        "selections": [],
        "addons": [],
        "completeYourSleep": []
      }
    }],
    "region": "FL",
    "zone": "0",
    "distributionIndex": 10,
    "zipCode": "33101"
  }' | jq -r '._id')

echo "RTG Cart ID: $RTG_CART_ID"

# Create Agentic Checkout session from RTG cart
curl -X POST http://localhost:3000/checkout_sessions \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d "{
    \"rtg_cart_id\": \"$RTG_CART_ID\",
    \"buyer\": {
      \"first_name\": \"John\",
      \"last_name\": \"Doe\",
      \"email\": \"john@example.com\"
    }
  }" | jq '.'
```

### Test 2: Complete Checkout (Closes RTG Cart)

```bash
SESSION_ID="cs_abc123"  # From above

# Add address
curl -X POST http://localhost:3000/checkout_sessions/$SESSION_ID \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillment_address": {
      "name": "John Doe",
      "line_one": "123 Main St",
      "city": "New York",
      "state": "NY",
      "country": "US",
      "postal_code": "10001"
    }
  }'

# Select shipping
curl -X POST http://localhost:3000/checkout_sessions/$SESSION_ID \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d '{"fulfillment_option_id": "shipping_standard"}'

# Complete checkout
curl -X POST http://localhost:3000/checkout_sessions/$SESSION_ID/complete \
  -H "API-Version: 2025-09-12" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_data": {
      "token": "tok_visa",
      "provider": "stripe"
    }
  }'

# Check if RTG cart was closed
curl https://carts.rtg-dev.com/cart/$RTG_CART_ID | jq '.status'
# Should show "closed"
```

## API Methods

### RTGCartService Methods

```javascript
const rtgCartService = new RTGCartService();

// Create cart
const cart = await rtgCartService.createCart({
  lineItems: [{sku: "xxx", quantity: 1, ...}],
  region: "FL",
  zone: "0",
  zipCode: "33101"
});

// Get cart
const cart = await rtgCartService.getCart(cartId);

// Update cart
await rtgCartService.updateCart(cartId, {
  region: "SE",
  zipCode: "37090"
});

// Add items
await rtgCartService.addItems(cartId, [
  {sku: "xxx", quantity: 1, warrantyEnabled: false, ...}
]);

// Update item
await rtgCartService.updateCartItem(cartId, itemId, {
  quantity: 2
});

// Remove item
await rtgCartService.removeCartItem(cartId, itemId);

// Close cart (mark as submitted)
await rtgCartService.closeCart(cartId);

// Delete cart
await rtgCartService.deleteCart(cartId);

// Check split delivery
const result = await rtgCartService.checkSplitDelivery(cartId, "33101");
```

## Data Flow

### When Creating Session from RTG Cart

```
1. Client provides RTG cart ID
   POST /checkout_sessions
   { "rtg_cart_id": "e0718..." }
   
2. CartStateBuilder.buildCheckoutSession()
   ├─→ Detects rtgCartId parameter
   ├─→ Calls buildLineItemsFromRTGCart()
   ├─→ RTGCartService.getCart(id)
   ├─→ Fetches cart from https://carts.rtg-dev.com/cart/{id}
   ├─→ Transforms RTG items → OpenAI line items
   └─→ Builds session with RTG cart data
   
3. Session includes:
   {
     "id": "cs_abc123",
     "line_items": [...],  // From RTG cart
     "rtg_cart_id": "e0718...",
     "rtg_cart_region": "SE",
     "rtg_cart_total": 2742.99,
     "rtg_cart_savings": 100.99
   }
```

### When Completing Checkout

```
1. Client completes checkout
   POST /checkout_sessions/cs_abc123/complete
   
2. Routes/agentic-checkout.js
   ├─→ Process payment with Stripe ✅
   ├─→ Create order ✅
   ├─→ Check if session.rtg_cart_id exists
   ├─→ If yes: RTGCartService.closeCart(rtg_cart_id)
   ├─→ RTG cart status = "closed" ✅
   └─→ Send webhook to OpenAI ✅
   
3. Order includes:
   {
     "id": "ord_123",
     "rtg_cart_id": "e0718...",
     "rtg_cart_closed": true
   }
```

## RTG Cart Data Structure

### Cart Response
```json
{
  "_id": "e0718ca8-955d-40d6-8ab0-f53e4bac5403",
  "lineItems": [
    {
      "lineItemId": "m9cz5smpofjz",
      "sku": "4243233P",
      "quantity": 1,
      "unitPrice": 799.99,
      "strikePrice": 899.99,
      "deliveryType": "D",
      "warrantyEnabled": true,
      "isContainerSku": false,
      "productDetails": {
        "title": "San Francisco Gray 5 Pc Dining Room",
        "category": "diningroom",
        "imageUrl": "https://...",
        "route": "/product/...",
        ...
      }
    }
  ],
  "cartTotal": 2742.99,
  "cartSubtotal": 2999.99,
  "totalSavings": 100.99,
  "region": "SE",
  "zone": "0",
  "distributionIndex": 10,
  "zipCode": "37090",
  "status": "open",
  "type": "online",
  "promotions": [...],
  "couponInfo": {...}
}
```

### Container SKUs (Room Sets)

RTG carts support container SKUs which are furniture sets:

```json
{
  "lineItemId": "container123",
  "sku": "3562750P",
  "isContainerSku": true,
  "containerName": "kids south bend brown cherry full Post bedroom",
  "containerImage": "https://assets.roomstogo.com/...",
  "slotFillers": [
    {
      "lineItemId": "slot1",
      "sku": "34327507",
      "quantity": 1,
      "slotName": "chesser",
      "friendlyName": "brown cherry chesser",
      "unitPrice": 745.17
    },
    {
      "lineItemId": "slot2",
      "sku": "34327508",
      "quantity": 1,
      "slotName": "bed",
      "friendlyName": "brown cherry full bed",
      "unitPrice": 899.99
    }
  ]
}
```

These are automatically transformed to OpenAI line items.

## Integration Scenarios

### Scenario 1: Website → ChatGPT Checkout

```
User shops on yourstore.com
  ↓
Items added to RTG Cart API
  ↓
User clicks "Checkout with ChatGPT"
  ↓
Website passes rtg_cart_id to ChatGPT
  ↓
ChatGPT creates Agentic Checkout session
  POST /checkout_sessions
  { "rtg_cart_id": "xxx" }
  ↓
User completes in ChatGPT
  ↓
RTG cart status = "closed" ✅
Order created ✅
```

### Scenario 2: Direct ChatGPT Shopping

```
User shops directly in ChatGPT
  ↓
ChatGPT creates session with items
  POST /checkout_sessions
  { "items": [{...}] }
  ↓
No RTG cart involved
  ↓
Complete checkout
  ↓
Order created ✅
```

### Scenario 3: Store Cart → Online Checkout

```
Customer shops in physical store
  ↓
Sales associate creates RTG cart (type: "storecart")
  storeCartId: "SE009851718"
  ↓
Customer goes home, checks out online
  ↓
Create session with rtg_cart_id
  ↓
Complete checkout
  ↓
Store cart closed ✅
```

## Error Handling

### Cart Not Found
```json
{
  "type": "error",
  "code": "cart_error",
  "content_type": "plain",
  "content": "Failed to load cart: Cart not found"
}
```

### Cart API Unavailable
```json
{
  "type": "error",
  "code": "cart_error",
  "content_type": "plain",
  "content": "Failed to load cart: Service unavailable"
}
```

### Cart Already Closed
If you try to create a session from a closed cart, the API will return an error from RTG Cart API.

## Benefits

### For Customers
- ✅ Shop on website, checkout anywhere (web, ChatGPT, mobile)
- ✅ Cart syncs across all platforms
- ✅ Promotions and savings preserved
- ✅ Seamless cross-platform experience

### For Business
- ✅ Single source of truth for cart data
- ✅ Centralized cart management
- ✅ Consistent pricing and promotions
- ✅ Better analytics (track cart-to-order conversion)
- ✅ Support for complex products (containers, promotions, coupons)

### For Development
- ✅ Separation of concerns (cart vs checkout)
- ✅ Reusable cart across channels
- ✅ Easy to integrate new checkout methods
- ✅ Backward compatible (both modes work)

## Monitoring

### Check RTG Cart Status

```bash
# Get cart status
curl https://carts.rtg-dev.com/cart/{cart_id} | jq '.status'

# Check if cart was closed
cat data/orders.json | jq '.orders[] | select(.rtg_cart_id) | {order_id, rtg_cart_id, rtg_cart_closed}'
```

### Server Logs

Watch for:
```
🛒 Creating RTG cart with 1 items
✅ RTG cart created: e0718ca8-955d-40d6-8ab0-f53e4bac5403
✅ Built 1 line items from RTG cart e0718ca8-955d-40d6-8ab0-f53e4bac5403
✅ Checkout session created: cs_abc123
...
💳 Payment processed: ch_xyz789
✅ Order created: ord_123
✅ RTG cart closed: e0718ca8-955d-40d6-8ab0-f53e4bac5403
```

## Troubleshooting

### Issue: Cannot connect to RTG Cart API

**Solution:** Check environment variables:
```bash
echo $RTG_CART_API_URL
# Should be: https://carts.rtg-dev.com

# Test connectivity
curl https://carts.rtg-dev.com/health
```

### Issue: Cart not closing after checkout

**Check:**
1. Server logs for errors
2. RTG cart status manually: `GET /cart/{id}`
3. Order data: Does it have `rtg_cart_closed: true`?

### Issue: Prices don't match RTG cart

**Cause:** Tax calculation differences

**Solution:** Ensure `DEFAULT_TAX_RATE` matches RTG cart tax calculation

## Future Enhancements

- [ ] Sync cart updates back to RTG (when items change)
- [ ] Support split delivery detection
- [ ] Handle promotions and coupons in totals
- [ ] Support store cart and modular cart creation methods
- [ ] Add cart validation before checkout
- [ ] Support cart merging
- [ ] Add cart expiration handling

## Summary

✅ **RTG Cart API fully integrated**
✅ **Support for cart-based checkout**
✅ **Automatic cart closing on completion**
✅ **Container SKUs and complex items supported**
✅ **Backward compatible with direct item checkout**
✅ **Full OpenAI Agentic Checkout compliance maintained**

The integration provides a bridge between your existing RTG cart system and the new Agentic Commerce Protocol, enabling seamless checkout across all platforms!

