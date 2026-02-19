const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  try {
    // 1. Only grab links that are 'used' but NOT yet 'verified'
    // We also check if it's been 'used' for at least 1 minute to give the user time to pay
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const { data: pendingLinks, error: fetchError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('status', 'used')
      .eq('is_verified', false)
      .lt('reserved_at', oneMinAgo);

    if (fetchError) throw fetchError;
    if (!pendingLinks || pendingLinks.length === 0) {
      return res.json({ message: "Pool is clean. No unverified payments found." });
    }

    console.log(`Checking ${pendingLinks.length} unverified payments...`);

    for (const link of pendingLinks) {
      const wallet = link.wallet_address.toLowerCase();
      const apiKey = process.env.ETHERSCAN_API_KEY;
      const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${wallet}&tag=latest&apikey=${apiKey}`;
      
      const response = await axios.get(url);
      const balance = parseFloat(response.data.result) / 1000000;

      if (balance >= link.amount) {
        // SUCCESS: Payment found! Mark as verified so we never check again.
        await supabase.from('payment_links')
          .update({ is_verified: true })
          .eq('id', link.id);
        console.log(`Verified payment for link: ${link.id}`);
      } else {
        // FAIL: No payment found after 1 minute. Return to pool.
        await supabase.from('payment_links')
          .update({ 
            status: 'available', 
            is_verified: false, 
            reserved_at: null 
          })
          .eq('id', link.id);
        console.log(`Returned link ${link.id} to pool (Insufficient funds).`);
      }
    }

    return res.json({ status: "Success", processed: pendingLinks.length });
  } catch (err) {
    console.error("Cleanup Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};