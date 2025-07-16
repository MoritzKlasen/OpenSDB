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

const app = express();
const PORT = 3001;
const JWT_SECRET = bcrypt.hashSync(process.env.JWT_SECRET, 10);

mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Mit MongoDB verbunden!"))
.catch(err => console.error("❌ MongoDB-Verbindung fehlgeschlagen:", err));

app.use(express.json());
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'admin-ui', 'assets')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username !== ADMIN_USERNAME ||
    !bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)
  ) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch' });
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
    return res.status(401).json({ error: 'Falsche Zugangsdaten' });
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
    console.error('Fehler beim Abrufen der User:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.delete('/api/remove-warning/:discordId/:index', authMiddleware, async (req, res) => {
  const { discordId, index } = req.params;
  try {
    const user = await VerifiedUser.findOne({ discordId });
    if (!user || !user.warnings?.[index]) {
      return res.status(404).json({ error: 'Warnung nicht gefunden' });
    }
    user.warnings.splice(index, 1);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Entfernen der Warnung:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.delete('/api/delete-user/:discordId', authMiddleware, async (req, res) => {
  try {
    await VerifiedUser.deleteOne({ discordId: req.params.discordId });
    res.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Löschen des Users:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.put('/api/update-comment/:discordId', authMiddleware, async (req, res) => {
  const { discordId } = req.params;
  const { comment } = req.body;

  try {
    const user = await VerifiedUser.findOne({ discordId });
    if (!user) {
      return res.status(404).json({ error: 'User nicht gefunden' });
    }
    user.comment = comment;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Kommentars:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login.html');
});

app.listen(PORT, () => {
  console.log(`✅ Admin UI läuft unter: http://localhost:${PORT}`);
});