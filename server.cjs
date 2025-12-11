require('dotenv').config({ path: '.env.local' });
const http = require('http');
const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.VITE_STRIPE_SECRET_KEY || '';
const masked = stripeSecret ? (stripeSecret.slice(0, 6) + '...' + stripeSecret.slice(-6)) : '(none)';
console.log('✅ Stripe server starting — secret key:', masked);
const stripe = require('stripe')(stripeSecret);

const PORT = process.env.PORT || 4242;

const server = http.createServer(async (req, res) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, defaultHeaders);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/create-payment-intent') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        console.log('📨 Received from frontend:', payload);
        const amount = Number(payload.amount || 0);
        if (!amount || amount <= 0) {
          res.writeHead(400, defaultHeaders);
          return res.end(JSON.stringify({ error: 'Invalid amount' }));
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: payload.currency || 'usd',
          payment_method_types: ['card'],
          metadata: {
            email: payload.email || '',
            fullName: payload.fullName || '',
            userId: payload.userId || '',
          },
          description: payload.fullName ? `Payment for ${payload.fullName}` : 'Payment',
        });
        console.log('✅ PaymentIntent created:', paymentIntent.id, `amount=${paymentIntent.amount}`, `status=${paymentIntent.status}`, `customer=${paymentIntent.metadata.fullName}`);

        res.writeHead(200, defaultHeaders);
        res.end(JSON.stringify({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id }));
      } catch (err) {
        console.error('❌ Payment error:', err.message || err);
        res.writeHead(500, defaultHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🚀 Stripe payment server running on http://localhost:${PORT}`);
});
