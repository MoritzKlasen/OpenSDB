const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const { t } = require('../utils/i18n');
const { logger } = require('../utils/logger');
const { notifyAdminServer } = require('../utils/botNotifier');
const {
  normalizeBaseUrl,
  resolveEndpointConfig,
  MAX_URL_LENGTH,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS
} = require('../utils/informationssystemConfig');

const EPHEMERAL = 64;

async function hasManagePermission(interaction) {
  const settings = await ServerSettings.findOne({ guildId: interaction.guildId }).lean() || {};
  const isOwner = interaction.user.id === interaction.guild.ownerId;
  const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
  const isTeam = settings.teamRoleId && interaction.member.roles.cache.has(settings.teamRoleId);
  return isOwner || isAdmin || isTeam;
}

async function notifySettingsChanged(interaction) {
  try {
    await notifyAdminServer('settings-changed', process.env.INTERNAL_SECRET);
  } catch (error) {
    logger.error('Failed to notify admin server after endpoint update', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: error.message
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setinformationssystem')
    .setDescription('Configures the information system API endpoint used by /ask.')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the API base URL the question is sent to.')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('Base URL, e.g. https://informationssystem.example.org')
            .setRequired(true)
            .setMaxLength(MAX_URL_LENGTH)
        )
        .addIntegerOption(option =>
          option
            .setName('timeout')
            .setDescription('Request timeout in milliseconds (optional).')
            .setMinValue(MIN_TIMEOUT_MS)
            .setMaxValue(MAX_TIMEOUT_MS)
        )
    )
    .addSubcommand(sub =>
      sub.setName('show').setDescription('Show the currently configured API endpoint.')
    )
    .addSubcommand(sub =>
      sub.setName('reset').setDescription('Reset the API endpoint to the server default.')
    )
    .addSubcommand(sub =>
      sub.setName('enable').setDescription('Enable the /ask command on this server.')
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Disable the /ask command on this server.')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    try {
      if (!(await hasManagePermission(interaction))) {
        return interaction.reply({
          content: await t(guildId, 'setinformationssystem.noPermission'),
          flags: EPHEMERAL
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'set') {
        const rawUrl = interaction.options.getString('url');
        const timeout = interaction.options.getInteger('timeout');

        const baseUrl = normalizeBaseUrl(rawUrl);
        if (!baseUrl) {
          return interaction.reply({
            content: await t(guildId, 'setinformationssystem.invalidUrl'),
            flags: EPHEMERAL
          });
        }

        const update = { 'informationssystemConfig.baseUrl': baseUrl };
        if (timeout != null) update['informationssystemConfig.timeout'] = timeout;

        await ServerSettings.findOneAndUpdate(
          { guildId },
          { $set: update },
          { upsert: true }
        );

        logger.security('Information system endpoint configured', {
          guildId,
          userId,
          baseUrl,
          timeout: timeout ?? null
        });

        await notifySettingsChanged(interaction);

        return interaction.reply({
          content: await t(guildId, 'setinformationssystem.setSuccess', { url: baseUrl }),
          flags: EPHEMERAL
        });
      }

      if (subcommand === 'show') {
        const settings = await ServerSettings.findOne({ guildId }).lean();
        const endpoint = resolveEndpointConfig(settings);
        const urlKey = endpoint.isCustom
          ? 'setinformationssystem.showCustom'
          : 'setinformationssystem.showDefault';
        const statusKey = endpoint.enabled
          ? 'setinformationssystem.statusEnabled'
          : 'setinformationssystem.statusDisabled';

        const urlMessage = await t(guildId, urlKey, { url: endpoint.baseUrl, timeout: endpoint.timeout });
        const statusMessage = await t(guildId, statusKey);

        return interaction.reply({
          content: `${urlMessage}\n${statusMessage}`,
          flags: EPHEMERAL
        });
      }

      if (subcommand === 'reset') {
        const settings = await ServerSettings.findOne({ guildId }).lean();
        const wasSet = Boolean(settings?.informationssystemConfig?.baseUrl);

        if (!wasSet) {
          return interaction.reply({
            content: await t(guildId, 'setinformationssystem.resetNothing'),
            flags: EPHEMERAL
          });
        }

        await ServerSettings.findOneAndUpdate(
          { guildId },
          { $unset: { 'informationssystemConfig.baseUrl': '', 'informationssystemConfig.timeout': '' } }
        );

        logger.security('Information system endpoint reset to default', { guildId, userId });

        await notifySettingsChanged(interaction);

        return interaction.reply({
          content: await t(guildId, 'setinformationssystem.resetSuccess'),
          flags: EPHEMERAL
        });
      }

      if (subcommand === 'enable' || subcommand === 'disable') {
        const enabled = subcommand === 'enable';

        await ServerSettings.findOneAndUpdate(
          { guildId },
          { $set: { 'informationssystemConfig.enabled': enabled } },
          { upsert: true }
        );

        logger.security('Information system feature toggled', { guildId, userId, enabled });

        await notifySettingsChanged(interaction);

        return interaction.reply({
          content: await t(guildId, enabled ? 'setinformationssystem.enableSuccess' : 'setinformationssystem.disableSuccess'),
          flags: EPHEMERAL
        });
      }
    } catch (error) {
      logger.error('Error configuring information system endpoint', {
        guildId,
        userId,
        error: error.message
      });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: await t(guildId, 'errors.commandError'),
          flags: EPHEMERAL
        });
      }
    }
  }
};
