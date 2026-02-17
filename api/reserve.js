// api/reserve.js - Persistent with Upstash Redis (Vercel KV)

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const LINKS_KEY = 'donation_links_pool';

async function getLinksPool() {
  const raw = await redis.get(LINKS_KEY);
  console.log('Raw value from Redis:', raw, typeof raw);

  // Force reset for this deploy only (remove after one successful test)
  const initial = {
    "100": ["https://tinyurl.com/ye7dfa8x"],
    "200": ["https://tinyurl.com/2sxktakk"],
    "300": ["https://tinyurl.com/4xjmjnex"],
    "400": ["https://tinyurl.com/3mrhab8w"],
    "500": ["https://tinyurl.com/ym6akt52"],
    "600": ["https://tinyurl.com/568t4cz8"],
    "700": ["https://tinyurl.com/3aave7py"],
    "800": ["https://tinyurl.com/ybu9ymsd"],
  };
  await redis.set(LINKS_KEY, JSON.stringify(initial));
  console.log('Forced fresh pool save');
  return initial;

  // After one good test, remove the force block above and keep only this:
  // if (!raw) { ... initialize ... }
  // try { return JSON.parse(raw); } catch (e) { ... reset ... }
}

async function saveLinksPool(pool) {
  console.log('Saving updated pool to Redis, counts:', 
    Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length]))
  );
  await redis.set(LINKS_KEY, JSON.stringify(pool));
}

let reservations = new Map(); // temporary 90-second holds

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90000) {
      reservations.delete(link);
      console.log('Expired reservation released:', link);
    }
  }
}

export default async function handler(req, res) {
  cleanExpired();

  // GET /api/reserve?all=true → availability for all amounts
  if (req.method === 'GET' && req.query.all === 'true') {
    const pool = await getLinksPool();
    const availability = {};
    for (const amount in pool) {
      const available = pool[amount].filter(link => !reservations.has(link));
      availability[amount] = available.length;
    }
    return res.json({ availability });
  }

  // GET /api/reserve?amount=XXX → reserve one link
  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount parameter' });

    const pool = await getLinksPool();
    if (!pool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = pool[amount].filter(link => !reservations.has(link));

    if (available.length === 0) {
      return res.status(503).json({ error: 'No available links for this amount (all reserved or used)' });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });
    console.log('Reserved link for $' + amount + ':', link);

    return res.json({ widgetUrl: link });
  }

  // POST /api/reserve → confirm paid or cancel reservation
  if (req.method === 'POST') {
    const { link, action } = req.body;

    if (!link || !action) return res.status(400).json({ error: 'Missing link or action' });

    const pool = await getLinksPool();

    if (action === 'paid') {
      let removed = false;
      for (const amt in pool) {
        const before = pool[amt].length;
        pool[amt] = pool[amt].filter(l => l !== link);
        if (pool[amt].length < before) removed = true;
      }
      if (removed) {
        await saveLinksPool(pool);
        console.log('Permanently removed paid link:', link);
      } else {
        console.warn('Paid link not found in pool:', link);
      }
      reservations.delete(link);
      return res.json({ success: true, message: 'Payment confirmed - link removed' });
    }

    if (action === 'cancel') {
      reservations.delete(link);
      console.log('Cancelled reservation for link:', link);
      return res.json({ success: true, message: 'Reservation cancelled - link released' });
    }

    return res.status(400).json({ error: 'Invalid action (must be "paid" or "cancel")' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}