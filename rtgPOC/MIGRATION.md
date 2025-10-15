# Migration Guide: Legacy Checkout → Agentic Checkout

This guide helps you migrate from the legacy custom checkout API to the OpenAI Agentic Commerce Protocol compliant endpoints.

## Overview

The new Agentic Checkout implementation follows the OpenAI specification exactly, providing a richer, more standardized checkout experience with full support for delegated payments.

## What's Changed

### 1. API Endpoints

| Legacy (Deprecated)            | New (Agentic Checkout)                 | Changes                                       |
| ------------------------------ | -------------------------------------- | --------------------------------------------- |
| `POST /api/checkout/initiate`  | `POST /checkout_sessions`              | Request/response structure completely changed |
| `POST /api/checkout/confirm`   | `POST /checkout_sessions/:id/complete` | Now requires payment_data object              |
| -                              | `POST /checkout_sessions/:id`          | **NEW**: Update session endpoint              |
| -                              | `POST /checkout_sessions/:id/cancel`   | **NEW**: Cancel session endpoint              |
| `GET /api/checkout/:id/status` | `GET /checkout_sessions/:id`           | Returns full session state                    |

### 2. Request Headers (NEW REQUIREMENTS)

All Agentic Checkout endpoints require:

```http
API-Version: 2025-09-12
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

Recommended headers:
```http
Idempotency-Key: unique_key_per_request
Request-Id: request_tracking_id
```

### 3. Response Structure

#### Legacy Response (Simple)
```json
{
  "checkout_id": "chk_xxx",
  "status": "initiated",
  "product": {...},
  "breakdown": {
    "subtotal": 79.99,
    "tax": 6.40,
    "shipping": 5.99,
    "total": 92.38
  }
}
```

#### Agentic Checkout Response (Rich)
```json
{
  "id": "cs_xxx",
  "status": "ready_for_payment",
  "currency": "usd",
  "payment_provider": {
    "provider": "stripe",
    "supported_payment_methods": ["card"]
  },
  "line_items": [
    {
      "id": "line_xxx",
      "item": {"id": "prod_001", "quantity": 1},
      "base_amount": 7999,
      "discount": 0,
      "subtotal": 7999,
      "tax": 640,
      "total": 8639
    }
  ],
  "totals": [
    {"type": "items_base_amount", "display_text": "Items Subtotal", "amount": 7999},
    {"type": "subtotal", "display_text": "Subtotal", "amount": 7999},
    {"type": "fulfillment", "display_text": "Shipping", "amount": 599},
    {"type": "tax", "display_text": "Tax", "amount": 688},
    {"type": "total", "display_text": "Total", "amount": 9286}
  ],
  "fulfillment_options": [
    {
      "type": "shipping",
      "id": "shipping_standard",
      "title": "Standard Shipping",
      "subtitle": "5-7 business days",
      "carrier": "USPS",
      "earliest_delivery_time": "2025-10-20T00:00:00.000Z",
      "latest_delivery_time": "2025-10-22T00:00:00.000Z",
      "subtotal": 599,
      "tax": 48,
      "total": 647
    }
  ],
  "fulfillment_option_id": "shipping_standard",
  "fulfillment_address": {...},
  "buyer": {...},
  "messages": [],
  "links": [
    {"type": "terms_of_use", "url": "https://..."},
    {"type": "privacy_policy", "url": "https://..."}
  ]
}
```

### 4. Key Differences

#### Currency Representation
- **Legacy**: Decimal numbers (e.g., `79.99`)
- **Agentic**: Minor units/cents (e.g., `7999`)
- **Conversion**: `amount_in_cents = amount_in_dollars * 100`

#### Status Values
- **Legacy**: `initiated`, `completed`, `expired`
- **Agentic**: `not_ready_for_payment`, `ready_for_payment`, `completed`, `canceled`

#### Session Updates
- **Legacy**: No update endpoint (one-shot initiate → confirm)
- **Agentic**: Progressive updates (`POST /checkout_sessions/:id`)

## Migration Steps

### Step 1: Update Environment Variables

Add to your `.env`:
```bash
# OpenAI Integration
OPENAI_WEBHOOK_URL=https://api.openai.com/v1/webhooks/order_events
OPENAI_WEBHOOK_SECRET=whsec_your_secret
OPENAI_API_KEY=sk_your_key

# API Configuration
API_VERSION=2025-09-12
SUPPORTED_API_VERSIONS=2025-09-12,2025-09-29

# Checkout Configuration
CHECKOUT_SESSION_EXPIRY_MINUTES=30
DEFAULT_CURRENCY=usd
DEFAULT_TAX_RATE=0.08
```

### Step 2: Update Request Format

#### Legacy: Initiate Checkout
```javascript
// OLD
const response = await fetch('/api/checkout/initiate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    product_id: 'prod_001',
    quantity: 1,
    buyer_info: {
      name: 'John Doe',
      email: 'john@example.com',
      address: {...}
    }
  })
});
```

#### Agentic: Create Session
```javascript
// NEW
const response = await fetch('/checkout_sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'API-Version': '2025-09-12',
    'Authorization': 'Bearer YOUR_API_KEY',
    'Idempotency-Key': `idem_${Date.now()}`
  },
  body: JSON.stringify({
    buyer: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    },
    items: [
      { id: 'prod_001', quantity: 1 }
    ],
    fulfillment_address: {
      name: 'John Doe',
      line_one: '123 Main St',
      city: 'New York',
      state: 'NY',
      country: 'US',
      postal_code: '10001'
    }
  })
});
```

### Step 3: Handle Progressive Updates

The new API allows incremental updates:

```javascript
// Add/update shipping address
await fetch(`/checkout_sessions/${sessionId}`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({
    fulfillment_address: {...}
  })
});

