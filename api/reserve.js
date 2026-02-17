import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const POOL_KEY = 'donation_links_pool';

async function getLinksPool() {
  console.log('Fetching pool from Redis...');
  const raw = await redis.get(POOL_KEY);
  console.log('Raw from Redis:', raw, 'type:', typeof raw);

  if (!raw) {
    console.log('Pool key missing - initializing');
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
    console.log('Initial pool saved to Redis');
    return initial;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      console.log('Parsed pool successfully, counts:', 
        Object.fromEntries(Object.entries(parsed).map(([k,v]) => [k, v.length]))
      );
      return parsed;
    } catch (e) {
      console.error('Parse failed - resetting pool', e, 'raw was:', raw);
      const initial = { /* same initial object */ };
      await redis.set(POOL_KEY, JSON.stringify(initial));
      return initial;
    }
  }

  // If somehow already an object (rare)
  console.log('Raw is already object - using as is');
  return raw;
}

async function saveLinksPool(pool) {
  console.log('Saving pool with counts:', 
    Object.fromEntries(Object.entries(pool).map(([k,v]) => [k, v.length]))
  );
  await redis.set(POOL_KEY, JSON.stringify(pool));
}

let reservations = new Map();

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90000) reservations.delete(link);
  }
}

export default async function handler(req, res) {
  cleanExpired();

  if (req.method === 'GET' && req.query.all === 'true') {
    const pool = await getLinksPool();
    const availability = {};
    for (const amount in pool) {
      const available = pool[amount].filter(l => !reservations.has(l));
      availability[amount] = available.length;
    }
    console.log('Returning availability:', availability);
    return res.json({ availability });
  }

  // ... rest of your handler code (GET reserve, POST paid/cancel) remains the same ...
  // Make sure to use getLinksPool() and saveLinksPool() in those places too
}