const mongoose = require('mongoose');

const scamDetectionEventSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  messageId: { type: String, index: true },
  channelId: { type: String, required: true },
  messageContent: { type: String },
  
  modeUsed: { 
    type: String, 
    enum: ['default', 'ai'],
    required: true 
  },
  fallbackTriggered: { type: Boolean, default: false },
  fallbackReason: { type: String },
  aiProvider: { type: String },
  aiModel: { type: String },
  aiClassification: { type: String },
  aiConfidence: { type: Number },
  aiReason: { type: String },
  
  detectionReasons: [String],
  extractedLinks: [String],
  extractedDomains: [String],
  
  riskScore: { type: Number, required: true },
  riskLevel: { 
    type: String, 
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true
  },
  
  actionTaken: {
    type: String,
    enum: ['none', 'flagged', 'deleted', 'timedout'],
    default: 'flagged'
  },
  actionReason: String,
  timeoutDuration: Number,
  
  alertSent: { type: Boolean, default: false },
  alertMessageId: String,
  dismissed: { type: Boolean, default: false },
  dismissedAt: Date,
  dismissedBy: String,
  
  detectedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

scamDetectionEventSchema.index({ guildId: 1, createdAt: -1 });
scamDetectionEventSchema.index({ userId: 1, modeUsed: 1 });
scamDetectionEventSchema.index({ fallbackTriggered: 1, createdAt: -1 });

module.exports = mongoose.model('ScamDetectionEvent', scamDetectionEventSchema);
