const mongoose = require('mongoose');

const serverSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  teamRoleId: { type: String },
  adminChannelId: { type: String },
  verifiedRoleId: { type: String, required: false },
  onJoinRoleId: { type: String },
  language: {type: String, enum: ["de", "en"], default: "en"},
});

module.exports = mongoose.model('ServerSettings', serverSettingsSchema);