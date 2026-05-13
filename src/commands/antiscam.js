const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const ScamDetectionEvent = require('../database/models/ScamDetectionEvent');
const { t } = require('../utils/i18n');
const { logger } = require('../utils/logger');
const { notifyAdminServer } = require('../utils/botNotifier');

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

    try {
      await interaction.deferReply({ flags: 64 });

      switch (subcommand) {
        case 'enable':
          await handleEnable(interaction, guildId);
          break;
        case 'disable':
          await handleDisable(interaction, guildId);
          break;
        case 'mode':
          await handleMode(interaction, guildId);
          break;
        case 'sensitivity':
          await handleSensitivity(interaction, guildId);
          break;
        case 'alert-channel':
          await handleAlertChannel(interaction, guildId);
          break;
        case 'auto-delete':
          await handleAutoDelete(interaction, guildId);
          break;
        case 'auto-timeout':
          await handleAutoTimeout(interaction, guildId);
          break;
        case 'whitelist-user':
          await handleWhitelistUser(interaction, guildId);
          break;
        case 'whitelist-domain':
          await handleWhitelistDomain(interaction, guildId);
          break;
        case 'ai-configure':
          await handleAIConfigure(interaction, guildId);
          break;
        case 'ai-configure-multimodel':
          await handleAIConfigureMultiModel(interaction, guildId);
          break;
        case 'ai-test':
          await handleAITest(interaction, guildId);
          break;
        case 'stats':
          await handleStats(interaction, guildId);
          break;
        case 'status':
          await handleStatus(interaction, guildId);
          break;
      }
    } catch (error) {
      logger.error('Error in antiscam command', {
        guildId,
        subcommand,
        error: error.message,
      });
      await interaction.editReply({
        content: '❌ An error occurred while processing your request.',
      });
    }
  },
};

async function handleEnable(interaction, guildId) {
  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.enabled': true },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'enable');

  await interaction.editReply({
    content: '✅ Anti-scam detection is now **enabled**.',
  });
}

async function handleDisable(interaction, guildId) {
  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.enabled': false },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'disable');

  await interaction.editReply({
    content: '❌ Anti-scam detection is now **disabled**.',
  });
}

async function handleMode(interaction, guildId) {
  const mode = interaction.options.getString('type');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.mode': mode },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'mode');

  const modeLabel = mode === 'ai' ? '🤖 AI Detection' : '📋 Default Detection';
  await interaction.editReply({
    content: `✅ Detection mode changed to **${modeLabel}**.`,
  });

  logger.security('Detection mode changed', {
    guildId,
    mode,
    changedBy: interaction.user.id,
  });
}

async function handleSensitivity(interaction, guildId) {
  const level = interaction.options.getString('level');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.sensitivity': level },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'sensitivity');

  const levelLabel =
    level === 'low'
      ? 'Low (fewer false positives)'
      : level === 'medium'
        ? 'Medium (balanced)'
        : 'High (more detections)';

  await interaction.editReply({
    content: `✅ Sensitivity set to **${levelLabel}**.`,
  });
}

async function handleAlertChannel(interaction, guildId) {
  const channel = interaction.options.getChannel('channel');

  if (!channel.isTextBased()) {
    return await interaction.editReply({
      content: '❌ Please select a text channel.',
    });
  }

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.alertChannelId': channel.id },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'alert-channel');

  await interaction.editReply({
    content: `✅ Alert channel set to ${channel.toString()}.`,
  });
}

async function handleAutoDelete(interaction, guildId) {
  const enabled = interaction.options.getBoolean('enabled');

  await ServerSettings.findOneAndUpdate(
    { guildId },
    { 'scamDetectionConfig.autoDelete': enabled },
    { upsert: true }
  );

  await notifyAdminServerSafely(guildId, interaction.user.id, 'auto-delete');

  await interaction.editReply({
    content: `✅ Auto-delete is now **${enabled ? 'enabled' : 'disabled'}**.`,
  });

  if (enabled) {
    logger.security('Auto-delete enabled', { guildId, changedBy: interaction.user.id });
  }
}

async function handleAutoTimeout(interaction, guildId) {
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
    content: `✅ Auto-timeout is now **${enabled ? 'enabled' : 'disabled'}** (${duration} minutes).`,
  });

  if (enabled) {
    logger.security('Auto-timeout enabled', {
      guildId,
      duration,
      changedBy: interaction.user.id,
    });
  }
}

