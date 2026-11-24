const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/market-stream' });
const publicDir = path.join(__dirname, 'public');
const logDir = path.join(__dirname, 'artifacts');

fs.mkdirSync(logDir, { recursive: true });
app.use(express.json({ limit: '64kb' }));
app.use(express.static(publicDir));

let packetCount = 0;
let price = 100.25;
let sequence = 0;

function logEvent(event, details = {}) {
  const entry = { timestamp: new Date().toISOString(), event, ...details };
  fs.appendFileSync(path.join(logDir, 'server-events.log'), `${JSON.stringify(entry)}\n`);
  console.log(JSON.stringify(entry));
}

app.post('/api/transaction', (request, response) => {
  const { amount, precision } = request.body || {};
  const valid = typeof amount === 'number'
    && Number.isFinite(amount)
    && typeof precision === 'number'
    && Number.isInteger(precision)
    && precision >= 0
    && precision <= 8;

  if (!valid) {
    logEvent('transaction_rejected', { amount, precision });
    return response.status(400).json({
      ok: false,
      code: 'INVALID_PRECISION',
      message: 'The numeric precision is invalid.'
    });
  }

  logEvent('transaction_accepted', { amount, precision });
  return response.json({ ok: true, code: 'ACCEPTED' });
});

wss.on('connection', socket => {
  logEvent('websocket_connected');
  socket.on('close', () => logEvent('websocket_disconnected'));
});

setInterval(() => {
  packetCount += 1;
  if (packetCount % 4 === 0) {
    logEvent('packet_dropped', { packet: packetCount });
    return;
  }

  sequence += 1;
  price = Math.max(40, price + (Math.random() - 0.48) * 0.8);
  const latencyMs = 2000 + Math.floor(Math.random() * 5001);
  const packet = {
    sequence,
    price: Number(price.toFixed(2)),
    volume: Math.round(500 + Math.random() * 5000),
    timestamp: Date.now()
  };

  setTimeout(() => {
    const payload = JSON.stringify({ type: 'market', ...packet });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }, latencyMs);

  logEvent('packet_scheduled', { packet: sequence, latencyMs });
}, 250);

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  logEvent('server_started', { url: `http://127.0.0.1:${port}` });
  console.log(`Dashboard running at http://127.0.0.1:${port}`);
});
