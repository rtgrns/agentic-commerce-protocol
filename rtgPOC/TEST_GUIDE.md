# Testing Guide - Agentic Commerce Protocol

## Prerequisites

1. **Start the server:**
```bash
cd rtgPOC
npm start
```

You should see:
```
🚀 ACP POC Server started successfully

📍 Main URLs:
   Health Check:         http://localhost:3000/health
   Product Feed:         http://localhost:3000/api/products/feed
   ...
```

2. **Verify product feed is working:**
```bash
curl http://localhost:3000/api/products/feed | jq '.products[0].id'
```

This will show you available product IDs to use in testing.

## Quick Test Script

Save this as `test-checkout-flow.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
API_VERSION="2025-09-12"

echo "🧪 Testing Agentic Checkout Flow"
echo "================================="

# 1. Create checkout session
echo -e "\n📦 Step 1: Creating checkout session..."
CREATE_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_$(date +%s)" \
  -d '{
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phone_number": "+1234567890"
    },
    "items": [
      {
        "id": "1537992P",
        "quantity": 1
      }
    ]
  }')

SESSION_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
STATUS=$(echo $CREATE_RESPONSE | jq -r '.status')

echo "✅ Session created: $SESSION_ID"
echo "   Status: $STATUS"

# 2. Add shipping address
echo -e "\n📍 Step 2: Adding shipping address..."
UPDATE1_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "fulfillment_address": {
      "name": "John Doe",
      "line_one": "123 Main Street",
      "line_two": "Apt 4B",
      "city": "New York",
      "state": "NY",
      "country": "US",
      "postal_code": "10001"
    }
  }')

STATUS=$(echo $UPDATE1_RESPONSE | jq -r '.status')
echo "✅ Address added"
echo "   Status: $STATUS"

# 3. Select shipping method
echo -e "\n🚚 Step 3: Selecting shipping method..."
UPDATE2_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "fulfillment_option_id": "shipping_standard"
  }')

STATUS=$(echo $UPDATE2_RESPONSE | jq -r '.status')
TOTAL=$(echo $UPDATE2_RESPONSE | jq -r '.totals[] | select(.type=="total") | .amount')

echo "✅ Shipping selected"
echo "   Status: $STATUS"
echo "   Total: \$$(echo "scale=2; $TOTAL/100" | bc)"

# 4. Get session status
echo -e "\n🔍 Step 4: Getting session status..."
GET_RESPONSE=$(curl -s -X GET ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123")

echo "✅ Session retrieved"
echo "   Full response saved to: session_${SESSION_ID}.json"
echo $GET_RESPONSE | jq '.' > session_${SESSION_ID}.json

# 5. Complete checkout with Stripe test token
echo -e "\n💳 Step 5: Completing checkout with payment..."
COMPLETE_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID}/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_complete_$(date +%s)" \
  -d '{
    "payment_data": {
      "token": "tok_visa",
      "provider": "stripe"
    }
  }')

ORDER_ID=$(echo $COMPLETE_RESPONSE | jq -r '.order.id')
STATUS=$(echo $COMPLETE_RESPONSE | jq -r '.status')
PERMALINK=$(echo $COMPLETE_RESPONSE | jq -r '.order.permalink_url')

echo "✅ Checkout completed!"
echo "   Order ID: $ORDER_ID"
echo "   Status: $STATUS"
echo "   Permalink: $PERMALINK"

echo -e "\n✨ Test completed successfully!"
echo "Session ID: $SESSION_ID"
echo "Order ID: $ORDER_ID"
```

Make it executable:
```bash
chmod +x test-checkout-flow.sh
./test-checkout-flow.sh
```

## Manual Testing with cURL

### 1. Create Checkout Session

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com"
    },
    "items": [
      {
        "id": "1537992P",
        "quantity": 1
      }
    ]
  }' | jq '.'
```

**Save the session ID from the response!**

### 2. Update Session - Add Address

```bash
# Replace cs_xxx with your actual session ID
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "fulfillment_address": {
      "name": "John Doe",
      "line_one": "123 Main Street",
      "city": "New York",
      "state": "NY",
      "country": "US",
      "postal_code": "10001"
    }
  }' | jq '.status, .messages'
```

### 3. Update Session - Select Shipping

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "fulfillment_option_id": "shipping_standard"
  }' | jq '.status, .totals'
```

### 4. Complete Checkout (Direct Stripe Token)

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "payment_data": {
      "token": "tok_visa",
      "provider": "stripe"
    }
  }' | jq '.order'
```

## Testing Delegated Payments Flow

### 1. Create Session (same as above)

### 2. Tokenize Payment with Delegated Payment

```bash
curl -X POST http://localhost:3000/agentic_commerce/delegate_payment \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-29" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_payment_$(date +%s)" \
  -d '{
    "payment_method": {
      "type": "card",
      "card_number_type": "fpan",
      "number": "4242424242424242",
      "exp_month": "12",
      "exp_year": "2026",
      "name": "John Doe",
      "cvc": "123",
      "display_card_funding_type": "credit",
      "display_brand": "visa",
      "display_last4": "4242",
      "metadata": {}
    },
    "allowance": {
      "reason": "one_time",
      "max_amount": 600000,
      "currency": "usd",
      "checkout_session_id": "cs_xxx",
      "merchant_id": "merchant_poc_123",
      "expires_at": "2025-12-31T23:59:59Z"
    },
    "risk_signals": [
      {
        "type": "card_testing",
        "score": 5,
        "action": "authorized"
      }
    ],
    "metadata": {
      "source": "test"
    }
  }' | jq '.'
