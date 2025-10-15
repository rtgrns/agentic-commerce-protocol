# Shipping Configuration Guide

## Current Implementation: Hardcoded Shipping

The shipping methods are currently **hardcoded** in `services/CartStateBuilder.js` with fixed prices:

- Standard Shipping: $5.99 (USPS, 5-7 days)
- Express Shipping: $19.99 (FedEx, 2-3 days)

**Location:** `services/CartStateBuilder.js` lines 192-240

```javascript
buildFulfillmentOptions(address, items) {
  const options = [];

  // Standard shipping - HARDCODED
  const standardCost = 599; // $5.99 in cents
  
  // Express shipping - HARDCODED  
  const expressCost = 1999; // $19.99 in cents
  
  return options;
}
```

## How to Make Shipping Dynamic

If you want shipping costs to vary based on product data, here are your options:

---

## Option 1: Calculate Based on Product Weight/Size

### Step 1: Add Shipping Data to Products

Update your MongoDB product documents to include shipping information:

```javascript
{
  "id": "1537992P",
  "title": "Sofa Set",
  "price": 4999.99,
  // Add shipping metadata
  "shipping": {
    "weight_lbs": 250,
    "dimensions": {
      "length": 84,
      "width": 40,
      "height": 36
    },
    "handling_fee": 50,  // Additional handling for large items
    "free_shipping_eligible": false
  }
}
```

### Step 2: Update CartStateBuilder

```javascript
async buildFulfillmentOptions(address, items) {
  const options = [];
  
  // Calculate total weight from all items
  let totalWeight = 0;
  let requiresWhiteGlove = false;
  
  for (const item of items) {
    const product = await this.productService.getProductById(item.id);
    const shipping = product.shipping || {};
    
    totalWeight += (shipping.weight_lbs || 0) * item.quantity;
    
    // Check if any item requires special handling
    if (shipping.requires_white_glove) {
      requiresWhiteGlove = true;
    }
  }
  
  // Calculate shipping cost based on weight
  let standardCost;
  if (totalWeight < 50) {
    standardCost = 599;  // $5.99
  } else if (totalWeight < 150) {
    standardCost = 1999;  // $19.99
  } else {
    standardCost = 4999;  // $49.99 for heavy items
  }
  
  // Add white glove delivery for furniture
  if (requiresWhiteGlove || totalWeight > 100) {
    standardCost = 9999;  // $99.99
    options.push({
      type: "shipping",
      id: "shipping_white_glove",
      title: "White Glove Delivery",
      subtitle: "7-10 business days with setup",
      carrier: "Specialized Furniture Delivery",
      subtotal: standardCost,
      tax: Math.round(standardCost * this.taxRate),
      total: standardCost + Math.round(standardCost * this.taxRate)
    });
  }
  
  // Standard shipping
  options.push({
    type: "shipping",
    id: "shipping_standard",
    title: "Standard Shipping",
    subtitle: `${Math.ceil(totalWeight / 50) * 2}-${Math.ceil(totalWeight / 50) * 3 + 2} business days`,
    carrier: "USPS/FedEx",
    subtotal: standardCost,
    tax: Math.round(standardCost * this.taxRate),
    total: standardCost + Math.round(standardCost * this.taxRate)
  });
  
  return options;
}
```

---

## Option 2: Use Real-time Shipping API

Integrate with shipping carriers for real-time rates:

### Step 1: Install Shipping SDK

```bash
npm install @shipengine/shipengine
```

### Step 2: Update CartStateBuilder

