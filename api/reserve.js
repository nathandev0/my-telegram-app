import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const POOL_KEY = 'donation_links_pool';

async function getLinksPool() {
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
    return initial;
  }
  return JSON.parse(raw);
}

async function saveLinksPool(pool) {
  await redis.set(POOL_KEY, JSON.stringify(pool));
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query.all === 'true') {
    const pool = await getLinksPool();
    const availability = {};
    for (const amount in pool) {
      availability[amount] = pool[amount].length;
    }
    return res.json({ availability });
  }

  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const pool = await getLinksPool();
    if (!pool[amount] || pool[amount].length === 0) {
      return res.status(503).json({ error: 'No available links for this amount' });
    }

    // Atomic lock: try to reserve the first available link
    const link = pool[amount][0]; // take first (you can randomize later)
    const lockKey = `lock:${link}`;
    const acquired = await redis.set(lockKey, 'locked', { NX: true, PX: 90000 }); // 90s TTL

    if (!acquired) {
      return res.status(503).json({ error: 'This link is currently being used by another user. Try again in 90 seconds.' });
    }

    // Remove from pool (optimistic - if paid later, it's gone)
    pool[amount] = pool[amount].slice(1);
    await saveLinksPool(pool);

    return res.json({ widgetUrl: link });
  }

  if (req.method === 'POST') {
    const { link, action } = req.body;
    if (!link || !action) return res.status(400).json({ error: 'Missing params' });

    const lockKey = `lock:${link}`;
    await redis.del(lockKey); // release lock

    if (action === 'paid') {
      // Already removed on reserve - nothing more needed
      return res.json({ success: true });
    }

    if (action === 'cancel') {
      // Add back to pool if cancelled
      const pool = await getLinksPool();
      let added = false;
      for (const amt in pool) {
        if (!pool[amt].includes(link)) {
          pool[amt].push(link);
          added = true;
          break;
        }
      }
      if (added) await saveLinksPool(pool);
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}