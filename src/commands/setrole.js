const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Legt wichtige Rollen für den Bot fest.')
    .addRoleOption(option =>
      option.setName('teamrole')
        .setDescription('Die Rolle mit Teamzugang')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('verifiedrole')
        .setDescription('Die Rolle, die verifizierte Benutzer erhalten')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('onjoinrole')
        .setDescription('Die Rolle, die neuen Mitgliedern zugewiesen wird')
        .setRequired(false)),

  async execute(interaction) {
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isAdmin && !isTeam) {
      return interaction.reply({
        content: '❌ Keine Berechtigung.',
        flags: 64
      });
    }

    const teamRole = interaction.options.getRole('teamrole');
    const verifiedRole = interaction.options.getRole('verifiedrole');
    const onJoinRole = interaction.options.getRole('onjoinrole');

    if (!teamRole && !verifiedRole && !onJoinRole) {
      return interaction.reply({
        content: '⚠️ Bitte geben Sie mindestens eine Rolle zum Aktualisieren an.',
        flags: 64
      });
    }

    const update = {};
    if (teamRole) update.teamRoleId = teamRole.id;
    if (verifiedRole) update.verifiedRoleId = verifiedRole.id;
    if (onJoinRole) update.onJoinRoleId = onJoinRole.id;

    await ServerSettings.findOneAndUpdate(
      {},
      update,
      { upsert: true }
    );

    let reply = '✅ Aktualisierte Rollen:\n';
    if (teamRole) reply += `• Teamrolle: **${teamRole.name}**\n`;
    if (verifiedRole) reply += `• Verifizierte Rolle: **${verifiedRole.name}**`;
    if (onJoinRole) reply += `• On-Join-Rolle: **${onJoinRole.name}**`;

    await interaction.reply({ content: reply, flags: 64 });
  }
};
