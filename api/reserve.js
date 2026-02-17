// api/reserve.js  ← Vercel serverless function
const linksPool = {
  "100": ["https://tinyurl.com/ye7dfa8x"],
  "200": ["https://tinyurl.com/2sxktakk"],
  "300": ["https://tinyurl.com/4xjmjnex"],
  "400": ["https://tinyurl.com/3mrhab8w"],
  "500": ["https://tinyurl.com/ym6akt52"],
  "600": ["https://tinyurl.com/568t4cz8"],
  "700": ["https://tinyurl.com/3aave7py"],
  "800": ["https://tinyurl.com/ybu9ymsd"],
};

let reservations = new Map(); // link → { reservedAt: timestamp }

function cleanExpired() {
  const now = Date.now();
  for (const [link, data] of reservations.entries()) {
    if (now - data.reservedAt > 60_000) { // 60 seconds
      reservations.delete(link);
    }
  }
}

export default async function handler(req, res) {
  cleanExpired();

  // ====================== RESERVE ======================
  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!linksPool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = linksPool[amount].filter(link => !reservations.has(link));

    if (available.length === 0) {
      return res.status(503).json({ 
        error: 'All links for this amount are currently reserved. Try again in 60 seconds.' 
      });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });

    return res.json({ widgetUrl: link, reserved: true });
  }

  // ====================== CONFIRM / CANCEL ======================
  if (req.method === 'POST') {
    const { link, action } = req.body; // action = "paid" or "cancel"

    if (action === "paid") {
      // Permanently remove from pool
      for (const amt in linksPool) {
        linksPool[amt] = linksPool[amt].filter(l => l !== link);
      }
      reservations.delete(link);
      return res.json({ success: true, message: "Wallet marked as USED forever" });
    }

    if (action === "cancel") {
      reservations.delete(link);
      return res.json({ success: true, message: "Link released back to pool" });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}