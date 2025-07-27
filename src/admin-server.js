const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
const JWT_SECRET = bcrypt.hashSync(process.env.JWT_SECRET, 10);

const VerifiedUser = require('./database/models/VerifiedUser');
const { Parser } = require('json2csv');
const multer = require('multer');
const csv = require('csvtojson');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.ADMIN_UI_PORT || 8001;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],   // Inline-Scripts erlauben
        styleSrc: ["'self'", "'unsafe-inline'"],    // Inline-Styles erlauben
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

app.use(express.json());
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'admin-ui', 'assets')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username !== ADMIN_USERNAME ||
    !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)
  ) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true });
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

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect login credentials' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true });
  res.json({ success: true });
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
      warnings: 1
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
      _id: 0
    }).lean();

    const data = users.map(u => ({
      verificationNumber: u.verificationNumber,
      discordTag: u.discordTag,
      discordId: u.discordId,
      firstName: u.firstName,
      lastName: u.lastName,
      comment: u.comment,
      warnings: JSON.stringify(u.warnings)
    }));

    const fields = [
      'verificationNumber',
      'discordTag',
      'discordId',
      'firstName',
      'lastName',
      'comment',
      'warnings'
    ];
    const parser = new Parser({ fields });
    const csvData = parser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment('verified_users.csv');
    res.send(csvData);
  } catch (err) {
    console.error('Error during CSV export:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.post(
  '/api/import-users',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const users = await csv().fromString(req.file.buffer.toString());
      let imported = 0;

      for (const row of users) {
        let warnings = [];
        try {
          warnings = JSON.parse(row.warnings || '[]');
        } catch { }

        await VerifiedUser.updateOne(
          { discordId: row.discordId },
          {
            $set: {
              verificationNumber: Number(row.verificationNumber),
              discordTag: row.discordTag,
              firstName: row.firstName,
              lastName: row.lastName,
              comment: row.comment || '',
              warnings: warnings
            }
          },
          { upsert: true }
        );
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

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("✅ Connected to MongoDB!"))
  .catch(err => console.error("❌ MongoDB connection failed:", err));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Admin UI is running at: http://0.0.0.0:${PORT}`);
});