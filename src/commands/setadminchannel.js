const { SlashCommandBuilder } = require('discord.js');
const Config = require('../database/models/Config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setadminchannel')
    .setDescription('Setzt den Admin-Channel für Wortmeldungen')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Admin-Channel')
        .setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.some(role => role.name === 'admin')) {
      return interaction.reply({ content: '❌ Nur Admins dürfen das.', flags: 64 });
    }

    const channel = interaction.options.getChannel('channel');
    await Config.findOneAndUpdate(
      { key: 'adminChannelId' },
      { value: channel.id },
      { upsert: true }
    );

    await interaction.reply(`✅ Admin-Channel wurde gesetzt: ${channel.toString()}`);
  }
};
