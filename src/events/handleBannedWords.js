const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');

module.exports = async function handleBannedWords(client, message) {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const bannedWords = await BannedWord.find();

  for (const entry of bannedWords) {
    const banned = entry.word.toLowerCase();
    if (content.includes(banned)) {
      const settings = await ServerSettings.findOne();
      if (!settings?.adminChannelId) return;

      try {
        const adminChannel = await client.channels.fetch(settings.adminChannelId);
        if (!adminChannel) return;

        const guildId = message.guildId;

        const embed = new EmbedBuilder()
          .setTitle(await t(guildId, 'bannedWords.detected'))
          .setDescription(`**${await t(guildId, 'bannedWords.user')}:** ${message.author.tag}\n**${await t(guildId, 'bannedWords.channel')}:** <#${message.channel.id}>\n**${await t(guildId, 'bannedWords.message')}:** ${message.content}`)
          .addFields({ name: await t(guildId, 'bannedWords.word'), value: `\`${banned}\`` })
          .setColor('Red')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`warn_${message.author.id}_${banned}`)
            .setLabel(await t(guildId, 'bannedWords.warn'))
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId(`comment_${message.author.id}`)
            .setLabel(await t(guildId, 'bannedWords.comment'))
            .setStyle(ButtonStyle.Secondary)
        );

        await adminChannel.send({
          embeds: [embed],
          components: [row]
        });
      } catch (err) {
        console.error('Error sending to the admin channel:', err);
      }

      break;
    }
  }
};