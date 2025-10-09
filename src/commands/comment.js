const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comment')
    .setDescription('Fügt einen Kommentar für einen verifizierten Benutzer hinzu oder ändert ihn.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, dessen Kommentar festgelegt werden soll.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Der neue Kommentar.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: '❌ Keine Berechtigung.', flags: 64 });
    }

    const user = interaction.options.getUser('user');
    const text = interaction.options.getString('text');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
        flags: 64
      });
    }

    verified.comment = text;
    await verified.save();

    return interaction.reply({
      content: `✅ Kommentar für ${user.tag} wurde festgelegt:\n> ${text}`,
      flags: 0
    });
  }
};
