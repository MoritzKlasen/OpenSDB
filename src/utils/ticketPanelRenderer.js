const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { t } = require("./i18n");

async function renderTicketPanel(guildId, { type, categoryId }) {
  const baseKey = `ticketPanel.${type}`;

  const title = await t(guildId, `${baseKey}.title`);
  const desc = await t(guildId, `${baseKey}.desc`);
  const button = await t(guildId, `${baseKey}.button`);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(type === "support" ? "Blurple" : "Green");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_${type}_${categoryId}`)
      .setLabel(button)
      .setStyle(type === "support" ? ButtonStyle.Primary : ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row], content: null };
}

module.exports = { renderTicketPanel };
