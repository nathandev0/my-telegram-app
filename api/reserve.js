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

    // 1. UI Counters
    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount')
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // 2. Reservation Logic with Atomic Lock
    if (amount) {
      const { data: links, error } = await supabase.rpc('reserve_payment_link', { 
        target_amount: parseInt(amount) 
      });

      const selectedLink = links && links.length > 0 ? links[0] : null;

      if (error || !selectedLink) {
        console.error("RPC Error or No Links:", error);
        return res.status(404).json({ error: "No links available right now." });
      }

      // SEND RESPONSE IMMEDIATELY - User gets the link now
      res.json({ widgetUrl: selectedLink.url });

      // BACKGROUND TASK - Check stock without making the user wait
      // Wrapping in setImmediate prevents this from blocking the response
      setImmediate(async () => {
        try {
          const { count: remainingCount } = await supabase
            .from('payment_links')
            .select('*', { count: 'exact', head: true })
            .eq('amount', amount)
            .eq('status', 'available');

          if (remainingCount !== null && remainingCount < 2) {
            await sendTelegramAlert(`⚠️ <b>LOW STOCK ALERT</b>\nOnly ${remainingCount} links left for $${amount}!`);
          }
        } catch (bgErr) {
          console.error("Background Stock Check Failed:", bgErr.message);
        }
      });

      return; // Stop execution here for this request
    }
  }

if (method === 'POST') {
    const { link, action, username } = req.body; // <--- Receive username

    if (action === 'paid') {
      const { link, username } = req.body; // username comes from index.html

      const { data: updatedLink, error: updateError } = await supabase.from('payment_links')
        .update({ 
          status: 'used',
          is_verified: false,
          reserved_at: new Date().toISOString(),
          claimed_by: username // <--- Save it here!
        })
        .eq('url', link)
        .select()
        .single();

      if (updateError) return res.status(500).json({ error: "Update failed" });

      await sendTelegramAlert(
        `🔔 <b>PAYMENT CLAIMED</b>\n` +
        `User: <b>${username || 'Unknown'}</b>\n` +
        `Amount: $${updatedLink.amount}\n` +
        `Wallet: <code>${updatedLink.wallet_address}</code>`
      );

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