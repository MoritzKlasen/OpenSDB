const { SlashCommandBuilder } = require('discord.js');
const BannedWord = require('../database/models/BannedWord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeword')
    .setDescription('Entfernt ein verbotenes Wort')
    .addStringOption(option =>
      option.setName('wort')
        .setDescription('Wort, das entfernt werden soll')
        .setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.some(role => role.name === 'Team')) {
      return interaction.reply({ content: '❌ Nur Team-Mitglieder dürfen das.', flags: 64 });
    }

    const word = interaction.options.getString('wort').toLowerCase();
    await BannedWord.deleteOne({ word });

    await interaction.reply(`✅ Verbotenes Wort entfernt: **${word}**`);
  }
};
