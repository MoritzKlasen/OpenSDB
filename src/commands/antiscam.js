const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const ScamDetectionEvent = require('../database/models/ScamDetectionEvent');
const { t, getTranslator } = require('../utils/i18n');
const { logger } = require('../utils/logger');
const { notifyAdminServer } = require('../utils/botNotifier');
const AIDetectionEngine = require('../utils/scamDetection/aiDetectionEngine');
const { recordAIHealth } = require('../utils/scamDetection/aiHealth');

async function notifyAdminServerSafely(guildId, changedBy, operation) {
  try {
    await notifyAdminServer('settings-changed', process.env.INTERNAL_SECRET);
  } catch (notifyErr) {
    logger.error('Failed to notify admin server', {
      guildId,
      changedBy,
      operation,
      error: notifyErr.message,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antiscam')
    .setDescription('Anti-scam detection system management')
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable anti-scam detection')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable anti-scam detection')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('mode')
        .setDescription('Set detection mode')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Detection mode')
            .addChoices(
              { name: 'Default (Rule-based)', value: 'default' },
              { name: 'AI (Machine Learning)', value: 'ai' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sensitivity')
        .setDescription('Set detection sensitivity')
        .addStringOption(option =>
          option
            .setName('level')
            .setDescription('Sensitivity level')
            .addChoices(
              { name: 'Low', value: 'low' },
              { name: 'Medium', value: 'medium' },
              { name: 'High', value: 'high' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('alert-channel')
        .setDescription('Set alert channel for detections')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for alerts')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('auto-delete')
        .setDescription('Enable/disable auto-delete of scam messages')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable auto-delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('auto-timeout')
        .setDescription('Enable/disable auto-timeout for scammers')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable auto-timeout')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('duration')
            .setDescription('Timeout duration in minutes (default: 60)')
            .setMinValue(1)
            .setMaxValue(40320)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist-user')
        .setDescription('Whitelist a user from detection')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to whitelist')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('whitelist-domain')
        .setDescription('Whitelist a domain')
        .addStringOption(option =>
          option
            .setName('domain')
            .setDescription('Domain to whitelist (e.g., discord.com)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ai-configure')
        .setDescription('Configure AI detection provider')
        .addStringOption(option =>
          option
            .setName('provider')
            .setDescription('AI provider')
            .addChoices(
              { name: 'OpenAI', value: 'openai' },
              { name: 'OpenRouter', value: 'openrouter' },
              { name: 'Ollama (Self-hosted)', value: 'ollama' },
              { name: 'Anthropic Claude', value: 'anthropic' }
            )
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('Model name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('baseurl')
            .setDescription('API base URL (required, e.g., https://api.openai.com/v1)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('apikey')
            .setDescription('API key (optional for Ollama)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('timeout')
            .setDescription('API timeout in milliseconds (e.g., 30000 for 30 seconds)')
            .setMinValue(5000)
            .setMaxValue(120000)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ai-configure-multimodel')
        .setDescription('Configure separate text and vision AI models for optimal performance')
        .addStringOption(option =>
          option
            .setName('text-provider')
            .setDescription('Text-only AI provider')
            .addChoices(
              { name: 'OpenAI', value: 'openai' },
              { name: 'OpenRouter', value: 'openrouter' },
              { name: 'Ollama (Self-hosted)', value: 'ollama' },
              { name: 'Anthropic Claude', value: 'anthropic' }
            )
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('text-model')
            .setDescription('Text model name (e.g., llama3.2, gpt-3.5-turbo)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('text-baseurl')
            .setDescription('Text model API base URL')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('vision-provider')
            .setDescription('Vision AI provider')
            .addChoices(
              { name: 'OpenAI', value: 'openai' },
              { name: 'OpenRouter', value: 'openrouter' },
              { name: 'Ollama (Self-hosted)', value: 'ollama' },
              { name: 'Anthropic Claude', value: 'anthropic' }
            )
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('vision-model')
            .setDescription('Vision model name (e.g., llama3.2-vision, gpt-4-vision-preview)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('vision-baseurl')
            .setDescription('Vision model API base URL')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('text-apikey')
            .setDescription('Text model API key (optional for Ollama)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('text-timeout')
            .setDescription('Text model timeout in ms (default: 10000)')
            .setMinValue(5000)
            .setMaxValue(120000)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('vision-apikey')
            .setDescription('Vision model API key (optional for Ollama)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('vision-timeout')
            .setDescription('Vision model timeout in ms (default: 20000)')
            .setMinValue(5000)
            .setMaxValue(120000)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ai-test')
        .setDescription('Test AI provider connection')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('Show detection statistics')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Time period')
            .addChoices(
              { name: 'Last 24 hours', value: '24h' },
              { name: 'Last 7 days', value: '7d' },
              { name: 'Last 30 days', value: '30d' },
              { name: 'All time', value: 'all' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show current configuration and status')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    const settings = await ServerSettings.findOne({ guildId }) || {};
    const teamRoleId = settings.teamRoleId;

    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
    const isTeam = teamRoleId && interaction.member.roles.cache.has(teamRoleId);

    if (!isOwner && !isAdmin && !isTeam) {
      return interaction.reply({ content: await t(guildId, 'antiscam.noPermission'), flags: 64 });
    }

    const tr = await getTranslator(guildId);

    try {
      await interaction.deferReply({ flags: 64 });

      switch (subcommand) {
        case 'enable':
          await handleEnable(interaction, guildId, tr);
          break;
        case 'disable':
          await handleDisable(interaction, guildId, tr);
          break;
        case 'mode':
          await handleMode(interaction, guildId, tr);
          break;
        case 'sensitivity':
          await handleSensitivity(interaction, guildId, tr);
          break;
        case 'alert-channel':
          await handleAlertChannel(interaction, guildId, tr);
          break;
        case 'auto-delete':
          await handleAutoDelete(interaction, guildId, tr);
          break;
        case 'auto-timeout':
          await handleAutoTimeout(interaction, guildId, tr);
          break;
        case 'whitelist-user':
          await handleWhitelistUser(interaction, guildId, tr);
          break;
        case 'whitelist-domain':
          await handleWhitelistDomain(interaction, guildId, tr);
          break;
        case 'ai-configure':
          await handleAIConfigure(interaction, guildId, tr);
          break;
        case 'ai-configure-multimodel':
          await handleAIConfigureMultiModel(interaction, guildId, tr);
          break;
        case 'ai-test':
          await handleAITest(interaction, guildId, tr);
          break;
        case 'stats':
          await handleStats(interaction, guildId, tr);
          break;
        case 'status':
          await handleStatus(interaction, guildId, tr);
          break;
      }
    } catch (error) {
      logger.error('Error in antiscam command', {
        guildId,
        subcommand,
        error: error.message,
      });
      await interaction.editReply({
        content: tr('antiscam.error'),
      }).catch(() => {});
    }
  },
};

async function handleEnable(interaction, guildId, tr) {
  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.enabled': true },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'enable');

  await interaction.editReply({
    content: tr('antiscam.enabled'),
  });
}

async function handleDisable(interaction, guildId, tr) {
  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.enabled': false },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'disable');

  await interaction.editReply({
    content: tr('antiscam.disabled'),
  });
}

async function handleMode(interaction, guildId, tr) {
  const mode = interaction.options.getString('type');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.mode': mode },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'mode');

  const modeLabel = tr(mode === 'ai' ? 'antiscam.modeAi' : 'antiscam.modeDefault');
  await interaction.editReply({
    content: tr('antiscam.modeChanged', { mode: modeLabel }),
  });

  logger.security('Detection mode changed', {
    guildId,
    mode,
    changedBy: interaction.user.id,
  });
}

function sensitivityLabel(level, tr) {
  const keys = { low: 'antiscam.sensitivityLow', medium: 'antiscam.sensitivityMedium', high: 'antiscam.sensitivityHigh' };
  return tr(keys[level] || keys.medium);
}

async function handleSensitivity(interaction, guildId, tr) {
  const level = interaction.options.getString('level');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.sensitivity': level },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'sensitivity');

  await interaction.editReply({
    content: tr('antiscam.sensitivitySet', { level: sensitivityLabel(level, tr) }),
  });
}

async function handleAlertChannel(interaction, guildId, tr) {
  const channel = interaction.options.getChannel('channel');

  if (!channel.isTextBased()) {
    return await interaction.editReply({
      content: tr('antiscam.textChannelRequired'),
    });
  }

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.alertChannelId': channel.id },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'alert-channel');

  await interaction.editReply({
    content: tr('antiscam.alertChannelSet', { channel: channel.toString() }),
  });
}

async function handleAutoDelete(interaction, guildId, tr) {
  const enabled = interaction.options.getBoolean('enabled');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.autoDelete': enabled },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'auto-delete');

  await interaction.editReply({
    content: tr('antiscam.autoDeleteSet', { state: tr(enabled ? 'antiscam.stateEnabled' : 'antiscam.stateDisabled') }),
  });

  if (enabled) {
    logger.security('Auto-delete enabled', { guildId, changedBy: interaction.user.id });
  }
}

async function handleAutoTimeout(interaction, guildId, tr) {
  const enabled = interaction.options.getBoolean('enabled');
  const duration = interaction.options.getInteger('duration') || 60;

  await ServerSettings.findOneAndUpdate(
    { guildId },
    {
      'scamDetectionConfig.autoTimeout': enabled,
      'scamDetectionConfig.autoTimeoutDuration': duration,
    },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'auto-timeout');

  await interaction.editReply({
    content: tr('antiscam.autoTimeoutSet', { state: tr(enabled ? 'antiscam.stateEnabled' : 'antiscam.stateDisabled'), duration }),
  });

  if (enabled) {
    logger.security('Auto-timeout enabled', {
      guildId,
      duration,
      changedBy: interaction.user.id,
    });
  }
}

async function handleWhitelistUser(interaction, guildId, tr) {
  const user = interaction.options.getUser('user');

  const settings = await ServerSettings.findOne({ guildId });
  const trustedIds = settings?.scamDetectionConfig?.trustedUserIds || [];

  if (trustedIds.includes(user.id)) {
    return await interaction.editReply({
      content: tr('antiscam.userAlreadyWhitelisted'),
    });
  }

  trustedIds.push(user.id);

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.trustedUserIds': trustedIds },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'whitelist-user');

  await interaction.editReply({
    content: tr('antiscam.userWhitelisted', { user: user.tag }),
  });

  logger.security('User whitelisted', {
    guildId,
    userId: user.id,
    changedBy: interaction.user.id,
  });
}

async function handleWhitelistDomain(interaction, guildId, tr) {
  const domain = interaction.options
    .getString('domain')
    .toLowerCase()
    .trim();

  if (!domain.includes('.')) {
    return await interaction.editReply({
      content: tr('antiscam.invalidDomain'),
    });
  }

  const settings = await ServerSettings.findOne({ guildId });
  const trustedDomains = settings?.scamDetectionConfig?.trustedDomains || [];

  if (trustedDomains.includes(domain)) {
    return await interaction.editReply({
      content: tr('antiscam.domainAlreadyWhitelisted'),
    });
  }

  trustedDomains.push(domain);

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.trustedDomains': trustedDomains },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'whitelist-domain');

  await interaction.editReply({
    content: tr('antiscam.domainWhitelisted', { domain }),
  });
}

async function handleAIConfigure(interaction, guildId, tr) {
  const provider = interaction.options.getString('provider');
  const model = interaction.options.getString('model');
  const baseUrl = interaction.options.getString('baseurl');
  const apiKey = interaction.options.getString('apikey');
  const timeout = interaction.options.getInteger('timeout');

  const requiresApiKey = !['ollama'].includes(provider.toLowerCase());

  if (requiresApiKey && !apiKey) {
    return await interaction.editReply({
      content: `${tr('antiscam.apiKeyRequired', { provider })}\n\n${tr('antiscam.apiKeySecurityNote')}`,
    });
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: `${tr('antiscam.baseUrlInvalid')}\n\n${tr('antiscam.baseUrlExamples')}\n• OpenAI: \`https://api.openai.com/v1\`\n• OpenRouter: \`https://openrouter.ai/api/v1\`\n• Anthropic: \`https://api.anthropic.com\`\n• Ollama: \`http://localhost:11434\``,
    });
  }

  const aiSettings = {
    enabled: true,
    provider,
    model,
    baseUrl,
  };

  if (apiKey) {
    aiSettings.apiKey = apiKey;
  }

  if (timeout) {
    aiSettings.timeout = timeout;
  }

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.aiSettings': aiSettings },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'ai-configure');

  const apiKeyInfo = apiKey 
    ? `\nAPI Key: ••••••••${apiKey.slice(-4)}`
    : `\n⚠️ ${tr('antiscam.noApiKey')}`;

  const timeoutInfo = timeout ? `\nTimeout: ${timeout}ms` : '';

  await interaction.editReply({
    content: `${tr('antiscam.aiConfigured')}\n\`\`\`
Provider: ${provider}
Model: ${model}
Base URL: ${baseUrl}${apiKeyInfo}${timeoutInfo}
\`\`\`\n${tr('antiscam.configSaved')}`,
  });

  logger.security('AI detection configured', {
    guildId,
    provider,
    model,
    baseUrl,
    hasApiKey: !!apiKey,
    timeout: timeout || 'default',
    changedBy: interaction.user.id,
  });
}

async function handleAIConfigureMultiModel(interaction, guildId, tr) {
  const textProvider = interaction.options.getString('text-provider');
  const textModel = interaction.options.getString('text-model');
  const textBaseUrl = interaction.options.getString('text-baseurl');
  const textApiKey = interaction.options.getString('text-apikey');
  const textTimeout = interaction.options.getInteger('text-timeout');

  const visionProvider = interaction.options.getString('vision-provider');
  const visionModel = interaction.options.getString('vision-model');
  const visionBaseUrl = interaction.options.getString('vision-baseurl');
  const visionApiKey = interaction.options.getString('vision-apikey');
  const visionTimeout = interaction.options.getInteger('vision-timeout');

  const textRequiresApiKey = !['ollama'].includes(textProvider.toLowerCase());
  if (textRequiresApiKey && !textApiKey) {
    return await interaction.editReply({
      content: `${tr('antiscam.textApiKeyRequired', { provider: textProvider })}\n\n${tr('antiscam.apiKeySecurityNote')}`,
    });
  }

  if (!textBaseUrl.startsWith('http://') && !textBaseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: tr('antiscam.textBaseUrlInvalid'),
    });
  }

  const visionRequiresApiKey = !['ollama'].includes(visionProvider.toLowerCase());
  if (visionRequiresApiKey && !visionApiKey) {
    return await interaction.editReply({
      content: `${tr('antiscam.visionApiKeyRequired', { provider: visionProvider })}\n\n${tr('antiscam.apiKeySecurityNote')}`,
    });
  }

  if (!visionBaseUrl.startsWith('http://') && !visionBaseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: tr('antiscam.visionBaseUrlInvalid'),
    });
  }

  const textModelConfig = {
    provider: textProvider,
    model: textModel,
    baseUrl: textBaseUrl,
  };

  if (textApiKey) {
    textModelConfig.apiKey = textApiKey;
  }

  if (textTimeout) {
    textModelConfig.timeout = textTimeout;
  } else {
    textModelConfig.timeout = 10000;
  }

  const visionModelConfig = {
    provider: visionProvider,
    model: visionModel,
    baseUrl: visionBaseUrl,
  };

  if (visionApiKey) {
    visionModelConfig.apiKey = visionApiKey;
  }

  if (visionTimeout) {
    visionModelConfig.timeout = visionTimeout;
  } else {
    visionModelConfig.timeout = 20000;
  }

  const aiSettings = {
    enabled: true,
    textModel: textModelConfig,
    visionModel: visionModelConfig,
  };

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { $set: { 'scamDetectionConfig.aiSettings': aiSettings } },
    { upsert: true, new: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'ai-configure-multimodel');

  logger.info('Multi-model AI configuration saved to database', {
    guildId,
    textProvider,
    visionProvider,
    hasTextApiKey: !!textApiKey,
    hasVisionApiKey: !!visionApiKey,
  });

  const textApiKeyInfo = textApiKey 
    ? `API Key: ••••••••${textApiKey.slice(-4)}`
    : tr('antiscam.noApiKey');

  const visionApiKeyInfo = visionApiKey 
    ? `API Key: ••••••••${visionApiKey.slice(-4)}`
    : tr('antiscam.noApiKey');

  await interaction.editReply({
    content: `${tr('antiscam.multiConfigured')}\n\n${tr('antiscam.multiTextModel')}\n\`\`\`
Provider: ${textProvider}
Model: ${textModel}
Base URL: ${textBaseUrl}
${textApiKeyInfo}
Timeout: ${textModelConfig.timeout}ms
\`\`\`\n${tr('antiscam.multiVisionModel')}\n\`\`\`
Provider: ${visionProvider}
Model: ${visionModel}
Base URL: ${visionBaseUrl}
${visionApiKeyInfo}
Timeout: ${visionModelConfig.timeout}ms
\`\`\`\n${tr('antiscam.multiRouting')}`,
  });

  logger.security('Multi-model AI detection configured', {
    guildId,
    textProvider,
    textModel,
    visionProvider,
    visionModel,
    changedBy: interaction.user.id,
  });
}

async function handleAITest(interaction, guildId, tr) {
  const settings = await ServerSettings.findOne({ guildId });
  const config = settings?.scamDetectionConfig;
  const aiSettings = config?.aiSettings;

  if (config?.mode !== 'ai' || !aiSettings) {
    return await interaction.editReply({
      content: tr('antiscam.aiNotEnabled'),
    });
  }

  const isMultiModel = AIDetectionEngine.isModelConfigured(aiSettings.textModel) &&
    AIDetectionEngine.isModelConfigured(aiSettings.visionModel);

  await interaction.editReply({
    content: tr(isMultiModel ? 'antiscam.aiTestingBoth' : 'antiscam.aiTesting'),
  });

  try {
    const aiEngine = new AIDetectionEngine();

    if (isMultiModel) {
      const textResult = await aiEngine.performHealthCheck(aiSettings.textModel);
      const visionResult = await aiEngine.performHealthCheck(aiSettings.visionModel);

      const resultLine = (result) => result.healthy
        ? tr('antiscam.aiModelHealthy')
        : tr('antiscam.aiModelFailed', { reason: result.reason });

      let responseText = `${tr('antiscam.aiMultiResults')}\n\n`;
      responseText += `${tr('antiscam.aiTextModel', { model: `${aiSettings.textModel.provider}/${aiSettings.textModel.model}` })}\n`;
      responseText += `${resultLine(textResult)}\n\n`;
      responseText += `${tr('antiscam.aiVisionModel', { model: `${aiSettings.visionModel.provider}/${aiSettings.visionModel.model}` })}\n`;
      responseText += `${resultLine(visionResult)}\n\n`;

      const failures = [['text', textResult], ['vision', visionResult]]
        .filter(([, r]) => !r.healthy)
        .map(([type, r]) => `${type}: ${r.reason}`);
      await recordAIHealth(interaction.client, guildId, failures.length === 0, failures.join('; '));

      if (textResult.healthy && visionResult.healthy) {
        responseText += tr('antiscam.aiAllHealthy');
        logger.security('Multi-model AI health check passed', {
          guildId,
          textProvider: aiSettings.textModel.provider,
          visionProvider: aiSettings.visionModel.provider,
        });
      } else {
        responseText += tr('antiscam.aiSomeFailed');
        logger.warn('Multi-model AI health check partially failed', {
          guildId,
          textHealthy: textResult.healthy,
          visionHealthy: visionResult.healthy,
        });
      }

      await interaction.editReply({ content: responseText });
    } else {
      const result = await aiEngine.performHealthCheck(aiSettings);
      await recordAIHealth(interaction.client, guildId, result.healthy, result.reason);

      if (result.healthy) {
        await interaction.editReply({
          content: tr('antiscam.aiHealthy', { model: `${aiSettings.provider}/${aiSettings.model}` }),
        });

        logger.security('AI health check passed', {
          guildId,
          provider: aiSettings.provider,
        });
      } else {
        await interaction.editReply({
          content: tr('antiscam.aiCheckFailed', { reason: result.reason }),
        });

        logger.warn('AI health check failed', {
          guildId,
          provider: aiSettings.provider,
          reason: result.reason,
        });
      }
    }
  } catch (error) {
    logger.error('Error testing AI provider', {
      guildId,
      isMultiModel,
      error: error.message,
    });
    await interaction.editReply({
      content: tr('antiscam.aiTestError', { reason: error.message }),
    });
  }
}

async function handleStats(interaction, guildId, tr) {
  const period = interaction.options.getString('period') || '24h';

  let since;
  switch (period) {
    case '24h':
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      since = new Date(0);
  }

  const stats = await ScamDetectionEvent.aggregate([
    {
      $match: {
        guildId,
        createdAt: { $gte: since },
      },
    },
    {
      $facet: {
        byMode: [{ $group: { _id: '$modeUsed', count: { $sum: 1 } } }],
        byRiskLevel: [{ $group: { _id: '$riskLevel', count: { $sum: 1 } } }],
        fallbackCount: [
          { $match: { fallbackTriggered: true } },
          { $count: 'count' },
        ],
        autoActions: [{ $group: { _id: '$actionTaken', count: { $sum: 1 } } }],
      },
    },
  ]);

  const [data] = stats;

  const total = (data.byMode || []).reduce((sum, m) => sum + m.count, 0);

  const periodKeys = { '24h': 'antiscam.period24h', '7d': 'antiscam.period7d', '30d': 'antiscam.period30d' };
  let statsText = `${tr('antiscam.statsTitle', { period: tr(periodKeys[period] || 'antiscam.periodAll') })}\n\n`;
  statsText += `${tr('antiscam.statsTotal', { count: total })}\n`;

  if (data.byMode?.length > 0) {
    statsText += `${tr('antiscam.statsByMode')}\n`;
    data.byMode.forEach(m => {
      const mode = tr(m._id === 'ai' ? 'antiscam.statsModeAi' : 'antiscam.statsModeDefault');
      statsText += `  ${mode}: ${m.count}\n`;
    });
  }

  if (data.byRiskLevel?.length > 0) {
    statsText += `${tr('antiscam.statsByRisk')}\n`;
    data.byRiskLevel.forEach(r => {
      const emoji = {
        LOW: '🟢',
        MEDIUM: '🟡',
        HIGH: '🔴',
        CRITICAL: '🔴',
      }[r._id] || '⚪';
      statsText += `  ${emoji} ${r._id}: ${r.count}\n`;
    });
  }

  if (data.fallbackCount[0]?.count > 0) {
    statsText += `${tr('antiscam.statsFallbacks', { count: data.fallbackCount[0].count })}\n`;
  }

  if (data.autoActions?.length > 0) {
    const actionKeys = { flagged: 'antiscam.actionFlagged', deleted: 'antiscam.actionDeleted', timedout: 'antiscam.actionTimedout' };
    statsText += `${tr('antiscam.statsAutoActions')}\n`;
    data.autoActions.forEach(a => {
      if (a._id !== 'none') {
        statsText += `  ${actionKeys[a._id] ? tr(actionKeys[a._id]) : a._id}: ${a.count}\n`;
      }
    });
  }

  await interaction.editReply({
    content: statsText,
  });
}

async function handleStatus(interaction, guildId, tr) {
  const settings = await ServerSettings.findOne({ guildId });
  const config = settings?.scamDetectionConfig;

  if (!config || !config.enabled) {
    return await interaction.editReply({
      content: tr('antiscam.statusDisabled'),
    });
  }

  const state = (on) => (on ? '✅' : '❌');
  const healthKeys = { healthy: 'antiscam.healthHealthy', unhealthy: 'antiscam.healthUnhealthy' };

  let status = `${tr('antiscam.statusTitle')}\n\n`;
  status += `${tr('antiscam.statusEnabled')}\n`;
  status += `${tr('antiscam.statusMode', { mode: tr(config.mode === 'ai' ? 'antiscam.modeAi' : 'antiscam.modeDefault') })}\n`;
  status += `${tr('antiscam.statusSensitivity', { level: sensitivityLabel(config.sensitivity, tr) })}\n`;
  status += `${tr('antiscam.statusAlertChannel', { channel: config.alertChannelId ? `<#${config.alertChannelId}>` : tr('antiscam.notSet') })}\n\n`;

  status += `${tr('antiscam.statusAutoActions')}\n`;
  status += `  ${tr('antiscam.statusDelete', { state: state(config.autoDelete) })}\n`;
  status += `  ${tr('antiscam.statusTimeout', { state: config.autoTimeout ? tr('antiscam.statusTimeoutOn', { duration: config.autoTimeoutDuration }) : state(false) })}\n\n`;

  status += `${tr('antiscam.statusThresholds')}\n`;
  status += `  ${tr('antiscam.statusAlertThreshold', { value: config.minRiskScoreForAlert })}\n`;
  status += `  ${tr('antiscam.statusAutoActionThreshold', { value: config.minRiskScoreForAutoAction })}\n`;
  status += `  ${tr('antiscam.statusDuplicateThreshold', { value: config.duplicateMessageThreshold })}\n\n`;

  status += `${tr('antiscam.statusWhitelistedUsers', { count: config.trustedUserIds?.length || 0 })}\n`;
  status += `${tr('antiscam.statusWhitelistedDomains', { count: config.trustedDomains?.length || 0 })}\n`;

  if (config.mode === 'ai' && config.aiSettings) {
    const ai = config.aiSettings;
    status += `\n${tr('antiscam.statusAiSettings')}\n`;

    if (AIDetectionEngine.isModelConfigured(ai.textModel) &&
        AIDetectionEngine.isModelConfigured(ai.visionModel)) {
      status += `  ${tr('antiscam.statusAiMulti')}\n`;
      status += `  ${tr('antiscam.statusAiTextModel', { model: `${ai.textModel.provider}/${ai.textModel.model}` })}\n`;
      status += `  ${tr('antiscam.statusAiVisionModel', { model: `${ai.visionModel.provider}/${ai.visionModel.model}` })}\n`;
    } else {
      status += `  ${tr('antiscam.statusAiSingle')}\n`;
      status += `  ${tr('antiscam.statusAiProvider', { provider: ai.provider })}\n`;
      status += `  ${tr('antiscam.statusAiModel', { model: ai.model })}\n`;
    }

    const healthLabel = tr(healthKeys[config.aiHealthStatus] || 'antiscam.healthUnknown');
    const healthReason = config.aiHealthStatus === 'unhealthy' && config.aiHealthCheckReason
      ? ` – ${config.aiHealthCheckReason}`
      : '';
    status += `  ${tr('antiscam.statusAiHealth', { status: healthLabel + healthReason })}\n`;
    if (config.lastHealthCheckTime) {
      const lastCheck = Math.floor(new Date(config.lastHealthCheckTime).getTime() / 1000);
      status += `  ${tr('antiscam.statusAiLastCheck', { time: `<t:${lastCheck}:R>` })}\n`;
    }
  }

  await interaction.editReply({ content: status });
}
