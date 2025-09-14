const { SlashCommandBuilder } = require('discord.js');
const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('word')
    .setDescription('Manages banned words')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adds a banned word')
        .addStringOption(option =>
          option.setName('word')
            .setDescription('Banned word')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Removes a banned word')
        .addStringOption(option =>
          option.setName('word')
            .setDescription('Word to be removed')
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
        content: '❌ No permission.',
        flags: 64      });
    }

    const word = interaction.options.getString('word').toLowerCase();
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await BannedWord.updateOne({ word }, { word }, { upsert: true });
      return interaction.reply(`✅ Banned word added: **${word}**`);
    }

    if (sub === 'remove') {
      await BannedWord.deleteOne({ word });
      return interaction.reply(`✅ Banned word removed: **${word}**`);
    }
  }
};