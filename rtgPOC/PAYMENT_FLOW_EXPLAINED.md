# Payment Flow - Complete Explanation

## Overview

There are **TWO different payment flows** in the Agentic Commerce Protocol:

1. **Delegated Payments** - OpenAI/ChatGPT handles card collection and tokenization
2. **Direct Token** - Client collects card and tokenizes directly

Let's understand both in detail.

---

## Flow 1: Delegated Payments (ChatGPT Checkout)

This is the flow when a user shops **inside ChatGPT**.

### The Complete Journey

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER IN CHATGPT                                              │
└─────────────────────────────────────────────────────────────────┘
User: "I want to buy this sofa"
ChatGPT: "Let me help you checkout..."

    ↓ ChatGPT creates checkout session

┌─────────────────────────────────────────────────────────────────┐
│ 2. CREATE SESSION (ChatGPT → Your API)                          │
└─────────────────────────────────────────────────────────────────┘
POST /checkout_sessions
{
  "items": [{"id": "sofa_123", "quantity": 1}]
}

Response:
{
  "id": "cs_abc123",
  "status": "not_ready_for_payment",
  "totals": [{...}],
  "messages": ["Please provide shipping address"]
}

    ↓ User provides address

┌─────────────────────────────────────────────────────────────────┐
│ 3. UPDATE SESSION - Add Address (ChatGPT → Your API)            │
└─────────────────────────────────────────────────────────────────┘
POST /checkout_sessions/cs_abc123
{
  "fulfillment_address": {
    "name": "John Doe",
    "line_one": "123 Main St",
    ...
  }
}

Response:
{
  "status": "not_ready_for_payment",
  "fulfillment_options": [
    {"id": "shipping_standard", "title": "Standard Shipping", ...}
  ]
}

    ↓ User selects shipping

┌─────────────────────────────────────────────────────────────────┐
│ 4. UPDATE SESSION - Select Shipping (ChatGPT → Your API)        │
└─────────────────────────────────────────────────────────────────┘
POST /checkout_sessions/cs_abc123
{
  "fulfillment_option_id": "shipping_standard"
}

Response:
{
  "status": "ready_for_payment",  ← Now ready!
  "totals": [
    {"type": "total", "amount": 199900}  // $1,999.00
  ]
}

    ↓ User enters card in ChatGPT interface

┌─────────────────────────────────────────────────────────────────┐
│ 5. USER ENTERS CARD IN CHATGPT                                  │
└─────────────────────────────────────────────────────────────────┘
User types in ChatGPT:
- Card: 4242 4242 4242 4242
- Expiry: 12/26
- CVC: 123

ChatGPT collects this securely ✅

    ↓ ChatGPT needs to tokenize this card

┌─────────────────────────────────────────────────────────────────┐
│ 6. DELEGATE PAYMENT (ChatGPT → Your API)                        │
│    ⭐ THIS IS WHERE TOKENIZATION HAPPENS                        │
└─────────────────────────────────────────────────────────────────┘
POST /agentic_commerce/delegate_payment
Headers:
  API-Version: 2025-09-29  ← Different version!
Body:
{
  "payment_method": {
    "type": "card",
    "number": "4242424242424242",  ← Real card number!
    "exp_month": "12",
    "exp_year": "2026",
    "cvc": "123",
    "display_card_funding_type": "credit",
    "display_brand": "visa",
    "display_last4": "4242"
  },
  "allowance": {
    "reason": "one_time",
    "max_amount": 199900,  ← Max can charge
    "currency": "usd",
    "checkout_session_id": "cs_abc123",  ← Tied to session!
    "merchant_id": "merchant_rtg",
    "expires_at": "2025-10-20T23:59:59Z"  ← Expires soon
  },
  "risk_signals": [...],
  "metadata": {"source": "chatgpt"}
}

    ↓ Your API receives card details

┌─────────────────────────────────────────────────────────────────┐
│ 7. YOUR API TOKENIZES WITH STRIPE                               │
└─────────────────────────────────────────────────────────────────┘
// In routes/delegated-payment.js
const stripeToken = await stripe.tokens.create({
  card: {
    number: "4242424242424242",
    exp_month: "12",
    exp_year: "2026",
    cvc: "123"
  }
});
// Returns: { id: "tok_abc123xyz..." }

    ↓ Create vault token and store it

