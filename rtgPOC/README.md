# 🛒 Agentic Commerce Protocol - POC

Complete Proof of Concept for OpenAI's **Agentic Commerce Protocol (ACP)**. This project implements both the **Agentic Checkout** and **Delegated Payments** specifications.

## 📋 What is the Agentic Commerce Protocol?

The Agentic Commerce Protocol is an open-source standard developed by OpenAI and Stripe that enables AI agents to interact with e-commerce platforms in a standardized way. It consists of three main specifications:

1. **Product Feed** - Standardized product catalog format
2. **Agentic Checkout** - Complete checkout flow inside ChatGPT
3. **Delegated Payments** - Secure payment credential tokenization

## ✨ POC Features

### Core Features
- ✅ **Product Feed API** - OpenAI-compliant product catalog
- ✅ **Agentic Checkout** - Full spec-compliant checkout flow
- ✅ **Delegated Payments** - Secure payment tokenization
- ✅ **Stripe Integration** - Payment processing with Stripe
- ✅ **Webhook Sender** - Sends order events to OpenAI
- ✅ **Order Management** - Complete order lifecycle
- ✅ **Idempotency** - Safe request retries
- ✅ **Header Validation** - API-Version, Authorization, etc.

### Endpoints
- ✅ 5 Agentic Checkout endpoints (create, update, complete, cancel, get)
- ✅ 1 Delegated Payment endpoint (tokenize)
- ✅ Product feed and search
- ✅ Legacy endpoints (deprecated, for backward compatibility)

## 🔧 Prerequisites

- **Node.js** v14 or higher
- **npm** v6 or higher
- **Stripe** account (test mode) - Optional for POC
- **OpenAI** account (for webhook integration) - Optional for POC

## 📦 Installation

### 1. Navigate to directory

```bash
cd rtgPOC
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
PORT=3000
MERCHANT_ID=merchant_rtg
BASE_URL=https://www.roomstogo.com
DEFAULT_REGION=FL

# MongoDB Configuration (optional)
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=rtg-products
PRODUCTS_COLLECTION=products

# Payment Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key

# Pricing Configuration
DEFAULT_TAX_RATE=0.08
DEFAULT_CURRENCY=usd

# OpenAI Integration (optional for POC)
OPENAI_WEBHOOK_URL=https://api.openai.com/v1/webhooks/order_events
OPENAI_WEBHOOK_SECRET=whsec_your_webhook_secret
OPENAI_API_KEY=sk_your_openai_api_key

# API Configuration
API_VERSION=2025-09-12
SUPPORTED_API_VERSIONS=2025-09-12,2025-09-29

# Checkout Configuration
CHECKOUT_SESSION_EXPIRY_MINUTES=30
```

> **Note:** The POC works without real Stripe keys or OpenAI webhooks by simulating transactions.

## 🚀 Usage

### Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000` with output like:

```
🚀 ACP POC Server started successfully

📍 Main URLs:
   Health Check:         http://localhost:3000/health
   Product Feed:         http://localhost:3000/api/products/feed
   Web Interface:        http://localhost:3000/test.html

📦 Agentic Checkout Endpoints (OpenAI Spec):
   Create Session:       POST http://localhost:3000/checkout_sessions
   Update Session:       POST http://localhost:3000/checkout_sessions/:id
   Complete Checkout:    POST http://localhost:3000/checkout_sessions/:id/complete
   Cancel Session:       POST http://localhost:3000/checkout_sessions/:id/cancel
   Get Session:          GET  http://localhost:3000/checkout_sessions/:id

💳 Delegated Payment Endpoint:
   Tokenize Payment:     POST http://localhost:3000/agentic_commerce/delegate_payment

⚠️  Legacy Endpoints (deprecated):
   /api/checkout/*

✨ Agentic Commerce Protocol v1.0
🔧 Merchant ID: merchant_rtg
📋 API Version: 2025-09-12
```

## 🔌 API Endpoints

### Agentic Checkout API (OpenAI Spec-Compliant)

