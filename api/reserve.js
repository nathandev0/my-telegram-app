// api/reserve.js

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const LINKS_KEY = 'donation_links_pool';

async function getLinksPool() {
  const raw = await redis.get(LINKS_KEY);

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
    await redis.set(LINKS_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Corrupted Redis value for links pool - resetting', e, raw);
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
    return initial;
  }
}

async function saveLinksPool(pool) {
  await redis.set(LINKS_KEY, JSON.stringify(pool));
}

let reservations = new Map(); // temporary reservations (in-memory, short-lived)

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90000) { // 90 seconds
      reservations.delete(link);
    }
  }
}

export default async function handler(req, res) {
  cleanExpired();

  // GET availability for all amounts
  if (req.method === 'GET' && req.query.all === 'true') {
    const pool = await getLinksPool();
    const availability = {};
    for (const amount in pool) {
      const available = pool[amount].filter(link => !reservations.has(link));
      availability[amount] = available.length;
    }
    return res.json({ availability });
  }

  // GET - reserve one link
  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const pool = await getLinksPool();
    if (!pool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = pool[amount].filter(link => !reservations.has(link));

    if (available.length === 0) {
      return res.status(503).json({ error: 'All links for this amount are currently reserved or used.' });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });

    return res.json({ widgetUrl: link });
  }

  // POST - paid or cancel
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
      }
      reservations.delete(link);
      return res.json({ success: true, message: 'Link permanently removed' });
    }

    if (action === 'cancel') {
      reservations.delete(link);
      return res.json({ success: true, message: 'Reservation cancelled' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}