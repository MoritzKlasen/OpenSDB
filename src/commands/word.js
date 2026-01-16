const { SlashCommandBuilder } = require('discord.js');
const BannedWord = require('../database/models/BannedWord');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');

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
        content: await t(interaction.guildId, 'errors.noPermission'),
        flags: 64      });
    }

    const word = interaction.options.getString('word').toLowerCase();
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await BannedWord.updateOne({ word }, { word }, { upsert: true });
      return interaction.reply(await t(interaction.guildId, 'banned.wordAdded', { word }));
    }

    if (sub === 'remove') {
      await BannedWord.deleteOne({ word });
      return interaction.reply(await t(interaction.guildId, 'banned.wordRemoved', { word }));
    }
  }
};