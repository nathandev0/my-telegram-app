// api/start.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // This is Telegram webhook payload
  if (body.message && body.message.text === '/start') {
    const chatId = body.message.chat.id;
    const firstName = body.message.from.first_name || 'friend';

    const reply = {
      chat_id: chatId,
      text: `Hi ${firstName}! 👋\n\nTo support me, just tap the **Open App** button below ↓\n\nIt will open the donation screen where you can choose any amount. Thank you in advance! ❤️`,
      reply_markup: {
        keyboard: [
          [{ text: 'Open App', web_app: { url: 'https://your-mini-app-name.vercel.app' } }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };

    // Send reply via Telegram API
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply)
    });

    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}