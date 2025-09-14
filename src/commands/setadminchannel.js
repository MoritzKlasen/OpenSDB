const { SlashCommandBuilder } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setadminchannel')
    .setDescription('Sets the admin channel for word reports')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Admin channel')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;

    if (interaction.user.id !== guildOwnerId) {
      return interaction.reply({
        content: '❌ No permission.',
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
      content: `✅ Admin channel has been set: ${channel.toString()}`,
      flags: 64
    });
  }
};