const { Schema, model } = require("mongoose");

const LocalizedMessageSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    key: { type: String, required: true },
    vars: { type: Schema.Types.Mixed, default: {} },
    overrides: {
      title: { type: String, default: null },
      description: { type: String, default: null },
      button: { type: String, default: null }
    }
  },
  { timestamps: true }
);

LocalizedMessageSchema.index({ guildId: 1, messageId: 1 }, { unique: true });

module.exports = model("LocalizedMessage", LocalizedMessageSchema);
