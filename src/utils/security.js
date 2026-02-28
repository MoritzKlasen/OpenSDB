const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { z } = require('zod');

/**
 * Helmet security headers middleware
 */
function getHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-" + crypto.randomBytes(16).toString('hex') + "'"],
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
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  });
}

/**
 * Rate limiting: Slow brute force attacks
 */
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

/**
 * Rate limiting: General API protection
 */
const createApiLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
  });

/**
 * CORS middleware - restrict to trusted origins
 */
function corsMiddleware(req, res, next) {
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}

/**
 * Input validation schema errors
 */
function validateInput(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid input',
          issues: err.errors,
        });
      }
      return res.status(400).json({ error: 'Bad request' });
    }
  };
}

/**
 * Request signing for internal APIs
 */
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

/**
 * Middleware to verify signed internal requests
 */
function verifyInternalRequest(secret, logger = null) {
  return (req, res, next) => {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    const ip = req.ip || req.connection.remoteAddress;

    if (!signature || !timestamp) {
      if (logger) logger.security('internal_request_rejected', { ip, reason: 'Missing signature/timestamp' });
      return res.status(403).json({ error: 'Missing signature' });
    }

    // Prevent replay attacks (request must be within 5 minutes)
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

/**
 * Sanitize user input to prevent injection
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .slice(0, 1000); // Limit length
}

module.exports = {
  getHelmetMiddleware,
  createLoginLimiter,
  createApiLimiter,
  corsMiddleware,
  validateInput,
  generateRequestSignature,
  verifyRequestSignature,
  verifyInternalRequest,
  sanitizeInput,
};
