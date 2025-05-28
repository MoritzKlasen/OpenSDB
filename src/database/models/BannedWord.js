const mongoose = require('mongoose');

const bannedWordSchema = new mongoose.Schema({
  word: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('BannedWord', bannedWordSchema);