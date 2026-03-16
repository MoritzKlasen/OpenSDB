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
    .setName('comment')
    .setDescription('Adds or modifies a comment for a verified user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user whose comment is to be set.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The new comment.')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      const settings = await ServerSettings.findOne() || {};
      const teamRoleId = settings.teamRoleId;
      const isOwner = interaction.user.id === interaction.guild.ownerId;
      const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

      if (!isOwner && !isTeam) {
        return interaction.reply({ content: await t(interaction.guildId, 'comments.noPermission'), flags: 64 });
      }

      const user = interaction.options.getUser('user');
      const text = interaction.options.getString('text');

      const verified = await VerifiedUser.findOne({ discordId: user.id });

      if (!verified) {
        return interaction.reply({
          content: await t(interaction.guildId, 'comments.notVerified', { user: user.tag }),
          flags: 64
        });
      }

      verified.comment = text;
      await verified.save();

      logger.security('User comment updated', {
        guildId: interaction.guildId,
        targetUserId: user.id,
        updatedBy: interaction.user.id,
        commentLength: text.length,
      });

      await notifyAdminServer('comment-updated', INTERNAL_SECRET);

      return interaction.reply({
        content: await t(interaction.guildId, 'comments.set', { user: user.tag, text }),
        flags: 0
      });
    } catch (error) {
      logger.error('Error updating comment', {
        guildId: interaction.guildId,
        targetUserId: interaction.options.getUser('user')?.id,
        updatedBy: interaction.user.id,
        error: error.message,
      });
      await interaction.reply({
        content: await t(interaction.guildId, 'errors.commandError'),
        flags: 64
      });
    }
  }
};
