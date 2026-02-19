const express = require('express');
const cors = require('cors');
const reserveHandler = require('./api/reserve');
const botHandler = require('./start').default;
const cleanupHandler = require('./api/cleanup');

const app = express();
app.use(cors()); // This allows your GitHub HTML to talk to your Render Backend
app.use(express.json());

// Bot Webhook
app.post('/webhook', (req, res) => botHandler(req, res));

// Payment API
app.all('/api/reserve', (req, res) => reserveHandler(req, res));

// Register the cleanup route
app.get('/api/cleanup', cleanupHandler);
app.post('/api/cleanup', cleanupHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));