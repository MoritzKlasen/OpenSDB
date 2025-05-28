const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verifiziert einen Benutzer')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der zu verifizierende Benutzer')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('vorname')
        .setDescription('Vorname')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('nachname')
        .setDescription('Nachname')
        .setRequired(true)),

  async execute(interaction) {
    const guildOwnerId = interaction.guild.ownerId;
    const userId = interaction.user.id;

    const settings = await ServerSettings.findOne();
    const teamRoleId = settings?.teamRoleId;


    const isOwner = userId === guildOwnerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({
        content: '❌ Nur der Server-Owner oder Mitglieder der Team-Rolle dürfen das.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const firstName = interaction.options.getString('vorname');
    const lastName = interaction.options.getString('nachname');

    const last = await VerifiedUser.findOne().sort({ verificationNumber: -1 });
    const newVerificationNumber = last ? last.verificationNumber + 1 : 1;

    const exists = await VerifiedUser.findOne({ discordId: user.id });
    if (exists) {
      return interaction.reply({
        content: `⚠️ ${user.tag} ist bereits verifiziert als #${exists.verificationNumber}.`,
        ephemeral: true
      });
    }

    const newUser = new VerifiedUser({
      verificationNumber: newVerificationNumber,
      discordTag: user.tag,
      discordId: user.id,
      firstName,
      lastName
    });

    await newUser.save();

    await interaction.reply({
      content: `✅ ${user.tag} wurde erfolgreich verifiziert als **#${newVerificationNumber} – ${firstName} ${lastName}**`,
      ephemeral: true
    });
  }
};