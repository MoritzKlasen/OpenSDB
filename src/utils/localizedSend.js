const LocalizedMessage = require("../database/models/LocalizedMessage");
const { t } = require("./i18n");

async function sendTracked(channel, guildId, key, vars = {}, options = {}) {
  const content = await t(guildId, key, vars);

  const msg = await channel.send({
    content,
    ...options
  });

  await LocalizedMessage.updateOne(
    { guildId, messageId: msg.id },
    { $set: { guildId, channelId: channel.id, messageId: msg.id, key, vars } },
    { upsert: true }
  );

  return msg;
}

module.exports = { sendTracked };
