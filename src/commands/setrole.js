const { SlashCommandBuilder } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Setzt Rollen')
    .addRoleOption(option =>
      option.setName('rolle')
        .setDescription('Die Rolle mit Team-Zugriff')
        .setRequired(true)),

  async execute(interaction) {
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner) {
      return interaction.reply({
        content: '❌ Nur der Server-Owner darf das.',
        ephemeral: true
      });
    }

    const role = interaction.options.getRole('rolle');

    await ServerSettings.findOneAndUpdate(
      {},
      { teamRoleId: role.id },
      { upsert: true }
    );

    await interaction.reply({
      content: `✅ Team-Rolle wurde gesetzt auf: **${role.name}**`,
      ephemeral: true
    });
  }
};