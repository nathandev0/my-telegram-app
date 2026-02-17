// start.js - Bot Webhook Logic
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function handler(req, res) {
  // 1. Safety Check: Ensure it's a POST request from Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // 2. Handle the /start command
  if (body.message && body.message.text === '/start') {
    const chatId = body.message.chat.id;
    const firstName = body.message.from.first_name || 'friend';

    const reply = {
      chat_id: chatId,
      text: `Hi ${firstName}! Tap 'Open App' button below to open the mini app and be able to donate.`
    };

    try {
      // Send reply via Telegram API using your BOT_TOKEN from environment variables
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply)
      });
    } catch (error) {
      console.error("Error sending Telegram message:", error);
    }

    return res.status(200).json({ ok: true });
  }

  // 3. Fallback for other messages
  res.status(200).json({ ok: true });
}

// This allows server.js to "see" and use this function
module.exports = { default: handler };