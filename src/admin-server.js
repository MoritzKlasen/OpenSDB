require('dotenv').config();

const express       = require('express');
const cookieParser  = require('cookie-parser');
const jwt           = require('jsonwebtoken');
const bcrypt        = require('bcrypt');
const path          = require('path');
const mongoose      = require('mongoose');
const crypto        = require('crypto');
const http          = require('http');
const { initWebSocket, broadcast } = require('./utils/websocket');
const {
  getHelmetMiddleware,
  createLoginLimiter,
  createApiLimiter,
  corsMiddleware,
  verifyInternalRequest
} = require('./utils/security');
const { logger, requestLogger, getSecurityEvents, getErrorLogs } = require('./utils/logger');
const { validateEnvironment } = require('./utils/envValidator');
const { SUPPORTED: SUPPORTED_LANGUAGES } = require('./utils/i18n');

validateEnvironment();

const ADMIN_USERNAME      = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
const VerifiedUser = require('./database/models/VerifiedUser');
const ServerSettings = require('./database/models/ServerSettings');
const BannedWord = require('./database/models/BannedWord');
const ScamDetectionEvent = require('./database/models/ScamDetectionEvent');
const { Parser } = require('json2csv');
const multer = require('multer');
const csv = require('csvtojson');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

if (!process.env.ADMIN_UI_PORT) {
  throw new Error('ADMIN_UI_PORT environment variable is required');
}
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (!process.env.INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET environment variable is required');
}

const app = express();
const PORT = process.env.ADMIN_UI_PORT;
const JWT_SECRET = process.env.JWT_SECRET;

function shouldUpdateApiKey(value) {
  return value !== undefined &&
    !(typeof value === 'string' && value.trim() === '') &&
    value !== '***HIDDEN***';
}
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
const GUILD_ID = process.env.ALLOWED_GUILD_ID;

app.set('trust proxy', 1);