```javascript
const ShipEngine = require('@shipengine/shipengine');

class CartStateBuilder {
  constructor() {
    this.shipEngine = new ShipEngine(process.env.SHIPENGINE_API_KEY);
  }

  async buildFulfillmentOptions(address, items) {
    // Get product dimensions from items
    const packages = await this.getPackagesFromItems(items);
    
    // Get real-time rates from ShipEngine
    const rates = await this.shipEngine.getRates({
      shipment: {
        ship_to: {
          name: address.name,
          address_line1: address.line_one,
          city_locality: address.city,
          state_province: address.state,
          postal_code: address.postal_code,
          country_code: address.country
        },
        ship_from: {
          // Your warehouse address
          name: "Rooms To Go",
          address_line1: "123 Warehouse St",
          city_locality: "Tampa",
          state_province: "FL",
          postal_code: "33601",
          country_code: "US"
        },
        packages: packages
      }
    });
    
    // Transform ShipEngine rates to OpenAI format
    const options = rates.rate_response.rates.map(rate => ({
      type: "shipping",
      id: `shipping_${rate.service_code}`,
      title: `${rate.carrier_friendly_name} ${rate.service_type}`,
      subtitle: `${rate.estimated_delivery_days} business days`,
      carrier: rate.carrier_friendly_name,
      earliest_delivery_time: rate.estimated_delivery_date,
      latest_delivery_time: rate.guaranteed_delivery_date || rate.estimated_delivery_date,
      subtotal: Math.round(rate.shipping_amount.amount * 100),
      tax: Math.round(rate.shipping_amount.amount * 100 * this.taxRate),
      total: Math.round(rate.total_amount.amount * 100)
    }));
    
    return options;
  }
}
```

---

## Option 3: Region-Based Shipping Rates

Calculate based on customer's region:

```javascript
buildFulfillmentOptions(address, items) {
  const options = [];
  
  // Get customer state
  const state = address.state;
  const region = this.getRegionFromState(state);
  
  // Different rates by region
  const shippingRates = {
    'FL': { standard: 599, express: 1499 },    // Local
    'SE': { standard: 999, express: 1999 },    // Southeast
    'NE': { standard: 1499, express: 2499 },   // Northeast
    'W': { standard: 1999, express: 3499 }     // West Coast
  };
  
  const rates = shippingRates[region] || shippingRates['SE'];
  
  options.push({
    type: "shipping",
    id: "shipping_standard",
    title: `Standard Shipping (${region})`,
    subtitle: "5-7 business days",
    carrier: "USPS",
    subtotal: rates.standard,
    tax: Math.round(rates.standard * this.taxRate),
    total: rates.standard + Math.round(rates.standard * this.taxRate)
  });
  
  return options;
}

getRegionFromState(state) {
  const regions = {
    'FL': 'FL',
    'GA': 'SE', 'SC': 'SE', 'NC': 'SE', 'TN': 'SE',
    'NY': 'NE', 'MA': 'NE', 'PA': 'NE',
    'CA': 'W', 'OR': 'W', 'WA': 'W'
  };
  return regions[state] || 'SE';
}
```

---

## Option 4: Free Shipping Threshold

Offer free shipping above certain amount:

```javascript
buildFulfillmentOptions(address, items) {
  const options = [];
  
  // Calculate cart subtotal
  const cartSubtotal = items.reduce((sum, item) => {
    // Get product price * quantity
    return sum + (item.price * item.quantity);
  }, 0);
  
  // Free shipping over $500
  const FREE_SHIPPING_THRESHOLD = 50000; // $500 in cents
  
  if (cartSubtotal >= FREE_SHIPPING_THRESHOLD) {
    options.push({
      type: "shipping",
      id: "shipping_free",
      title: "FREE Standard Shipping",
      subtitle: "5-7 business days (Free for orders over $500)",
      carrier: "USPS",
      subtotal: 0,  // FREE!
      tax: 0,
      total: 0
    });
  } else {
    options.push({
      type: "shipping",
      id: "shipping_standard",
      title: "Standard Shipping",
      subtitle: `5-7 business days (Free shipping at $${FREE_SHIPPING_THRESHOLD / 100})`,
      carrier: "USPS",
      subtotal: 599,
      tax: Math.round(599 * this.taxRate),
      total: 599 + Math.round(599 * this.taxRate)
    });
  }
  
  return options;
}
```

