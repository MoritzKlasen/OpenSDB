const mongoose = require('mongoose');

const verifiedUserSchema = new mongoose.Schema({
  verificationNumber: { type: Number, unique: true },
  discordTag: String,
  discordId: String,
  firstName: String,
  lastName: String,
  comment: { type: String, default: "" },
});

module.exports = mongoose.model('VerifiedUser', verifiedUserSchema);
