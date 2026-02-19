const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
  const method = req.method;
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();

  if (method === 'GET') {
    const { all, amount } = req.query;
    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount')
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecondsAgo})`);
      const counts = data.reduce((acc, curr) => { 
        acc[curr.amount] = (acc[curr.amount] || 0) + 1; 
        return acc; 
      }, {});
      return res.json({ availability: counts });
    }
    
    const { data: link, error } = await supabase.from('payment_links').select('*')
      .eq('amount', amount)
      .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecondsAgo})`)
      .limit(1).single();

    if (error || !link) return res.status(404).json({ error: "No links available." });

    await supabase.from('payment_links').update({ 
        status: 'reserved', 
        reserved_at: new Date().toISOString() 
    }).eq('id', link.id);

    return res.json({ widgetUrl: link.url });
  }

  if (method === 'POST') {
    const { link, action } = req.body;

    if (action === 'paid') {
      // 1. Mark as 'used' immediately so it's hidden from other users
      await supabase.from('payment_links').update({ status: 'used' }).eq('url', link);
      
      // 2. Background check after 1 minute
      setTimeout(async () => {
        try {
          const { data: linkData } = await supabase.from('payment_links')
            .select('id, wallet_address, amount').eq('url', link).single();

          if (!linkData) return;

          const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${linkData.wallet_address}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`;
          const response = await axios.get(url);
          const balance = parseFloat(response.data.result) / 1000000;

          // --- FIX: If balance is low, force the status back to 'reserved' ---
          if (balance < linkData.amount) {
            await supabase.from('payment_links').update({ 
                status: 'reserved', 
                reserved_at: new Date().toISOString() // This gives it 30s before 'GET' makes it available
            }).eq('id', linkData.id);
            console.log(`Payment failed for ${link}. Link returned to pool.`);
          } else {
            console.log(`Payment confirmed for ${link}. Leaving as 'used'.`);
          }
        } catch (err) {
          console.error("Background check error:", err.message);
        }
      }, 60000);

      return res.json({ success: true });
    }

    if (action === 'cancel') {
      await supabase.from('payment_links').update({ status: 'available', reserved_at: null }).eq('url', link);
      return res.json({ success: true });
    }
  }
}

module.exports = handleReserve;