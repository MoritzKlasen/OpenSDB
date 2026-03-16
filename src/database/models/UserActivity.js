const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  lastMessageTime: { type: Date, default: Date.now },
  messageCount: { type: Number, default: 0 },
  channelsPostIn: [{ type: String }],
  firstLinkTime: { type: Date },
  hasPostedLinks: { type: Boolean, default: false },
  accountAge: { type: Number },
  recentMessages: [
    {
      content: String,
      channelId: String,
      timestamp: Date,
      contentHash: String,
    }
  ],
  suspicionScore: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userActivitySchema.index({ guildId: 1, userId: 1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);
