// api/reserve.js - FIXED permanent paid links removal

// This stays in memory across requests (until Vercel cold start)
let linksPool = {
  "100": ["https://tinyurl.com/ye7dfa8x"],
  "200": ["https://tinyurl.com/2sxktakk"],
  "300": ["https://tinyurl.com/4xjmjnex"],
  "400": ["https://tinyurl.com/3mrhab8w"],
  "500": ["https://tinyurl.com/ym6akt52"],
  "600": ["https://tinyurl.com/568t4cz8"],
  "700": ["https://tinyurl.com/3aave7py"],
  "800": ["https://tinyurl.com/ybu9ymsd"],
};

let reservations = new Map();   // temporary 90-second reservations

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90_000) {
      reservations.delete(link);
    }
  }
}

export default async function handler(req, res) {
  cleanExpired();

  // GET availability for all amounts
  if (req.method === 'GET' && req.query.all === 'true') {
    const availability = {};
    for (const amount in linksPool) {
      const available = linksPool[amount].filter(link => !reservations.has(link));
      availability[amount] = available.length;
    }
    return res.json({ availability });
  }

  // GET - reserve one link
  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!linksPool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = linksPool[amount].filter(link => !reservations.has(link));

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

    if (action === 'paid') {
      let removed = false;

      // Permanently delete the link from ALL amounts
      for (const amt in linksPool) {
        const before = linksPool[amt].length;
        linksPool[amt] = linksPool[amt].filter(l => l !== link);
        if (linksPool[amt].length < before) removed = true;
      }

      reservations.delete(link);

      if (removed) {
        return res.json({ success: true });
      } else {
        return res.status(404).json({ error: 'Link not found' });
      }
    }

    if (action === 'cancel') {
      reservations.delete(link);
      return res.json({ success: true });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}