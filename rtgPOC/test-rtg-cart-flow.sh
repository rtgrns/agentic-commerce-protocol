#!/bin/bash

# RTG Cart Integration Test Script
# Tests the complete flow using RTG Cart API

set -e

BASE_URL="http://localhost:3000"
RTG_CART_URL="https://carts.rtg-dev.com"
API_VERSION="2025-09-12"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing RTG Cart Integration with Agentic Checkout${NC}"
echo "========================================================"
echo ""

# Check if server is running
echo -e "${YELLOW}Checking if server is running...${NC}"
if ! curl -s ${BASE_URL}/health > /dev/null; then
  echo -e "${RED}❌ Server is not running!${NC}"
  echo "Please start the server with: npm start"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# ============================================
# Step 1: Create RTG Cart
# ============================================
echo -e "${BLUE}🛒 Step 1: Creating RTG cart...${NC}"
RTG_CART_RESPONSE=$(curl -s -X POST ${RTG_CART_URL}/cart \
  -H "Content-Type: application/json" \
  -d '{
    "lineItems": [
      {
        "sku": "1537992P",
        "quantity": 1,
        "warrantyEnabled": false,
        "additionalOptions": {
          "selections": [],
          "addons": [],
          "completeYourSleep": []
        }
      }
    ],
    "region": "FL",
    "zone": "0",
    "distributionIndex": 10,
    "zipCode": "33101",
    "type": "online",
    "source": "desktop-web"
  }')

RTG_CART_ID=$(echo $RTG_CART_RESPONSE | jq -r '._id')
RTG_CART_TOTAL=$(echo $RTG_CART_RESPONSE | jq -r '.cartTotal')
RTG_CART_STATUS=$(echo $RTG_CART_RESPONSE | jq -r '.status')

if [ -z "$RTG_CART_ID" ] || [ "$RTG_CART_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to create RTG cart${NC}"
  echo $RTG_CART_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ RTG cart created${NC}"
echo "   Cart ID: ${RTG_CART_ID}"
echo "   Total: \$${RTG_CART_TOTAL}"
echo "   Status: ${RTG_CART_STATUS}"
echo ""

# ============================================
# Step 2: Create Agentic Checkout Session from RTG Cart
# ============================================
echo -e "${BLUE}📦 Step 2: Creating checkout session from RTG cart...${NC}"
CREATE_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_$(date +%s)_$$" \
  -d "{
    \"rtg_cart_id\": \"${RTG_CART_ID}\",
    \"buyer\": {
      \"first_name\": \"John\",
      \"last_name\": \"Doe\",
      \"email\": \"john.doe@example.com\",
      \"phone_number\": \"+1234567890\"
    }
  }")

SESSION_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
STATUS=$(echo $CREATE_RESPONSE | jq -r '.status')
LINE_ITEMS=$(echo $CREATE_RESPONSE | jq -r '.line_items | length')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to create session${NC}"
  echo $CREATE_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Session created from RTG cart${NC}"
echo "   Session ID: ${SESSION_ID}"
echo "   Status: ${STATUS}"
echo "   Line Items: ${LINE_ITEMS}"
echo ""

# ============================================
# Step 3: Add Shipping Address
# ============================================
echo -e "${BLUE}📍 Step 3: Adding shipping address...${NC}"
UPDATE1_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "fulfillment_address": {
      "name": "John Doe",
      "line_one": "123 Main Street",
      "city": "Miami",
      "state": "FL",
      "country": "US",
      "postal_code": "33101"
    }
  }')

STATUS=$(echo $UPDATE1_RESPONSE | jq -r '.status')
echo -e "${GREEN}✅ Address added${NC}"
echo "   Status: ${STATUS}"
echo ""

# ============================================
# Step 4: Select Shipping Method
# ============================================
echo -e "${BLUE}🚚 Step 4: Selecting shipping method...${NC}"
UPDATE2_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "fulfillment_option_id": "shipping_standard"
  }')

STATUS=$(echo $UPDATE2_RESPONSE | jq -r '.status')
TOTAL=$(echo $UPDATE2_RESPONSE | jq -r '.totals[] | select(.type=="total") | .amount')

echo -e "${GREEN}✅ Shipping selected${NC}"
echo "   Status: ${STATUS}"
echo "   Total: \$$(echo "scale=2; $TOTAL/100" | bc)"
echo ""

# ============================================
# Step 5: Complete Checkout
# ============================================
echo -e "${BLUE}💳 Step 5: Completing checkout with payment...${NC}"
COMPLETE_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID}/complete \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_complete_$(date +%s)_$$" \
  -d '{
    "payment_data": {
      "token": "tok_visa",
      "provider": "stripe"
    }
  }')

ORDER_ID=$(echo $COMPLETE_RESPONSE | jq -r '.order.id')
STATUS=$(echo $COMPLETE_RESPONSE | jq -r '.status')

if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to complete checkout${NC}"
  echo $COMPLETE_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Checkout completed!${NC}"
echo "   Order ID: ${ORDER_ID}"
echo "   Status: ${STATUS}"
echo ""

# ============================================
# Step 6: Verify RTG Cart Was Closed
# ============================================
echo -e "${BLUE}🔍 Step 6: Verifying RTG cart was closed...${NC}"
RTG_CART_CHECK=$(curl -s ${RTG_CART_URL}/cart/${RTG_CART_ID})
RTG_STATUS=$(echo $RTG_CART_CHECK | jq -r '.status')

if [ "$RTG_STATUS" == "closed" ]; then
  echo -e "${GREEN}✅ RTG cart successfully closed${NC}"
  echo "   Cart ID: ${RTG_CART_ID}"
  echo "   Status: ${RTG_STATUS}"
else
  echo -e "${YELLOW}⚠️  RTG cart status: ${RTG_STATUS}${NC}"
  echo "   Expected: closed"
  echo "   Note: Cart may not have closed if RTG_CART_API_KEY is not configured"
fi
echo ""

# ============================================
# Summary
# ============================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✨ RTG Cart Integration Test Complete! ✨           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "  RTG Cart ID:  ${RTG_CART_ID}"
echo "  Session ID:   ${SESSION_ID}"
echo "  Order ID:     ${ORDER_ID}"
echo "  Cart Status:  ${RTG_STATUS}"
echo "  Total:        \$$(echo "scale=2; $TOTAL/100" | bc)"
echo ""
echo "Verification:"
echo "  • RTG Cart: curl ${RTG_CART_URL}/cart/${RTG_CART_ID} | jq '.status'"
echo "  • Order:    cat data/orders.json | jq '.orders[\"${ORDER_ID}\"]'"
echo ""

