const { SlashCommandBuilder } = require('discord.js');
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

    const isOwner = userId === guildOwnerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
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

    // Pre-flight: check role hierarchy before touching the DB
    if (verifiedRoleId) {
      let member;
      try {
        member = await interaction.guild.members.fetch(user.id);
      } catch {
        member = null;
      }

      if (member?.roles.cache.has(verifiedRoleId)) {
        const verifiedRole = interaction.guild.roles.cache.get(verifiedRoleId)
          ?? await interaction.guild.roles.fetch(verifiedRoleId).catch(() => null);

        const me = interaction.guild.members.me
          ?? await interaction.guild.members.fetchMe().catch(() => null);

        if (verifiedRole && me && verifiedRole.position >= me.roles.highest.position) {
          return interaction.reply({
            content: `❌ Cannot remove role **${verifiedRole.name}** – it is above the bot's highest role in the hierarchy. Move the bot's role above **${verifiedRole.name}** in Server Settings › Roles, then try again.`,
            flags: 64,
          });
        }

        // Role check passed – remove from Discord
        try {
          await member.roles.remove(verifiedRoleId);
        } catch (err) {
          logger.warn(`Could not remove verified role from ${user.tag}`, { error: err.message });
          return interaction.reply({
            content: `❌ Could not remove role **${verifiedRole?.name ?? verifiedRoleId}**: ${err.message}`,
            flags: 64,
          });
        }
      }
    }

    await VerifiedUser.deleteOne({ _id: record._id });

    await notifyAdminServer('unverify', INTERNAL_SECRET);

    await interaction.reply({
      content: await t(interaction.guildId, 'unverify.success', { user: user.tag }),
      flags: 64
    });
  }
};