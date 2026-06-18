const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 10000;

async function connectDB(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.DB_URI, {});
      logger.info('Connected to MongoDB');
      return;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt}/${retries} failed`, { error: err.message });
      if (attempt < retries) {
        const delay = Math.min(BACKOFF_BASE_MS * attempt, BACKOFF_MAX_MS);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  logger.error('All MongoDB connection attempts failed, exiting');
  process.exit(1);
}

module.exports = connectDB;