---

## Current Limitations

**What's NOT considered currently:**
- ❌ Product weight/dimensions
- ❌ Product category (furniture vs small items)
- ❌ Customer location/distance
- ❌ Cart total value
- ❌ Product availability by warehouse
- ❌ Special handling requirements

**What IS considered:**
- ✅ Tax rate (from environment variable)
- ✅ Two fixed shipping options
- ✅ Delivery time estimates
- ✅ Carrier information

---

## Where Shipping Data Could Come From

### From Product Data:
```javascript
// In your MongoDB product documents
{
  "id": "1537992P",
  "shipping_class": "furniture",  // furniture, small_item, oversized
  "weight": 250,
  "requires_white_glove": true,
  "ships_from_warehouse": "FL_01"
}
```

### From Environment Variables:
```bash
# .env
STANDARD_SHIPPING_COST=599
EXPRESS_SHIPPING_COST=1999
FREE_SHIPPING_THRESHOLD=50000
SHIPPING_TAX_RATE=0.08
```

### From External API:
```javascript
// Call shipping API
const rates = await fetch('https://shipping-api.example.com/rates', {
  method: 'POST',
  body: JSON.stringify({
    origin: 'FL',
    destination: address.state,
    weight: totalWeight,
    dimensions: totalDimensions
  })
});
```

---

## Recommendation for Your Use Case

For **Rooms To Go furniture**, I'd suggest:

### Implement Product-Based Shipping:

```javascript
async buildFulfillmentOptions(address, items) {
  const options = [];
  
  // Analyze products in cart
  let hasFurniture = false;
  let totalValue = 0;
  
  for (const item of items) {
    const product = await this.productService.getProductById(item.id);
    
    // Check if it's furniture (from category or custom_attributes)
    if (product.category === 'bedroom' || 
        product.category === 'living_room' ||
        product.piece_count > 1) {
      hasFurniture = true;
    }
    
    totalValue += product.price?.value || 0;
  }
  
  // Furniture gets white glove delivery
  if (hasFurniture) {
    options.push({
      type: "shipping",
      id: "shipping_white_glove",
      title: "White Glove Delivery & Setup",
      subtitle: "7-14 business days with room of choice delivery",
      carrier: "Specialized Furniture Delivery",
      subtotal: 9999,  // $99.99
      tax: Math.round(9999 * this.taxRate),
      total: 9999 + Math.round(9999 * this.taxRate)
    });
    
    // Free white glove for orders over $2000
    if (totalValue >= 2000) {
      options.push({
        type: "shipping",
        id: "shipping_free_white_glove",
        title: "FREE White Glove Delivery",
        subtitle: "7-14 business days (Free for orders over $2,000)",
        carrier: "Specialized Furniture Delivery",
        subtotal: 0,
        tax: 0,
        total: 0
      });
    }
  } else {
    // Small items get standard shipping
    options.push({
      type: "shipping",
      id: "shipping_standard",
      title: "Standard Shipping",
      subtitle: "5-7 business days",
      carrier: "FedEx",
      subtotal: 599,
      tax: Math.round(599 * this.taxRate),
      total: 599 + Math.round(599 * this.taxRate)
    });
  }
  
  return options;
}
```

This would check your product's `category`, `piece_count`, or other metadata to determine appropriate shipping methods.

---

## Summary

**Current Answer:** No, shipping methods are **hardcoded** in `CartStateBuilder.js` with:
- Standard: $5.99
- Express: $19.99

**To Make Dynamic:** You'd need to:
1. Add shipping metadata to your product documents in MongoDB
2. Update `buildFulfillmentOptions()` to read that data
3. Calculate shipping based on product characteristics

**Would you like me to implement dynamic shipping based on your product data?** I can update the CartStateBuilder to check product categories (bedroom, living room, etc.) and apply appropriate shipping methods!
