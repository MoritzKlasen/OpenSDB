const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Erstellt ein Ticket-Panel (Support / Verify)')
    .addStringOption(o =>
      o.setName('titel')
       .setDescription('Embed-Titel')
       .setRequired(true))
    .addStringOption(o =>
      o.setName('beschreibung')
       .setDescription('Embed-Beschreibung')
       .setRequired(true))
    .addStringOption(o =>
      o.setName('button')
       .setDescription('Button-Text')
       .setRequired(true))
    .addStringOption(o =>
      o.setName('typ')
       .setDescription('Ticket-Typ')
       .addChoices(
         { name: 'Support', value: 'support' },
         { name: 'Verify',  value: 'verify' }
       )
       .setRequired(true))
    .addChannelOption(o =>
      o.setName('kategorie')
       .setDescription('Kategorie für neue Tickets')
       .addChannelTypes(ChannelType.GuildCategory)
       .setRequired(true)),

  async execute(interaction) {
    const settings   = await ServerSettings.findOne() || {};
    const teamRoleId = settings.teamRoleId;
    const isOwner    = interaction.user.id === interaction.guild.ownerId;
    const isTeam     = teamRoleId && interaction.member.roles.cache.has(teamRoleId);
    if (!isOwner && !isTeam) {
      return interaction.reply({ content: '❌ Keine Berechtigung.', flags: 64 });
    }

    const title       = interaction.options.getString('titel');
    const description = interaction.options.getString('beschreibung');
    const buttonLabel = interaction.options.getString('button');
    const type        = interaction.options.getString('typ');
    const category    = interaction.options.getChannel('kategorie');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(type === 'support' ? 'Blurple' : 'Green');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_${type}_${category.id}`)
        .setLabel(buttonLabel)
        .setStyle(type === 'support' ? ButtonStyle.Primary : ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: 0
    });
  },
};
