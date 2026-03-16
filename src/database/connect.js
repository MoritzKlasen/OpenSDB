const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

async function connectDB() {
  try {
    await mongoose.connect(process.env.DB_URI, {
    });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('Error connecting to MongoDB', { error: err.message });
    process.exit(1);
  }
}

module.exports = connectDB;