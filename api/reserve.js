const { createClient } = require('@supabase/supabase-js');

// These will be pulled from Render's settings later
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function handleReserve(req, res) {
  const method = req.method;

  if (method === 'GET') {
    const { all, amount } = req.query;

    // Check how many links are left for the buttons
    if (all === 'true') {
      const { data } = await supabase.from('payment_links').select('amount').eq('status', 'available');
      const counts = data.reduce((acc, curr) => {
        acc[curr.amount] = (acc[curr.amount] || 0) + 1;
        return acc;
      }, {});
      return res.json({ availability: counts });
    }

    // Grab a link and "lock" it for 90 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();    
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
    const newStatus = (action === 'paid') ? 'used' : 'available';
    await supabase.from('payment_links').update({ status: newStatus, reserved_at: null }).eq('url', link);
    return res.json({ success: true });
  }
}

module.exports = handleReserve;