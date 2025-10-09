const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verifiziert einen Benutzer.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der verifiziert werden soll.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('firstname')
        .setDescription('Vorname')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('lastname')
        .setDescription('Nachname')
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
      return interaction.reply({ content: '❌ Keine Berechtigung.', flags: 64 });
    }

    if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({ content: '❌ Mir fehlt das Recht **Rollen verwalten**.', flags: 64 });
    }

    const user       = interaction.options.getUser('user');
    const first_Name = interaction.options.getString('firstname');
    const last_Name  = interaction.options.getString('lastname');

    const last = await VerifiedUser.findOne().sort({ verificationNumber: -1 });
    const newVerificationNumber = last ? last.verificationNumber + 1 : 1;

    const exists = await VerifiedUser.findOne({ discordId: user.id });
    if (exists) {
      return interaction.reply({ content: `⚠️ ${user.tag} ist bereits verifiziert!`, flags: 64 });
    }

    const newUser = new VerifiedUser({
      verificationNumber: newVerificationNumber,
      discordTag: user.tag,
      discordId: user.id,
      firstName: first_Name,
      lastName : last_Name
    });
    await newUser.save();

    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (err) {
      console.warn(`⚠️ Konnte GuildMember für ${user.tag} nicht fetchen:`, err?.message);
      return interaction.reply({ content: `⚠️ Konnte ${user.tag} nicht finden.`, flags: 64 });
    }

    try {
      if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
        await member.roles.add(verifiedRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Konnte verifiedRole für ${user.tag} nicht zuweisen:`, err?.message);
    }

    try {
      if (onJoinRoleId && member.roles.cache.has(onJoinRoleId)) {
        await member.roles.remove(onJoinRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Konnte onJoinRole für ${user.tag} nicht entfernen:`, err?.message);
    }

    await interaction.reply({
      content: `✅ ${user.tag} wurde verifiziert als **#${newVerificationNumber} – ${first_Name} ${last_Name}**`,
    });
  }
};