async function handleWhitelistUser(interaction, guildId) {
  const user = interaction.options.getUser('user');

  const settings = await ServerSettings.findOne({ guildId });
  const trustedIds = settings?.scamDetectionConfig?.trustedUserIds || [];

  if (trustedIds.includes(user.id)) {
    return await interaction.editReply({
      content: '⚠️ This user is already whitelisted.',
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
    content: `✅ ${user.tag} has been added to the whitelist.`,
  });

  logger.security('User whitelisted', {
    guildId,
    userId: user.id,
    changedBy: interaction.user.id,
  });
}

async function handleWhitelistDomain(interaction, guildId) {
  const domain = interaction.options
    .getString('domain')
    .toLowerCase()
    .trim();

  if (!domain.includes('.')) {
    return await interaction.editReply({
      content: '❌ Invalid domain format.',
    });
  }

  const settings = await ServerSettings.findOne({ guildId });
  const trustedDomains = settings?.scamDetectionConfig?.trustedDomains || [];

  if (trustedDomains.includes(domain)) {
    return await interaction.editReply({
      content: '⚠️ This domain is already whitelisted.',
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
    content: `✅ \`${domain}\` has been added to the domain whitelist.`,
  });
}

async function handleAIConfigure(interaction, guildId) {
  const provider = interaction.options.getString('provider');
  const model = interaction.options.getString('model');
  const baseUrl = interaction.options.getString('baseurl');
  const apiKey = interaction.options.getString('apikey');
  const timeout = interaction.options.getInteger('timeout');

  const requiresApiKey = !['ollama'].includes(provider.toLowerCase());

  if (requiresApiKey && !apiKey) {
    return await interaction.editReply({
      content: `❌ API key is required for **${provider}**.\n\nProviders that don't require an API key:\n• Ollama (self-hosted)\n\n⚠️ **Security Note:** API keys are stored in the database. Use this command in a private channel or DM.`,
    });
  }

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: `❌ Base URL must start with http:// or https://\n\n**Example Base URLs:**\n• OpenAI: \`https://api.openai.com/v1\`\n• OpenRouter: \`https://openrouter.ai/api/v1\`\n• Anthropic: \`https://api.anthropic.com\`\n• Ollama: \`http://localhost:11434\``,
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
    : '\n⚠️ No API key configured (self-hosted provider)';

  const timeoutInfo = timeout ? `\nTimeout: ${timeout}ms` : '';

  await interaction.editReply({
    content: `✅ AI Detection configured:\n\`\`\`
Provider: ${provider}
Model: ${model}
Base URL: ${baseUrl}${apiKeyInfo}${timeoutInfo}
\`\`\`\n✅ Configuration saved to database.`,
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

async function handleAIConfigureMultiModel(interaction, guildId) {
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
      content: `❌ API key is required for text model provider **${textProvider}**.\n\n⚠️ **Security Note:** API keys are stored in the database. Use this command in a private channel or DM.`,
    });
  }

  if (!textBaseUrl.startsWith('http://') && !textBaseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: `❌ Text model base URL must start with http:// or https://`,
    });
  }

  const visionRequiresApiKey = !['ollama'].includes(visionProvider.toLowerCase());
  if (visionRequiresApiKey && !visionApiKey) {
    return await interaction.editReply({
      content: `❌ API key is required for vision model provider **${visionProvider}**.\n\n⚠️ **Security Note:** API keys are stored in the database. Use this command in a private channel or DM.`,
    });
  }

  if (!visionBaseUrl.startsWith('http://') && !visionBaseUrl.startsWith('https://')) {
    return await interaction.editReply({
      content: `❌ Vision model base URL must start with http:// or https://`,
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
    : 'No API key (self-hosted)';

  const visionApiKeyInfo = visionApiKey 
    ? `API Key: ••••••••${visionApiKey.slice(-4)}`
    : 'No API key (self-hosted)';

  await interaction.editReply({
    content: `✅ **Multi-Model AI Detection Configured**\n\n**Text Model (for text-only messages):**\n\`\`\`
Provider: ${textProvider}
Model: ${textModel}
Base URL: ${textBaseUrl}
${textApiKeyInfo}
Timeout: ${textModelConfig.timeout}ms
\`\`\`\n**Vision Model (for messages with images):**\n\`\`\`
Provider: ${visionProvider}
Model: ${visionModel}
Base URL: ${visionBaseUrl}
${visionApiKeyInfo}
Timeout: ${visionModelConfig.timeout}ms
\`\`\`\n✅ Configuration saved. The bot will automatically route:\n• Text-only messages → Text model (faster, cheaper)\n• Messages with images → Vision model (full analysis)`,
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

async function handleAITest(interaction, guildId) {
  const settings = await ServerSettings.findOne({ guildId });
  const config = settings?.scamDetectionConfig;
  const aiSettings = config?.aiSettings;

  if (config?.mode !== 'ai' || !aiSettings) {
    return await interaction.editReply({
      content: '❌ AI detection is not enabled. Set detection mode to "AI (Machine Learning)" first.',
    });
  }

  const isMultiModel = aiSettings.textModel && aiSettings.visionModel;

  await interaction.editReply({
    content: isMultiModel 
      ? '🔄 Testing both AI providers (text & vision)...' 
      : '🔄 Testing AI provider connection...',
  });

  try {
    const AIDetectionEngine = require('../utils/scamDetection/aiDetectionEngine');
    const aiEngine = new AIDetectionEngine();

    if (isMultiModel) {
      const textResult = await aiEngine.performHealthCheck(aiSettings.textModel);
      const visionResult = await aiEngine.performHealthCheck(aiSettings.visionModel);

      let responseText = '**Multi-Model AI Test Results:**\n\n';
      
      responseText += `**Text Model** (${aiSettings.textModel.provider}/${aiSettings.textModel.model}):\n`;
      if (textResult.healthy) {
        responseText += `✅ Healthy and responding\n\n`;
      } else {
        responseText += `❌ Failed: \`${textResult.reason}\`\n\n`;
      }
      
      responseText += `**Vision Model** (${aiSettings.visionModel.provider}/${aiSettings.visionModel.model}):\n`;
      if (visionResult.healthy) {
        responseText += `✅ Healthy and responding\n\n`;
      } else {
        responseText += `❌ Failed: \`${visionResult.reason}\`\n\n`;
      }

      if (textResult.healthy && visionResult.healthy) {
        responseText += '✅ **Overall:** Both models are healthy!';
        logger.security('Multi-model AI health check passed', {
          guildId,
          textProvider: aiSettings.textModel.provider,
          visionProvider: aiSettings.visionModel.provider,
        });
      } else {
        responseText += '⚠️ **Overall:** One or more models failed';
        logger.warn('Multi-model AI health check partially failed', {
          guildId,
          textHealthy: textResult.healthy,
          visionHealthy: visionResult.healthy,
        });
      }

      await interaction.editReply({ content: responseText });
    } else {
      const result = await aiEngine.performHealthCheck(aiSettings);

      if (result.healthy) {
        await interaction.editReply({
          content: `✅ AI provider is **healthy** and responding correctly.\n\nProvider: ${aiSettings.provider}/${aiSettings.model}`,
        });

        logger.security('AI health check passed', {
          guildId,
          provider: aiSettings.provider,
        });
      } else {
        await interaction.editReply({
          content: `❌ AI provider check failed:\n\`${result.reason}\``,
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
      content: `❌ Error testing AI provider:\n\`${error.message}\``,
    });
  }
}

async function handleStats(interaction, guildId) {
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

  let statsText = `📊 **Anti-Scam Statistics (${period})**\n\n`;
  statsText += `**Total Detections:** ${total}\n`;

  if (data.byMode?.length > 0) {
    statsText += `**By Mode:**\n`;
    data.byMode.forEach(m => {
      const mode = m._id === 'ai' ? '🤖 AI' : '📋 Default';
      statsText += `  ${mode}: ${m.count}\n`;
    });
  }

  if (data.byRiskLevel?.length > 0) {
    statsText += `**By Risk Level:**\n`;
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
    statsText += `**Fallback Events:** ${data.fallbackCount[0].count}\n`;
  }

  if (data.autoActions?.length > 0) {
    statsText += `**Auto Actions:**\n`;
    data.autoActions.forEach(a => {
      if (a._id !== 'none') {
        statsText += `  ${a._id}: ${a.count}\n`;
      }
    });
  }

  await interaction.editReply({
    content: statsText,
  });
}

async function handleStatus(interaction, guildId) {
  const settings = await ServerSettings.findOne({ guildId });
  const config = settings?.scamDetectionConfig;

  if (!config || !config.enabled) {
    return await interaction.editReply({
      content: '❌ Anti-scam detection is **disabled**.',
    });
  }

  let status = '✅ **Anti-Scam Detection Status**\n\n';
  status += `**Enabled:** Yes\n`;
  status += `**Mode:** ${config.mode === 'ai' ? '🤖 AI Detection' : '📋 Default Detection'}\n`;
  status += `**Sensitivity:** ${config.sensitivity || 'medium'}\n`;
  status += `**Alert Channel:** ${config.alertChannelId ? `<#${config.alertChannelId}>` : 'Not set'}\n\n`;

  status += `**Auto-Actions:**\n`;
  status += `  Delete Messages: ${config.autoDelete ? '✅' : '❌'}\n`;
  status += `  Timeout Users: ${config.autoTimeout ? `✅ (${config.autoTimeoutDuration} min)` : '❌'}\n\n`;

  status += `**Thresholds:**\n`;
  status += `  Alert Threshold: ${config.minRiskScoreForAlert}/100\n`;
  status += `  Auto-Action Threshold: ${config.minRiskScoreForAutoAction}/100\n`;
  status += `  Duplicate Threshold: ${config.duplicateMessageThreshold} channels\n\n`;

  status += `**Whitelisted Users:** ${config.trustedUserIds?.length || 0}\n`;
  status += `**Whitelisted Domains:** ${config.trustedDomains?.length || 0}\n`;

  if (config.mode === 'ai' && config.aiSettings) {
    status += `\n**AI Settings:**\n`;
    
    if (config.aiSettings.textModel && config.aiSettings.visionModel) {
      status += `  Mode: 🔀 Multi-Model (auto-routing)\n`;
      status += `  Text Model: ${config.aiSettings.textModel.provider}/${config.aiSettings.textModel.model}\n`;
      status += `  Vision Model: ${config.aiSettings.visionModel.provider}/${config.aiSettings.visionModel.model}\n`;
    } else {
      status += `  Mode: Single Model\n`;
      status += `  Provider: ${config.aiSettings.provider}\n`;
      status += `  Model: ${config.aiSettings.model}\n`;
    }
    
    status += `  Status: ${config.aiHealthStatus || 'Unknown'}\n`;
  }

  await interaction.editReply({ content: status });
}
