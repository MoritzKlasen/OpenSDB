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
const { t } = require('../utils/i18n');
const { logger } = require('../utils/logger');

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

async function handleAntiScam(client, message) {
  if (message.author.bot) return;

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

    const looksSuspicious = defaultEngine.quickSuspiciousCheck(message.content, message);
    
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
      config
    );
  } catch (error) {
    logger.error('Error in anti-scam handler', {
      messageId: message.id,
      error: error.message,
    });
  }
}

async function updateUserActivity(guildId, author, message) {
  try {
    const userData = await UserActivity.findOne({
      guildId,
      userId: author.id,
    });

    const now = new Date();
    const contentHash = defaultEngine.hashContent(message.content);

    const recentMessages = (userData?.recentMessages || [])
      .filter(msg => now - new Date(msg.timestamp) < 24 * 60 * 60 * 1000)
      .slice(-20);

    recentMessages.push({
      content: message.content,
      channelId: message.channelId,
      timestamp: now,
      contentHash,
    });

    const channelsPostIn = new Set(userData?.channelsPostIn || []);
    channelsPostIn.add(message.channelId);

    const accountAgeDays = Math.floor(
      (Date.now() - author.createdTimestamp) / (1000 * 60 * 60 * 24)
    );

    await UserActivity.findOneAndUpdate(
      { guildId, userId: author.id },
      {
        lastMessageTime: now,
        messageCount: (userData?.messageCount || 0) + 1,
        channelsPostIn: Array.from(channelsPostIn),
        recentMessages,
        accountAge: accountAgeDays,
        updatedAt: now,
      },
      { upsert: true }
    );
  } catch (error) {
    logger.error('Failed to update user activity', {
      guildId,
      userId: author.id,
      error: error.message,
    });
  }
}

