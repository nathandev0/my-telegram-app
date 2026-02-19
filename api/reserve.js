const { createClient } = require('@supabase/supabase-js');

// These will be pulled from Render's settings later
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
const method = req.method;
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();

  if (method === 'GET') {
    const { all, amount } = req.query;

    // --- FIX: Updated count logic ---
    if (all === 'true') {
      const { data } = await supabase
        .from('payment_links')
        .select('amount')
        // Count it if it's 'available' OR ('reserved' AND expired)
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecondsAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // --- Reservation Logic (Already correct, but keep as is) ---
    const { data: link, error } = await supabase
    .from('payment_links')
    .select('*')
    .eq('amount', amount)
    .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecondsAgo})`)
    .limit(1)
    .single();

    if (error || !link) {
      return res.status(404).json({ error: "No links available right now." });
    }

    await supabase
      .from('payment_links')
      .update({ 
        status: 'reserved', 
        reserved_at: new Date().toISOString() 
      })
      .eq('id', link.id);

    return res.json({ widgetUrl: link.url });
  }

  const axios = require('axios');

  // ... (top of file remains same)

  if (method === 'POST') {
    const { link, action, amount } = req.body;

    if (action === 'paid') {
      // 1. Fetch the wallet and current status from DB
      const { data: linkData, error } = await supabase
        .from('payment_links')
        .select('wallet_address, amount, status')
        .eq('url', link)
        .single();

      if (!linkData || !linkData.wallet_address) {
        return res.status(404).json({ error: "Wallet not found for this link." });
      }

      // 2. Call Etherscan to check USDT (ERC-20) balance
      const USDT_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
      const apiKey = process.env.ETHERSCAN_API_KEY;
      const wallet = linkData.wallet_address;
      
      const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${USDT_CONTRACT}&address=${wallet}&tag=latest&apikey=${apiKey}`;

      try {
        const response = await axios.get(url);
        // USDT has 6 decimals
        const balance = parseFloat(response.data.result) / 1000000; 

        if (balance >= linkData.amount) {
          // SUCCESS: Mark as used
          await supabase.from('payment_links').update({ status: 'used' }).eq('url', link);
          return res.json({ success: true, verified: true });
        } else {
          // FAIL: Not enough money yet
          return res.status(400).json({ 
            verified: false, 
            error: `Payment not detected. Wallet balance: ${balance} USDT. Required: ${linkData.amount} USDT.` 
          });
        }
      } catch (err) {
        return res.status(500).json({ error: "Blockchain busy. Try again in 10 seconds." });
      }
    }

    // Handle manual cancel
    if (action === 'cancel') {
      await supabase.from('payment_links').update({ status: 'available', reserved_at: null }).eq('url', link);
      return res.json({ success: true });
    }
  }
}

module.exports = handleReserve;