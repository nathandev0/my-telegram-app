import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function amountKey(amount) {
  return `donation_links:${amount}`;
}

function reservationKey(link) {
  return `reserve:${link}`;
}

async function getLinksForAmount(amount) {
  const key = amountKey(amount);
  const raw = await redis.get(key);

  if (!raw) {
    let initial = [];
    if (amount === '100') initial = ["https://tinyurl.com/ye7dfa8x"];
    if (amount === '200') initial = ["https://tinyurl.com/2sxktakk"];
    if (amount === '300') initial = ["https://tinyurl.com/4xjmjnex"];
    if (amount === '400') initial = ["https://tinyurl.com/3mrhab8w"];
    if (amount === '500') initial = ["https://tinyurl.com/ym6akt52"];
    if (amount === '600') initial = ["https://tinyurl.com/568t4cz8"];
    if (amount === '700') initial = ["https://tinyurl.com/3aave7py"];
    if (amount === '800') initial = ["https://tinyurl.com/ybu9ymsd"];

    await redis.set(key, JSON.stringify(initial));
    return initial;
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Corrupted data for ${amount} - resetting`, e);
    let initial = [];
    if (amount === '100') initial = ["https://tinyurl.com/ye7dfa8x"];
    // ... add others
    await redis.set(key, JSON.stringify(initial));
    return initial;
  }
}

async function saveLinksForAmount(amount, links) {
  await redis.set(amountKey(amount), JSON.stringify(links));
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query.all === 'true') {
    const availability = {};
    for (const amount of ['100','200','300','400','500','600','700','800']) {
      const links = await getLinksForAmount(amount);
      availability[amount] = links.length;
    }
    return res.json({ availability });
  }

  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const links = await getLinksForAmount(amount);
    if (links.length === 0) {
      return res.status(503).json({ error: 'No available links for this amount' });
    }

    // Atomic reservation using Redis lock
    const link = links[0]; // take first (or random if you want)
    const lockKey = reservationKey(link);
    const acquired = await redis.set(lockKey, 'locked', { NX: true, PX: 90000 }); // 90s TTL

    if (!acquired) {
      return res.status(503).json({ error: 'Link is currently reserved by another user - try again in a minute' });
    }

    // Remove from pool (permanent if paid later)
    const updatedLinks = links.slice(1); // remove first link
    await saveLinksForAmount(amount, updatedLinks);

    return res.json({ widgetUrl: link });
  }

  if (req.method === 'POST') {
    const { link, action } = req.body;
    if (!link || !action) return res.status(400).json({ error: 'Missing params' });

    const lockKey = reservationKey(link);
    await redis.del(lockKey); // release lock on cancel or paid

    if (action === 'paid') {
      // Already removed in reserve step - no need to do again
      return res.json({ success: true });
    }

    if (action === 'cancel') {
      // Put back to pool (since paid already removed it)
      let amountFound = null;
      for (const amt of ['100','200','300','400','500','600','700','800']) {
        const links = await getLinksForAmount(amt);
        if (links.includes(link)) {
          amountFound = amt;
          break;
        }
      }
      if (amountFound) {
        let links = await getLinksForAmount(amountFound);
        links.push(link);
        await saveLinksForAmount(amountFound, links);
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}