const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const ServerSettings = require('../database/models/ServerSettings');
const UserActivity = require('../database/models/UserActivity');
const ScamDetectionEvent = require('../database/models/ScamDetectionEvent');
const DefaultDetectionEngine = require('../utils/scamDetection/defaultDetectionEngine');
const AIDetectionEngine = require('../utils/scamDetection/aiDetectionEngine');
const { recordAIHealth } = require('../utils/scamDetection/aiHealth');
const { getTranslator } = require('../utils/i18n');
const { logger } = require('../utils/logger');
const { notifyAdminServer } = require('../utils/botNotifier');
const { MAX_MESSAGE_CONTENT_LENGTH } = require('../utils/constants');

// AI mode is usable when at least one configured model passes validation.
// validateConfig decides per provider whether an API key is needed (Ollama needs none).
function hasValidAIConfiguration(config) {
  const ai = config.aiSettings;
  if (!ai) return false;
  return [ai, ai.textModel, ai.visionModel]
    .filter(AIDetectionEngine.isModelConfigured)
    .some(modelConfig => aiEngine.validateConfig(modelConfig).valid);
}

const defaultEngine = new DefaultDetectionEngine();
const aiEngine = new AIDetectionEngine();

const suspiciousMessageStaging = new Map();
const activeSpamAlerts = new Map();
const alertMessageStorage = new Map();
const detectionResultCache = new Map();
const previouslyAlertedContent = new Map();
const alertCreationInProgress = new Map();

const SPAM_ALERT_THRESHOLD = 3;
const SPAM_ALERT_THRESHOLD_REPEAT = 1; // Threshold for content that was already alerted
const STAGING_CLEANUP_WINDOW = 120000;  // 120 seconds to handle slow AI detection
const ALERT_UPDATE_WINDOW = 60000;
const DETECTION_CACHE_TTL = 300000; // 5 minutes cache for detection results
const ALERT_STORAGE_TTL = 24 * 60 * 60 * 1000; // older alerts fall back to the DB
const PREVIOUS_ALERT_TTL = 24 * 60 * 60 * 1000; // repeat content needs only 1 message within this window
const MAINTENANCE_INTERVAL = 10 * 60 * 1000;
// Defaults match the ServerSettings schema
const DEFAULT_ALERT_THRESHOLD = 45;
const DEFAULT_AUTO_ACTION_THRESHOLD = 80;

async function handleAntiScam(client, message) {
  if (!message.author || message.author.bot) return;

  try {
    const settings = await ServerSettings.findOne({ guildId: message.guildId });
    
    if (!settings?.scamDetectionConfig?.enabled) {
      logger.debug('Anti-scam detection not enabled for guild', {
        guildId: message.guildId,
      });
      return;
    }

    const config = settings.scamDetectionConfig;
    const alertChannelId = config.alertChannelId || settings.adminChannelId;

    if (!alertChannelId) {
      logger.warn('Anti-scam enabled but no alert channel configured', {
        guildId: message.guildId,
      });
      return;
    }

    if (config.trustedUserIds?.includes(message.author.id)) {
      return;
    }

    await updateUserActivity(message.guildId, message.author, message);

    const looksSuspicious = defaultEngine.quickSuspiciousCheck(message.content, message, settings.language);
    
    if (!looksSuspicious) {
      return;
    }
    
    const images = defaultEngine.extractImages(message);
    const hasImages = images.length > 0;
    
    logger.info('Message looks suspicious, staging for spam detection', {
      guildId: message.guildId,
      userId: message.author.id,
      messagePreview: message.content?.substring(0, 50) || '(image only)',
      hasImages,
      imageCount: images.length,
    });
    
    await sendAdminAlert(
      client,
      alertChannelId,
      message,
      config,
      settings.language
    );
  } catch (error) {
    logger.error('Error in anti-scam handler', {
      messageId: message.id,
      error: error.message,
    });
  }
}

