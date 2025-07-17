const { SlashCommandBuilder } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Sets roles')
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role with team access')
        .setRequired(true)),

  async execute(interaction) {
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner) {
      return interaction.reply({
        content: '❌ Only the server owner is allowed to execute this.',
        flags: 64
      });
    }

    const role = interaction.options.getRole('role');

    await ServerSettings.findOneAndUpdate(
      {},
      { teamRoleId: role.id },
      { upsert: true }
    );

    await interaction.reply({
      content: `✅ Team role has been set to: **${role.name}**`,
      flags: 64
    });
  }
};