All endpoints require these headers:
```http
API-Version: 2025-09-12
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

| Endpoint                          | Method | Description                                   |
| --------------------------------- | ------ | --------------------------------------------- |
| `/checkout_sessions`              | POST   | Create a new checkout session                 |
| `/checkout_sessions/:id`          | POST   | Update session (add address, select shipping) |
| `/checkout_sessions/:id/complete` | POST   | Complete checkout and process payment         |
| `/checkout_sessions/:id/cancel`   | POST   | Cancel checkout session                       |
| `/checkout_sessions/:id`          | GET    | Get checkout session state                    |

### Delegated Payment API

| Endpoint                             | Method | Description                 | API Version |
| ------------------------------------ | ------ | --------------------------- | ----------- |
| `/agentic_commerce/delegate_payment` | POST   | Tokenize payment credential | 2025-09-29  |

### Product Feed API

| Endpoint                       | Method | Description                           |
| ------------------------------ | ------ | ------------------------------------- |
| `/api/products/feed`           | GET    | Get complete OpenAI-compliant catalog |
| `/api/products/:id`            | GET    | Get specific product                  |
| `/api/products/search?q=query` | GET    | Search products                       |

### Legacy Checkout API (Deprecated)

| Endpoint                   | Method | Description                                          |
| -------------------------- | ------ | ---------------------------------------------------- |
| `/api/checkout/initiate`   | POST   | ⚠️ Deprecated - Use `/checkout_sessions`              |
| `/api/checkout/confirm`    | POST   | ⚠️ Deprecated - Use `/checkout_sessions/:id/complete` |
| `/api/checkout/:id/status` | GET    | ⚠️ Deprecated - Use `/checkout_sessions/:id`          |

## 📊 Complete Checkout Flow

### 1. Create Checkout Session

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -H "Authorization: Bearer test_key" \
  -d '{
    "buyer": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com"
    },
    "items": [
      {"id": "1537992P", "quantity": 1}
    ]
  }'
```

Response includes full cart state with `line_items`, `totals`, `messages`, `links`, etc.

### 2. Add Shipping Address

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
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
```

### 3. Select Shipping Method

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "fulfillment_option_id": "shipping_standard"
  }'
```

Session status becomes `ready_for_payment`.

### 4. Complete Checkout

#### Option A: With Delegated Payment

```bash
# First, tokenize payment
curl -X POST http://localhost:3000/agentic_commerce/delegate_payment \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-29" \
  -d '{
    "payment_method": {
      "type": "card",
      "card_number_type": "fpan",
      "number": "4242424242424242",
      "exp_month": "12",
      "exp_year": "2026",
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
      "merchant_id": "merchant_rtg",
      "expires_at": "2025-12-31T23:59:59Z"
    },
    "risk_signals": [
      {"type": "card_testing", "score": 5, "action": "authorized"}
    ],
    "metadata": {"source": "chatgpt"}
  }'

# Then complete with vault token
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "payment_data": {
      "token": "vt_xxx",
      "provider": "stripe"
    }
  }'
```

#### Option B: Direct Stripe Token

```bash
curl -X POST http://localhost:3000/checkout_sessions/cs_xxx/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "payment_data": {
      "token": "tok_visa",
      "provider": "stripe"
    }
  }'
```

## 📁 Project Structure

```
rtgPOC/
├── server.js                          # Main Express server
├── middleware/
│   └── agentic-commerce.js           # Header validation, idempotency
├── routes/
│   ├── agentic-checkout.js           # Agentic Checkout endpoints
│   ├── delegated-payment.js          # Delegated Payment endpoint
│   ├── products.js                   # Product Feed API
│   ├── checkout.js                   # Legacy checkout (deprecated)
│   └── webhooks.js                   # Webhook receiver
├── services/
│   ├── CartStateBuilder.js           # Build rich cart state
│   ├── WebhookSender.js              # Send webhooks to OpenAI
│   ├── DelegatedTokenManager.js      # Manage payment tokens
│   ├── ProductService.js             # Product business logic
│   └── mappers/
│       └── OpenAIProductMapper.js    # Transform to OpenAI format
├── data/
│   ├── products.json                 # Sample products
│   └── orders.json                   # Orders and sessions storage
├── examples/
│   └── agentic-checkout-flow.http    # Complete flow examples
├── spec/
│   └── json-schema/                  # OpenAI spec schemas
├── MIGRATION.md                       # Migration guide
└── README.md                          # This file
```

## 🔐 Security Features

- ✅ API version validation
- ✅ Authorization header support
- ✅ Idempotency for safe retries
- ✅ Request signature verification (optional)
- ✅ PCI-compliant token handling
- ✅ One-time use delegated tokens
- ✅ Allowance constraints (amount, expiry, session)
- ✅ HMAC webhook signatures

## 🎯 Key Features

### Rich Cart State
- Line items with base amounts, discounts, taxes, totals (in cents)
- Multiple fulfillment options with delivery estimates
- Progressive totals array (items, shipping, tax, total)
- User messages (errors and info)
- Links (ToS, privacy policy)

### Checkout Session States
```
not_ready_for_payment → ready_for_payment → completed
                     ↓                    ↓
                  canceled            canceled
```

