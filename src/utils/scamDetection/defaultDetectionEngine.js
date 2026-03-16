const crypto = require('crypto');
const UserActivity = require('../../database/models/UserActivity');
const { getCombinedKeywords } = require('./scamKeywords');

/**
 * Default Detection Engine - Rule-based scam detection
 * Detects scams through heuristics, patterns, and behavioral anomalies
 * Supports multilingual keyword detection
 */
class DefaultDetectionEngine {
  constructor() {
    this.suspiciousDomains = [
      'casenwin', 'nitro-free', 'discord-free', 'claim-', 'bonus', 'reward',
      'casino', 'crypto', 'bitcoin', 'ethereum', 'nft', 'token',
      'shortlink', 'free-nitro', 'free-crypto',
      'work', 'click', 'download', 'online', 'cloud', 'stream',
    ];

    this.urlShorteners = [
      'bit.ly', 'tinyurl.com', 'short.link', 'ow.ly', 'goo.gl',
      'is.gd', 'buff.ly', 'adf.ly', 'sp.com', 'lnk.co',
    ];

    this.punycodePattern = /xn--/i;
  }

  extractLinks(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }
    const urlPattern = /(https?:\/\/[^\s]+)/gi;
    const matches = content.match(urlPattern) || [];
    return matches;
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  isSuspiciousDomain(domain) {
    if (!domain) return false;

    if (this.punycodePattern.test(domain)) {
      return { suspicious: true, reason: 'Punycode obfuscation detected' };
    }

    if (this.urlShorteners.some(shortener => domain.includes(shortener))) {
      return { suspicious: true, reason: 'URL shortener detected' };
    }

    for (const suspiciousPattern of this.suspiciousDomains) {
      if (domain.toLowerCase().includes(suspiciousPattern.toLowerCase())) {
        return { suspicious: true, reason: `Suspicious pattern: ${suspiciousPattern}` };
      }
    }

    const parts = domain.split('.');
    if (parts.length > 3) {
      return { suspicious: true, reason: 'Unusual subdomain structure' };
    }

    return { suspicious: false };
  }

  detectSuspiciousPatterns(content, keywords = {}) {
    if (!content || typeof content !== 'string') {
      return [];
    }
    
    const reasons = [];
    const contentLower = content.toLowerCase();
    const keywordData = keywords || {};
    const highRiskKeywords = keywordData.high || [];
    const mediumRiskKeywords = keywordData.medium || [];
    const singleWordKeywords = keywordData.singleWord || [];

    for (const keyword of highRiskKeywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        reasons.push(`Contains high-risk phrase: "${keyword}"`);
      }
    }

