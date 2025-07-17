const mongoose = require('mongoose');

const serverSettingsSchema = new mongoose.Schema({
  teamRoleId: { type: String },
  adminChannelId: { type: String },
  verifiedRoleId: { type: String, required: false }
});

module.exports = mongoose.model('ServerSettings', serverSettingsSchema);