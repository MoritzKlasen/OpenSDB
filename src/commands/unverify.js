const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Löscht die Verifizierung eines Benutzers.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der ent-verifiziert werden soll.')
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
        flags: 64
      });
    }

    const user = interaction.options.getUser('user');
    const result = await VerifiedUser.findOneAndDelete({ discordId: user.id });

    if (!result) {
      return interaction.reply({
        content: `❌ ${user.tag} war nicht verifiziert.`,
        flags: 64
      });
    }

    await interaction.reply({
      content: `✅ Verifizierung von ${user.tag} wurde gelöscht.`,
      flags: 0    });
  }
};