logger.info('Starting OpenSDB Admin Server');

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  logger.info('Connected to MongoDB');
})
.catch(err => {
  logger.error('MongoDB connection failed', { error: err.message });
  process.exit(1);
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(requestLogger);

app.use(getHelmetMiddleware());
app.use(corsMiddleware);
app.use(createApiLimiter());

// CSRF protection: require X-Requested-With header on state-changing requests.
// Browsers block cross-origin custom headers by default, so this prevents CSRF.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    // Skip for internal API (uses signature-based auth)
    if (req.path === '/api/internal/notify-change') return next();
    if (!req.headers['x-requested-with']) {
      return res.status(403).json({ error: 'Missing CSRF header' });
    }
  }
  next();
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
function basicAuth(user, pass) {
  return (req, res, next) => {
    const hdr = req.headers.authorization || "";
    if (!hdr.startsWith("Basic ")) {
      res.set("WWW-Authenticate", 'Basic realm="metrics"');
      return res.status(401).send("Unauthorized");
    }
    const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (!timingSafeEqual(u, user) || !timingSafeEqual(p, pass)) {
      res.set("WWW-Authenticate", 'Basic realm="metrics"');
      return res.status(401).send("Unauthorized");
    }
    next();
  };
}

if (!process.env.METRICS_BASIC_USER) {
  throw new Error('METRICS_BASIC_USER environment variable is required');
}
if (!process.env.METRICS_BASIC_PASS) {
  throw new Error('METRICS_BASIC_PASS environment variable is required');
}

const metricsBasic = basicAuth(process.env.METRICS_BASIC_USER, process.env.METRICS_BASIC_PASS);

app.post('/api/login', createLoginLimiter(), (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (
    username !== ADMIN_USERNAME ||
    !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)
  ) {
    logger.security('login_failed', {
      username,
      ip,
      reason: 'Invalid credentials',
    });
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
  
  logger.security('login_success', {
    username,
    ip,
  });
  
  res.json({ success: true });
});

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    logger.security('auth_failed', {
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      reason: 'No token provided',
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    logger.security('auth_failed', {
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      reason: 'Invalid or expired token',
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.post('/api/internal/notify-change', verifyInternalRequest(INTERNAL_SECRET, logger), (req, res) => {
  const { type } = req.body;

  if (type === 'warning' || type === 'verification' || type === 'unverify' || type === 'comment-updated') {
    logger.security('event_received', {
      type,
      message: `${type} update triggered by bot`,
      source: 'internal_api'
    });
    broadcast('users-updated', { type });
    broadcast('analytics-updated', { type });
  } else if (type === 'analytics' || type === 'scam-alert') {
    logger.security('event_received', {
      type,
      message: `${type} update triggered by bot`,
      source: 'internal_api'
    });
    broadcast('analytics-updated', { type });
  } else if (type === 'settings-changed') {
    logger.security('event_received', {
      type,
      message: 'Settings update triggered by bot',
      source: 'internal_api'
    });
    broadcast('settings-updated', { type: 'server-settings' });
  }

  res.json({ success: true });
});

app.get('/api/verified-users', authMiddleware, async (req, res) => {
  try {
    const users = await VerifiedUser.find({}, {
      discordId: 1,
      discordTag: 1,
      firstName: 1,
      lastName: 1,
      comment: 1,
      warnings: 1,
      verifiedAt: 1
    });
    res.json(users);
  } catch (err) {
    logger.error('Error fetching users', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/remove-warning/:discordId/:index', authMiddleware, async (req, res) => {
  const { discordId } = req.params;
  const idx = parseInt(req.params.index, 10);
  try {
    if (!/^\d{17,20}$/.test(discordId)) {
      return res.status(400).json({ error: 'Invalid Discord ID' });
    }
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Invalid warning index' });
    }
    const user = await VerifiedUser.findOne({ discordId });
    if (!user || !user.warnings || idx >= user.warnings.length) {
      return res.status(404).json({ error: 'Warning not found' });
    }
    user.warnings.splice(idx, 1);
    await user.save();
    broadcast('users-updated', { discordId });
    broadcast('analytics-updated', { type: 'warning-deleted' });
    res.json({ success: true });
  } catch (err) {
    logger.error('Error removing the warning', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/export-users', authMiddleware, async (req, res) => {
  try {
    const users = await VerifiedUser.find({}, {
      verificationNumber: 1,
      discordTag: 1,
      discordId: 1,
      firstName: 1,
      lastName: 1,
      comment: 1,
      warnings: 1,
      verifiedAt: 1,
      _id: 0
    }).lean();

    const data = users.map(u => ({
      verificationNumber: u.verificationNumber ?? '',
      discordTag: u.discordTag ?? '',
      discordId: u.discordId ?? '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      comment: u.comment ?? '',
      warnings: JSON.stringify(u.warnings ?? []),
      verifiedAt: u.verifiedAt ? new Date(u.verifiedAt).toISOString() : ''
    }));

    const fields = [
      'verificationNumber',
      'discordTag',
      'discordId',
      'firstName',
      'lastName',
      'comment',
      'warnings',
      'verifiedAt'
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    const withBOM = '\ufeff' + csv;

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('verified_users.csv');
    res.send(withBOM);
  } catch (err) {
    logger.error('Error during CSV export', { error: err.message });
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get(
  ['/api/metrics/users-per-day', '/api/metrics/users-per-day.csv', '/api/metrics/users-per-day.json'],
  metricsBasic,
  async (req, res) => {
    try {
      const defaultTz = process.env.SERVER_TIMEZONE || 'UTC';
      const tz   = req.query.tz   || defaultTz;
      const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const to   = req.query.to   ? new Date(req.query.to)   : new Date();
      if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });

      const MAX_RANGE_DAYS = 730;
      const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
      if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
        return res.status(400).json({ error: `Date range must be between 0 and ${MAX_RANGE_DAYS} days` });
      }

      from.setUTCHours(0,0,0,0);
      to.setUTCHours(23,59,59,999);

      const dateField = 'verifiedAt';

      const rows = await VerifiedUser.aggregate([
        { $match: { [dateField]: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}`, timezone: tz } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const map = new Map(rows.map(r => [r._id, r.count]));
      const out = [];
      const cur = new Date(from);
      while (cur <= to) {
        const day = cur.toISOString().slice(0,10);
        out.push({ day, count: map.get(day) || 0 });
        cur.setDate(cur.getDate() + 1);
      }

      let cum = 0;
      const data = out.map(d => ({
        ts: new Date(d.day).toISOString(),
        daily: d.count,
        cumulative: (cum += d.count),
      }));

      const wantsCsv  = req.path.endsWith('.csv');
      const wantsJson = req.path.endsWith('.json') || !wantsCsv;

      if (wantsCsv) {
        const csv = 'ts,daily,cumulative\n' + data.map(r => `${r.ts},${r.daily},${r.cumulative}`).join('\n');
        res.type('text/csv; charset=utf-8');
        if (req.query.download === '1') res.attachment('users-per-day.csv');
        return res.send(csv);
      }
      if (wantsJson) {
        res.type('application/json; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=60');
        return res.json(data);
      }

      res.set('Cache-Control', 'public, max-age=60');
      return res.json(data);
    } catch (err) {
      logger.error('Metrics error', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

app.post(
  '/api/import-users',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!req.file.originalname.endsWith('.csv')) {
        return res.status(400).json({ error: 'Only CSV files are allowed' });
      }

      const rows = await csv().fromString(req.file.buffer.toString('utf-8'));

      const requiredColumns = ['discordId'];
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const missing = requiredColumns.filter(c => !columns.includes(c));
        if (missing.length > 0) {
          return res.status(400).json({ error: `Missing required columns: ${missing.join(', ')}` });
        }
      }

      let imported = 0;

      for (const row of rows) {
        if (!row.discordId || !/^\d{17,20}$/.test(row.discordId)) {
          continue;
        }
        let warnings = [];
        try {
          warnings = JSON.parse(row.warnings || '[]');
          if (!Array.isArray(warnings)) warnings = [];
        } catch {
          warnings = [];
        }

        let parsedVerifiedAt = null;
        if (row.verifiedAt && typeof row.verifiedAt === 'string') {
          const d = new Date(row.verifiedAt);
          if (!isNaN(d.getTime())) parsedVerifiedAt = d;
        }

        const existing = await VerifiedUser.findOne({ discordId: row.discordId }).lean();

        const setFields = {
          verificationNumber: Number(row.verificationNumber) || 0,
          discordTag: row.discordTag || '',
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          comment: row.comment || '',
          warnings
        };

        const filter = { discordId: row.discordId };
        const options = { upsert: true, new: true, setDefaultsOnInsert: true };

        if (!existing) {
          const toInsert = {
            ...setFields,
            ...(parsedVerifiedAt ? { verifiedAt: parsedVerifiedAt } : {})
          };
          await VerifiedUser.updateOne(filter, { $set: toInsert }, options);
        } else {
          const updateOps = { $set: setFields };

          const hasVerifiedAt =
            existing.verifiedAt !== undefined &&
            existing.verifiedAt !== null;

          if (!hasVerifiedAt && parsedVerifiedAt) {
            updateOps.$set.verifiedAt = parsedVerifiedAt;
          }
          await VerifiedUser.updateOne(filter, updateOps, options);
        }

        imported++;
      }

      broadcast('users-updated', { type: 'import' });
      broadcast('analytics-updated', { type: 'import' });
      res.json({ success: true, imported });
    } catch (err) {
      logger.error('Import error', { error: err.message });
      res.status(500).json({ error: 'Import failed' });
    }
  }
);

app.put('/api/update-comment/:discordId', authMiddleware, async (req, res) => {
  const { discordId } = req.params;
  const { comment } = req.body;

  if (!/^\d{17,20}$/.test(discordId)) {
    return res.status(400).json({ error: 'Invalid Discord ID' });
  }
  if (typeof comment === 'string' && comment.length > 500) {
    return res.status(400).json({ error: 'Comment too long (max 500 characters)' });
  }

  try {
    const user = await VerifiedUser.findOne({ discordId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.comment = comment;
    await user.save();
    broadcast('users-updated', { discordId });
    broadcast('analytics-updated', { type: 'user-updated' });
    res.json({ success: true });
  } catch (err) {
    logger.error('Error updating the comment', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/analytics/warnings-per-day', authMiddleware, async (req, res) => {
  try {
    const defaultTz = process.env.SERVER_TIMEZONE || 'UTC';
    const tz = req.query.tz || defaultTz;
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });
    const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    if (rangeDays > 730 || rangeDays < 0) return res.status(400).json({ error: 'Date range too large (max 730 days)' });
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);

    const rows = await VerifiedUser.aggregate([
      {
        $match: {
          'warnings.date': { $gte: from, $lte: to }
        }
      },
      { $unwind: '$warnings' },
      {
        $match: {
          'warnings.date': { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: '$warnings.date', timezone: tz } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const map = new Map(rows.map(r => [r._id, r.count]));
    const out = [];
    const cur = new Date(from);
    while (cur <= to) {
      const day = cur.toISOString().slice(0, 10);
      out.push({ day, count: map.get(day) || 0 });
      cur.setDate(cur.getDate() + 1);
    }

    const data = out.map(d => ({
      ts: new Date(d.day).toISOString(),
      count: d.count
    }));

    res.json(data);
  } catch (err) {
    logger.error('Analytics error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/dashboard/users-growth', authMiddleware, async (req, res) => {
  try {
    let from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let to   = req.query.to   ? new Date(req.query.to)   : new Date();
    
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });
    const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    if (rangeDays > 730 || rangeDays < 0) return res.status(400).json({ error: 'Date range too large (max 730 days)' });
    
    from = new Date(from.getTime());
    to = new Date(to.getTime());
    from.setUTCHours(0,0,0,0);
    to.setUTCHours(23,59,59,999);

    const dateField = 'verifiedAt';

    // Count users with verifiedAt dates within range (for daily growth chart)
    const rows = await VerifiedUser.aggregate([
      { $match: { [dateField]: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Count users verified before the date range (users without verifiedAt are
    // automatically excluded from this count)
    const usersBeforeRange = await VerifiedUser.countDocuments({
      [dateField]: { $lt: from }
    });

    const map = new Map(rows.map(r => [r._id, r.count]));
    const out = [];
    const cur = new Date(from);
    while (cur <= to) {
      const day = cur.toISOString().slice(0,10);
      out.push({ day, count: map.get(day) || 0 });
      cur.setDate(cur.getDate() + 1);
    }

    let cumulativeCount = usersBeforeRange;
    const data = out.map(d => ({
      ts: new Date(d.day).toISOString(),
      daily: d.count,
      cumulative: (cumulativeCount += d.count),
    }));

    res.json(data);
  } catch (err) {
    logger.error('User growth error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/warnings-activity', authMiddleware, async (req, res) => {
  try {
    let from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let to = req.query.to ? new Date(req.query.to) : new Date();
    
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });
    const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    if (rangeDays > 730 || rangeDays < 0) return res.status(400).json({ error: 'Date range too large (max 730 days)' });
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);

    const rows = await VerifiedUser.aggregate([
      {
        $match: {
          'warnings.date': { $gte: from, $lte: to }
        }
      },
      { $unwind: '$warnings' },
      {
        $match: {
          'warnings.date': { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: '$warnings.date' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const map = new Map(rows.map(r => [r._id, r.count]));
    const out = [];
    const cur = new Date(from);
    while (cur <= to) {
      const day = cur.toISOString().slice(0, 10);
      out.push({ day, count: map.get(day) || 0 });
      cur.setDate(cur.getDate() + 1);
    }

    const data = out.map(d => ({
      ts: new Date(d.day).toISOString(),
      count: d.count
    }));

    res.json(data);
  } catch (err) {
    logger.error('Warnings activity error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Scam Detection Alerts Activity
app.get('/api/dashboard/alerts-activity', authMiddleware, async (req, res) => {
  try {
    let from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    let to = req.query.to ? new Date(req.query.to) : new Date();
    
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });
    const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    if (rangeDays > 730 || rangeDays < 0) return res.status(400).json({ error: 'Date range too large (max 730 days)' });
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);

    const rows = await ScamDetectionEvent.aggregate([
      {
        $match: {
          detectedAt: { $gte: from, $lte: to },
          alertSent: true
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: '$detectedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const map = new Map(rows.map(r => [r._id, r.count]));
    const out = [];
    const cur = new Date(from);
    while (cur <= to) {
      const day = cur.toISOString().slice(0, 10);
      out.push({ day, count: map.get(day) || 0 });
      cur.setDate(cur.getDate() + 1);
    }

    const data = out.map(d => ({
      ts: new Date(d.day).toISOString(),
      count: d.count
    }));

    res.json(data);
  } catch (err) {
    logger.error('Alerts activity error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server Settings API
app.get('/api/settings/server', authMiddleware, async (req, res) => {
  try {
    const query = GUILD_ID ? { guildId: GUILD_ID } : {};
    const settings = await ServerSettings.findOne(query).lean();
    
    if (!settings) {
      // Return default settings if none exist
      return res.json({
        guildId: '',
        teamRoleId: '',
        adminChannelId: '',
        verifiedRoleId: '',
        onJoinRoleId: '',
        language: 'en',
        scamDetectionConfig: {
          enabled: false,
          mode: 'default',
          sensitivity: 'medium',
          autoDelete: false,
          autoTimeout: false,
          autoTimeoutDuration: 60,
          alertChannelId: '',
          minRiskScoreForAlert: 45,
          minRiskScoreForAutoAction: 80,
          duplicateMessageThreshold: 3,
          duplicateTimeWindow: 2,
          accountAgeRequirement: 7,
          firstMessageSuspicion: true,
          trustedUserIds: [],
          trustedDomains: [],
          aiSettings: {
            enabled: false,
            provider: '',
            baseUrl: '',
            model: '',
            apiKey: '',
            timeout: 30000,
            notifyAdminsOnFallback: true,
            healthCheckEnabled: true,
            healthCheckInterval: 3600000,
          }
        }
      });
    }
    
    // Hide sensitive fields in the response
    const sanitizedSettings = { ...settings };
    if (sanitizedSettings.scamDetectionConfig?.aiSettings) {
      if (sanitizedSettings.scamDetectionConfig.aiSettings.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.apiKey = '***HIDDEN***';
      }
      if (sanitizedSettings.scamDetectionConfig.aiSettings.textModel?.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.textModel.apiKey = '***HIDDEN***';
      }
      if (sanitizedSettings.scamDetectionConfig.aiSettings.visionModel?.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.visionModel.apiKey = '***HIDDEN***';
      }
    }
    
    res.json(sanitizedSettings);
  } catch (err) {
    logger.error('Error fetching server settings', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/settings/server', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    
    // Validate language if provided
    if (updates.language) {
      if (!SUPPORTED_LANGUAGES.has(updates.language)) {
        return res.status(400).json({ error: 'Invalid language code' });
      }
    }
    
    // Validate Discord ID fields (must be numeric strings of 17-20 digits, or empty to clear)
    const discordIdPattern = /^\d{17,20}$/;
    const idFields = ['adminChannelId', 'teamRoleId', 'verifiedRoleId', 'onJoinRoleId'];
    for (const field of idFields) {
      if (updates[field] !== undefined && updates[field] !== '' && !discordIdPattern.test(updates[field])) {
        return res.status(400).json({ error: `Invalid ${field} - must be a Discord snowflake ID` });
      }
    }
    if (updates.scamDetectionConfig?.alertChannelId !== undefined && 
        updates.scamDetectionConfig.alertChannelId !== '' && 
        !discordIdPattern.test(updates.scamDetectionConfig.alertChannelId)) {
      return res.status(400).json({ error: 'Invalid alertChannelId - must be a Discord snowflake ID' });
    }
    
    // Validate scam detection mode if provided
    if (updates.scamDetectionConfig?.mode && !['default', 'ai'].includes(updates.scamDetectionConfig.mode)) {
      return res.status(400).json({ error: 'Invalid scam detection mode' });
    }
    
    // Validate sensitivity if provided
    if (updates.scamDetectionConfig?.sensitivity && !['low', 'medium', 'high'].includes(updates.scamDetectionConfig.sensitivity)) {
      return res.status(400).json({ error: 'Invalid sensitivity level' });
    }
    
    // Validate numeric ranges
    const scam = updates.scamDetectionConfig;
    if (scam) {
      if (scam.autoTimeoutDuration !== undefined && (scam.autoTimeoutDuration < 1 || scam.autoTimeoutDuration > 40320)) {
        return res.status(400).json({ error: 'autoTimeoutDuration must be between 1 and 40320 minutes' });
      }
      if (scam.minRiskScoreForAlert !== undefined && (scam.minRiskScoreForAlert < 0 || scam.minRiskScoreForAlert > 100)) {
        return res.status(400).json({ error: 'minRiskScoreForAlert must be between 0 and 100' });
      }
      if (scam.minRiskScoreForAutoAction !== undefined && (scam.minRiskScoreForAutoAction < 0 || scam.minRiskScoreForAutoAction > 100)) {
        return res.status(400).json({ error: 'minRiskScoreForAutoAction must be between 0 and 100' });
      }
      if (scam.duplicateMessageThreshold !== undefined && (scam.duplicateMessageThreshold < 2 || scam.duplicateMessageThreshold > 50)) {
        return res.status(400).json({ error: 'duplicateMessageThreshold must be between 2 and 50' });
      }
      if (scam.duplicateTimeWindow !== undefined && (scam.duplicateTimeWindow < 1 || scam.duplicateTimeWindow > 60)) {
        return res.status(400).json({ error: 'duplicateTimeWindow must be between 1 and 60 minutes' });
      }
      if (scam.accountAgeRequirement !== undefined && (scam.accountAgeRequirement < 0 || scam.accountAgeRequirement > 365)) {
        return res.status(400).json({ error: 'accountAgeRequirement must be between 0 and 365 days' });
      }
    }
    
    // Get existing settings or create new one
    const query = GUILD_ID ? { guildId: GUILD_ID } : {};
    let settings = await ServerSettings.findOne(query);
    
    if (!settings) {
      if (!GUILD_ID) {
        return res.status(400).json({ error: 'ALLOWED_GUILD_ID environment variable is required to create settings' });
      }
      // Create new settings with required guildId
      const newSettingsData = {
        guildId: GUILD_ID,
        ...updates
      };
      settings = new ServerSettings(newSettingsData);
    } else {
      // Update fields individually to avoid undefined issues
      if (updates.language !== undefined) settings.language = updates.language;
      if (updates.adminChannelId !== undefined) settings.adminChannelId = updates.adminChannelId;
      if (updates.teamRoleId !== undefined) settings.teamRoleId = updates.teamRoleId;
      if (updates.verifiedRoleId !== undefined) settings.verifiedRoleId = updates.verifiedRoleId;
      if (updates.onJoinRoleId !== undefined) settings.onJoinRoleId = updates.onJoinRoleId;
      
      // Handle scamDetectionConfig updates
      if (updates.scamDetectionConfig && typeof updates.scamDetectionConfig === 'object') {
        // Initialize if doesn't exist
        if (!settings.scamDetectionConfig) {
          settings.scamDetectionConfig = {};
        }
        
        // Update top-level scam detection config fields
        const scamConfig = updates.scamDetectionConfig;
        if (scamConfig.enabled !== undefined) settings.scamDetectionConfig.enabled = scamConfig.enabled;
        if (scamConfig.mode !== undefined) settings.scamDetectionConfig.mode = scamConfig.mode;
        if (scamConfig.sensitivity !== undefined) settings.scamDetectionConfig.sensitivity = scamConfig.sensitivity;
        if (scamConfig.autoDelete !== undefined) settings.scamDetectionConfig.autoDelete = scamConfig.autoDelete;
        if (scamConfig.autoTimeout !== undefined) settings.scamDetectionConfig.autoTimeout = scamConfig.autoTimeout;
        if (scamConfig.autoTimeoutDuration !== undefined) settings.scamDetectionConfig.autoTimeoutDuration = scamConfig.autoTimeoutDuration;
        if (scamConfig.alertChannelId !== undefined) settings.scamDetectionConfig.alertChannelId = scamConfig.alertChannelId;
        if (scamConfig.minRiskScoreForAlert !== undefined) settings.scamDetectionConfig.minRiskScoreForAlert = scamConfig.minRiskScoreForAlert;
        if (scamConfig.minRiskScoreForAutoAction !== undefined) settings.scamDetectionConfig.minRiskScoreForAutoAction = scamConfig.minRiskScoreForAutoAction;
        if (scamConfig.duplicateMessageThreshold !== undefined) settings.scamDetectionConfig.duplicateMessageThreshold = scamConfig.duplicateMessageThreshold;
        if (scamConfig.duplicateTimeWindow !== undefined) settings.scamDetectionConfig.duplicateTimeWindow = scamConfig.duplicateTimeWindow;
        if (scamConfig.accountAgeRequirement !== undefined) settings.scamDetectionConfig.accountAgeRequirement = scamConfig.accountAgeRequirement;
        if (scamConfig.firstMessageSuspicion !== undefined) settings.scamDetectionConfig.firstMessageSuspicion = scamConfig.firstMessageSuspicion;
        if (scamConfig.trustedUserIds !== undefined) settings.scamDetectionConfig.trustedUserIds = scamConfig.trustedUserIds;
        if (scamConfig.trustedDomains !== undefined) settings.scamDetectionConfig.trustedDomains = scamConfig.trustedDomains;
        
        // Handle nested aiSettings
        if (scamConfig.aiSettings && typeof scamConfig.aiSettings === 'object') {
          if (!settings.scamDetectionConfig.aiSettings) {
            settings.scamDetectionConfig.aiSettings = {};
          }
          const aiSettings = scamConfig.aiSettings;
          if (aiSettings.enabled !== undefined) settings.scamDetectionConfig.aiSettings.enabled = aiSettings.enabled;
          if (aiSettings.provider !== undefined) settings.scamDetectionConfig.aiSettings.provider = aiSettings.provider;
          if (aiSettings.baseUrl !== undefined) settings.scamDetectionConfig.aiSettings.baseUrl = aiSettings.baseUrl;
          if (aiSettings.model !== undefined) settings.scamDetectionConfig.aiSettings.model = aiSettings.model;
          if (shouldUpdateApiKey(aiSettings.apiKey)) settings.scamDetectionConfig.aiSettings.apiKey = aiSettings.apiKey;
          if (aiSettings.timeout !== undefined) settings.scamDetectionConfig.aiSettings.timeout = aiSettings.timeout;
          if (aiSettings.notifyAdminsOnFallback !== undefined) settings.scamDetectionConfig.aiSettings.notifyAdminsOnFallback = aiSettings.notifyAdminsOnFallback;
          if (aiSettings.healthCheckEnabled !== undefined) settings.scamDetectionConfig.aiSettings.healthCheckEnabled = aiSettings.healthCheckEnabled;
          if (aiSettings.healthCheckInterval !== undefined) settings.scamDetectionConfig.aiSettings.healthCheckInterval = aiSettings.healthCheckInterval;
          
          // Handle nested textModel
          if (aiSettings.textModel && typeof aiSettings.textModel === 'object') {
            if (!settings.scamDetectionConfig.aiSettings.textModel) {
              settings.scamDetectionConfig.aiSettings.textModel = {};
            }
            const tm = aiSettings.textModel;
            if (tm.provider !== undefined) settings.scamDetectionConfig.aiSettings.textModel.provider = tm.provider;
            if (tm.baseUrl !== undefined) settings.scamDetectionConfig.aiSettings.textModel.baseUrl = tm.baseUrl;
            if (tm.model !== undefined) settings.scamDetectionConfig.aiSettings.textModel.model = tm.model;
            if (shouldUpdateApiKey(tm.apiKey)) settings.scamDetectionConfig.aiSettings.textModel.apiKey = tm.apiKey;
            if (tm.timeout !== undefined) settings.scamDetectionConfig.aiSettings.textModel.timeout = tm.timeout;
          }
          
          // Handle nested visionModel
          if (aiSettings.visionModel && typeof aiSettings.visionModel === 'object') {
            if (!settings.scamDetectionConfig.aiSettings.visionModel) {
              settings.scamDetectionConfig.aiSettings.visionModel = {};
            }
            const vm = aiSettings.visionModel;
            if (vm.provider !== undefined) settings.scamDetectionConfig.aiSettings.visionModel.provider = vm.provider;
            if (vm.baseUrl !== undefined) settings.scamDetectionConfig.aiSettings.visionModel.baseUrl = vm.baseUrl;
            if (vm.model !== undefined) settings.scamDetectionConfig.aiSettings.visionModel.model = vm.model;
            if (shouldUpdateApiKey(vm.apiKey)) settings.scamDetectionConfig.aiSettings.visionModel.apiKey = vm.apiKey;
            if (vm.timeout !== undefined) settings.scamDetectionConfig.aiSettings.visionModel.timeout = vm.timeout;
          }
        }
        
        // Mark the nested object as modified for Mongoose
        settings.markModified('scamDetectionConfig');
      }
    }
    
    await settings.save();
    
    logger.security('Server settings updated', {
      ip: req.ip || req.connection.remoteAddress,
      updatedFields: Object.keys(updates),
    });
    
    // Broadcast settings update via WebSocket
    broadcast('settings-updated', { type: 'server-settings' });
    
    // Return sanitized settings
    const sanitizedSettings = settings.toObject();
    if (sanitizedSettings.scamDetectionConfig?.aiSettings) {
      if (sanitizedSettings.scamDetectionConfig.aiSettings.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.apiKey = '***HIDDEN***';
      }
      if (sanitizedSettings.scamDetectionConfig.aiSettings.textModel?.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.textModel.apiKey = '***HIDDEN***';
      }
      if (sanitizedSettings.scamDetectionConfig.aiSettings.visionModel?.apiKey) {
        sanitizedSettings.scamDetectionConfig.aiSettings.visionModel.apiKey = '***HIDDEN***';
      }
    }
    
    res.json(sanitizedSettings);
  } catch (err) {
    logger.error('Error updating server settings', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Banned Words API
app.get('/api/settings/banned-words', authMiddleware, async (req, res) => {
  try {
    const bannedWords = await BannedWord.find({}).lean();
    res.json(bannedWords.map(w => w.word).sort());
  } catch (err) {
    logger.error('Error fetching banned words', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/settings/banned-words', authMiddleware, async (req, res) => {
  try {
    const { word } = req.body;
    
    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return res.status(400).json({ error: 'Word is required' });
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    if (normalizedWord.length > 100) {
      return res.status(400).json({ error: 'Word must be 100 characters or less' });
    }
    
    // Check if word already exists
    const existing = await BannedWord.findOne({ word: normalizedWord });
    if (existing) {
      return res.status(400).json({ error: 'Word already banned' });
    }
    
    await BannedWord.create({ word: normalizedWord });
    
    logger.security('Banned word added', {
      ip: req.ip || req.connection.remoteAddress,
      word: normalizedWord,
    });
    
    // Broadcast update via WebSocket
    broadcast('settings-updated', { type: 'banned-words', action: 'add', word: normalizedWord });
    
    res.json({ success: true, word: normalizedWord });
  } catch (err) {
    logger.error('Error adding banned word', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/settings/banned-words/:word', authMiddleware, async (req, res) => {
  try {
    const { word } = req.params;
    const normalizedWord = word.toLowerCase().trim();
    
    const result = await BannedWord.deleteOne({ word: normalizedWord });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Word not found' });
    }
    
    logger.security('Banned word removed', {
      ip: req.ip || req.connection.remoteAddress,
      word: normalizedWord,
    });
    
    // Broadcast update via WebSocket
    broadcast('settings-updated', { type: 'banned-words', action: 'remove', word: normalizedWord });
    
    res.json({ success: true });
  } catch (err) {
    logger.error('Error removing banned word', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});


app.get('/api/monitoring/security-events', authMiddleware, (req, res) => {
  const hours = parseInt(req.query.hours || '24', 10);
  const events = getSecurityEvents(hours);
  res.json({ events, count: events.length });
});

app.get('/api/monitoring/errors', authMiddleware, (req, res) => {
  const hours = parseInt(req.query.hours || '24', 10);
  const errors = getErrorLogs(hours);
  res.json({ errors, count: errors.length });
});

app.get('/api/monitoring/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});


app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/logout') {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' });
    }
  });
});

const server = http.createServer(app);
initWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  logger.info('Admin UI is running', {
    url: `http://0.0.0.0:${PORT}`,
    environment: process.env.NODE_ENV,
    websocket: 'wss://0.0.0.0/ws',
  });
  
  logger.info('Monitoring endpoints available:', {
    health: '/api/monitoring/health',
    security: '/api/monitoring/security-events?hours=24',
    errors: '/api/monitoring/errors?hours=24',
  });
});
