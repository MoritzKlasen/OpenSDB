require('dotenv').config();

const express       = require('express');
const cookieParser  = require('cookie-parser');
const bcrypt        = require('bcrypt');
const path          = require('path');
const mongoose      = require('mongoose');
const crypto        = require('crypto');
const http          = require('http');
const { initWebSocket, broadcast, closeSessionsForToken } = require('./utils/websocket');
const { issueToken, verifyToken, revokeToken, TOKEN_TTL_SECONDS } = require('./utils/authTokens');
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
const { MAX_COMMENT_LENGTH } = require('./utils/constants');

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

// CSRF protection: require X-Requested-With: XMLHttpRequest on state-changing requests.
// Browsers block cross-origin custom headers by default, so this prevents CSRF.
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    // Skip for internal API (uses signature-based auth)
    if (req.path === '/api/internal/notify-change') return next();
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Missing or invalid CSRF header' });
    }
  }
  next();
});

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash first so inputs of different length still compare in constant time
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
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

const AUTH_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict' };

app.post('/api/login', createLoginLimiter(), async (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Always run bcrypt (async, off the event loop) so the response time
  // doesn't reveal whether the username was correct
  const passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  const usernameOk = timingSafeEqual(username, ADMIN_USERNAME);

  if (!usernameOk || !passwordOk) {
    logger.security('login_failed', {
      username,
      ip,
      reason: 'Invalid credentials',
    });
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  const token = issueToken(username);
  res.cookie('token', token, { ...AUTH_COOKIE_OPTIONS, maxAge: TOKEN_TTL_SECONDS * 1000 });
  
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
    verifyToken(token);
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

// Spreadsheet apps execute cells starting with these characters as formulas
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvFormula(value) {
  return typeof value === 'string' && CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

// Reverses escapeCsvFormula so exported files can be re-imported unchanged
function unescapeCsvFormula(value) {
  return typeof value === 'string' && value.startsWith("'") && CSV_FORMULA_PREFIX.test(value.slice(1))
    ? value.slice(1)
    : value;
}

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
      discordTag: escapeCsvFormula(u.discordTag ?? ''),
      discordId: u.discordId ?? '',
      firstName: escapeCsvFormula(u.firstName ?? ''),
      lastName: escapeCsvFormula(u.lastName ?? ''),
      comment: escapeCsvFormula(u.comment ?? ''),
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

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Resolves ?tz= (or SERVER_TIMEZONE); sends a 400 and returns null for unknown zones
function resolveTimezone(query, res) {
  const tz = query.tz || process.env.SERVER_TIMEZONE || 'UTC';
  if (typeof tz !== 'string' || !isValidTimezone(tz)) {
    res.status(400).json({ error: 'Invalid timezone' });
    return null;
  }
  return tz;
}

// Builds one entry per calendar day in [from, to], filling days without rows with 0.
// Iterates in UTC so the server's local timezone / DST cannot skip or repeat a day.
function fillDailyCounts(rows, from, to) {
  const map = new Map(rows.map(r => [r._id, r.count]));
  const out = [];
  const cur = new Date(from);
  while (cur <= to) {
    const day = cur.toISOString().slice(0, 10);
    out.push({ ts: new Date(day).toISOString(), count: map.get(day) || 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function parseDateRange(query, res, maxDays = 730) {
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const to   = query.to   ? new Date(query.to)   : new Date();

  if (isNaN(from) || isNaN(to)) {
    res.status(400).json({ error: 'Invalid from/to' });
    return null;
  }

  const rangeDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
  if (rangeDays > maxDays || rangeDays < 0) {
    res.status(400).json({ error: `Date range must be between 0 and ${maxDays} days` });
    return null;
  }

  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

app.get(
  ['/api/metrics/users-per-day', '/api/metrics/users-per-day.csv', '/api/metrics/users-per-day.json'],
  metricsBasic,
  async (req, res) => {
    try {
      const tz = resolveTimezone(req.query, res);
      if (!tz) return;
      const range = parseDateRange(req.query, res);
      if (!range) return;
      const { from, to } = range;

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

      let cum = 0;
      const data = fillDailyCounts(rows, from, to).map(d => ({
        ts: d.ts,
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

function parseImportedWarnings(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const warnings = [];
  for (const w of parsed) {
    if (!w || typeof w !== 'object' || typeof w.reason !== 'string') return null;
    const date = w.date ? new Date(w.date) : new Date();
    if (isNaN(date.getTime())) return null;
    warnings.push({
      reason: w.reason.slice(0, 1000),
      issuedBy: typeof w.issuedBy === 'string' ? w.issuedBy : '',
      date,
    });
  }
  return warnings;
}

// Imports a single CSV row. Returns { error } when the row is skipped.
async function importUserRow(row, allocateVerificationNumber) {
  const discordId = String(row.discordId || '').trim();
  if (!/^\d{17,20}$/.test(discordId)) {
    return { error: 'Invalid or missing discordId' };
  }

  const warnings = parseImportedWarnings(row.warnings);
  if (warnings === null) {
    return { error: 'Invalid warnings column (expected a JSON list of {reason, issuedBy, date})' };
  }

  let parsedVerifiedAt = null;
  if (row.verifiedAt && typeof row.verifiedAt === 'string') {
    const d = new Date(row.verifiedAt);
    if (!isNaN(d.getTime())) parsedVerifiedAt = d;
  }

  const rawNumber = String(row.verificationNumber ?? '').trim();
  let verificationNumber = null;
  if (rawNumber !== '') {
    verificationNumber = Number(rawNumber);
    if (!Number.isInteger(verificationNumber) || verificationNumber <= 0) {
      return { error: `Invalid verificationNumber "${rawNumber}"` };
    }
    const owner = await VerifiedUser.findOne({ verificationNumber }, { discordId: 1 }).lean();
    if (owner && owner.discordId !== discordId) {
      return { error: `verificationNumber ${verificationNumber} already belongs to ${owner.discordId}` };
    }
  }

  const existing = await VerifiedUser.findOne({ discordId }).lean();

  const setFields = {
    discordTag: unescapeCsvFormula(String(row.discordTag || '')).slice(0, 100),
    firstName: unescapeCsvFormula(String(row.firstName || '')).slice(0, 200),
    lastName: unescapeCsvFormula(String(row.lastName || '')).slice(0, 200),
    comment: unescapeCsvFormula(String(row.comment || '')).slice(0, 4000),
    warnings
  };

  if (verificationNumber !== null) {
    setFields.verificationNumber = verificationNumber;
  } else if (!existing?.verificationNumber) {
    // Keep an existing user's number; only new users get the next free one
    setFields.verificationNumber = allocateVerificationNumber();
  }

  if (parsedVerifiedAt && !existing?.verifiedAt) {
    setFields.verifiedAt = parsedVerifiedAt;
  }

  await VerifiedUser.updateOne(
    { discordId },
    { $set: setFields },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return {};
}

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

      // Strip the BOM our own export adds, otherwise the first header gets a BOM prefix
      const content = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const rows = await csv().fromString(content);

      const requiredColumns = ['discordId'];
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const missing = requiredColumns.filter(c => !columns.includes(c));
        if (missing.length > 0) {
          return res.status(400).json({ error: `Missing required columns: ${missing.join(', ')}` });
        }
      }

      // New users get numbers above both the DB maximum and any number used in the file,
      // so an auto-assigned number never collides with an explicit one in a later row
      const last = await VerifiedUser.findOne({}, { verificationNumber: 1 }).sort({ verificationNumber: -1 }).lean();
      const maxInFile = rows.reduce((max, row) => {
        const n = Number(String(row.verificationNumber ?? '').trim());
        return Number.isInteger(n) && n > max ? n : max;
      }, 0);
      let nextVerificationNumber = Math.max(last?.verificationNumber || 0, maxInFile) + 1;

      let imported = 0;
      const skipped = [];

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2; // +1 for the header, +1 for 1-based line numbers
        try {
          const result = await importUserRow(row, () => nextVerificationNumber++);
          if (result.error) {
            skipped.push({ row: rowNumber, discordId: row.discordId || '', reason: result.error });
          } else {
            imported++;
          }
        } catch (err) {
          logger.error('Import row failed', { row: rowNumber, error: err.message });
          skipped.push({ row: rowNumber, discordId: row.discordId || '', reason: 'Database error' });
        }
      }

      broadcast('users-updated', { type: 'import' });
      broadcast('analytics-updated', { type: 'import' });
      res.json({ success: true, imported, skipped });
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
  if (typeof comment === 'string' && comment.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Comment too long (max ${MAX_COMMENT_LENGTH} characters)` });
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
    const tz = resolveTimezone(req.query, res);
    if (!tz) return;
    const range = parseDateRange(req.query, res);
    if (!range) return;
    const { from, to } = range;

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

    res.json(fillDailyCounts(rows, from, to));
  } catch (err) {
    logger.error('Analytics error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/dashboard/users-growth', authMiddleware, async (req, res) => {
  try {
    const range = parseDateRange(req.query, res);
    if (!range) return;
    const { from, to } = range;

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

    let cumulativeCount = usersBeforeRange;
    const data = fillDailyCounts(rows, from, to).map(d => ({
      ts: d.ts,
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
    const range = parseDateRange(req.query, res);
    if (!range) return;
    const { from, to } = range;

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

    res.json(fillDailyCounts(rows, from, to));
  } catch (err) {
    logger.error('Warnings activity error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Scam Detection Alerts Activity
app.get('/api/dashboard/alerts-activity', authMiddleware, async (req, res) => {
  try {
    const range = parseDateRange(req.query, res);
    if (!range) return;
    const { from, to } = range;

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

    res.json(fillDailyCounts(rows, from, to));
  } catch (err) {
    logger.error('Alerts activity error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hide API keys in settings responses (mutates and returns the given plain object)
function sanitizeSettings(settings) {
  const ai = settings.scamDetectionConfig?.aiSettings;
  if (ai) {
    for (const cfg of [ai, ai.textModel, ai.visionModel]) {
      if (cfg?.apiKey) cfg.apiKey = '***HIDDEN***';
    }
  }
  return settings;
}

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
    
    res.json(sanitizeSettings(settings));
  } catch (err) {
    logger.error('Error fetching server settings', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Returns an error message for the first invalid field, or null if the update is valid
function validateSettingsUpdate(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return 'Request body must be an object';
  }

  if (updates.language !== undefined && !SUPPORTED_LANGUAGES.has(updates.language)) {
    return 'Invalid language code';
  }

  // Discord ID fields must be snowflakes, or empty to clear
  for (const field of ['adminChannelId', 'teamRoleId', 'verifiedRoleId', 'onJoinRoleId']) {
    const v = updates[field];
    if (v !== undefined && v !== '' && !(typeof v === 'string' && DISCORD_ID_PATTERN.test(v))) {
      return `Invalid ${field} - must be a Discord snowflake ID`;
    }
  }

  const scam = updates.scamDetectionConfig;
  if (scam === undefined) return null;
  if (!scam || typeof scam !== 'object' || Array.isArray(scam)) {
    return 'scamDetectionConfig must be an object';
  }

  if (scam.alertChannelId !== undefined && scam.alertChannelId !== '' &&
      !(typeof scam.alertChannelId === 'string' && DISCORD_ID_PATTERN.test(scam.alertChannelId))) {
    return 'Invalid alertChannelId - must be a Discord snowflake ID';
  }
  if (scam.mode !== undefined && !['default', 'ai'].includes(scam.mode)) {
    return 'Invalid scam detection mode';
  }
  if (scam.sensitivity !== undefined && !['low', 'medium', 'high'].includes(scam.sensitivity)) {
    return 'Invalid sensitivity level';
  }
  for (const field of ['enabled', 'autoDelete', 'autoTimeout', 'firstMessageSuspicion']) {
    if (scam[field] !== undefined && typeof scam[field] !== 'boolean') {
      return `${field} must be true or false`;
    }
  }

  const ranges = {
    autoTimeoutDuration: [1, 40320, 'minutes'],
    minRiskScoreForAlert: [0, 100, ''],
    minRiskScoreForAutoAction: [0, 100, ''],
    duplicateMessageThreshold: [2, 50, ''],
    duplicateTimeWindow: [1, 60, 'minutes'],
    accountAgeRequirement: [0, 365, 'days'],
  };
  for (const [field, [min, max, unit]] of Object.entries(ranges)) {
    const v = scam[field];
    if (v !== undefined && (!isFiniteNumber(v) || v < min || v > max)) {
      return `${field} must be a number between ${min} and ${max}${unit ? ` ${unit}` : ''}`;
    }
  }

  if (scam.trustedUserIds !== undefined &&
      !(Array.isArray(scam.trustedUserIds) && scam.trustedUserIds.every(id => typeof id === 'string' && DISCORD_ID_PATTERN.test(id)))) {
    return 'trustedUserIds must be a list of Discord user IDs';
  }
  if (scam.trustedDomains !== undefined &&
      !(Array.isArray(scam.trustedDomains) && scam.trustedDomains.every(d => typeof d === 'string' && d.length > 0 && d.length <= 253))) {
    return 'trustedDomains must be a list of domain names';
  }

  const ai = scam.aiSettings;
  if (ai === undefined) return null;
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) {
    return 'aiSettings must be an object';
  }
  for (const field of ['enabled', 'notifyAdminsOnFallback', 'healthCheckEnabled']) {
    if (ai[field] !== undefined && typeof ai[field] !== 'boolean') {
      return `aiSettings.${field} must be true or false`;
    }
  }
  if (ai.healthCheckInterval !== undefined &&
      (!isFiniteNumber(ai.healthCheckInterval) || ai.healthCheckInterval < 60000 || ai.healthCheckInterval > 7 * 24 * 3600000)) {
    return 'aiSettings.healthCheckInterval must be between 60000 and 604800000 ms';
  }

  const modelConfigs = [['aiSettings', ai]];
  for (const nested of ['textModel', 'visionModel']) {
    if (ai[nested] === undefined) continue;
    if (!ai[nested] || typeof ai[nested] !== 'object' || Array.isArray(ai[nested])) {
      return `aiSettings.${nested} must be an object`;
    }
    modelConfigs.push([`aiSettings.${nested}`, ai[nested]]);
  }
  for (const [prefix, cfg] of modelConfigs) {
    for (const field of ['provider', 'model', 'apiKey', 'baseUrl']) {
      if (cfg[field] !== undefined && (typeof cfg[field] !== 'string' || cfg[field].length > 2000)) {
        return `${prefix}.${field} must be a string`;
      }
    }
    if (cfg.baseUrl && !/^https?:\/\//i.test(cfg.baseUrl)) {
      return `${prefix}.baseUrl must start with http:// or https://`;
    }
    if (cfg.timeout !== undefined && (!isFiniteNumber(cfg.timeout) || cfg.timeout < 1000 || cfg.timeout > 300000)) {
      return `${prefix}.timeout must be between 1000 and 300000 ms`;
    }
  }

  return null;
}

function assignDefined(target, source, fields) {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = source[field];
  }
}

function assignModelConfig(target, source) {
  assignDefined(target, source, ['provider', 'baseUrl', 'model', 'timeout']);
  // The UI echoes back the masked key; only overwrite when a real new key is sent
  if (shouldUpdateApiKey(source.apiKey)) target.apiKey = source.apiKey;
}

app.put('/api/settings/server', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;

    const validationError = validateSettingsUpdate(updates);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Get existing settings or create new one
    const query = GUILD_ID ? { guildId: GUILD_ID } : {};
    let settings = await ServerSettings.findOne(query);

    if (!settings) {
      if (!GUILD_ID) {
        return res.status(400).json({ error: 'ALLOWED_GUILD_ID environment variable is required to create settings' });
      }
      // New documents go through the same field-by-field path as updates,
      // so masked API keys and unknown fields are never stored
      settings = new ServerSettings({ guildId: GUILD_ID });
    }

    assignDefined(settings, updates, ['language', 'adminChannelId', 'teamRoleId', 'verifiedRoleId', 'onJoinRoleId']);

    const scamConfig = updates.scamDetectionConfig;
    if (scamConfig) {
      if (!settings.scamDetectionConfig) settings.scamDetectionConfig = {};
      const target = settings.scamDetectionConfig;

      assignDefined(target, scamConfig, [
        'enabled', 'mode', 'sensitivity', 'autoDelete', 'autoTimeout', 'autoTimeoutDuration',
        'alertChannelId', 'minRiskScoreForAlert', 'minRiskScoreForAutoAction',
        'duplicateMessageThreshold', 'duplicateTimeWindow', 'accountAgeRequirement',
        'firstMessageSuspicion', 'trustedUserIds', 'trustedDomains',
      ]);

      const aiSettings = scamConfig.aiSettings;
      if (aiSettings) {
        if (!target.aiSettings) target.aiSettings = {};
        assignDefined(target.aiSettings, aiSettings, ['enabled', 'notifyAdminsOnFallback', 'healthCheckEnabled', 'healthCheckInterval']);
        assignModelConfig(target.aiSettings, aiSettings);

        for (const nested of ['textModel', 'visionModel']) {
          if (!aiSettings[nested]) continue;
          if (!target.aiSettings[nested]) target.aiSettings[nested] = {};
          assignModelConfig(target.aiSettings[nested], aiSettings[nested]);
        }
      }

      // Mark the nested object as modified for Mongoose
      settings.markModified('scamDetectionConfig');
    }

    await settings.save();

    logger.security('Server settings updated', {
      ip: req.ip || req.connection.remoteAddress,
      updatedFields: Object.keys(updates),
    });

    // Broadcast settings update via WebSocket
    broadcast('settings-updated', { type: 'server-settings' });

    res.json(sanitizeSettings(settings.toObject()));
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
  const token = req.cookies.token;
  if (token) {
    const payload = revokeToken(token);
    if (payload) closeSessionsForToken(payload.jti);
  }
  res.clearCookie('token', AUTH_COOKIE_OPTIONS);
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
