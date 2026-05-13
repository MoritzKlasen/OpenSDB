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
    .setName('verify')
    .setDescription('Verifies a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to be verified')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('firstname')
        .setDescription('First name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('lastname')
        .setDescription('Last name')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;
    const userId = interaction.user.id;

    const settings = await ServerSettings.findOne({ guildId: interaction.guildId });
    const teamRoleId      = settings?.teamRoleId;
    const verifiedRoleId  = settings?.verifiedRoleId;
    const onJoinRoleId    = settings?.onJoinRoleId;

    const isOwner = userId === guildOwnerId;
    const isTeam  = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: await t(interaction.guildId, 'verify.noPermission'), flags: 64 });
    }

    const user = interaction.options.getUser('user');
    const first_Name = interaction.options.getString('firstname');
    const last_Name = interaction.options.getString('lastname');

    const exists = await VerifiedUser.findOne({ discordId: user.id });
    if (exists) {
      return interaction.reply({ content: await t(interaction.guildId, 'verify.alreadyVerified', { user: user.tag }), flags: 64 });
    }

    // Pre-flight: resolve member, bot member, and verified role before touching the DB
    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (err) {
      logger.warn(`Could not fetch GuildMember for ${user.tag}`, { error: err?.message });
      return interaction.reply({ content: await t(interaction.guildId, 'verify.memberNotFound', { user: user.tag }), flags: 64 });
    }

    if (!verifiedRoleId) {
      return interaction.reply({
        content: '❌ No verified role configured. Run `/setrole verifiedrole:` first.',
        flags: 64,
      });
    }

    const verifiedRole = interaction.guild.roles.cache.get(verifiedRoleId)
      ?? await interaction.guild.roles.fetch(verifiedRoleId).catch(() => null);

    if (!verifiedRole) {
      return interaction.reply({
        content: '❌ The configured verified role no longer exists. Run `/setrole verifiedrole:` again.',
        flags: 64,
      });
    }

    const me = interaction.guild.members.me
      ?? await interaction.guild.members.fetchMe().catch(() => null);

    if (me && verifiedRole.position >= me.roles.highest.position) {
      return interaction.reply({
        content: `❌ Cannot assign role **${verifiedRole.name}** – it is above the bot's highest role in the hierarchy. Move the bot's role above **${verifiedRole.name}** in Server Settings › Roles, then try again.`,
        flags: 64,
      });
    }

    // All pre-flight checks passed – now create the DB record
    let newUser;
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const last = await VerifiedUser.findOne().sort({ verificationNumber: -1 });
      const newVerificationNumber = last ? last.verificationNumber + 1 : 1;
      try {
        newUser = await VerifiedUser.create({
          verificationNumber: newVerificationNumber,
          discordTag: user.tag,
          discordId: user.id,
          firstName: first_Name,
          lastName: last_Name,
          verifiedAt: new Date()
        });
        break;
      } catch (err) {
        if (err.code === 11000 && attempt < MAX_RETRIES - 1) {
          continue; // Duplicate key — retry with next number
        }
        throw err;
      }
    }

    if (!newUser) {
      return interaction.reply({ content: await t(interaction.guildId, 'errors.commandError'), flags: 64 });
    }

    // Assign verified role
    try {
      if (!member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRole);
      }
    } catch (err) {
      logger.warn(`Could not assign verifiedRole to ${user.tag}`, { error: err?.message });
      // Roll back: remove the DB record so the user can be re-verified once the issue is fixed
      await VerifiedUser.deleteOne({ _id: newUser._id }).catch(() => {});
      return interaction.reply({
        content: `❌ Verification aborted – could not assign role **${verifiedRole.name}**: ${err?.message}`,
        flags: 64,
      });
    }

    // Remove on-join role if present
    try {
      if (onJoinRoleId && member.roles.cache.has(onJoinRoleId)) {
        await member.roles.remove(onJoinRoleId);
      }
    } catch (err) {
      logger.warn(`Could not remove onJoinRole from ${user.tag}`, { error: err?.message });
    }

    await notifyAdminServer('verification', INTERNAL_SECRET);

    await interaction.reply({
      content: await t(interaction.guildId, 'verify.success', { user: user.tag, number: newUser.verificationNumber, fullName: `${first_Name} ${last_Name}` }),
      flags: 0
    });
  }
};
