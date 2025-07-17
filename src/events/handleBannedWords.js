const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
} = require('discord.js');

const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');
const VerifiedUser = require('../database/models/VerifiedUser');

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

        const embed = new EmbedBuilder()
          .setTitle('🚨 Banned word detected')
          .setDescription(`**User:** ${message.author.tag}\n**Channel:** <#${message.channel.id}>\n**Message:** ${message.content}`)
          .addFields({ name: 'Word', value: `\`${banned}\`` })
          .setColor('Red')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`warn_${message.author.id}_${banned}`)
            .setLabel('Warn')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId(`comment_${message.author.id}`)
            .setLabel('Comment')
            .setStyle(ButtonStyle.Secondary)
        );

        await adminChannel.send({
          embeds: [embed],
          components: [row]
        });
      } catch (err) {
        console.error('❌ Error sending to the admin channel:', err);
      }

      break;
    }
  }
};