async function sendAdminAlert(client, alertChannelId, message, config) {
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
        
        const alertMessage = await alertChannel.messages.fetch(existingAlert.alertMessageId);
        const updatedEmbed = buildSpamAlertEmbed(
          existingAlert.firstMessage,
          existingAlert.detectionResult,
          existingAlert.count
        );
        const updatedButtons = buildSpamAlertButtons(
          existingAlert.firstMessage,
          existingAlert.messages.length,
          existingAlert.alertMessageId
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
      
      await processAutoActions(message, existingAlert.detectionResult, config);
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
        if (config.mode === 'ai' && config.aiSettings?.enabled) {
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
              {
                sensitivity: config.sensitivity,
                serverLanguage: config.language || 'en',
                trustedDomains: config.trustedDomains,
                duplicateThreshold: config.duplicateMessageThreshold,
                duplicateTimeWindow: config.duplicateTimeWindow,
                spamCount: staging.count,  // Pass spam count from staging
              }
            );
            
            if (finalDetectionResult.fallbackTriggered) {
              logger.warn('AI detection fell back to default', {
                guildId: message.guildId,
                reason: finalDetectionResult.fallbackReason,
              });
            }
          } catch (aiError) {
            logger.error('AI detection failed, using default', {
              guildId: message.guildId,
              error: aiError.message,
            });
            
            finalDetectionResult = await defaultEngine.detectScam(
              message.guildId,
              staging.firstMessage.author.id,
              staging.firstMessage.author,
              staging.firstMessage,
              {
                sensitivity: config.sensitivity,
                serverLanguage: config.language || 'en',
                trustedDomains: config.trustedDomains,
                duplicateThreshold: config.duplicateMessageThreshold,
                duplicateTimeWindow: config.duplicateTimeWindow,
                spamCount: staging.count,  // Pass spam count from staging
              }
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
            {
              sensitivity: config.sensitivity,
              serverLanguage: config.language || 'en',
              trustedDomains: config.trustedDomains,
              duplicateThreshold: config.duplicateMessageThreshold,
              duplicateTimeWindow: config.duplicateTimeWindow,
              spamCount: staging.count,  // Pass spam count from staging
            }
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
      
      const thresholdMap = {
        low: 60,
        medium: 40,
        high: 20
      };
      
      const alertThreshold = thresholdMap[config.sensitivity] || 50;
      
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
      
      const embed = buildSpamAlertEmbed(staging.firstMessage, finalDetectionResult, staging.count);
      
      const buttons = buildSpamAlertButtons(staging.firstMessage, staging.messages.length, 'temp');

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

      alertMessageStorage.set(alertMessage.id, {
        messages: staging.messages.map(m => ({ messageId: m.messageId, channelId: m.channelId })),
        userId: staging.firstMessage.author.id,
        guildId: staging.firstMessage.guildId,
        groupKey: groupKey, // Store groupKey for cleanup when messages are deleted
      });
      
      const correctButtons = buildSpamAlertButtons(staging.firstMessage, staging.messages.length, alertMessage.id);
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
        aiMode: config.aiSettings?.enabled,
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
      
        await processAutoActions(message, finalDetectionResult, config);
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

async function processAutoActions(message, detectionResult, config) {
  const thresholdMap = {
    low: 60,
    medium: 40,
    high: 20
  };
  const alertThreshold = thresholdMap[config.sensitivity] || 40;
  const autoActionThreshold = alertThreshold + 10;
  
  const shouldTakeAutoAction = detectionResult.riskScore >= autoActionThreshold;

  if (shouldTakeAutoAction && config.autoDelete) {
    try {
      await message.delete();
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
}

function buildSpamAlertEmbed(message, result, count) {
  let description = `**User:** ${message.author.tag} (<@${message.author.id}>)\n`;
  description += `**Channel:** <#${message.channelId}>\n`;
  
  if (count > 1) {
    description += `**Spam Count:** 🔁 ${count} messages detected\n`;
  }
  
  description += `**Detection Mode:** ${result.modeUsed === 'ai' ? '🤖 AI' : '📋 Default'}\n`;
  description += `**Risk Level:** ${getRiskLevelEmoji(result.riskLevel)} ${result.riskLevel}\n`;

  if (result.fallbackTriggered) {
    description += `⚠️ **Fallback Active:** ${result.fallbackReason}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(count > 1 ? '⚠️ Spam Attack Detected' : 'Potential Scam Detected')
    .setDescription(description)
    .setColor(getRiskLevelColor(result.riskLevel))
    .setTimestamp();

  if (result.reasons?.length > 0) {
    const reasonsText = result.reasons
      .slice(0, 3)
      .map(r => `• ${r}`)
      .join('\n');
    embed.addFields({
      name: 'Detection Reasons',
      value: reasonsText || 'No specific reasons',
      inline: false,
    });
  }

  if (result.modeUsed === 'ai' && result.aiClassification) {
    embed.addFields({
      name: 'AI Analysis',
      value:
        `**Classification:** ${result.aiClassification}\n` +
        `**Confidence:** ${result.aiConfidence}%\n` +
        `**Reason:** ${result.aiReason}`,
      inline: false,
    });
  }

  embed.addFields({
    name: 'Risk Score',
    value: `${result.riskScore}/100`,
    inline: true,
  });

  if (result.extractedLinks?.length > 0) {
    const linksText = result.extractedLinks
      .slice(0, 3)
      .join('\n');
    embed.addFields({
      name: 'Extracted Links',
      value: `\`\`\`${linksText}\`\`\`` || 'None',
      inline: false,
    });
  }

  if (result.extractedImages?.length > 0 || result.hasImages) {
    const imageCount = result.extractedImages?.length || 0;
    let imageText = `📷 ${imageCount} image(s) attached and analyzed by AI\n`;
    
    if (result.extractedImages && result.extractedImages.length > 0) {
      imageText += result.extractedImages
        .slice(0, 3)
        .map((img, i) => `${i + 1}. ${img.name} (${(img.size / 1024).toFixed(1)}KB)`)
        .join('\n');
    }
    
    embed.addFields({
      name: '🖼️ Images Detected',
      value: imageText,
      inline: false,
    });
  }

  const messageText = message.content 
    ? message.content.substring(0, 500)
    : '(no text content - image only)';

  embed.addFields({
    name: count > 1 ? 'First Message Content' : 'Message',
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

function buildSpamAlertButtons(firstMessage, messageCount, alertMessageId) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL(`https://discord.com/channels/${firstMessage.guildId}/${firstMessage.channelId}/${firstMessage.id}`)
      .setLabel('View Message')
      .setStyle(ButtonStyle.Link),

    new ButtonBuilder()
      .setCustomId(`scam_delete_${alertMessageId}`)
      .setLabel(messageCount > 1 ? `Delete All (${messageCount})` : 'Delete')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`scam_timeout_${firstMessage.author.id}_60`)
      .setLabel('Timeout 1h')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttons2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`scam_timeout_${firstMessage.author.id}_1440`)
      .setLabel('Timeout 24h')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`scam_dismiss_${firstMessage.id}`)
      .setLabel('Dismiss')
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

function getAlertMessageData(alertMessageId) {
  return alertMessageStorage.get(alertMessageId);
}

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
