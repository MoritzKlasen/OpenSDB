const LocalizedMessage = require("../database/models/LocalizedMessage");
const { renderTicketPanel } = require("./ticketPanelRenderer");
const { t } = require("./i18n");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Colors } = require("discord.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function updateGuildLocalizedMessages(client, guildId, { limit = 200, delayMs = 350 } = {}) {
  const docs = await LocalizedMessage.find({ guildId }).limit(limit).lean();

  let updated = 0;
  let removed = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const channel = await client.channels.fetch(doc.channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) {
        await LocalizedMessage.deleteOne({ _id: doc._id });
        removed++;
        continue;
      }

      const msg = await channel.messages.fetch(doc.messageId).catch(() => null);
      if (!msg || !msg.editable) {
        await LocalizedMessage.deleteOne({ _id: doc._id });
        removed++;
        continue;
      }

      if (doc.key === "panel.ticket" && doc.vars?.type && doc.vars?.categoryId) {
        const payload = await renderTicketPanel(guildId, {
          type: doc.vars.type,
          categoryId: doc.vars.categoryId
        });

        // Apply custom overrides if they exist
        if (doc.overrides?.title || doc.overrides?.description) {
          const embed = EmbedBuilder.from(payload.embeds[0]);
          if (doc.overrides.title) embed.setTitle(doc.overrides.title);
          if (doc.overrides.description) embed.setDescription(doc.overrides.description);
          payload.embeds = [embed];
        }

        if (doc.overrides?.button && payload.components?.[0]?.components?.[0]) {
          const row = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(payload.components[0].components[0]).setLabel(doc.overrides.button)
          );
          payload.components = [row];
        }

        await msg.edit({
          content: payload.content ?? null,
          embeds: payload.embeds ?? [],
          components: payload.components ?? []
        });

        updated++;
        await sleep(delayMs);
        continue;
      }
      if (doc.key === "ticket.opened" && doc.vars?.type && doc.vars?.userMention) {
        const ticketType = doc.vars.type;

        const titleKey = ticketType === "support"
          ? "tickets.openedTitleSupport"
          : "tickets.openedTitleVerify";

        const askKey = ticketType === "support"
          ? "tickets.supportAsk"
          : "tickets.verifyAsk";

        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setTitle(await t(guildId, titleKey))
              .setDescription(
                `${await t(guildId, "tickets.welcome", { user: doc.vars.userMention })}\n\n` +
                `${await t(guildId, "tickets.accessInfo")}\n` +
                `${await t(guildId, askKey)}\n\n` +
                `${await t(guildId, "tickets.privacy")}`
              )
              .setColor(ticketType === "support" ? Colors.Blurple : Colors.Green)
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel(await t(guildId, "tickets.close"))
                .setStyle(ButtonStyle.Danger)
            )
          ]
        });

        updated++;
        await sleep(delayMs);
        continue;
      }

      const newContent = await t(guildId, doc.key, doc.vars);
      await msg.edit({ content: newContent });

      updated++;
      await sleep(delayMs);
    } catch (e) {
      failed++;
    }
  }

  return { updated, removed, failed, total: docs.length, limit };
}

module.exports = { updateGuildLocalizedMessages };
