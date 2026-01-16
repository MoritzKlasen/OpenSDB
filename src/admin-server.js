const express       = require('express');
const cookieParser  = require('cookie-parser');
const jwt           = require('jsonwebtoken');
const bcrypt        = require('bcrypt');
const path          = require('path');
const mongoose      = require('mongoose');
require('dotenv').config();
const ADMIN_USERNAME      = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
const VerifiedUser = require('./database/models/VerifiedUser');
const { Parser } = require('json2csv');
const multer = require('multer');
const csv = require('csvtojson');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.ADMIN_UI_PORT || 8001; 
const JWT_SECRET = bcrypt.hashSync(process.env.JWT_SECRET, 10);

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB!"))
.catch(err => console.error("❌ MongoDB connection failed:", err));

app.use(express.json());
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'admin-ui', 'assets')));

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
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
const metricsBasic = basicAuth(process.env.METRICS_BASIC_USER || "grafana", process.env.METRICS_BASIC_PASS || "changeMe!");

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username !== ADMIN_USERNAME ||
    !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)
  ) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true, secure: true });
  res.json({ success: true });
});

app.get('/', (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect('/login.html');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    return res.redirect('/dashboard');
  } catch {
    return res.redirect('/login.html');
  }
});

app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-ui', 'login.html'));
});

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect('/login.html');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.redirect('/login.html');
  }
}

app.get(['/dashboard', '/dashboard.html'], authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-ui', 'dashboard.html'));
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
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/remove-warning/:discordId/:index', authMiddleware, async (req, res) => {
  const { discordId, index } = req.params;
  try {
    const user = await VerifiedUser.findOne({ discordId });
    if (!user || !user.warnings?.[index]) {
      return res.status(404).json({ error: 'Warning not found' });
    }
    user.warnings.splice(index, 1);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing the warning:', err);
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
    console.error('Error during CSV export:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get(
  ['/api/metrics/users-per-day', '/api/metrics/users-per-day.csv', '/api/metrics/users-per-day.json'],
  metricsBasic,
  async (req, res) => {
    try {
      const tz   = req.query.tz   || 'Europe/Vienna';
      const from = req.query.from ? new Date(req.query.from) : new Date('2024-01-01');
      const to   = req.query.to   ? new Date(req.query.to)   : new Date();
      if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'Invalid from/to' });
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
      console.error('Metrics error:', err);
      return res.status(500).json({ error: 'Internal error' });
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

      const rows = await csv().fromString(req.file.buffer.toString('utf-8'));
      let imported = 0;

      for (const row of rows) {
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

      res.json({ success: true, imported });
    } catch (err) {
      console.error('Import error:', err);
      res.status(500).json({ error: 'Import failed' });
    }
  }
);

app.put('/api/update-comment/:discordId', authMiddleware, async (req, res) => {
  const { discordId } = req.params;
  const { comment } = req.body;

  try {
    const user = await VerifiedUser.findOne({ discordId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.comment = comment;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating the comment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login.html');
});

app.listen(PORT, '0.0.0.0',() => {
  console.log(`✅ Admin UI is running at: http://0.0.0.0:${PORT}`);
});
