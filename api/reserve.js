// api/reserve.js — Static JSON file (read-only, permanent status)

const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '../links-status.json');

let pool;
try {
  const data = fs.readFileSync(STATUS_FILE, 'utf8');
  pool = JSON.parse(data);
  console.log('Loaded static links-status.json');
} catch (e) {
  console.error('Failed to load links-status.json - using fallback', e);
  pool = {
    "100": { links: ["https://tinyurl.com/ye7dfa8x"], statuses: {"https://tinyurl.com/ye7dfa8x": "available"} },
    "200": { links: ["https://tinyurl.com/2sxktakk"], statuses: {"https://tinyurl.com/2sxktakk": "available"} },
    "300": { links: ["https://tinyurl.com/4xjmjnex"], statuses: {"https://tinyurl.com/4xjmjnex": "available"} },
    "400": { links: ["https://tinyurl.com/3mrhab8w"], statuses: {"https://tinyurl.com/3mrhab8w": "available"} },
    "500": { links: ["https://tinyurl.com/ym6akt52"], statuses: {"https://tinyurl.com/ym6akt52": "available"} },
    "600": { links: ["https://tinyurl.com/568t4cz8"], statuses: {"https://tinyurl.com/568t4cz8": "available"} },
    "700": { links: ["https://tinyurl.com/3aave7py"], statuses: {"https://tinyurl.com/3aave7py": "available"} },
    "800": { links: ["https://tinyurl.com/ybu9ymsd"], statuses: {"https://tinyurl.com/ybu9ymsd": "available"} },
  };
}

let reservations = new Map(); // temporary 90s "in-use"

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 90000) {
      reservations.delete(link);
      // Optional: update status back to "available" if needed (but not necessary here)
    }
  }
}

export default async function handler(req, res) {
  cleanExpired();

  if (req.method === 'GET' && req.query.all === 'true') {
    const availability = {};
    for (const amount in pool) {
      const statuses = pool[amount].statuses || {};
      let count = 0;
      for (const url in statuses) {
        if (statuses[url] === 'available' && !reservations.has(url)) count++;
      }
      availability[amount] = count;
    }
    return res.json({ availability });
  }

  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!pool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const statuses = pool[amount].statuses || {};
    const available = [];
    for (const url in statuses) {
      if (statuses[url] === 'available' && !reservations.has(url)) available.push(url);
    }

    if (available.length === 0) {
      return res.status(503).json({ error: 'No available links for this amount' });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });

    return res.json({ widgetUrl: link });
  }

  if (req.method === 'POST') {
    const { link, action } = req.body;
    if (!link || !action) return res.status(400).json({ error: 'Missing params' });

    let amountFound = null;
    for (const amt in pool) {
      if (pool[amt].statuses && pool[amt].statuses[link]) {
        amountFound = amt;
        break;
      }
    }

    if (!amountFound) return res.status(404).json({ error: 'Link not found' });

    if (action === 'paid') {
      pool[amountFound].statuses[link] = 'used';
      // Here you would normally write back to file, but since static → manual
      reservations.delete(link);
      console.log(`Marked as used: ${link} for $${amountFound} (manual file update needed)`);
      return res.json({ success: true, message: 'Marked as used - please update links-status.json manually' });
    }

    if (action === 'cancel') {
      pool[amountFound].statuses[link] = 'available';
      reservations.delete(link);
      console.log(`Released back: ${link} for $${amountFound} (manual file update needed)`);
      return res.json({ success: true });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}