const { SlashCommandBuilder } = require('discord.js');
const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('word')
    .setDescription('Verwaltet verbotene Wörter')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Fügt ein verbotenes Wort hinzu')
        .addStringOption(option =>
          option.setName('wort')
            .setDescription('Verbotenes Wort')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Entfernt ein verbotenes Wort')
        .addStringOption(option =>
          option.setName('wort')
            .setDescription('Wort, das entfernt werden soll')
            .setRequired(true))),

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
        ephemeral: true
      });
    }

    const word = interaction.options.getString('wort').toLowerCase();
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await BannedWord.updateOne({ word }, { word }, { upsert: true });
      return interaction.reply(`🚫 Verbotenes Wort hinzugefügt: **${word}**`);
    }

    if (sub === 'remove') {
      await BannedWord.deleteOne({ word });
      return interaction.reply(`✅ Verbotenes Wort entfernt: **${word}**`);
    }
  }
};