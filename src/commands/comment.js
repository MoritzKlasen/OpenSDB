const { SlashCommandBuilder } = require('discord.js');
const VerifiedUser = require('../database/models/VerifiedUser');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comment')
    .setDescription('Adds or modifies a comment for a verified user.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user whose comment is to be set.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The new comment.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: '❌ No permission.', flags: 64 });
    }

    const user = interaction.options.getUser('user');
    const text = interaction.options.getString('text');

    const verified = await VerifiedUser.findOne({ discordId: user.id });

    if (!verified) {
      return interaction.reply({
        content: `❌ ${user.tag} is not verified.`,
        flags: 64
      });
    }

    verified.comment = text;
    await verified.save();

    return interaction.reply({
      content: `✅ Comment for ${user.tag} has been set:\n> ${text}`,
      flags: 0
    });
  }
};
