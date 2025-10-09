const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isAdmin && !isTeam) {
      return interaction.reply({ content: '❌ No Permission.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    if (channel.guild.id !== interaction.guild.id) {
      return interaction.reply({ content: '❌ The specified channel does not belong to this server.', flags: 64 });
    }

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