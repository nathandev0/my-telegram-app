const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  // This allows you to open it in your browser to test
  try {
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // 1. Only grab 'used' but 'unverified' links
    const { data: pendingLinks, error: fetchError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('status', 'used')
      .eq('is_verified', false)
      .lt('reserved_at', oneMinAgo);

    if (fetchError) throw fetchError;

    if (!pendingLinks || pendingLinks.length === 0) {
      return res.json({ 
        status: "success", 
        message: "Pool is already clean. No unverified links to check." 
      });
    }

    let restored = 0;
    let verified = 0;

    for (const link of pendingLinks) {
      const wallet = link.wallet_address.toLowerCase();
      const apiKey = process.env.ETHERSCAN_API_KEY;
      const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${wallet}&tag=latest&apikey=${apiKey}`;
      
      const response = await axios.get(url);
      const balance = parseFloat(response.data.result) / 1000000;

      if (balance >= link.amount) {
        await supabase.from('payment_links').update({ is_verified: true }).eq('id', link.id);
        verified++;
      } else {
        // Return to available pool
        await supabase.from('payment_links').update({ 
          status: 'available', 
          is_verified: false, 
          reserved_at: null 
        }).eq('id', link.id);
        restored++;
      }
    }

    return res.json({ 
      status: "success", 
      checked: pendingLinks.length, 
      verified_now: verified, 
      returned_to_pool: restored 
    });

  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};