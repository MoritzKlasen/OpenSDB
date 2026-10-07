const mongoose = require('mongoose');

const serverSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  teamRoleId: { type: String },
  adminChannelId: { type: String },
  verifiedRoleId: { type: String, required: false },
  onJoinRoleId: { type: String },
  language: {type: String, enum: ["de", "en", "es", "fr", "it", "tr", "zh"], default: "en"},
  
  scamDetectionConfig: {
    enabled: { type: Boolean, default: false },
    mode: { type: String, enum: ['default', 'ai'], default: 'default' },
    sensitivity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    
    autoDelete: { type: Boolean, default: false },
    autoTimeout: { type: Boolean, default: false },
    autoTimeoutDuration: { type: Number, default: 60 },
    alertChannelId: { type: String },
    minRiskScoreForAlert: { type: Number, default: 45 },
    minRiskScoreForAutoAction: { type: Number, default: 80 },
    
    duplicateMessageThreshold: { type: Number, default: 3 },
    duplicateTimeWindow: { type: Number, default: 2 },
    accountAgeRequirement: { type: Number, default: 7 },
    firstMessageSuspicion: { type: Boolean, default: true },
    
    trustedUserIds: [String],
    trustedDomains: [String],
    
    aiSettings: {
      enabled: { type: Boolean, default: false },
      
      provider: { type: String },
      baseUrl: { type: String },
      model: { type: String },
      apiKey: { type: String },
      timeout: { type: Number, default: 30000 },
      
      textModel: {
        provider: { type: String },
        baseUrl: { type: String },
        model: { type: String },
        apiKey: { type: String },
        timeout: { type: Number }
      },
      visionModel: {
        provider: { type: String },
        baseUrl: { type: String },
        model: { type: String },
        apiKey: { type: String },
        timeout: { type: Number }
      },
      
      notifyAdminsOnFallback: { type: Boolean, default: true },
      healthCheckEnabled: { type: Boolean, default: true },
      healthCheckInterval: { type: Number, default: 3600000 },
    },
    
    lastHealthCheckTime: Date,
    aiHealthStatus: { type: String, enum: ['healthy', 'unhealthy', 'unknown'], default: 'unknown' },
    aiHealthCheckReason: String,
  }
});

module.exports = mongoose.model('ServerSettings', serverSettingsSchema);