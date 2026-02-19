const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function sendTelegramAlert(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.ADMIN_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (e) { console.error("TG Alert Error:", e.message); }
}

module.exports = async (req, res) => {
  try {
    // FORCE 5 MINUTE GRACE PERIOD
    // We only check links where 'reserved_at' is older than 5 minutes ago
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: pendingLinks, error: fetchError } = await supabase
      .from('payment_links')
      .select('*')
      .eq('status', 'used')
      .eq('is_verified', false)
      .lt('reserved_at', fiveMinsAgo); // This is the 5-minute lock

    if (fetchError) throw fetchError;
    if (!pendingLinks || pendingLinks.length === 0) {
      return res.json({ status: "success", message: "No links past the 5-minute grace period yet." });
    }

    let restored = 0;
    let verified = 0;

    for (const link of pendingLinks) {
      const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${link.wallet_address}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`;
      const response = await axios.get(url);
      const balance = parseFloat(response.data.result) / 1000000;

      if (balance >= link.amount) {
        await supabase.from('payment_links').update({ is_verified: true }).eq('id', link.id);
        await sendTelegramAlert(`✅ <b>PAYMENT CONFIRMED</b>\nReceived: ${balance} USDT\nAmount: $${link.amount}\nWallet: <code>${link.wallet_address}</code>`);
      } else {
        await supabase.from('payment_links').update({ 
          status: 'available', 
          is_verified: false, 
          reserved_at: null 
        }).eq('id', link.id);
        await sendTelegramAlert(`❌ <b>PAYMENT FAILED</b>\nReturned to pool: $${link.amount}\nReason: No funds found.\nWallet: <code>${link.wallet_address}</code>`);
      }
    }

    return res.json({ status: "success", checked: pendingLinks.length, verified, restored });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};