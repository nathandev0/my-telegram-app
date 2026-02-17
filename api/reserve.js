// api/reserve.js — Vercel Blob — permanent link removal

import { put, get } from '@vercel/blob';

const BLOB_PATH = 'donation-links.json';

async function getLinksPool() {
  try {
    const { url } = await get(BLOB_PATH);
    if (!url) throw new Error('Blob not found');

    const res = await fetch(url + '?_=' + Date.now());
    if (!res.ok) throw new Error('Fetch failed');

    const pool = await res.json();
    console.log('Loaded pool from Blob — counts:', 
      Object.fromEntries(Object.entries(pool).map(([k,v]) => [k, v.length]))
    );
    return pool;
  } catch (e) {
    console.log('Blob missing/error — initializing fresh pool', e);
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
    await put(BLOB_PATH, JSON.stringify(initial), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log('Fresh initial pool saved to Blob');
    return initial;
  }
}

async function saveLinksPool(pool) {
  await put(BLOB_PATH, JSON.stringify(pool), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log('Updated pool saved to Blob — counts:', 
    Object.fromEntries(Object.entries(pool).map(([k,v]) => [k, v.length]))
  );
}

let reservations = new Map(); // temporary 90s reservation

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
    return res.json({ availability });
  }

  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const pool = await getLinksPool();
    if (!pool[amount]) return res.status(400).json({ error: 'Invalid amount' });

    const available = pool[amount].filter(l => !reservations.has(l));
    if (available.length === 0) {
      return res.status(503).json({ error: 'No available links' });
    }

    const link = available[0];
    reservations.set(link, { reservedAt: Date.now() });

    return res.json({ widgetUrl: link });
  }

  if (req.method === 'POST') {
    const { link, action } = req.body;
    if (!link || !action) return res.status(400).json({ error: 'Missing params' });

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
      }
      reservations.delete(link);
      return res.json({ success: true });
    }

    if (action === 'cancel') {
      reservations.delete(link);
      return res.json({ success: true });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}