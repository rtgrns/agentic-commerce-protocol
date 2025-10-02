// Checkout API - Purchase process
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Stripe = require('stripe');

// Initialize Stripe (test mode)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper functions for data management
function readProducts() {
  const productsPath = path.join(__dirname, '../data/products.json');
  const data = fs.readFileSync(productsPath, 'utf8');
  return JSON.parse(data);
}

function getProduct(productId) {
  const { products } = readProducts();
  return products.find(p => p.id === productId);
}

function readOrders() {
  const ordersPath = path.join(__dirname, '../data/orders.json');
  const data = fs.readFileSync(ordersPath, 'utf8');
  return JSON.parse(data);
}

function writeOrders(data) {
  const ordersPath = path.join(__dirname, '../data/orders.json');
  fs.writeFileSync(ordersPath, JSON.stringify(data, null, 2));
}

// POST /api/checkout/initiate - Initiate checkout process
router.post('/initiate', async (req, res) => {
  try {
    const { product_id, quantity, buyer_info } = req.body;

    // Validations
    if (!product_id || !quantity || !buyer_info) {
      return res.status(400).json({
        error: 'Required fields: product_id, quantity, buyer_info'
      });
    }

    // Verify product exists
    const product = getProduct(product_id);
    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        product_id
      });
    }

    // Verify availability
    if (product.availability !== 'in_stock') {
      return res.status(400).json({
        error: 'Product not available',
        availability: product.availability
      });
    }

    // Verify stock
    if (product.stock_quantity < quantity) {
      return res.status(400).json({
        error: 'Insufficient stock',
        available: product.stock_quantity,
        requested: quantity
      });
    }

    // Calculate prices
    const subtotal = product.price * quantity;
    const tax = subtotal * 0.08; // 8% tax
    const shipping = 5.99;
    const total = subtotal + tax + shipping;

    // Generate checkout ID
    const checkoutId = `chk_${uuidv4()}`;

    // Calculate expiration date (30 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Create checkout
    const checkout = {
      checkout_id: checkoutId,
      status: 'initiated',
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency
      },
      quantity,
      buyer_info,
      breakdown: {
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        shipping: shipping,
        total: parseFloat(total.toFixed(2))
      },
      currency: product.currency,
      available_payment_methods: ['card', 'apple_pay', 'google_pay'],
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString()
    };

    // Save to orders.json
    const ordersData = readOrders();
    ordersData.checkouts[checkoutId] = checkout;
    writeOrders(ordersData);

    console.log('✅ Checkout initiated:', checkoutId, '-', product.name);

    res.status(201).json(checkout);
  } catch (error) {
    console.error('❌ Error initiating checkout:', error);
    res.status(500).json({
      error: 'Error initiating checkout',
      details: error.message
    });
  }
});

// POST /api/checkout/confirm - Confirm and process payment
router.post('/confirm', async (req, res) => {
  try {
    const { checkout_id, payment_method } = req.body;

    // Validations
    if (!checkout_id || !payment_method) {
      return res.status(400).json({
        error: 'Required fields: checkout_id, payment_method'
      });
    }

    // Get checkout
    const ordersData = readOrders();
    const checkout = ordersData.checkouts[checkout_id];

    if (!checkout) {
      return res.status(404).json({
        error: 'Checkout not found',
        checkout_id
      });
    }

    // Verify status
    if (checkout.status !== 'initiated') {
      return res.status(400).json({
        error: 'Checkout already processed',
        current_status: checkout.status
      });
    }

    // Verify expiration
    const now = new Date();
    const expiresAt = new Date(checkout.expires_at);
    if (now > expiresAt) {
      checkout.status = 'expired';
      ordersData.checkouts[checkout_id] = checkout;
      writeOrders(ordersData);

      return res.status(400).json({
        error: 'Checkout has expired',
        expires_at: checkout.expires_at
      });
    }

    // Create PaymentIntent with Stripe (simulated for POC)
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(checkout.breakdown.total * 100), // Convert to cents
        currency: checkout.currency.toLowerCase(),
        payment_method_types: [payment_method === 'card' ? 'card' : payment_method],
        description: `Purchase: ${checkout.product.name}`,
        metadata: {
          checkout_id: checkout_id,
          product_id: checkout.product.id,
          merchant_id: process.env.MERCHANT_ID
        }
      });

      console.log('💳 PaymentIntent created:', paymentIntent.id);
    } catch (stripeError) {
      console.error('❌ Stripe error:', stripeError.message);
      // In POC, we continue even if Stripe fails (placeholder api key)
    }

    // Generate order ID and confirmation number
    const orderId = `ord_${uuidv4()}`;
    const confirmationNumber = `CONF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Calculate estimated delivery date (+7 days)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);

    // Create order
    const order = {
      order_id: orderId,
      checkout_id: checkout_id,
      status: 'confirmed',
      confirmation_number: confirmationNumber,
      product: checkout.product,
      quantity: checkout.quantity,
      buyer_info: checkout.buyer_info,
      payment: {
        method: payment_method,
        stripe_payment_intent_id: paymentIntent?.id || 'pi_test_simulated',
        status: paymentIntent?.status || 'simulated'
      },
      breakdown: checkout.breakdown,
      total: checkout.breakdown.total,
      currency: checkout.currency,
      created_at: new Date().toISOString(),
      estimated_delivery: estimatedDelivery.toISOString(),
      tracking_url: `https://tracking.example.com/order/${orderId}`
    };

    // Save order
    ordersData.orders[orderId] = order;

    // Update checkout status
    checkout.status = 'completed';
    checkout.order_id = orderId;
    checkout.completed_at = new Date().toISOString();
    ordersData.checkouts[checkout_id] = checkout;

    writeOrders(ordersData);

    console.log('✅ Order confirmed:', orderId, '-', confirmationNumber);

    // Response according to ACP specification
    const response = {
      order_id: orderId,
      status: 'confirmed',
      confirmation_number: confirmationNumber,
      total: order.total,
      currency: order.currency,
      estimated_delivery: order.estimated_delivery,
      tracking_url: order.tracking_url
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('❌ Error confirming checkout:', error);
    res.status(500).json({
      error: 'Error confirming checkout',
      details: error.message
    });
  }
});

// GET /api/checkout/:id/status - Get checkout status
router.get('/:id/status', (req, res) => {
  try {
    const checkoutId = req.params.id;
    const ordersData = readOrders();
    const checkout = ordersData.checkouts[checkoutId];

    if (!checkout) {
      return res.status(404).json({
        error: 'Checkout not found',
        checkout_id: checkoutId
      });
    }

    console.log('✅ Checkout status queried:', checkoutId, '-', checkout.status);

    res.json({
      checkout_id: checkoutId,
      status: checkout.status,
      created_at: checkout.created_at,
      expires_at: checkout.expires_at,
      order_id: checkout.order_id || null,
      completed_at: checkout.completed_at || null
    });
  } catch (error) {
    console.error('❌ Error querying status:', error);
    res.status(500).json({
      error: 'Error querying checkout status'
    });
  }
});

// GET /api/checkout/orders/:id - Get order details
router.get('/orders/:id', (req, res) => {
  try {
    const orderId = req.params.id;
    const ordersData = readOrders();
    const order = ordersData.orders[orderId];

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
        order_id: orderId
      });
    }

    console.log('✅ Order queried:', orderId);

    res.json(order);
  } catch (error) {
    console.error('❌ Error querying order:', error);
    res.status(500).json({
      error: 'Error querying order'
    });
  }
});

module.exports = router;