const vaultToken = {
  id: "vt_xyz789",  ← Unique vault token ID
  stripe_token_id: "tok_abc123xyz",  ← Real Stripe token
  allowance: {
    max_amount: 199900,
    checkout_session_id: "cs_abc123",
    expires_at: "2025-10-20T23:59:59Z"
  },
  created: "2025-10-15T14:00:00Z",
  used: false  ← Not used yet
};

// Store in database
data.delegated_tokens["vt_xyz789"] = vaultToken;

    ↓ Return vault token to ChatGPT

Response to ChatGPT:
{
  "id": "vt_xyz789",  ← ChatGPT stores this!
  "created": "2025-10-15T14:00:00Z",
  "metadata": {"source": "chatgpt"}
}

┌─────────────────────────────────────────────────────────────────┐
│ 8. CHATGPT STORES VAULT TOKEN                                   │
└─────────────────────────────────────────────────────────────────┘
ChatGPT now has:
- Checkout Session: cs_abc123
- Vault Token: vt_xyz789

Card details are GONE - only token remains ✅

    ↓ User clicks "Complete Purchase"

┌─────────────────────────────────────────────────────────────────┐
│ 9. COMPLETE CHECKOUT (ChatGPT → Your API)                       │
│    ⭐ CHATGPT SENDS THE VAULT TOKEN BACK                        │
└─────────────────────────────────────────────────────────────────┘
POST /checkout_sessions/cs_abc123/complete
Headers:
  API-Version: 2025-09-12  ← Back to standard version
Body:
{
  "payment_data": {
    "token": "vt_xyz789",  ← The vault token!
    "provider": "stripe"
  }
}

    ↓ Your API processes payment

┌─────────────────────────────────────────────────────────────────┐
│ 10. YOUR API VALIDATES AND CHARGES                              │
└─────────────────────────────────────────────────────────────────┘
// In routes/agentic-checkout.js

// 1. Check if it's a vault token
const isDelegatedToken = token.startsWith("vt_");  // true!

// 2. Validate the vault token
const validation = tokenManager.validateAllowance(
  "vt_xyz789",
  "cs_abc123",  // Must match!
  199900,       // Amount must be <= max_amount
  "usd"         // Currency must match
);

if (!validation.valid) {
  return error("Invalid token");
}

// 3. Get the real Stripe token
const vaultToken = validation.token;
const stripeToken = vaultToken.stripe_token_id;  // "tok_abc123xyz"

// 4. Charge the card using Stripe token
const charge = await stripe.charges.create({
  amount: 199900,
  currency: "usd",
  source: stripeToken,  ← Real Stripe token!
  description: "Sofa purchase"
});
// Charge successful! ✅

// 5. Mark vault token as used (one-time use!)
tokenManager.consumeToken("vt_xyz789");
// vaultToken.used = true

// 6. Create order
const order = {
  id: "ord_123",
  status: "confirmed",
  payment: {
    charge_id: charge.id,
    status: "succeeded"
  }
};

    ↓ Send webhook to OpenAI

┌─────────────────────────────────────────────────────────────────┐
│ 11. WEBHOOK TO OPENAI                                           │
└─────────────────────────────────────────────────────────────────┘
POST https://api.openai.com/v1/webhooks/order_events
{
  "type": "order_created",
  "data": {
    "checkout_session_id": "cs_abc123",
    "status": "created",
    "permalink_url": "https://yourstore.com/orders/ord_123"
  }
}

    ↓ Return to ChatGPT

Response to ChatGPT:
{
  "id": "cs_abc123",
  "status": "completed",
  "order": {
    "id": "ord_123",
    "permalink_url": "https://yourstore.com/orders/ord_123"
  }
}

