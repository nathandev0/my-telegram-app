const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
  const method = req.method;
  
  // Define the 30-second expiry for the "Reserved" (question) state
  const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();

  if (method === 'GET') {
    const { all, amount } = req.query;

    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount')
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // Reservation Logic: 
    // Pulls 'available' links OR 'reserved' links that timed out (30s)
    // IMPORTANT: We REMOVED the 'used' rescue here so the 5-minute Janitor can work.
    const { data: link, error } = await supabase.from('payment_links').select('*')
      .eq('amount', amount)
      .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo})`)
      .limit(1).single();

    if (error || !link) return res.status(404).json({ error: "No links available." });

    // Mark as reserved (starts the 30-second countdown for the Yes/No question)
    await supabase.from('payment_links').update({ 
      status: 'reserved', 
      reserved_at: new Date().toISOString() 
    }).eq('id', link.id);

    return res.json({ widgetUrl: link.url });
  }

  if (method === 'POST') {
    const { link, action } = req.body;

    if (action === 'paid') {
      // Mark as 'used' and RESET the timestamp to NOW.
      // Your cleanup.js Janitor will see this timestamp and wait exactly 5 minutes.
      await supabase.from('payment_links').update({ 
        status: 'used',
        is_verified: false,
        reserved_at: new Date().toISOString() 
      }).eq('url', link);

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