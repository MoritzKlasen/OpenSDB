const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

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
      logger.security('websocket_auth_rejected', {
        reason: 'no token in cookies',
        headers: req.headers
      });
      ws.close(4001, 'Unauthorized - no token');
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
      clients.add(ws);
      logger.ws('client_authenticated', { total: clients.size });

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
}

/**
 * Broadcast event to all connected clients
 */
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

/**
 * Parse cookies from header string
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.split('=');
    if (name && value) {
      cookies[name.trim()] = decodeURIComponent(value.trim());
    }
  });
  return cookies;
}

module.exports = { initWebSocket, broadcast };