┌─────────────────────────────────────────────────────────────────┐
│ 12. CHATGPT SHOWS SUCCESS                                       │
└─────────────────────────────────────────────────────────────────┘
ChatGPT to User:
"✅ Purchase complete! Your order #ord_123 is confirmed.
View order: https://yourstore.com/orders/ord_123"
```

---

## Flow 2: Direct Token (Your Own Web App)

This is when you have your own checkout interface (not ChatGPT).

### The Complete Journey

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER ON YOUR WEBSITE                                         │
└─────────────────────────────────────────────────────────────────┘
User browses products on yourstore.com
Clicks "Checkout"

    ↓ Your frontend creates session

┌─────────────────────────────────────────────────────────────────┐
│ 2. CREATE SESSION (Your Frontend → Your Backend)                │
└─────────────────────────────────────────────────────────────────┘
POST /checkout_sessions
{
  "items": [{"id": "sofa_123", "quantity": 1}]
}

    ↓ Frontend collects address and shipping

POST /checkout_sessions/cs_abc123
{ "fulfillment_address": {...} }

POST /checkout_sessions/cs_abc123
{ "fulfillment_option_id": "shipping_standard" }

    ↓ User enters card on YOUR payment form

┌─────────────────────────────────────────────────────────────────┐
│ 3. USER ENTERS CARD ON YOUR WEBSITE                             │
└─────────────────────────────────────────────────────────────────┘
<form>
  <input id="card-number" placeholder="4242 4242 4242 4242">
  <input id="expiry" placeholder="12/26">
  <input id="cvc" placeholder="123">
</form>

    ↓ Your frontend tokenizes with Stripe.js

┌─────────────────────────────────────────────────────────────────┐
│ 4. TOKENIZE IN BROWSER (Your Frontend → Stripe)                 │
│    ⭐ CLIENT-SIDE TOKENIZATION                                  │
└─────────────────────────────────────────────────────────────────┘
// In your frontend JavaScript
const stripe = Stripe('pk_test_YOUR_PUBLISHABLE_KEY');

// Tokenize the card (NEVER send card to your server!)
const result = await stripe.createToken({
  number: '4242424242424242',
  exp_month: '12',
  exp_year: '2026',
  cvc: '123'
});

// result.token.id = "tok_xyz789"
// Card details stay in browser, never touch your server! ✅

    ↓ Send token to your backend

┌─────────────────────────────────────────────────────────────────┐
│ 5. COMPLETE WITH TOKEN (Your Frontend → Your Backend)           │
└─────────────────────────────────────────────────────────────────┐
POST /checkout_sessions/cs_abc123/complete
{
  "payment_data": {
    "token": "tok_xyz789",  ← Stripe token from frontend!
    "provider": "stripe"
  }
}

    ↓ Your backend charges the card

┌─────────────────────────────────────────────────────────────────┐
│ 6. YOUR BACKEND CHARGES CARD                                    │
└─────────────────────────────────────────────────────────────────┘
// In routes/agentic-checkout.js

// This is NOT a vault token
const isDelegatedToken = token.startsWith("vt_");  // false!

// Use token directly with Stripe
const charge = await stripe.charges.create({
  amount: 199900,
  currency: "usd",
  source: "tok_xyz789",  ← Token from frontend
  description: "Sofa purchase"
});

// Create order and return
```

---

## Key Differences

### Delegated Payments (ChatGPT)

| Step                  | Who Does It            | What Happens                            |
| --------------------- | ---------------------- | --------------------------------------- |
| 1. Collect Card       | **ChatGPT**            | User enters card in ChatGPT interface   |
| 2. Send Card          | **ChatGPT → Your API** | POST /agentic_commerce/delegate_payment |
| 3. Tokenize           | **Your API → Stripe**  | stripe.tokens.create()                  |
| 4. Create Vault Token | **Your API**           | Generate vt_xxx and store               |
| 5. Return Token       | **Your API → ChatGPT** | { id: "vt_xxx" }                        |
| 6. Complete Checkout  | **ChatGPT → Your API** | POST /complete with vt_xxx              |
| 7. Validate & Charge  | **Your API**           | Validate allowance, charge card         |

**Security:** Card details travel: User → ChatGPT → Your API → Stripe
**Token Type:** Vault token (vt_xxx) with allowance constraints

### Direct Token (Your Web App)

| Step            | Who Does It                      | What Happens                  |
| --------------- | -------------------------------- | ----------------------------- |
| 1. Collect Card | **Your Frontend**                | User enters card in your form |
| 2. Tokenize     | **Your Frontend → Stripe**       | Stripe.js creates token       |
| 3. Send Token   | **Your Frontend → Your Backend** | POST /complete with tok_xxx   |
| 4. Charge       | **Your Backend → Stripe**        | Use token directly            |

**Security:** Card details travel: User → Stripe (never your servers!)
**Token Type:** Stripe token (tok_xxx) directly from Stripe.js

---

## The Token Mystery Solved

### What is a Token?

A token is a **safe representation** of a card that can be used to charge it **without knowing the card number**.

```
Card:  4242 4242 4242 4242
  ↓ Tokenize
Token: tok_abc123xyz

You can charge the token without ever storing the card number!
```

### Two Types of Tokens

**1. Stripe Token (tok_xxx)**
```javascript
// Created by Stripe.js in browser OR by your backend
const stripeToken = await stripe.tokens.create({
  card: { number: "4242...", exp_month: "12", ... }
});
// Result: "tok_abc123"
```

