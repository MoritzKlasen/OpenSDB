const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warns a verified user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to be warned.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('The reason for the warning.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: await t(interaction.guildId, 'warn.noPermission'), flags: 64 });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: await t(interaction.guildId, 'warn.notVerified', { user: user.tag }),
        flags: 64
      });
    }

    if (!Array.isArray(verified.warnings)) {
      verified.warnings = [];
    }

    verified.warnings.push({
      reason,
      issuedBy: interaction.user.id,
      date: new Date()
    });

    await verified.save();

    return interaction.reply({
      content: await t(interaction.guildId, 'warn.success', { user: user.tag, issuer: interaction.user.tag, reason }),
      flags: 0
    });
  }
};