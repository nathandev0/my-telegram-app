// api/reserve.js - Simple & Reliable Persistent Version

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const POOL_KEY = 'donation_links_pool';

async function getPool() {
  const raw = await redis.get(POOL_KEY);
  if (!raw) {
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
    await redis.set(POOL_KEY, JSON.stringify(initial));
    console.log('Initialized fresh links pool in Redis');
    return initial;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Corrupted pool - resetting', e);
    const initial = { /* same initial object as above */ };
    await redis.set(POOL_KEY, JSON.stringify(initial));
    return initial;
  }
}

async function savePool(pool) {
  await redis.set(POOL_KEY, JSON.stringify(pool));
  console.log('Saved pool to Redis. Current counts:', 
    Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length])));
}

let reservations = new Map(); // temporary

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90000) reservations.delete(link);
  }
}

export default async function handler(req, res) {
  cleanExpired();

  // GET availability
  if (req.method === 'GET' && req.query.all === 'true') {
    const pool = await getPool();
    const availability = {};
    for (const amount in pool) {
      const available = pool[amount].filter(l => !reservations.has(l));
      availability[amount] = available.length;
    }
    return res.json({ availability });
  }

  // GET - reserve
  if (req.method === 'GET') {
    const { amount } = req.query;
    const pool = await getPool();
    if (!pool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = pool[amount].filter(l => !reservations.has(l));
    if (available.length === 0) {
      return res.status(503).json({ error: 'No available links' });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });

    return res.json({ widgetUrl: link });
  }

  // POST - paid or cancel
  if (req.method === 'POST') {
    const { link, action } = req.body;
    if (!link || !action) return res.status(400).json({ error: 'Missing params' });

    const pool = await getPool();

    if (action === 'paid') {
      let removed = false;
      for (const amt in pool) {
        const before = pool[amt].length;
        pool[amt] = pool[amt].filter(l => l !== link);
        if (pool[amt].length < before) removed = true;
      }
      if (removed) {
        await savePool(pool);
        console.log('✅ Permanently removed paid link:', link);
      }
      reservations.delete(link);
      return res.json({ success: true });
    }

    if (action === 'cancel') {
      reservations.delete(link);
      console.log('Released link back to pool:', link);
      return res.json({ success: true });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}