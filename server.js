const express = require('express');
const cors = require('cors');
const reserveHandler = require('./api/reserve');
const botHandler = require('./start').default;

const app = express();
app.use(cors()); // This allows your GitHub HTML to talk to your Render Backend
app.use(express.json());

// Bot Webhook
app.post('/webhook', (req, res) => botHandler(req, res));

// Payment API
app.all('/api/reserve', (req, res) => reserveHandler(req, res));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));