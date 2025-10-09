const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setadminchannel')
    .setDescription('Legt den Admin-Kanal für Wortmeldungen fest.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Admin-Kanal')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isAdmin && !isTeam) {
      return interaction.reply({ content: '❌ Keine Berechtigung.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    if (channel.guild.id !== interaction.guild.id) {
      return interaction.reply({ content: '❌ Der angegebene Kanal gehört nicht zu diesem Server.', flags: 64 });
    }

    await ServerSettings.findOneAndUpdate(
      {},
      { adminChannelId: channel.id },
      { upsert: true }
    );

    await interaction.reply({
      content: `✅ Admin-Kanal wurde festgelegt: ${channel.toString()}`,
      flags: 64
    });
  }
};
