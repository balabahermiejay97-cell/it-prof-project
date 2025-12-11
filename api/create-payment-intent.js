const Stripe = require('stripe');

module.exports = async (req, res) => {
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

  if (req.method !== 'POST') {
    res.writeHead(404, defaultHeaders);
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.VITE_STRIPE_SECRET_KEY || '';
  if (!stripeSecret) {
    res.writeHead(500, defaultHeaders);
    return res.end(JSON.stringify({ error: 'Stripe secret key not configured on server' }));
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: '2022-11-15' });

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
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

      res.writeHead(200, defaultHeaders);
      res.end(JSON.stringify({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id }));
    } catch (err) {
      console.error('Stripe function error:', err && err.message ? err.message : err);
      res.writeHead(500, defaultHeaders);
      res.end(JSON.stringify({ error: err.message || 'Internal error' }));
    }
  });
};
