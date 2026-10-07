const ServerSettings = require('../../database/models/ServerSettings');
const AIDetectionEngine = require('./aiDetectionEngine');
const { getTranslator } = require('../i18n');
const { logger } = require('../logger');

const MONITOR_TICK_MS = 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_REASON_LENGTH = 300;

const aiEngine = new AIDetectionEngine();

// The configured model blocks: text + vision when both are set, otherwise the single model
function getConfiguredModels(aiSettings) {
  if (!aiSettings) return [];
  const models = [];
  if (AIDetectionEngine.isModelConfigured(aiSettings.textModel)) models.push(['text', aiSettings.textModel]);
  if (AIDetectionEngine.isModelConfigured(aiSettings.visionModel)) models.push(['vision', aiSettings.visionModel]);
  if (models.length === 0 && AIDetectionEngine.isModelConfigured(aiSettings)) models.push(['default', aiSettings]);
  return models;
}

async function checkAIHealth(aiSettings) {
  const models = getConfiguredModels(aiSettings);
  if (models.length === 0) {
    return { healthy: false, reason: 'No AI model configured' };
  }

  const failures = [];
  for (const [type, modelConfig] of models) {
    const result = await aiEngine.performHealthCheck(modelConfig);
    if (!result.healthy) {
      failures.push(models.length > 1 ? `${type}: ${result.reason}` : result.reason);
    }
  }
  return failures.length === 0
    ? { healthy: true, reason: null }
    : { healthy: false, reason: failures.join('; ') };
}

async function notifyAdmins(client, settings, message) {
  const channelId = settings.scamDetectionConfig?.alertChannelId || settings.adminChannelId;
  if (!client || !channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) await channel.send(message);
  } catch (err) {
    logger.warn('Could not send AI health notification', { guildId: settings.guildId, error: err.message });
  }
}

/**
 * Stores the AI health status and notifies admins once per status change
 * (unavailable / available again), instead of on every fallback.
 */
async function recordAIHealth(client, guildId, healthy, reason = null) {
  const status = healthy ? 'healthy' : 'unhealthy';
  const fields = {
    'scamDetectionConfig.aiHealthStatus': status,
    'scamDetectionConfig.aiHealthCheckReason': healthy ? null : String(reason || '').slice(0, MAX_REASON_LENGTH),
    'scamDetectionConfig.lastHealthCheckTime': new Date(),
  };

  // Only the update that actually flips the status gets the previous document back,
  // so concurrent detections cannot send duplicate notifications
  const previous = await ServerSettings.findOneAndUpdate(
    { guildId, 'scamDetectionConfig.aiHealthStatus': { $ne: status } },
    { $set: fields },
    { new: false }
  ).lean();

  if (!previous) {
    await ServerSettings.updateOne({ guildId }, { $set: fields });
    return;
  }

  const previousStatus = previous.scamDetectionConfig?.aiHealthStatus || 'unknown';
  logger.info('AI health status changed', { guildId, from: previousStatus, to: status, reason });

  // The first successful check after startup is not news
  if (healthy && previousStatus === 'unknown') return;
  if (previous.scamDetectionConfig?.aiSettings?.notifyAdminsOnFallback === false) return;

  const tr = await getTranslator(guildId);
  const message = healthy
    ? tr('antiscam.healthRecovered')
    : tr('antiscam.healthDown', { reason: fields['scamDetectionConfig.aiHealthCheckReason'] });
  await notifyAdmins(client, previous, message);
}

async function runDueHealthChecks(client) {
  const guilds = await ServerSettings.find({
    'scamDetectionConfig.enabled': true,
    'scamDetectionConfig.mode': 'ai',
  }).lean();

  for (const settings of guilds) {
    const config = settings.scamDetectionConfig;
    const ai = config.aiSettings;
    if (!ai || ai.healthCheckEnabled === false) continue;

    const interval = ai.healthCheckInterval || DEFAULT_CHECK_INTERVAL_MS;
    const lastCheck = config.lastHealthCheckTime ? new Date(config.lastHealthCheckTime).getTime() : 0;
    if (Date.now() - lastCheck < interval) continue;

    const result = await checkAIHealth(ai);
    await recordAIHealth(client, settings.guildId, result.healthy, result.reason);
  }
}

function startAIHealthMonitor(client) {
  const tick = () => runDueHealthChecks(client).catch(err => {
    logger.error('AI health monitor failed', { error: err.message });
  });
  tick();
  setInterval(tick, MONITOR_TICK_MS).unref();
}

module.exports = { checkAIHealth, recordAIHealth, startAIHealthMonitor };