**2. Vault Token (vt_xxx)**
```javascript
// Created by YOUR API (wraps a Stripe token)
const vaultToken = {
  id: "vt_xyz789",
  stripe_token_id: "tok_abc123",  ← Contains Stripe token
  allowance: {
    max_amount: 199900,
    checkout_session_id: "cs_abc123",
    expires_at: "2025-10-20T23:59:59Z"
  }
};
```

### Why Two Types?

**Stripe Token (tok_xxx):**
- ✅ Simple
- ✅ Direct from Stripe
- ❌ No spending limits
- ❌ No expiration
- ❌ Not tied to specific session

**Vault Token (vt_xxx):**
- ✅ Has spending limit (max_amount)
- ✅ Has expiration
- ✅ Tied to specific checkout session
- ✅ One-time use
- ✅ More secure for delegated scenarios

---

## Visual: Who Tokenizes When?

```
┌──────────────────────────────────────────────────────────────┐
│                    DELEGATED PAYMENTS                         │
│                    (ChatGPT Checkout)                         │
└──────────────────────────────────────────────────────────────┘

User → ChatGPT → Your API → Stripe
(card)  (card)    (card)   (tokenize) → tok_xxx
                     ↓
                  (create vt_xxx)
                     ↓
        ChatGPT ← vt_xxx
           ↓
        (stores vt_xxx)
           ↓
        Your API ← vt_xxx
           ↓
        (validates)
           ↓
        (gets tok_xxx from vault)
           ↓
        Stripe ← tok_xxx
           ↓
        💰 CHARGE


┌──────────────────────────────────────────────────────────────┐
│                      DIRECT TOKEN                             │
│                    (Your Web App)                             │
└──────────────────────────────────────────────────────────────┘

User → Browser/Stripe.js → Stripe
(card)  (card)            (tokenize) → tok_xxx
          ↓
       Your Backend ← tok_xxx
          ↓
       Stripe ← tok_xxx
          ↓
       💰 CHARGE
```

---

## In Your Current Implementation

Looking at your code:

**File: `routes/delegated-payment.js`**
```javascript
// ChatGPT sends card details here
router.post("/", async (req, res) => {
  const { payment_method, allowance } = req.body;
  
  // YOUR API tokenizes with Stripe
  const stripeToken = await stripe.tokens.create({
    card: {
      number: payment_method.number,  // From ChatGPT
      exp_month: payment_method.exp_month,
      // ...
    }
  });
  
  // YOUR API creates vault token
  const vaultToken = tokenManager.storeToken({
    stripeTokenId: stripeToken.id,  // tok_xxx
    allowance,  // Constraints
    // ...
  });
  
  // Return to ChatGPT
  res.json({
    id: vaultToken.id,  // vt_xxx
    created: new Date(),
  });
});
```

**File: `routes/agentic-checkout.js`**
```javascript
// ChatGPT sends vault token here
router.post("/:id/complete", async (req, res) => {
  const { token } = req.body.payment_data;
  
  // Check what type of token
  if (token.startsWith("vt_")) {
    // It's a vault token from delegated payment
    const validation = tokenManager.validateAllowance(...);
    const realStripeToken = validation.token.stripe_token_id;
    
    // Charge using the wrapped Stripe token
    await stripe.charges.create({
      source: realStripeToken  // tok_xxx
    });
  } else {
    // It's a direct Stripe token (tok_xxx)
    await stripe.charges.create({
      source: token  // Use directly
    });
  }
});
```

---

## Summary

**Your Understanding Was Close!**

The flow is:
1. ✅ Client (ChatGPT) collects card
2. ✅ Client sends card to YOUR API (not directly to Stripe)
3. ✅ YOUR API sends to Stripe and gets tok_xxx
4. ✅ YOUR API wraps it in vt_xxx and returns to client
5. ✅ Client stores vt_xxx
6. ✅ Client sends vt_xxx back when completing purchase
7. ✅ YOUR API unwraps vt_xxx to get tok_xxx
8. ✅ YOUR API charges using tok_xxx

**The Token Play:**
- **Stripe Token (tok_xxx)** = Real tokenized card from Stripe
- **Vault Token (vt_xxx)** = Your wrapper with security constraints
- vt_xxx → tok_xxx → 💰 Charge

The vault token is like a "permission slip" that says:
- "You can charge up to $1,999"
- "Only for session cs_abc123"
- "Only until 2025-10-20"
- "Only once"

This makes delegated payments secure! 🔐

