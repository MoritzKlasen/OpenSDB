const mongoose = require('mongoose');

const verifiedUserSchema = new mongoose.Schema({
  verificationNumber: { type: Number, unique: true },
  discordTag: String,
  discordId: String,
  firstName: String,
  lastName: String,
  comment: { type: String, default: "" },
  warnings: [
    {
      reason: String,
      issuedBy: String,
      date: { type: Date, default: Date.now }
    }
  ],
  verifiedAt: { type: Date, default: null }
});

module.exports = mongoose.model('VerifiedUser', verifiedUserSchema);
