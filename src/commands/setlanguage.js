const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ServerSettings = require("../database/models/ServerSettings");
const { t, setGuildLanguageCache, SUPPORTED } = require("../utils/i18n");
const { logger } = require("../utils/logger");
const { notifyAdminServer } = require("../utils/botNotifier");

const { updateGuildLocalizedMessages } = require("../utils/updateLocalizedMessages");

const LANGUAGE_NAMES = { de: "German", en: "English", es: "Spanish", fr: "French", it: "Italian", tr: "Turkish", zh: "Chinese Simplified" };

async function canManageLanguage(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  if (interaction.guild?.ownerId === interaction.user.id) return true;

  const settings = await ServerSettings.findOne({ guildId: interaction.guildId }).lean();
  if (settings?.teamRoleId) {
    return interaction.member?.roles?.cache?.has(settings.teamRoleId) ?? false;
  }

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("Get or set the bot language for this server")
    .addSubcommand(sc => sc.setName("get").setDescription("Show the current language"))
    .addSubcommand(sc =>
      sc
        .setName("set")
        .setDescription("Set the language")
        .addStringOption(opt =>
          opt
            .setName("lang")
            .setDescription("de, en, es, fr, it, tr, or zh")
            .setRequired(true)
            .addChoices(
              { name: "German (de)", value: "de" },
              { name: "English (en)", value: "en" },
              { name: "Spanish (es)", value: "es" },
              { name: "French (fr)", value: "fr" },
              { name: "Italian (it)", value: "it" },
              { name: "Turkish (tr)", value: "tr" },
              { name: "Chinese Simplified (zh)", value: "zh" }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!(await canManageLanguage(interaction))) {
      return interaction.reply({ content: await t(guildId, "errors.missingPermission"), flags: 64 });
    }

    if (sub === "get") {
      const settings = await ServerSettings.findOneAndUpdate(
        { guildId },
        { $setOnInsert: { guildId } },
        { new: true, upsert: true }
      ).lean();

      const lang = settings.language || "en";
      const languageName = LANGUAGE_NAMES[lang] || "English";

      return interaction.reply({
        content: await t(guildId, "language.current", { languageName, lang }),
        flags: 64
      });
    }

    if (sub === "set") {
      const newLang = interaction.options.getString("lang");

      if (!SUPPORTED.has(newLang)) {
        return interaction.reply({ content: await t(guildId, "language.invalid"), flags: 64 });
      }

      const currentSettings = await ServerSettings.findOne({ guildId }).lean();
      const oldLang = currentSettings?.language || "en";

      if (oldLang === newLang) {
        const languageName = LANGUAGE_NAMES[newLang] || "English";
        return interaction.reply({
          content: await t(guildId, "language.setSuccess", { languageName, lang: newLang }),
          flags: 64
        });
      }

      try {
        await ServerSettings.updateOne(
          { guildId },
          { $set: { language: newLang } },
          { upsert: true }
        );

        setGuildLanguageCache(guildId, newLang);

        logger.security('Server language changed', {
          guildId,
          changedBy: interaction.user.id,
          oldLanguage: oldLang,
          newLanguage: newLang,
        });

        try {
          await notifyAdminServer('settings-changed', process.env.INTERNAL_SECRET);
        } catch (error) {
          logger.warn('Failed to notify admin server after language change', {
            guildId,
            changedBy: interaction.user.id,
            newLanguage: newLang,
            error: error.message,
          });
        }

        const languageName = LANGUAGE_NAMES[newLang] || "English";
        await interaction.reply({
          content: await t(guildId, "language.setSuccess", { languageName, lang: newLang }),
          flags: 64
        });

        updateGuildLocalizedMessages(interaction.client, guildId, { limit: 200, delayMs: 350 })
          .catch((err) => {
            logger.warn('Failed to update localized messages after language change', {
              guildId,
              newLanguage: newLang,
              error: err.message,
            });
          });
      } catch (error) {
        logger.error('Error setting guild language', {
          guildId,
          changedBy: interaction.user.id,
          newLanguage: newLang,
          error: error.message,
        });
        await interaction.reply({
          content: 'An error occurred while setting the language.',
          flags: 64
        });
      }
    }
  }
};
