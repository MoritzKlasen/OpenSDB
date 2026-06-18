const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');
const { notifyAdminServer } = require('../utils/botNotifier');
const { logger } = require('../utils/logger');
require('dotenv').config();

if (!process.env.INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET environment variable is required');
}
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Deletes the verification from a user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to be unverified.')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;
    const userId = interaction.user.id;

    const settings = await ServerSettings.findOne({ guildId: interaction.guildId });
    const teamRoleId = settings?.teamRoleId;
    const verifiedRoleId = settings?.verifiedRoleId;
    const onJoinRoleId = settings?.onJoinRoleId;

    const isOwner = userId === guildOwnerId;
    const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isAdmin && !isTeam) {
      return interaction.reply({
        content: await t(interaction.guildId, 'unverify.noPermission'),
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');

    const record = await VerifiedUser.findOne({ discordId: user.id });
    if (!record) {
      return interaction.reply({
        content: await t(interaction.guildId, 'unverify.notVerified', { user: user.tag }),
        flags: 64
      });
    }

    // Resolve the on-join role name for the success message (may be null)
    let onJoinRoleName = null;
    if (onJoinRoleId) {
      const onJoinRole = interaction.guild.roles.cache.get(onJoinRoleId)
        ?? await interaction.guild.roles.fetch(onJoinRoleId).catch(() => null);
      onJoinRoleName = onJoinRole?.name ?? null;
    }

    // Replace all non-managed roles with just the on-join role (or none).
    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch {
      member = null;
    }

    if (member) {
      const newRoles = onJoinRoleId ? [onJoinRoleId] : [];
      try {
        await member.roles.set(newRoles);
      } catch (err) {
        logger.warn(`Could not reset roles for ${user.tag}`, { error: err.message });
        return interaction.reply({
          content: `❌ Could not reset roles for **${user.tag}**: ${err.message}`,
          flags: 64,
        });
      }
    }

    await VerifiedUser.deleteOne({ _id: record._id });

    await notifyAdminServer('unverify', INTERNAL_SECRET);

    const messageKey = onJoinRoleName ? 'unverify.success' : 'unverify.successNoRole';
    await interaction.reply({
      content: await t(interaction.guildId, messageKey, { user: user.tag, role: onJoinRoleName }),
      flags: 64
    });
  }
};