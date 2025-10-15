#!/bin/bash

# Agentic Checkout Flow Test Script
# This script tests the complete checkout flow with the Agentic Commerce Protocol

set -e  # Exit on error

BASE_URL="http://localhost:3000"
API_VERSION="2025-09-12"
DELEGATED_API_VERSION="2025-09-29"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Testing Agentic Checkout Flow${NC}"
echo "================================="
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

# Get a product ID from the feed
echo -e "${YELLOW}Fetching product from feed...${NC}"
PRODUCT_ID=$(curl -s ${BASE_URL}/api/products/feed | jq -r '.products[0].id')
if [ -z "$PRODUCT_ID" ] || [ "$PRODUCT_ID" == "null" ]; then
  echo -e "${RED}❌ Could not get product ID from feed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Using product ID: ${PRODUCT_ID}${NC}"
echo ""

# ============================================
# Test 1: Create Checkout Session
# ============================================
echo -e "${BLUE}📦 Step 1: Creating checkout session...${NC}"
CREATE_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -H "Idempotency-Key: idem_$(date +%s)_$$" \
  -d "{
    \"buyer\": {
      \"first_name\": \"John\",
      \"last_name\": \"Doe\",
      \"email\": \"john.doe@example.com\",
      \"phone_number\": \"+1234567890\"
    },
    \"items\": [
      {
        \"id\": \"${PRODUCT_ID}\",
        \"quantity\": 1
      }
    ]
  }")

SESSION_ID=$(echo $CREATE_RESPONSE | jq -r '.id')
STATUS=$(echo $CREATE_RESPONSE | jq -r '.status')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to create session${NC}"
  echo $CREATE_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Session created${NC}"
echo "   Session ID: ${SESSION_ID}"
echo "   Status: ${STATUS}"
echo ""

# ============================================
# Test 2: Add Shipping Address
# ============================================
echo -e "${BLUE}📍 Step 2: Adding shipping address...${NC}"
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
FULFILLMENT_OPTIONS=$(echo $UPDATE1_RESPONSE | jq -r '.fulfillment_options | length')

echo -e "${GREEN}✅ Address added${NC}"
echo "   Status: ${STATUS}"
echo "   Available shipping options: ${FULFILLMENT_OPTIONS}"
echo ""

# ============================================
# Test 3: Select Shipping Method
# ============================================
echo -e "${BLUE}🚚 Step 3: Selecting shipping method...${NC}"
UPDATE2_RESPONSE=$(curl -s -X POST ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "Content-Type: application/json" \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123" \
  -d '{
    "fulfillment_option_id": "shipping_standard"
  }')

STATUS=$(echo $UPDATE2_RESPONSE | jq -r '.status')
TOTAL=$(echo $UPDATE2_RESPONSE | jq -r '.totals[] | select(.type=="total") | .amount')
CURRENCY=$(echo $UPDATE2_RESPONSE | jq -r '.currency')

echo -e "${GREEN}✅ Shipping selected${NC}"
echo "   Status: ${STATUS}"
echo "   Total: \$$(echo "scale=2; $TOTAL/100" | bc) ${CURRENCY}"
echo ""

# ============================================
# Test 4: Get Session Status
# ============================================
echo -e "${BLUE}🔍 Step 4: Getting session status...${NC}"
GET_RESPONSE=$(curl -s -X GET ${BASE_URL}/checkout_sessions/${SESSION_ID} \
  -H "API-Version: ${API_VERSION}" \
  -H "Authorization: Bearer test_key_123")

LINE_ITEMS=$(echo $GET_RESPONSE | jq -r '.line_items | length')
MESSAGES=$(echo $GET_RESPONSE | jq -r '.messages | length')

echo -e "${GREEN}✅ Session retrieved${NC}"
echo "   Line items: ${LINE_ITEMS}"
echo "   Messages: ${MESSAGES}"
echo ""

# Save full response
echo $GET_RESPONSE | jq '.' > "session_${SESSION_ID}.json"
echo -e "   Full response saved to: ${GREEN}session_${SESSION_ID}.json${NC}"
echo ""

# ============================================
# Test 5: Complete Checkout with Direct Token
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
PERMALINK=$(echo $COMPLETE_RESPONSE | jq -r '.order.permalink_url')

if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" == "null" ]; then
  echo -e "${RED}❌ Failed to complete checkout${NC}"
  echo $COMPLETE_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Checkout completed!${NC}"
echo "   Order ID: ${ORDER_ID}"
echo "   Status: ${STATUS}"
echo "   Permalink: ${PERMALINK}"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✨ Test Completed Successfully! ✨   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "  Session ID: ${SESSION_ID}"
echo "  Order ID:   ${ORDER_ID}"
echo "  Status:     ${STATUS}"
echo "  Total:      \$$(echo "scale=2; $TOTAL/100" | bc) ${CURRENCY}"
echo ""
echo "Next steps:"
echo "  • View session: cat session_${SESSION_ID}.json | jq '.'"
echo "  • View order:   cat data/orders.json | jq '.orders[\"${ORDER_ID}\"]'"
echo "  • Check logs:   View server console for webhook attempts"
echo ""

