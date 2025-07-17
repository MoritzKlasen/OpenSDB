const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

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
    const teamRoleId = settings?.teamRoleId;
    const verifiedRoleId = settings?.verifiedRoleId;

    const isOwner = userId === guildOwnerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({
        content: '❌ Only the server owner or members of the team role are allowed to do this.',
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');
    const first_Name = interaction.options.getString('firstname');
    const last_Name = interaction.options.getString('lastname');

    const last = await VerifiedUser.findOne().sort({ verificationNumber: -1 });
    const newVerificationNumber = last ? last.verificationNumber + 1 : 1;

    const exists = await VerifiedUser.findOne({ discordId: user.id });
    if (exists) {
      return interaction.reply({
        content: `⚠️ ${user.tag} is already verified!`,
        flags: 64
      });
    }

    const newUser = new VerifiedUser({
      verificationNumber: newVerificationNumber,
      discordTag: user.tag,
      discordId: user.id,
      firstName: first_Name,
      lastName: last_Name
    });

    await newUser.save();

    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Could not assign verified role to ${user.tag}:`, err.message);
    }

    await interaction.reply({
      content: `✅ ${user.tag} was successfully verified as **#${newVerificationNumber} – ${first_Name} ${last_Name}**`,
      flags: 0
    });
  }
};