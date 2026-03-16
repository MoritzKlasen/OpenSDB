const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');
const { logger } = require('../utils/logger');

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
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('onjoinrole')
        .setDescription('The role given to new members')
        .setRequired(false)),

  async execute(interaction) {
    try {
      const settings = await ServerSettings.findOne({ guildId: interaction.guildId }) || {};
      const teamRoleId = settings.teamRoleId;

      const isOwner = interaction.user.id === interaction.guild.ownerId;
      const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
      const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

      if (!isOwner && !isAdmin && !isTeam) {
        return interaction.reply({
          content: await t(interaction.guildId, 'setrole.noPermission'),
          flags: 64
        });
      }

      const teamRole = interaction.options.getRole('teamrole');
      const verifiedRole = interaction.options.getRole('verifiedrole');
      const onJoinRole = interaction.options.getRole('onjoinrole');

      if (!teamRole && !verifiedRole && !onJoinRole) {
        return interaction.reply({
          content: await t(interaction.guildId, 'setrole.noRolesSpecified'),
          flags: 64
        });
      }

      const update = {};
      if (teamRole) update.teamRoleId = teamRole.id;
      if (verifiedRole) update.verifiedRoleId = verifiedRole.id;
      if (onJoinRole) update.onJoinRoleId = onJoinRole.id;

      await ServerSettings.findOneAndUpdate(
        { guildId: interaction.guildId },
        update,
        { upsert: true }
      );

      logger.security('Role configuration updated', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roles: Object.keys(update),
      });

      let roles = '';
      if (teamRole) roles += `• ${await t(interaction.guildId, 'setrole.teamrole')}: **${teamRole.name}**\n`;
      if (verifiedRole) roles += `• ${await t(interaction.guildId, 'setrole.verifiedRole')}: **${verifiedRole.name}**\n`;
      if (onJoinRole) roles += `• ${await t(interaction.guildId, 'setrole.onjoinRole')}: **${onJoinRole.name}**`;

      await interaction.reply({ 
        content: await t(interaction.guildId, 'setrole.updated', { roles }), 
        flags: 64 
      });
    } catch (error) {
      logger.error('Error updating role configuration', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        error: error.message,
      });
      await interaction.reply({
        content: await t(interaction.guildId, 'errors.commandError'),
        flags: 64
      });
    }
  }
};