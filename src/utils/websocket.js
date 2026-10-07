const WebSocket = require('ws');
const { logger } = require('./logger');
const { verifyToken } = require('./authTokens');

let wss = null;
const clients = new Set();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Verify origin
    const origin = req.headers.origin;
    if (origin && process.env.CORS_ORIGINS) {
      const allowedOrigins = process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(o => o !== '*');
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
        origin,
        ip: req.socket?.remoteAddress,
      });
      ws.close(4001, 'Unauthorized - no token');
      return;
    }

    try {
      const payload = verifyToken(token);
      ws.isAlive = true;
      ws.jti = payload.jti;
      clients.add(ws);
      logger.ws('connected', { total: clients.size });

      // Disconnect when the session token expires instead of streaming events indefinitely
      const expiresInMs = Math.max(0, payload.exp * 1000 - Date.now());
      ws.expiryTimer = setTimeout(() => ws.close(4001, 'Session expired'), expiresInMs);

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        clearTimeout(ws.expiryTimer);
        clients.delete(ws);
        logger.ws('disconnected', { total: clients.size });
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message });
        clearTimeout(ws.expiryTimer);
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

// Closes all connections opened with the given (now revoked) session token
function closeSessionsForToken(jti) {
  for (const ws of clients) {
    if (ws.jti === jti) ws.close(4001, 'Logged out');
  }
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

module.exports = { initWebSocket, broadcast, closeSessionsForToken };
