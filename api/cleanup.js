const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function sendTelegramAlert(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.ADMIN_CHAT_ID;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (e) { console.error("TG Alert Error:", e.response ? e.response.data : e.message); }
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

    if (!pendingLinks || pendingLinks.length === 0) {
      return res.json({ status: "success", message: "No links past the 5-minute grace period yet." });
    }

    for (const link of pendingLinks) {
      const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7&address=${link.wallet_address}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`;
      const response = await axios.get(url);
      const balance = parseFloat(response.data.result) / 1000000;
      const user = link.claimed_by || 'Unknown'; // <--- Get saved username

      const minimumAcceptable = link.amount * 0.90; 
      const isEnough = balance >= minimumAcceptable;

      if (isEnough) {
        await supabase.from('payment_links').update({ is_verified: true }).eq('id', link.id);
            
            await sendTelegramAlert(
                `✅ <b>PAYMENT CONFIRMED</b>\n` +
                `User: <b>${user}</b>\n` +
                `Donation: $${link.amount}\n` +
                `Received: <b>${balance} USDT</b>\n` +
                `Wallet: <code>${link.wallet_address}</code>`
            );
        } else {
            await supabase.from('payment_links').update({ 
                status: 'available', 
                is_verified: false, 
                reserved_at: null,
                claimed_by: null 
            }).eq('id', link.id);

            await sendTelegramAlert(
            `❌ <b>PAYMENT NOT CONFIRMED</b>\n` +
            `User: <b>${user}</b>\n` +
            `Donation: $${link.amount}\n` +
            `Received: <b>${balance} USDT</b>\n` +
            `Wallet: <code>${link.wallet_address}</code>`
            );
        }
    }
    return res.json({ status: "success", processed: pendingLinks.length });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};