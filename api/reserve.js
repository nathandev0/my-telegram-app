const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // Added Axios

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
  const method = req.method;

  if (method === 'GET') {
    const { all, amount } = req.query;

    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();

    if (all === 'true') {
      // Count links that are available OR reserved but expired
      const { data } = await supabase
        .from('payment_links')
        .select('amount')
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecondsAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // Reservation Logic
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

  if (method === 'POST') {
    const { link, action } = req.body;

    if (action === 'paid') {
      try {
        // 1. Get the wallet and amount from Supabase
        const { data: linkData, error: dbError } = await supabase
          .from('payment_links')
          .select('wallet_address, amount')
          .eq('url', link)
          .single();

        if (dbError || !linkData || !linkData.wallet_address) {
          return res.status(404).json({ verified: false, error: "Link or Wallet not found." });
        }

        // 2. Call Etherscan to check USDT (ERC-20) balance
        // USDT Contract: 0xdac17f958d2ee523a2206206994597c13d831ec7
        const apiKey = process.env.ETHERSCAN_API_KEY;
        const wallet = linkData.wallet_address;
        const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${wallet}&tag=latest&apikey=${apiKey}`;

        const response = await axios.get(url);
        
        // USDT has 6 decimals
        const balance = parseFloat(response.data.result) / 1000000;

        if (balance >= linkData.amount) {
          // Success!
          await supabase.from('payment_links').update({ status: 'used' }).eq('url', link);
          return res.json({ success: true, verified: true });
        } else {
          // Fail: Not enough money
          return res.status(400).json({ 
            verified: false, 
            error: `Insufficient balance. Found ${balance} USDT, expected ${linkData.amount} USDT.` 
          });
        }
      } catch (err) {
        return res.status(500).json({ verified: false, error: "Blockchain check failed. Try again." });
      }
    }

    if (action === 'cancel') {
      await supabase.from('payment_links').update({ status: 'available', reserved_at: null }).eq('url', link);
      return res.json({ success: true });
    }
  }
}

module.exports = handleReserve;