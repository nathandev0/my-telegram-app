// api/reserve.js
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios'); // <--- THIS LINE WAS MISSING
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Helper function for alerts
async function sendTelegramAlert(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.ADMIN_CHAT_ID;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (e) {
    console.error("TG Alert Error:", e.response ? e.response.data : e.message);
  }
}

async function handleReserve(req, res) {
  const method = req.method;
  const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();

  if (method === 'GET') {
    const { all, amount } = req.query;

    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount')
        // ONLY pull available or timed-out reserved links.
        // DO NOT include "used" links here.
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    const { data: link, error } = await supabase.from('payment_links').select('*')
      .eq('amount', amount)
      .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo})`)
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
      // 1. Mark as 'used' in DB
      const { data: updatedLink, error: updateError } = await supabase.from('payment_links')
        .update({ 
          status: 'used',
          is_verified: false,
          reserved_at: new Date().toISOString() 
        })
        .eq('url', link)
        .select()
        .single();

      if (updateError) {
        console.error("DB Update Error:", updateError);
        return res.status(500).json({ error: "Database update failed" });
      }

      // 2. Send Alert with the data we just updated
      await sendTelegramAlert(`🔔 <b>Payment Claimed</b>\nAmount: $${updatedLink.amount}\nWallet: <code>${updatedLink.wallet_address}</code>\n\n<i>Janitor check in 5 mins.</i>`);

      return res.json({ success: true });
    }

    if (action === 'cancel') {
      // If user clicks "No", return it to the pool immediately
      await supabase.from('payment_links').update({ 
        status: 'available', 
        reserved_at: null,
        is_verified: false 
      }).eq('url', link);
      return res.json({ success: true });
    }
  }
}

module.exports = handleReserve;