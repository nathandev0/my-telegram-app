const express = require('express');
const cors = require('cors');
const path = require('path');

// 1. Import your logic files
// Note: We use 'require' because Render runs in a standard Node environment
const botHandler = require('./start').default; 
const reserveHandler = require('./api/reserve');

const app = express();

// 2. Middleware
app.use(cors()); // Allows your Mini App to talk to this server
app.use(express.json()); // Allows the server to read data sent in JSON format

// 3. Routing
// This handles the Bot (Webhook)
app.post('/webhook', async (req, res) => {
  try {
    await botHandler(req, res);
  } catch (err) {
    console.error("Bot Error:", err);
    res.status(500).send("Internal Bot Error");
  }
});

// This handles the Mini App (Reserve/Paid/Cancel)
app.all('/api/reserve', async (req, res) => {
  try {
    await reserveHandler(req, res);
  } catch (err) {
    console.error("Reserve Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 4. Start the Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🤖 Bot Webhook: /webhook`);
  console.log(`💰 Payment API: /api/reserve`);
});