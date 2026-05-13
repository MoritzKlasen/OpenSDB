const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { z } = require('zod');

function getHelmetMiddleware() {
  return (req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('hex');
    res.locals.cspNonce = nonce;
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", `'nonce-${nonce}'`],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          childSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })(req, res, next);
  };
}

const createLoginLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    skip: (req) => process.env.NODE_ENV === 'development',
  });

const createApiLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
  });

function corsMiddleware(req, res, next) {
  if (!process.env.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS environment variable is required');
  }
  
  const allowedOrigins = process.env.CORS_ORIGINS.split(',').filter(o => o !== '*');
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}

function stringifyForSigning(obj) {
  return JSON.stringify(Object.keys(obj).sort().reduce((result, key) => {
    result[key] = obj[key];
    return result;
  }, {}));
}

function generateRequestSignature(payload, secret) {
  const payloadString = stringifyForSigning(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

function verifyRequestSignature(payload, signature, secret) {
  const expected = generateRequestSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

function verifyInternalRequest(secret, logger = null) {
  return (req, res, next) => {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const ip = req.ip || req.connection.remoteAddress;

    if (!signature || !timestamp) {
      if (logger) logger.security('internal_request_rejected', { ip, reason: 'Missing signature/timestamp' });
      return res.status(403).json({ error: 'Missing signature' });
    }

    const requestTime = parseInt(timestamp, 10);
    const now = Date.now();
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
      if (logger) logger.security('internal_request_rejected', { ip, reason: 'Request expired' });
      return res.status(401).json({ error: 'Request expired' });
    }

    try {
      const payload = { ...req.body, timestamp: parseInt(timestamp, 10) };
      if (!verifyRequestSignature(payload, signature, secret)) {
        if (logger) logger.security('internal_request_rejected', { ip, reason: 'Invalid signature' });
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } catch (err) {
      if (logger) logger.security('internal_request_rejected', { ip, reason: 'Verification failed', error: err.message });
      return res.status(403).json({ error: 'Signature verification failed' });
    }

    next();
  };
}

module.exports = {
  getHelmetMiddleware,
  createLoginLimiter,
  createApiLimiter,
  corsMiddleware,
  generateRequestSignature,
  verifyRequestSignature,
  verifyInternalRequest,
};
