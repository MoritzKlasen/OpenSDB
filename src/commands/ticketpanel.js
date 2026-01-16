const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require("discord.js");

const ServerSettings = require("../database/models/ServerSettings");
const LocalizedMessage = require("../database/models/LocalizedMessage");
const { t } = require("../utils/i18n");
const { renderTicketPanel } = require("../utils/ticketPanelRenderer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Creates a ticket panel (Support / Verify)")

    .addStringOption(o =>
      o.setName("type")
        .setDescription("Ticket type")
        .addChoices(
          { name: "Support", value: "support" },
          { name: "Verify", value: "verify" }
        )
        .setRequired(true)
    )
    .addChannelOption(o =>
      o.setName("category")
        .setDescription("Category for new tickets")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName("titel")
        .setDescription("Embed title (override, optional)")
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("description")
        .setDescription("Embed description (override, optional)")
        .setRequired(false)
    )
    .addStringOption(o =>
      o.setName("button")
        .setDescription("Button text (override, optional)")
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const settings = (await ServerSettings.findOne({ guildId }).lean()) || {};
    const teamRoleId = settings.teamRoleId;

    const isOwner = interaction.user.id === interaction.guild?.ownerId;
    const isTeam = teamRoleId && (interaction.member?.roles?.cache?.has(teamRoleId) ?? false);

    if (!isOwner && !isTeam) {
      return interaction.reply({ content: await t(guildId, "errors.noPermission"), flags: 64 });
    }

    const type = interaction.options.getString("type");
    const category = interaction.options.getChannel("category");

    const basePayload = await renderTicketPanel(guildId, { type, categoryId: category.id });

    const overrideTitle = interaction.options.getString("titel");
    const overrideDesc = interaction.options.getString("description");
    const overrideButton = interaction.options.getString("button");

    if (overrideTitle || overrideDesc) {
      const embed = EmbedBuilder.from(basePayload.embeds[0]);

      if (overrideTitle) embed.setTitle(overrideTitle);
      if (overrideDesc) embed.setDescription(overrideDesc);

      basePayload.embeds = [embed];
    }

    if (overrideButton) {
      const row = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(basePayload.components[0].components[0]).setLabel(overrideButton)
      );
      basePayload.components = [row];
    }

    await interaction.reply({
      content: basePayload.content ?? undefined,
      embeds: basePayload.embeds ?? [],
      components: basePayload.components ?? [],
      fetchReply: true
    });

    const msg = await interaction.fetchReply();

    await LocalizedMessage.updateOne(
      { guildId, messageId: msg.id },
      {
        $set: {
          guildId,
          channelId: msg.channelId,
          messageId: msg.id,
          key: "panel.ticket",
          vars: { type, categoryId: category.id },
          overrides: {
            title: overrideTitle || null,
            description: overrideDesc || null,
            button: overrideButton || null
          }
        }
      },
      { upsert: true }
    );
  }
};