```

**Save the vault token ID (vt_xxx)!**

### 3. Complete with Delegated Token

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "payment_data": {
      "token": "vt_xxx",
      "provider": "stripe"
    }
  }' | jq '.'
```

## Testing Error Scenarios

### 1. Missing Required Headers

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"1537992P","quantity":1}]}'
```

Expected: `400 Bad Request` with missing API-Version error

### 2. Invalid Session ID

```bash
curl http://localhost:3000/checkout_sessions/invalid_id \
  -H "API-Version: 2025-09-12"
```

Expected: `404 Not Found` with session_not_found error

### 3. Complete Without Payment Ready

```bash
# Create session without address, try to complete
SESSION_ID=$(curl -s -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{"items":[{"id":"1537992P","quantity":1}]}' | jq -r '.id')

curl -X POST http://localhost:3000/checkout_sessions/${SESSION_ID}/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{"payment_data":{"token":"tok_visa","provider":"stripe"}}'
```

Expected: `400 Bad Request` with session_not_ready error

### 4. Idempotency Test

```bash
IDEM_KEY="idem_test_123"

# First request
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -H "Idempotency-Key: ${IDEM_KEY}" \
  -d '{"items":[{"id":"1537992P","quantity":1}]}'

# Same request again - should return cached response
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -H "Idempotency-Key: ${IDEM_KEY}" \
  -d '{"items":[{"id":"1537992P","quantity":1}]}'
```

Expected: Same session ID returned

## Using the HTTP Examples File

If you're using VS Code with the REST Client extension:

1. Open `examples/agentic-checkout-flow.http`
2. Replace `cs_REPLACE_WITH_SESSION_ID` with actual session IDs
3. Click "Send Request" above each request

## Checking the Results

### View Checkout Sessions

```bash
cat data/orders.json | jq '.checkout_sessions | keys'
```

### View Orders

```bash
cat data/orders.json | jq '.orders | keys'
```

### View Delegated Tokens

```bash
cat data/orders.json | jq '.delegated_tokens | keys'
```

### View Specific Session

```bash
# Replace cs_xxx with your session ID
cat data/orders.json | jq '.checkout_sessions["cs_xxx"]'
```

## Testing with Postman

1. Import the collection from `examples/agentic-checkout-flow.http`
2. Set environment variables:
   - `BASE_URL`: http://localhost:3000
   - `API_VERSION`: 2025-09-12
3. Run the requests in order

## Expected Response Structures

### Create Session Response

```json
{
  "id": "cs_xxx",
  "status": "not_ready_for_payment",
  "currency": "usd",
  "payment_provider": {
    "provider": "stripe",
    "supported_payment_methods": ["card"]
  },
  "line_items": [...],
  "totals": [...],
  "fulfillment_options": [],
  "messages": [
    {
      "type": "info",
      "content_type": "plain",
      "content": "Please provide a shipping address to continue."
    }
  ],
  "links": [...]
}
```

### Complete Response

```json
{
  "id": "cs_xxx",
  "status": "completed",
  "order": {
    "id": "ord_xxx",
    "checkout_session_id": "cs_xxx",
    "permalink_url": "https://www.roomstogo.com/orders/ord_xxx"
  },
  ...
}
```

## Troubleshooting

### Server Won't Start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>
```

### MongoDB Connection Issues

```bash
# Test MongoDB connection
mongosh "mongodb+srv://dev_service_user:zkcDibr9E1f1LFfl@dev.stebl.mongodb.net/?authSource=admin&tls=true"
```

### Stripe Errors

The POC will work even without valid Stripe keys. It will log errors but continue with simulated transactions.

### Check Server Logs

The server logs all requests with detailed information:
```
[2025-10-15T12:00:00.000Z] POST /checkout_sessions | Request-Id: req_xxx
  Idempotency-Key: idem_xxx
✅ Checkout session created: cs_xxx (1 items)
```

## Next Steps

After successful testing:

1. **Review webhook payloads** - Check console for webhook delivery attempts
2. **Test with real Stripe keys** - Update STRIPE_SECRET_KEY in .env
3. **Configure OpenAI webhook** - Set OPENAI_WEBHOOK_URL to receive real webhook deliveries
4. **Run load tests** - Test concurrent requests and idempotency under load
5. **Add automated tests** - Create Jest/Mocha test suite

## Support

If you encounter issues:
1. Check server console for error logs
2. Verify all required headers are present
3. Ensure product IDs exist in the feed
4. Review the MIGRATION.md for API changes
5. Check IMPLEMENTATION_COMPLETE.md for known limitations

