const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Verwarnt einen verifizierten Benutzer.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Der Benutzer, der verwarnt werden soll.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Der Grund für die Verwarnung.')
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
    const reason = interaction.options.getString('reason');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} ist nicht verifiziert.`,
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
      content: `✅ ${user.tag} wurde von ${interaction.user.tag} verwarnt.\nGrund: *${reason}*`,
      flags: 0
    });
  }
};
