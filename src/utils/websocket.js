const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

let wss = null;
const clients = new Set();

const JWT_SECRET = process.env.JWT_SECRET;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Verify origin
    const origin = req.headers.origin;
    if (origin && process.env.CORS_ORIGINS) {
      const allowedOrigins = process.env.CORS_ORIGINS.split(',').filter(o => o !== '*');
      if (!allowedOrigins.includes(origin)) {
        logger.security('websocket_origin_rejected', { origin });
        ws.close(4003, 'Invalid origin');
        return;
      }
    }

    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies.token;

    if (!token) {
      logger.security('websocket_auth_rejected', {
        reason: 'no token in cookies',
        headers: req.headers
      });
      ws.close(4001, 'Unauthorized - no token');
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
      ws.isAlive = true;
      clients.add(ws);
      logger.ws('client_authenticated', { total: clients.size });

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        clients.delete(ws);
        logger.ws('client_disconnected', { total: clients.size });
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message });
        clients.delete(ws);
      });
    } catch (err) {
      logger.security('websocket_auth_rejected', {
        reason: 'invalid token',
        error: err.message
      });
      ws.close(4001, 'Unauthorized - invalid token');
      return;
    }
  });

  logger.info('WebSocket server initialized on /ws');

  // Ping clients every 30s to detect stale connections
  const pingInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));
}

function broadcast(event, data) {
  if (!wss) {
    logger.warn('WebSocket server not initialized, cannot broadcast', { event });
    return;
  }

  const message = JSON.stringify({ event, data });
  let sent = 0;

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sent++;
      } catch (err) {
        logger.error('Failed to send message to client', { error: err.message });
      }
    }
  });

  logger.ws('broadcast_sent', { event, clients_total: clients.size, clients_sent: sent });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex > 0) {
      const name = cookie.slice(0, eqIndex).trim();
      const value = cookie.slice(eqIndex + 1).trim();
      if (name) {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value;
        }
      }
    }
  });
  return cookies;
}

module.exports = { initWebSocket, broadcast };