// Select shipping method
await fetch(`/checkout_sessions/${sessionId}`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({
    fulfillment_option_id: 'shipping_express'
  })
});
```

### Step 4: Complete Checkout with Payment

#### Without Delegated Payment
```javascript
const response = await fetch(`/checkout_sessions/${sessionId}/complete`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({
    payment_data: {
      token: 'tok_visa', // Stripe token
      provider: 'stripe'
    }
  })
});
```

#### With Delegated Payment
```javascript
// First, tokenize payment with OpenAI
const tokenResponse = await fetch('/agentic_commerce/delegate_payment', {
  method: 'POST',
  headers: {
    'API-Version': '2025-09-29', // Note: different version!
    ...
  },
  body: JSON.stringify({
    payment_method: {
      type: 'card',
      card_number_type: 'fpan',
      number: '4242424242424242',
      exp_month: '12',
      exp_year: '2026',
      cvc: '123',
      ...
    },
    allowance: {
      reason: 'one_time',
      max_amount: 10000, // in cents
      currency: 'usd',
      checkout_session_id: sessionId,
      ...
    },
    ...
  })
});

const { id: vaultToken } = await tokenResponse.json();

// Then complete checkout
await fetch(`/checkout_sessions/${sessionId}/complete`, {
  method: 'POST',
  headers: {...},
  body: JSON.stringify({
    payment_data: {
      token: vaultToken, // vt_xxx
      provider: 'stripe'
    }
  })
});
```

### Step 5: Parse Response Data

```javascript
const session = await response.json();

// Access totals
const totalAmount = session.totals.find(t => t.type === 'total').amount;
console.log(`Total: $${totalAmount / 100}`); // Convert cents to dollars

// Check status
if (session.status === 'ready_for_payment') {
  // Can proceed to payment
}

// Get order info (after completion)
if (session.order) {
  console.log(`Order ID: ${session.order.id}`);
  console.log(`Order URL: ${session.order.permalink_url}`);
}

// Display messages to user
session.messages.forEach(msg => {
  if (msg.type === 'error') {
    console.error(msg.content);
  } else {
    console.info(msg.content);
  }
});
```

## Webhook Integration

The new implementation **sends webhooks to OpenAI** (not receives):

```javascript
// After order creation
webhook sent to OPENAI_WEBHOOK_URL:
{
  "type": "order_created",
  "data": {
    "type": "order",
    "checkout_session_id": "cs_xxx",
    "permalink_url": "https://...",
    "status": "created",
    "refunds": []
  }
}

// After order updates
{
  "type": "order_updated",
  "data": {
    "type": "order",
    "checkout_session_id": "cs_xxx",
    "permalink_url": "https://...",
    "status": "shipped",
    "refunds": []
  }
}
```

## Error Handling

### Legacy Errors
```json
{
  "error": "Product not found",
  "product_id": "prod_123"
}
```

### Agentic Errors (Structured)
```json
{
  "type": "invalid_request",
  "code": "session_not_found",
  "message": "Checkout session cs_123 not found",
  "param": "$.checkout_session_id"
}
```

Error types:
- `invalid_request` - Validation errors
- `request_not_idempotent` - Idempotency conflict
- `processing_error` - Payment/processing failures
- `service_unavailable` - Temporary service issues

## Backward Compatibility

The legacy endpoints (`/api/checkout/*`) are still available but marked as deprecated. They will be removed in a future version.

To use both APIs during migration:
1. Update new integrations to use Agentic Checkout
2. Keep legacy endpoints for existing integrations
3. Plan migration timeline
4. Remove legacy code after full migration

## Testing

Example test script:

```bash
# Test new endpoints
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -H "Authorization: Bearer test_key" \
  -d '{
    "items": [{"id": "prod_001", "quantity": 1}]
  }'
```

See `examples/agentic-checkout-flow.http` for complete flow examples.

## Support

For questions or issues:
1. Check the OpenAI Agentic Commerce Protocol documentation
2. Review example requests in `examples/agentic-checkout-flow.http`
3. Consult the JSON schemas in `spec/json-schema/`

## Checklist

- [ ] Update environment variables
- [ ] Add required headers to requests
- [ ] Convert amounts to minor units (cents)
- [ ] Handle new status values
- [ ] Implement progressive session updates
- [ ] Update payment completion flow
- [ ] Add delegated payment support (optional)
- [ ] Update response parsing
- [ ] Implement webhook sending (to OpenAI)
- [ ] Add error handling for new error format
- [ ] Test full checkout flow
- [ ] Update documentation
- [ ] Plan legacy endpoint deprecation