// Message content is only needed for duplicate detection (max. duplicateTimeWindow = 60 min);
// older entries keep just timestamp/channel/hash for the 24h behavioral checks.
const MESSAGE_CONTENT_RETENTION = 60 * 60 * 1000;
const RECENT_MESSAGES_RETENTION = 24 * 60 * 60 * 1000;
const RECENT_MESSAGES_LIMIT = 20;

// Unreachable or misconfigured AI marks the provider unhealthy right away (a single
// unparsable answer does not); a successful AI verdict marks it healthy again
function reportAIHealthFromDetection(client, guildId, result) {
  let update = null;
  if (result.modeUsed === 'ai') {
    update = recordAIHealth(client, guildId, true);
  } else if (result.fallbackTriggered && ['config', 'request'].includes(result.fallbackType)) {
    update = recordAIHealth(client, guildId, false, result.fallbackReason);
  }
  update?.catch(err => logger.error('Failed to record AI health', { guildId, error: err.message }));
}

async function updateUserActivity(guildId, author, message) {
  try {
    const now = new Date();
    const contentHash = defaultEngine.hashContent(message.content);
    const accountAgeDays = Math.floor(
      (Date.now() - author.createdTimestamp) / (1000 * 60 * 60 * 24)
    );

    // Single atomic update – a read-modify-write here loses messages when a user posts quickly
    await UserActivity.updateOne(
      { guildId, userId: author.id },
      {
        $set: { lastMessageTime: now, accountAge: accountAgeDays, updatedAt: now },
        $inc: { messageCount: 1 },
        $addToSet: { channelsPostIn: message.channelId },
        $push: {
          recentMessages: {
            $each: [{
              content: (message.content || '').slice(0, MAX_MESSAGE_CONTENT_LENGTH),
              channelId: message.channelId,
              timestamp: now,
              contentHash,
            }],
            $slice: -RECENT_MESSAGES_LIMIT,
          },
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, setDefaultsOnInsert: false }
    );
  } catch (error) {
    logger.error('Failed to update user activity', {
      guildId,
      userId: author.id,
      error: error.message,
    });
  }
}

async function pruneUserActivity() {
  const now = Date.now();
  const messagesCutoff = new Date(now - RECENT_MESSAGES_RETENTION);
  const contentCutoff = new Date(now - MESSAGE_CONTENT_RETENTION);

  await UserActivity.updateMany(
    { 'recentMessages.timestamp': { $lt: messagesCutoff } },
    { $pull: { recentMessages: { timestamp: { $lt: messagesCutoff } } } }
  );
  await UserActivity.updateMany(
    { recentMessages: { $elemMatch: { timestamp: { $lt: contentCutoff }, content: { $exists: true } } } },
    { $unset: { 'recentMessages.$[old].content': '' } },
    { arrayFilters: [{ 'old.timestamp': { $lt: contentCutoff } }] }
  );
}

async function sendAdminAlert(client, alertChannelId, message, config, serverLanguage = 'en') {
  try {
    logger.info('sendAdminAlert called', {
      guildId: message.guildId,
      alertChannelId,
      messageId: message.id,
    });

    const alertChannel = await client.channels.fetch(alertChannelId);
    if (!alertChannel?.isTextBased()) {
      logger.warn('Alert channel not found or not text-based', {
        guildId: message.guildId,
        alertChannelId,
      });
      return;
    }

    const contentHash = defaultEngine.hashMessageContent(message);
    const groupKey = `${message.guildId}_${message.author.id}_${contentHash}`;
    const now = Date.now();
    
    const existingAlert = activeSpamAlerts.get(groupKey);
    
    if (existingAlert && (now - existingAlert.lastUpdate) < ALERT_UPDATE_WINDOW) {
      existingAlert.messages.push({ messageId: message.id, channelId: message.channelId });
      existingAlert.count++;
      existingAlert.lastUpdate = now;

      try {
        const storage = alertMessageStorage.get(existingAlert.alertMessageId);
        if (storage) {
          storage.messages.push({ messageId: message.id, channelId: message.channelId });
        }
        await ScamDetectionEvent.updateOne(
          { alertMessageId: existingAlert.alertMessageId },
          { $push: { relatedMessages: { messageId: message.id, channelId: message.channelId } } }
        ).catch(err => logger.warn('Failed to persist related spam message', { error: err.message }));
        
        const alertMessage = await alertChannel.messages.fetch(existingAlert.alertMessageId);
        const tr = await getTranslator(message.guildId);
        const updatedEmbed = buildSpamAlertEmbed(
          existingAlert.firstMessage,
          existingAlert.detectionResult,
          existingAlert.count,
          tr
        );
        const updatedButtons = buildSpamAlertButtons(
          existingAlert.firstMessage,
          existingAlert.messages.length,
          existingAlert.alertMessageId,
          tr
        );

        await alertMessage.edit({
          embeds: [updatedEmbed],
          components: updatedButtons,
        });
      } catch (error) {
        logger.error('Failed to update spam alert', {
          groupKey,
          error: error.message,
        });
        if (existingAlert?.alertMessageId) {
          alertMessageStorage.delete(existingAlert.alertMessageId);
        }
        activeSpamAlerts.delete(groupKey);
        suspiciousMessageStaging.delete(groupKey);
      }
      
      await processAutoActions(message, existingAlert.detectionResult, config, existingAlert.alertMessageId);
      return;
    }
    
    let staging = suspiciousMessageStaging.get(groupKey);
    
    const wasPreviouslyAlerted = previouslyAlertedContent.has(groupKey);
    const effectiveThreshold = wasPreviouslyAlerted ? SPAM_ALERT_THRESHOLD_REPEAT : SPAM_ALERT_THRESHOLD;
    
    if (!staging) {
      const timeoutId = setTimeout(() => {
        suspiciousMessageStaging.delete(groupKey);
      }, STAGING_CLEANUP_WINDOW);
      
      suspiciousMessageStaging.set(groupKey, {
        messages: [{ messageId: message.id, channelId: message.channelId }],
        firstMessage: message,
        count: 1,
        lastUpdate: now,
        timeoutId,
      });
      
      logger.info('First suspicious message staged (not alerting yet)', {
        guildId: message.guildId,
        userId: message.author.id,
        username: message.author.username,
        threshold: effectiveThreshold,
        currentCount: 1,
        contentHash: contentHash.substring(0, 8),
        wasPreviouslyAlerted,
        note: wasPreviouslyAlerted 
          ? 'Content was alerted before - only 1 message needed for new alert'
          : `This USER needs to post ${effectiveThreshold - 1} more IDENTICAL messages`,
      });
      
      if (wasPreviouslyAlerted && effectiveThreshold === 1) {
        staging = suspiciousMessageStaging.get(groupKey);
      } else {
        return;
      }
    } else if (staging) {
      staging.messages.push({ messageId: message.id, channelId: message.channelId });
      staging.count++;
      staging.lastUpdate = now;
      
      clearTimeout(staging.timeoutId);
      staging.timeoutId = setTimeout(() => {
        suspiciousMessageStaging.delete(groupKey);
      }, STAGING_CLEANUP_WINDOW);
      
      logger.info('Additional suspicious message staged', {
        guildId: message.guildId,
        userId: message.author.id,
        username: message.author.username,
        threshold: effectiveThreshold,
        contentHash: contentHash.substring(0, 8),
        wasPreviouslyAlerted,
        note: staging.count >= effectiveThreshold 
          ? 'Threshold reached for THIS user!' 
          : `This USER needs ${effectiveThreshold - staging.count} more IDENTICAL message(s)`,
        currentCount: staging.count,
        willAlert: staging.count >= effectiveThreshold,
      });
    }
    
    if (staging && staging.count >= effectiveThreshold) {
      if (alertCreationInProgress.get(groupKey)) {
        logger.info('Alert creation already in progress for this content, skipping duplicate', {
          guildId: message.guildId,
          groupKey: groupKey.substring(0, 20) + '...',
          count: staging.count,
        });
        return;
      }
      
      alertCreationInProgress.set(groupKey, true);
      
      try {
        logger.info('Spam threshold reached, running full detection', {
          guildId: message.guildId,
          spamCount: staging.count,
          mode: config.mode,
        });
      
      const contentHash = defaultEngine.hashMessageContent(staging.firstMessage);
      const cacheKey = `${message.guildId}_${contentHash}`;
      const cachedResult = detectionResultCache.get(cacheKey);
      const cacheTime = Date.now();
      
      let finalDetectionResult;
      
      if (cachedResult && (cacheTime - cachedResult.timestamp) < DETECTION_CACHE_TTL) {
        finalDetectionResult = cachedResult.result;
        
        logger.info('Using cached detection result', {
          guildId: message.guildId,
          mode: finalDetectionResult.modeUsed,
          riskScore: finalDetectionResult.riskScore,
        });
      } else {
        const detectionOptions = {
          sensitivity: config.sensitivity,
          serverLanguage,
          trustedDomains: config.trustedDomains,
          duplicateThreshold: config.duplicateMessageThreshold,
          duplicateTimeWindow: config.duplicateTimeWindow,
          accountAgeRequirement: config.accountAgeRequirement,
          firstMessageSuspicion: config.firstMessageSuspicion,
          spamCount: staging.count,  // Pass spam count from staging
        };

        if (config.mode === 'ai' && hasValidAIConfiguration(config)) {
          try {
            logger.info('Running AI detection for spam analysis', {
              guildId: message.guildId,
              provider: config.aiSettings.provider,
              model: config.aiSettings.model,
            });

            finalDetectionResult = await aiEngine.detectScam(
              message.guildId,
              staging.firstMessage.author.id,
              staging.firstMessage.author,
              staging.firstMessage,
              config.aiSettings,
              detectionOptions
            );
            
            if (finalDetectionResult.fallbackTriggered) {
              logger.warn('AI detection fell back to default', {
                guildId: message.guildId,
                reason: finalDetectionResult.fallbackReason,
              });
            }
            reportAIHealthFromDetection(client, message.guildId, finalDetectionResult);
          } catch (aiError) {
            logger.error('AI detection failed, using default', {
              guildId: message.guildId,
              error: aiError.message,
            });
            reportAIHealthFromDetection(client, message.guildId, {
              fallbackTriggered: true,
              fallbackType: 'request',
              fallbackReason: aiError.message,
            });
            
            finalDetectionResult = await defaultEngine.detectScam(
              message.guildId,
              staging.firstMessage.author.id,
              staging.firstMessage.author,
              staging.firstMessage,
              detectionOptions
            );
            
            finalDetectionResult.modeUsed = 'default';
            finalDetectionResult.fallbackTriggered = true;
            finalDetectionResult.fallbackReason = aiError.message;
          }
        } else {
          finalDetectionResult = await defaultEngine.detectScam(
            message.guildId,
            staging.firstMessage.author.id,
            staging.firstMessage.author,
            staging.firstMessage,
            detectionOptions
          );
          
          finalDetectionResult.modeUsed = 'default';
          finalDetectionResult.fallbackTriggered = false;
        }
        
        detectionResultCache.set(cacheKey, {
          result: finalDetectionResult,
          timestamp: cacheTime,
        });
        
        for (const [key, value] of detectionResultCache.entries()) {
          if (cacheTime - value.timestamp > DETECTION_CACHE_TTL) {
            detectionResultCache.delete(key);
          }
        }
      }
      
      logger.info('Full detection complete', {
        guildId: message.guildId,
        mode: finalDetectionResult.modeUsed,
        riskScore: finalDetectionResult.riskScore,
        isScam: finalDetectionResult.isScam,
        reasons: finalDetectionResult.reasons,
      });
      
      const { alertThreshold } = getRiskThresholds(config);
      
      if (finalDetectionResult.riskScore < alertThreshold) {
        logger.info('Risk score below threshold after full detection, not alerting', {
          guildId: message.guildId,
          riskScore: finalDetectionResult.riskScore,
          alertThreshold,
        });
        
        clearTimeout(staging.timeoutId);
        suspiciousMessageStaging.delete(groupKey);
        alertCreationInProgress.delete(groupKey);
        return;
      }
      
      const tr = await getTranslator(message.guildId);
      const embed = buildSpamAlertEmbed(staging.firstMessage, finalDetectionResult, staging.count, tr);
      
      const buttons = buildSpamAlertButtons(staging.firstMessage, staging.messages.length, 'temp', tr);

      logger.info('Sending Discord alert message now', {
        guildId: message.guildId,
        channelId: alertChannel.id,
        spamCount: staging.count,
        riskScore: finalDetectionResult.riskScore,
      });

      const alertMessage = await alertChannel.send({
        embeds: [embed],
        components: buttons,
      });

      logger.info('Discord alert message sent successfully', {
        guildId: message.guildId,
        alertMessageId: alertMessage.id,
      });

      // Log the scam detection event to database
      try {
        await ScamDetectionEvent.create({
          guildId: staging.firstMessage.guildId,
          userId: staging.firstMessage.author.id,
          messageId: staging.firstMessage.id,
          channelId: staging.firstMessage.channelId,
          messageContent: staging.firstMessage.content?.substring(0, MAX_MESSAGE_CONTENT_LENGTH),
          
          modeUsed: finalDetectionResult.modeUsed || 'default',
          fallbackTriggered: finalDetectionResult.fallbackTriggered || false,
          fallbackReason: finalDetectionResult.fallbackReason,
          aiProvider: finalDetectionResult.aiProvider,
          aiModel: finalDetectionResult.aiModel,
          aiClassification: finalDetectionResult.aiClassification,
          aiConfidence: finalDetectionResult.aiConfidence,
          aiReason: finalDetectionResult.aiReason,
          
          detectionReasons: finalDetectionResult.reasons || [],
          extractedLinks: finalDetectionResult.links || [],
          extractedDomains: finalDetectionResult.domains || [],
          
          riskScore: finalDetectionResult.riskScore,
          riskLevel: finalDetectionResult.riskLevel || 'MEDIUM',
          
          actionTaken: 'flagged',
          alertSent: true,
          alertMessageId: alertMessage.id,
          relatedMessages: staging.messages.map(m => ({ messageId: m.messageId, channelId: m.channelId })),
          
          detectedAt: new Date(),
        });
        
        logger.info('Scam detection event logged to database', {
          guildId: staging.firstMessage.guildId,
          userId: staging.firstMessage.author.id,
          riskScore: finalDetectionResult.riskScore,
        });
        
        // Notify admin server to broadcast analytics update via WebSocket
        try {
          await notifyAdminServer('scam-alert', process.env.INTERNAL_SECRET);
        } catch (notifyError) {
          logger.error('Failed to notify admin server about scam detection event', {
            guildId: staging.firstMessage.guildId,
            error: notifyError.message,
          });
        }
      } catch (dbError) {
        logger.error('Failed to log scam detection event', {
          guildId: staging.firstMessage.guildId,
          error: dbError.message,
        });
      }

      alertMessageStorage.set(alertMessage.id, {
        messages: staging.messages.map(m => ({ messageId: m.messageId, channelId: m.channelId })),
        userId: staging.firstMessage.author.id,
        guildId: staging.firstMessage.guildId,
        groupKey: groupKey, // Store groupKey for cleanup when messages are deleted
        createdAt: now,
      });
      
      const correctButtons = buildSpamAlertButtons(staging.firstMessage, staging.messages.length, alertMessage.id, tr);
      await alertMessage.edit({ components: correctButtons }).catch(() => {});

      activeSpamAlerts.set(groupKey, {
        alertMessageId: alertMessage.id,
        messages: staging.messages.map(m => ({ messageId: m.messageId, channelId: m.channelId })),
        firstMessage: staging.firstMessage,
        lastUpdate: now,
        count: staging.count,
        detectionResult: finalDetectionResult,
      });
      
      clearTimeout(staging.timeoutId);
      suspiciousMessageStaging.delete(groupKey);
      alertCreationInProgress.delete(groupKey); // Clear in-progress flag
      
      logger.security('Spam alert created after threshold', {
        guildId: message.guildId,
        userId: message.author.id,
        count: staging.count,
        aiMode: config.mode === 'ai',
        riskScore: finalDetectionResult.riskScore
      });
      
      previouslyAlertedContent.set(groupKey, {
        timestamp: now,
        userId: staging.firstMessage.author.id,
        guildId: staging.firstMessage.guildId
      });
      
      setTimeout(() => {
        const alert = activeSpamAlerts.get(groupKey);
        if (alert && alert.alertMessageId === alertMessage.id) {
          activeSpamAlerts.delete(groupKey);
        }
      }, ALERT_UPDATE_WINDOW + 5000);
      
        await processAutoActions(message, finalDetectionResult, config, alertMessage.id);
      } catch (alertError) {
        logger.error('Error during alert creation', {
          guildId: message.guildId,
          groupKey: groupKey.substring(0, 20) + '...',
          error: alertError.message,
        });
        alertCreationInProgress.delete(groupKey);
        throw alertError; // Re-throw to outer catch
      }
    }
  } catch (error) {
    logger.error('Failed to send admin alert', {
      channelId: alertChannelId,
      error: error.message,
    });
  }
}

// Thresholds come from the admin settings (sensitivity only affects the scoring itself)
function getRiskThresholds(config) {
  return {
    alertThreshold: config.minRiskScoreForAlert ?? DEFAULT_ALERT_THRESHOLD,
    autoActionThreshold: config.minRiskScoreForAutoAction ?? DEFAULT_AUTO_ACTION_THRESHOLD,
  };
}

async function processAutoActions(message, detectionResult, config, alertMessageId) {
  const { autoActionThreshold } = getRiskThresholds(config);
  
  const shouldTakeAutoAction = detectionResult.riskScore >= autoActionThreshold;
  let actionTaken = 'flagged';
  let actionReason = null;
  let timeoutDuration = null;

  if (shouldTakeAutoAction && config.autoDelete) {
    try {
      await message.delete();
      actionTaken = 'deleted';
      actionReason = 'Auto-deletion enabled and risk score above threshold';
      logger.security('Auto-deleted scam message', {
        guildId: message.guildId,
        userId: message.author.id,
        messageId: message.id,
        riskScore: detectionResult.riskScore,
      });
    } catch (error) {
      logger.error('Failed to delete scam message', {
        messageId: message.id,
        error: error.message,
      });
    }
  }

  if (shouldTakeAutoAction && config.autoTimeout) {
    try {
      await message.member?.timeout(
        config.autoTimeoutDuration * 60 * 1000,
        'Suspected scam/spam activity'
      );
      actionTaken = 'timedout';
      timeoutDuration = config.autoTimeoutDuration;
      actionReason = `Auto-timeout enabled and risk score above threshold (${config.autoTimeoutDuration} minutes)`;
      logger.security('Auto-timed out user for scam activity', {
        guildId: message.guildId,
        userId: message.author.id,
        duration: config.autoTimeoutDuration,
      });
    } catch (error) {
      logger.error('Failed to timeout user', {
        userId: message.author.id,
        error: error.message,
      });
    }
  }
  
  // Update the ScamDetectionEvent with auto-action details
  if (alertMessageId && (actionTaken !== 'flagged' || actionReason)) {
    try {
      await ScamDetectionEvent.findOneAndUpdate(
        { alertMessageId: alertMessageId },
        {
          actionTaken,
          actionReason,
          timeoutDuration,
        }
      );
      logger.debug('Updated scam detection event with auto-action details', {
        alertMessageId,
        actionTaken,
      });
    } catch (error) {
      logger.error('Failed to update scam detection event with auto-actions', {
        alertMessageId,
        error: error.message,
      });
    }
  }
}

// The AI answers with fixed English labels (the scoring relies on them); only the display is translated
function classificationLabel(classification, a) {
  const value = String(classification || '').toLowerCase();
  if (value.includes('scam')) return a('classificationScam');
  if (value.includes('suspicious')) return a('classificationSuspicious');
  if (value.includes('safe')) return a('classificationSafe');
  return classification;
}

// tr: synchronous translator from getTranslator(guildId)
function buildSpamAlertEmbed(message, result, count, tr) {
  const a = (key, vars) => tr(`scamAlert.${key}`, vars);

  let description = `**${a('user')}:** ${message.author.tag} (<@${message.author.id}>)\n`;
  description += `**${a('channel')}:** <#${message.channelId}>\n`;
  
  if (count > 1) {
    description += `**${a('spamCount')}:** 🔁 ${a('messagesDetected', { count })}\n`;
  }
  
  description += `**${a('detectionMode')}:** ${a(result.modeUsed === 'ai' ? 'modeAi' : 'modeDefault')}\n`;
  description += `**${a('riskLevel')}:** ${getRiskLevelEmoji(result.riskLevel)} ${result.riskLevel}\n`;

  if (result.fallbackTriggered) {
    description += `⚠️ **${a('fallbackActive')}:** ${result.fallbackReason}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(a(count > 1 ? 'titleSpam' : 'titleSingle'))
    .setDescription(description)
    .setColor(getRiskLevelColor(result.riskLevel))
    .setTimestamp();

  if (result.reasons?.length > 0) {
    const reasonsText = result.reasons
      .slice(0, 3)
      .map(r => `• ${r}`)
      .join('\n');
    embed.addFields({
      name: a('reasons'),
      value: reasonsText || a('noReasons'),
      inline: false,
    });
  }

  if (result.modeUsed === 'ai' && result.aiClassification) {
    embed.addFields({
      name: a('aiAnalysis'),
      value:
        `**${a('classification')}:** ${classificationLabel(result.aiClassification, a)}\n` +
        `**${a('confidence')}:** ${result.aiConfidence}%\n` +
        `**${a('reason')}:** ${result.aiReason}`,
      inline: false,
    });
  }

  embed.addFields({
    name: a('riskScore'),
    value: `${result.riskScore}/100`,
    inline: true,
  });

  if (result.extractedLinks?.length > 0) {
    const linksText = result.extractedLinks
      .slice(0, 3)
      .join('\n');
    embed.addFields({
      name: a('links'),
      value: `\`\`\`${linksText}\`\`\``,
      inline: false,
    });
  }

  if (result.extractedImages?.length > 0 || result.hasImages) {
    const imageCount = result.extractedImages?.length || 0;
    let imageText = `${a('imagesAnalyzed', { count: imageCount })}\n`;
    
    if (result.extractedImages && result.extractedImages.length > 0) {
      imageText += result.extractedImages
        .slice(0, 3)
        .map((img, i) => `${i + 1}. ${img.name} (${(img.size / 1024).toFixed(1)}KB)`)
        .join('\n');
    }
    
    embed.addFields({
      name: a('imagesDetected'),
      value: imageText,
      inline: false,
    });
  }

  const messageText = message.content 
    ? message.content.substring(0, MAX_MESSAGE_CONTENT_LENGTH)
    : a('noText');

  embed.addFields({
    name: a(count > 1 ? 'firstMessage' : 'message'),
    value: `\`\`\`${messageText}\`\`\``,
    inline: false,
  });

  if (message.attachments && message.attachments.size > 0) {
    const firstImage = Array.from(message.attachments.values()).find(a => 
      a.contentType?.startsWith('image/')
    );
    if (firstImage) {
      embed.setThumbnail(firstImage.url);
    }
  }

  return embed;
}

