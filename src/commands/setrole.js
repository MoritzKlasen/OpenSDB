const { SlashCommandBuilder } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Sets important roles for the bot')
    .addRoleOption(option =>
      option.setName('teamrole')
        .setDescription('The role with team access')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('verifiedrole')
        .setDescription('The role that verified users will receive')
        .setRequired(false)),

  async execute(interaction) {
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner) {
      return interaction.reply({
        content: '❌ Only the server owner is allowed to execute this.',
        flags: 64
      });
    }

    const teamRole = interaction.options.getRole('teamrole');
    const verifiedRole = interaction.options.getRole('verifiedrole');

    if (!teamRole && !verifiedRole) {
      return interaction.reply({
        content: '⚠️ Please provide at least one role to update.',
        flags: 64
      });
    }

    const update = {};
    if (teamRole) update.teamRoleId = teamRole.id;
    if (verifiedRole) update.verifiedRoleId = verifiedRole.id;

    await ServerSettings.findOneAndUpdate(
      {}, // keine guildId mehr nötig
      update,
      { upsert: true }
    );

    let reply = '✅ Updated roles:\n';
    if (teamRole) reply += `• Team role: **${teamRole.name}**\n`;
    if (verifiedRole) reply += `• Verified role: **${verifiedRole.name}**`;

    await interaction.reply({ content: reply, flags: 64 });
  }
};