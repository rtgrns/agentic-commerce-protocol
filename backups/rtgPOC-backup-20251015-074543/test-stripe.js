require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function testStripeConnection() {
  try {
    // Crear un PaymentIntent de prueba
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00
      currency: "usd",
      metadata: { test: true },
    });

    console.log("✅ Stripe conectado correctamente!");
    console.log("💳 PaymentIntent creado:", paymentIntent.id);
    console.log("📊 Estado:", paymentIntent.status);
  } catch (error) {
    console.error("❌ Error conectando con Stripe:", error.message);
  }
}

testStripeConnection();
