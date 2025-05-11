const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URI, {
    });
    console.log('✅ Mit MongoDB verbunden.');
  } catch (err) {
    console.error('❌ Fehler bei der MongoDB-Verbindung:', err);
  }
}

module.exports = connectDB;