    for (const keyword of mediumRiskKeywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        reasons.push(`Contains medium-risk phrase: "${keyword}"`);
      }
    }
    
    for (const keyword of singleWordKeywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        reasons.push(`Contains keyword: "${keyword}"`);
      }
    }

    const capsWords = (content.match(/\b[A-Z]{3,}\b/g) || []).length;
    if (capsWords >= 2) {
      reasons.push('Excessive capitalization detected');
    }

    const specialChars = (content.match(/[!@#$%^&*()_+=\[\]{};:'",.<>?/\\|`~-]/g) || []).length;
    if (specialChars > content.length * 0.08) {
      reasons.push('Excessive special characters');
    }

    return reasons;
  }

  hashContent(content) {
    return crypto
      .createHash('md5')
      .update(content.toLowerCase().trim())
      .digest('hex');
  }

  extractImages(message) {
    if (!message?.attachments) {
      return [];
    }

    const images = [];
    message.attachments.forEach(attachment => {
      const isImage = 
        attachment.contentType?.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(attachment.name || '');
      
      if (isImage) {
        images.push({
          url: attachment.url,
          proxyUrl: attachment.proxyURL,
          name: attachment.name,
          size: attachment.size,
          contentType: attachment.contentType,
        });
      }
    });

    return images;
  }

  hashImage(image) {
    const hashInput = `${image.name}_${image.size}`;
    return crypto
      .createHash('md5')
      .update(hashInput)
      .digest('hex');
  }

  hashMessageContent(message) {
    const images = this.extractImages(message);
    
    if (images.length === 0) {
      return this.hashContent(message.content || '');
    }
    
    const textHash = this.hashContent(message.content || '');
    const imageHashes = images.map(img => this.hashImage(img)).sort().join('_');
    
    return crypto
      .createHash('md5')
      .update(`${textHash}_${imageHashes}`)
      .digest('hex');
  }

  normalizeContent(content) {
    if (!content || typeof content !== 'string') {
      return '';
    }
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = this.normalizeContent(str1);
    const s2 = this.normalizeContent(str2);

    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const editDistance = this.getEditDistance(shorter, longer);
    return (longer.length - editDistance) / longer.length;
  }

  getEditDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  async checkDuplicateMessages(
    guildId,
    userId,
    messageContent,
    timeWindowMinutes = 2,
    duplicateThreshold = 3
  ) {
    try {
      const userActivity = await UserActivity.findOne({ guildId, userId });
      
      if (!userActivity || !userActivity.recentMessages) {
        return { isDuplicate: false, channels: 0 };
      }

      const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
      const recentMessages = userActivity.recentMessages.filter(
        msg => new Date(msg.timestamp) > cutoffTime
      );

      if (recentMessages.length === 0) {
        return { isDuplicate: false, channels: 0 };
      }

      const similarMessages = recentMessages.filter(msg => {
        if (!msg || !msg.content) return false;
        const similarity = this.calculateSimilarity(messageContent, msg.content);
        return similarity > 0.8;
      });

      const uniqueChannels = new Set(similarMessages.map(m => m.channelId)).size;

      return {
        isDuplicate: uniqueChannels >= duplicateThreshold,
        channels: uniqueChannels,
        similarCount: similarMessages.length,
      };
    } catch (error) {
      return { isDuplicate: false, channels: 0 };
    }
  }

  async checkBehavioralAnomalies(guildId, userId, author, message) {
    const reasons = [];
    const scores = [];

    try {
      const userActivity = await UserActivity.findOne({ guildId, userId });

      const accountAgeMs = Date.now() - author.createdTimestamp;
      const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

      if (accountAgeDays < 7) {
        reasons.push(`New account (${Math.floor(accountAgeDays)} days old)`);
        scores.push(20);
      }

      if (!userActivity || userActivity.messageCount === 0) {
        if (message.attachments.size > 0 || this.extractLinks(message.content).length > 0) {
          reasons.push('First message contains links/attachments');
          scores.push(15);
        }
      }

      if (userActivity && userActivity.messageCount > 5) {
        const recentMessages = userActivity.recentMessages || [];
        const last5MinMessages = recentMessages.filter(
          msg => new Date(msg.timestamp) > new Date(Date.now() - 5 * 60 * 1000)
        ).length;

        if (last5MinMessages >= 3) {
          reasons.push('Unusual posting spike detected');
          scores.push(15);
        }
      }

      if (userActivity && userActivity.channelsPostIn) {
        const last24hMessages = userActivity.recentMessages.filter(
          msg => new Date(msg.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        );

        if (last24hMessages.length >= 5) {
          const uniqueChannels = new Set(last24hMessages.map(m => m.channelId)).size;
          if (uniqueChannels >= 4) {
            reasons.push(`Cross-channel spam (${uniqueChannels} channels in 24h)`);
            scores.push(20);
          }
        }
      }

      return {
        anomaliesDetected: reasons.length > 0,
        reasons,
        anomalyScore: scores.length > 0 ? Math.min(...scores) : 0,
      };
    } catch (error) {
      return { anomaliesDetected: false, reasons: [], anomalyScore: 0 };
    }
  }

  quickSuspiciousCheck(messageContent, messageObj = null) {
    let hasImages = false;
    let hasSuspiciousImageContext = false;
    
    if (messageObj) {
      const images = this.extractImages(messageObj);
      hasImages = images.length > 0;
      
      if (hasImages && messageContent) {
        const contentLower = messageContent.toLowerCase();
        const imageScamPhrases = [
          'scan', 'qr', 'verify', 'claim', 'free nitro', 'giveaway',
          'click here', 'limited', 'prize', 'winner', 'congratulations'
        ];
        
        for (const phrase of imageScamPhrases) {
          if (contentLower.includes(phrase)) {
            hasSuspiciousImageContext = true;
            break;
          }
        }
      }
    }
    
    if (!messageContent || typeof messageContent !== 'string') {
      return hasImages;
    }

    const contentLower = messageContent.toLowerCase();
    
    const highRiskPhrases = [
      'free nitro', 'claim now', 'limited offer', 'free crypto', 'free money',
      'click here', 'click this', 'urgent', 'act now', 'verify your', 'suspended',
      'claim your', 'won', 'prize', 'giveaway', 'token', 'airdrop',
      'get paid', 'earn money', 'make money fast'
    ];
    
    for (const phrase of highRiskPhrases) {
      if (contentLower.includes(phrase)) {
        return true;
      }
    }
    
    const hasLinks = /https?:\/\//.test(messageContent);
    const hasPlainDomains = /\w+\.(com|org|net|io|gg|xyz|tk|ml|ga|cf|gq|link|click|download|work|online)/i.test(messageContent);
    
    if (hasLinks || hasPlainDomains) {
      for (const domain of this.suspiciousDomains) {
        if (contentLower.includes(domain)) {
          return true;
        }
      }
      
      for (const shortener of this.urlShorteners) {
        if (contentLower.includes(shortener)) {
          return true;
        }
      }
    }
    
    const capsWords = (messageContent.match(/\b[A-Z]{3,}\b/g) || []).length;
    if (capsWords >= 2 && (hasLinks || hasPlainDomains)) {
      return true;
    }
    
    if (hasSuspiciousImageContext) {
      return true;
    }
    
    return false;
  }

  async detectScam(guildId, userId, author, message, config = {}) {
    const {
      sensitivity = 'medium',
      serverLanguage = 'en',  // Add language support
      trustedDomains = [],
      duplicateThreshold = 3,
      duplicateTimeWindow = 2,
      firstMessageSuspicion = true,
      spamCount = 0,  // Number of identical messages from staging (same or cross-channel)
    } = config;

    const keywords = getCombinedKeywords(serverLanguage);

    const detectionResults = {
      isScam: false,
      riskScore: 0,
      riskLevel: 'LOW',
      reasons: [],
      extractedLinks: [],
      extractedDomains: [],
      spamScore: 0,        // PRIMARY: Cross-channel spam indicator
      linkScore: 0,        // SECONDARY: Suspicious links
      patternScore: 0,     // SECONDARY: Keywords
      anomalyScore: 0,
    };

    const links = this.extractLinks(message.content);
    detectionResults.extractedLinks = links;

    if (links.length > 0) {
      for (const link of links) {
        const domain = this.extractDomain(link);
        if (domain && !detectionResults.extractedDomains.includes(domain)) {
          detectionResults.extractedDomains.push(domain);
        }

        if (domain && !trustedDomains.includes(domain)) {
          const suspicious = this.isSuspiciousDomain(domain);
          if (suspicious.suspicious) {
            detectionResults.reasons.push(`${link}: ${suspicious.reason}`);
            detectionResults.linkScore += sensitivity === 'high' ? 25 : 15;
          }
        }
      }
    }

    const patterns = this.detectSuspiciousPatterns(message.content, keywords);
    if (patterns.length > 0) {
      detectionResults.reasons.push(...patterns);
      const pointsPerKeyword = sensitivity === 'high' ? 15 : 10;
      const maxPatternScore = sensitivity === 'high' ? 60 : 40;
      let basePatternScore = Math.min(maxPatternScore, patterns.length * pointsPerKeyword);
      detectionResults.patternScore = basePatternScore;
    }

    const duplicates = await this.checkDuplicateMessages(
      guildId,
      userId,
      message.content,
      duplicateTimeWindow,
      duplicateThreshold
    );

    if (duplicates.isDuplicate) {
      detectionResults.reasons.push(
        `Spam detected: Similar message posted in ${duplicates.channels} channels`
      );
      detectionResults.spamScore = Math.min(75, duplicates.channels * 25);
    } else if (spamCount && spamCount >= duplicateThreshold) {
      detectionResults.reasons.push(
        `Repetitive message detected: Posted ${spamCount} identical times`
      );
      detectionResults.spamScore = Math.min(40, 25 + (spamCount - duplicateThreshold) * 5);
    } else {
      detectionResults.spamScore = 0;
    }

    const anomalies = await this.checkBehavioralAnomalies(guildId, userId, author, message);
    
    if (anomalies.anomaliesDetected) {
      detectionResults.reasons.push(...anomalies.reasons);
      detectionResults.anomalyScore = anomalies.anomalyScore;
    }

    let riskScore = 0;
    
    const highRiskPatternCount = detectionResults.reasons.filter(r => 
      r.includes('high-risk phrase')
    ).length;
    const hasHighRiskPhrase = highRiskPatternCount >= 1;
    const hasMultipleHighRisk = highRiskPatternCount >= 2;
    const hasSuspiciousLink = detectionResults.linkScore > 0;
    
    if (detectionResults.spamScore > 0) {
      if (hasMultipleHighRisk && hasSuspiciousLink) {
        riskScore = detectionResults.spamScore +
                    (detectionResults.patternScore * 0.85) +
                    (detectionResults.linkScore * 0.7) +
                    (detectionResults.anomalyScore * 0.3);
      } else {
        riskScore = detectionResults.spamScore + 
                    (detectionResults.patternScore * 0.7) +
                    (detectionResults.linkScore * 0.5) +
                    (detectionResults.anomalyScore * 0.3);
      }
    } else if (hasHighRiskPhrase && hasSuspiciousLink) {
      if (hasMultipleHighRisk) {
        riskScore = detectionResults.patternScore * 0.9 +
                    detectionResults.linkScore * 0.75 +
                    detectionResults.anomalyScore;
      } else {
        riskScore = detectionResults.patternScore * 0.8 +
                    detectionResults.linkScore * 0.65 +
                    detectionResults.anomalyScore;
      }
    } else if (sensitivity === 'high' && detectionResults.patternScore > 0) {
      riskScore = detectionResults.patternScore + 
                  (detectionResults.linkScore * 0.4) +
                  detectionResults.anomalyScore;
    } else {
      riskScore = detectionResults.linkScore + 
                  detectionResults.anomalyScore;
    }

    riskScore = Math.min(100, riskScore);
    detectionResults.riskScore = riskScore;

    if (detectionResults.riskScore >= 80) {
      detectionResults.riskLevel = 'CRITICAL';
      detectionResults.isScam = true;
    } else if (detectionResults.riskScore >= 60) {
      detectionResults.riskLevel = 'HIGH';
      detectionResults.isScam = true;
    } else if (detectionResults.riskScore >= 40) {
      detectionResults.riskLevel = 'MEDIUM';
    } else {
      detectionResults.riskLevel = 'LOW';
    }

    return detectionResults;
  }
}

module.exports = DefaultDetectionEngine;
