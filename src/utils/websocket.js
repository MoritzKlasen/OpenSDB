const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss = null;
const clients = new Set();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Initialize WebSocket server attached to HTTP server
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Verify auth token from cookies
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.token;

    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    clients.add(ws);
    console.log(`✅ WebSocket client connected. (${clients.size} total)`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`❌ WebSocket client disconnected. (${clients.size} total)`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });
}

/**
 * Broadcast event to all connected clients
 */
function broadcast(event, data) {
  if (!wss) return;

  const message = JSON.stringify({ event, data });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Parse cookies from header string
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.split('=');
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  });
  return cookies;
}

module.exports = { initWebSocket, broadcast };
