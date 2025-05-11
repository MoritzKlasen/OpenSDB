const { SlashCommandBuilder } = require('discord.js');
const BannedWord = require('../database/models/BannedWord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addword')
    .setDescription('Fügt ein verbotenes Wort hinzu')
    .addStringOption(option =>
      option.setName('wort')
        .setDescription('Verbotenes Wort')
        .setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.some(role => role.name === 'Team')) {
      return interaction.reply({ content: '❌ Nur Team-Mitglieder dürfen das.', flags: 64 });
    }

    const word = interaction.options.getString('wort').toLowerCase();
    await BannedWord.updateOne({ word }, { word }, { upsert: true });

    await interaction.reply(`🚫 Verbotenes Wort hinzugefügt: **${word}**`);
  }
};
