const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
  const method = req.method;
  
  // Timings
  const now = new Date();
  const thirtySecAgo = new Date(now - 30 * 1000).toISOString();
  const oneMinAgo = new Date(now - 60 * 1000).toISOString();

  if (method === 'GET') {
    const { all, amount } = req.query;

    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount')
        .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo}),and(status.eq.used,reserved_at.lt.${oneMinAgo})`);
      
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // Reservation Logic: Now rescues "fake" used links too
    const { data: link, error } = await supabase.from('payment_links').select('*')
      .eq('amount', amount)
      .or(`status.eq.available,and(status.eq.reserved,reserved_at.lt.${thirtySecAgo}),and(status.eq.used,reserved_at.lt.${oneMinAgo})`)
      .limit(1).single();

    if (error || !link) return res.status(404).json({ error: "No links available." });

    // Update to reserved
    await supabase.from('payment_links').update({ 
      status: 'reserved', 
      reserved_at: new Date().toISOString() 
    }).eq('id', link.id);

    return res.json({ widgetUrl: link.url });
  }

    if (method === 'POST') {
      const { link, action } = req.body;

      if (action === 'paid') {
        // 1. Mark as 'used' and ensure 'is_verified' is false
        // This tells the Janitor: "Hey, check this one in a minute!"
        await supabase.from('payment_links').update({ 
          status: 'used',
          is_verified: false,
          reserved_at: new Date().toISOString() 
        }).eq('url', link);

        return res.json({ success: true });
      }

    if (action === 'cancel') {
      await supabase.from('payment_links').update({ status: 'available', reserved_at: null }).eq('url', link);
      return res.json({ success: true });
    }
  }
}

module.exports = handleReserve;