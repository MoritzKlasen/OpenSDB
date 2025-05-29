const { SlashCommandBuilder } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setadminchannel')
    .setDescription('Setzt den Admin-Channel für Wortmeldungen')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Admin-Channel')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;

    if (interaction.user.id !== guildOwnerId) {
      return interaction.reply({
        content: '❌ Nur der Server-Owner darf das ausführen.',
        flags: 64
      });
    }

    const channel = interaction.options.getChannel('channel');

    await ServerSettings.findOneAndUpdate(
      {},
      { adminChannelId: channel.id },
      { upsert: true }
    );

    await interaction.reply({
      content: `✅ Admin-Channel wurde gesetzt: ${channel.toString()}`,
      flags: 64
    });
  }
};