function buildSpamAlertButtons(firstMessage, messageCount, alertMessageId, tr) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL(`https://discord.com/channels/${firstMessage.guildId}/${firstMessage.channelId}/${firstMessage.id}`)
      .setLabel(tr('scamAlert.buttonView'))
      .setStyle(ButtonStyle.Link),

    new ButtonBuilder()
      .setCustomId(`scam_delete_${alertMessageId}`)
      .setLabel(messageCount > 1 ? tr('scamAlert.buttonDeleteAll', { count: messageCount }) : tr('scamAlert.buttonDelete'))
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`scam_timeout_${firstMessage.author.id}_60`)
      .setLabel(tr('scamAlert.buttonTimeout1h'))
      .setStyle(ButtonStyle.Secondary)
  );

  const buttons2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`scam_timeout_${firstMessage.author.id}_1440`)
      .setLabel(tr('scamAlert.buttonTimeout24h'))
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`scam_dismiss_${firstMessage.id}`)
      .setLabel(tr('scamAlert.buttonDismiss'))
      .setStyle(ButtonStyle.Success)
  );

  return [buttons, buttons2];
}

function getRiskLevelEmoji(riskLevel) {
  const emojis = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🔴',
    CRITICAL: '🔴',
  };
  return emojis[riskLevel] || '⚪';
}

