const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const ServerSettings = require("../database/models/ServerSettings");
const { t, setGuildLanguageCache, SUPPORTED } = require("../utils/i18n");

const { updateGuildLocalizedMessages } = require("../utils/updateLocalizedMessages");

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
            .setDescription("de or en")
            .setRequired(true)
            .addChoices(
              { name: "German (de)", value: "de" },
              { name: "English (en)", value: "en" }
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
      const languageName = lang === "de" ? "German" : "English";

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
        const languageName = newLang === "de" ? "German" : "English";
        return interaction.reply({
          content: await t(guildId, "language.setSuccess", { languageName, lang: newLang }),
          flags: 64
        });
      }

      await ServerSettings.updateOne(
        { guildId },
        { $set: { language: newLang } },
        { upsert: true }
      );

      setGuildLanguageCache(guildId, newLang);

      const languageName = newLang === "de" ? "German" : "English";
      await interaction.reply({
        content: await t(guildId, "language.setSuccess", { languageName, lang: newLang }),
        flags: 64
      });

      updateGuildLocalizedMessages(interaction.client, guildId, { limit: 200, delayMs: 350 })
        .catch(() => {});
    }
  }
};
