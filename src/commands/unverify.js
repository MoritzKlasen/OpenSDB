const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Löscht die Verifizierung eines Benutzers.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Verifizierung gelöscht werden soll.')
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
        content: '❌ Keine Berechtigung.',
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');
    const result = await VerifiedUser.findOneAndDelete({ discordId: user.id });

    if (!result) {
      return interaction.reply({
        content: `❌ ${user.tag} wurde nicht verifiziert.`,
        flags: 64
      });
    }

    try {
      const member = await interaction.guild.members.fetch(user.id);
      if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
        await member.roles.remove(verifiedRoleId);
      }
    } catch (err) {
      console.warn(`⚠️ Konnte die verifizierte Rolle von ${user.tag} nicht entfernen:`, err.message);
    }

    await interaction.reply({
      content: `✅ Die Verifizierung von ${user.tag} wurde gelöscht.`,
      flags: 64
    });
  }
};