### Webhooks to OpenAI
After order events, the system sends webhooks to OpenAI:
- `order.created` - When order is confirmed
- `order.updated` - Status changes, refunds, etc.

### Idempotency
Safe request retries using `Idempotency-Key` header:
- Same key + same body = same response (cached)
- Same key + different body = 409 Conflict

## 📚 Documentation

- **[MIGRATION.md](./MIGRATION.md)** - Migrate from legacy to Agentic Checkout
- **[OPENAI_COMMERCE_SPEC.md](./OPENAI_COMMERCE_SPEC.md)** - OpenAI Product Feed spec details
- **[examples/agentic-checkout-flow.http](./examples/agentic-checkout-flow.http)** - Complete request examples
- **[OpenAI Agentic Checkout Spec](https://developers.openai.com/commerce/specs/checkout)** - Official specification
- **[OpenAI Delegated Payment Spec](https://developers.openai.com/commerce/specs/payment)** - Official specification

## 🧪 Testing

See `examples/agentic-checkout-flow.http` for complete test scenarios.

### Test Checkout Flow

```bash
# 1. Create session
SESSION_ID=$(curl -s -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{"items":[{"id":"1537992P","quantity":1}]}' | jq -r '.id')

echo "Session ID: $SESSION_ID"

# 2. Add address
curl -X POST http://localhost:3000/checkout_sessions/$SESSION_ID \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{
    "fulfillment_address": {
      "name": "Test User",
      "line_one": "123 Test St",
      "city": "New York",
      "state": "NY",
      "country": "US",
      "postal_code": "10001"
    }
  }'

# 3. Select shipping
curl -X POST http://localhost:3000/checkout_sessions/$SESSION_ID \
  -H "Content-Type: application/json" \
  -H "API-Version: 2025-09-12" \
  -d '{"fulfillment_option_id":"shipping_standard"}'

# 4. Check status
curl http://localhost:3000/checkout_sessions/$SESSION_ID \
  -H "API-Version: 2025-09-12"
```

## 🚀 Next Steps for Production

To take this POC to production:

1. **Real Database**
   - Migrate from JSON to PostgreSQL/MongoDB
   - Implement proper transactions
   - Add indexes for performance

2. **Authentication**
   - Implement OAuth 2.0 or API keys
   - Rate limiting per merchant
   - HTTPS/TLS enforcement

3. **Complete Stripe Integration**
   - Real webhook signature verification
   - Refund handling
   - Multiple payment methods
   - Dynamic currencies

4. **Real Inventory**
   - Stock management system
   - Temporary reservations during checkout
   - Real-time availability

5. **Monitoring**
   - Structured logging (Winston, Bunyan)
   - APM (Application Performance Monitoring)
   - Error tracking (Sentry)
   - Metrics (Prometheus, Grafana)

6. **Testing**
   - Unit tests (Jest)
   - Integration tests
   - E2E tests
   - CI/CD pipeline

7. **Scalability**
   - Load balancing
   - Caching (Redis)
   - Queue system for webhooks
   - Microservices architecture

## 📜 API Response Examples

### Checkout Session Response
```json
{
  "id": "cs_xxx",
  "status": "ready_for_payment",
  "currency": "usd",
  "payment_provider": {
    "provider": "stripe",
    "supported_payment_methods": ["card"]
  },
  "line_items": [...],
  "totals": [...],
  "fulfillment_options": [...],
  "fulfillment_option_id": "shipping_standard",
  "fulfillment_address": {...},
  "buyer": {...},
  "messages": [],
  "links": [...]
}
```

### Delegated Token Response
```json
{
  "id": "vt_abc123...",
  "created": "2025-10-15T12:00:00Z",
  "metadata": {
    "source": "chatgpt",
    "merchant_id": "merchant_rtg"
  }
}
```

## 📖 Useful Links

- **OpenAI ACP Repository**: [github.com/agentic-commerce-protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- **OpenAI Commerce Docs**: [developers.openai.com/commerce](https://developers.openai.com/commerce)
- **Stripe Docs**: [docs.stripe.com](https://docs.stripe.com)
- **Stripe Test Cards**: [docs.stripe.com/testing](https://docs.stripe.com/testing)

## 🤝 Contributing

This is a POC for demonstration and learning purposes. Feel free to:
- Fork the project
- Experiment with the code
- Add new features
- Report issues or improvements

## 📄 License

MIT License - Free to use and modify

---

**Developed with ❤️ as a complete implementation of the Agentic Commerce Protocol**

For questions or support: [your-email@example.com]
