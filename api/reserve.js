// api/reserve.js - Final clean version with proper initialization

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function amountKey(amount) {
  return `donation_links:${amount}`;
}

async function getLinksForAmount(amount) {
  const key = amountKey(amount);
  let raw = await redis.get(key);

  if (!raw) {
    console.log(`[INIT ${amount}] No data found - creating initial links`);
    return await initializeAmount(amount);
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      console.log(`[LOAD ${amount}] Loaded ${parsed.length} links`);
      return parsed;
    }
  } catch (e) {
    console.error(`[CORRUPTED ${amount}] Resetting`, e.message);
  }

  console.log(`[RESET ${amount}] Invalid data - reinitializing`);
  return await initializeAmount(amount);
}

async function initializeAmount(amount) {
  let initial = [];
  if (amount === '100') initial = ["https://tinyurl.com/ye7dfa8x"];
  if (amount === '200') initial = ["https://tinyurl.com/2sxktakk"];
  if (amount === '300') initial = ["https://tinyurl.com/4xjmjnex"];
  if (amount === '400') initial = ["https://tinyurl.com/3mrhab8w"];
  if (amount === '500') initial = ["https://tinyurl.com/ym6akt52"];
  if (amount === '600') initial = ["https://tinyurl.com/568t4cz8"];
  if (amount === '700') initial = ["https://tinyurl.com/3aave7py"];
  if (amount === '800') initial = ["https://tinyurl.com/ybu9ymsd"];

  const key = amountKey(amount);
  await redis.set(key, JSON.stringify(initial));
  console.log(`[INIT ${amount}] Saved ${initial.length} fresh links`);
  return initial;
}

async function saveLinksForAmount(amount, links) {
  const key = amountKey(amount);
  await redis.set(key, JSON.stringify(links));
  console.log(`[SAVE ${amount}] Saved ${links.length} links`);
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
    const availability = {};
    for (const amount of ['100','200','300','400','500','600','700','800']) {
      const links = await getLinksForAmount(amount);
      const available = links.filter(l => !reservations.has(l));
      availability[amount] = available.length;
    }
    return res.json({ availability });
  }

  if (req.method === 'GET') {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ error: 'Missing amount' });

    const links = await getLinksForAmount(amount);
    const available = links.filter(l => !reservations.has(l));

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
    for (const amt of ['100','200','300','400','500','600','700','800']) {
      const links = await getLinksForAmount(amt);
      if (links.includes(link)) {
        amountFound = amt;
        break;
      }
    }

    if (!amountFound) return res.status(404).json({ error: 'Link not found' });

    if (action === 'paid') {
      let links = await getLinksForAmount(amountFound);
      links = links.filter(l => l !== link);
      await saveLinksForAmount(amountFound, links);
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