const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');

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

    const settings = await ServerSettings.findOne();
    const teamRoleId      = settings?.teamRoleId;
    const verifiedRoleId  = settings?.verifiedRoleId;
    const onJoinRoleId    = settings?.onJoinRoleId;

    const isOwner = userId === guildOwnerId;
    const isTeam  = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: await t(interaction.guildId, 'verify.noPermission'), flags: 64 });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: await t(interaction.guildId, 'verify.noManageRoles'), flags: 64 });
    }

    const user = interaction.options.getUser('user');
    const first_Name = interaction.options.getString('firstname');
    const last_Name = interaction.options.getString('lastname');

    const last = await VerifiedUser.findOne().sort({ verificationNumber: -1 });
    const newVerificationNumber = last ? last.verificationNumber + 1 : 1;

    const exists = await VerifiedUser.findOne({ discordId: user.id });
    if (exists) {
      return interaction.reply({ content: await t(interaction.guildId, 'verify.alreadyVerified', { user: user.tag }), flags: 64 });
    }

    const newUser = new VerifiedUser({
      verificationNumber: newVerificationNumber,
      discordTag: user.tag,
      discordId: user.id,
      firstName: first_Name,
      lastName: last_Name,
      verifiedAt: new Date()
    });
    await newUser.save();

    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (err) {
      console.warn(`⚠️ Could not fetch GuildMember for ${user.tag}:`, err?.message);
      return interaction.reply({ content: await t(interaction.guildId, 'verify.memberNotFound', { user: user.tag }), flags: 64 });
    }

    try {
      if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Could not assign verifiedRole to ${user.tag}:`, err?.message);
    }

    try {
      if (onJoinRoleId && member.roles.cache.has(onJoinRoleId)) {
        await member.roles.remove(onJoinRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Could not remove onJoinRole from ${user.tag}:`, err?.message);
    }

    await interaction.reply({
      content: await t(interaction.guildId, 'verify.success', { user: user.tag, number: newVerificationNumber, fullName: `${first_Name} ${last_Name}` }),
      flags: 0
    });
  }
};