function getRiskLevelColor(riskLevel) {
  const colors = {
    LOW: 0x00aa00,
    MEDIUM: 0xffaa00,
    HIGH: 0xff0000,
    CRITICAL: 0x8b0000,
  };
  return colors[riskLevel] || 0x808080;
}

async function getAlertMessageData(alertMessageId) {
  const cached = alertMessageStorage.get(alertMessageId);
  if (cached) return cached;

  // In-memory data is gone after a restart or TTL sweep – fall back to the persisted event
  const event = await ScamDetectionEvent.findOne({ alertMessageId }).lean().catch(() => null);
  if (!event) return null;
  const messages = event.relatedMessages?.length
    ? event.relatedMessages
    : (event.messageId ? [{ messageId: event.messageId, channelId: event.channelId }] : []);
  if (messages.length === 0) return null;
  return { messages, userId: event.userId, guildId: event.guildId, groupKey: null };
}

function forgetAlert(alertMessageId) {
  cleanupDeletedAlert(alertMessageId);
  alertMessageStorage.delete(alertMessageId);
}

function runMaintenance() {
  const now = Date.now();
  for (const [id, data] of alertMessageStorage) {
    if (now - (data.createdAt || 0) > ALERT_STORAGE_TTL) alertMessageStorage.delete(id);
  }
  for (const [key, data] of previouslyAlertedContent) {
    if (now - data.timestamp > PREVIOUS_ALERT_TTL) previouslyAlertedContent.delete(key);
  }
  for (const [key, data] of detectionResultCache) {
    if (now - data.timestamp > DETECTION_CACHE_TTL) detectionResultCache.delete(key);
  }
  pruneUserActivity().catch(err => {
    logger.error('Failed to prune user activity', { error: err.message });
  });
}

setInterval(runMaintenance, MAINTENANCE_INTERVAL).unref();

function cleanupDeletedAlert(alertMessageId) {
  const alertData = alertMessageStorage.get(alertMessageId);
  if (alertData?.groupKey) {
    activeSpamAlerts.delete(alertData.groupKey);
    alertCreationInProgress.delete(alertData.groupKey);
    logger.info('Cleaned up active alert after deletion', {
      alertMessageId,
      groupKey: alertData.groupKey.substring(0, 20) + '...',
    });
  }
}

module.exports = handleAntiScam;
module.exports.getAlertMessageData = getAlertMessageData;
module.exports.cleanupDeletedAlert = cleanupDeletedAlert;
module.exports.forgetAlert = forgetAlert;
