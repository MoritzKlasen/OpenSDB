const DefaultDetectionEngine = require('./defaultDetectionEngine');
const { logger } = require('../logger');

/**
 * AI Detection Engine - Supports multiple providers with fallback
 * Providers supported: OpenAI, Ollama, OpenRouter, Anthropic, custom endpoints
 * API keys are stored in database configuration, not environment variables
 * 
 * Hybrid Registry Pattern:
 * - Built-in providers are automatically registered
 * - Custom providers can be registered via registerProvider()
 * - Supports multi-model routing (text vs vision models)
 */
class AIDetectionEngine {
  constructor() {
    this.defaultEngine = new DefaultDetectionEngine();
    this.healthCheckCache = new Map();
    this.providers = new Map();
    this._registerDefaultProviders();
  }

  _registerDefaultProviders() {
    this.providers.set('openai', this.callOpenAI.bind(this));
    this.providers.set('ollama', this.callOllama.bind(this));
    this.providers.set('openrouter', this.callOpenRouter.bind(this));
    this.providers.set('anthropic', this.callAnthropic.bind(this));
    this.providers.set('claude', this.callAnthropic.bind(this));
    
    logger.debug('Registered default AI providers', {
      providers: Array.from(this.providers.keys()),
    });
  }

  registerProvider(name, callFunction) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }
    
    if (typeof callFunction !== 'function') {
      throw new Error('Provider call function must be a function');
    }
    
    const providerName = name.toLowerCase();
    this.providers.set(providerName, callFunction);
    
    logger.info('Registered custom AI provider', {
      provider: providerName,
    });
  }

  validateConfig(config) {
    const errors = [];

    if (!config.provider) {
      errors.push('AI provider not specified');
    }

    if (!config.model) {
      errors.push('AI model not specified');
    }

    if (!config.baseUrl) {
      errors.push('AI base URL is required - no default URLs configured');
    }

    const provider = config.provider ? config.provider.toLowerCase() : '';
    const requiresApiKey = !['ollama'].includes(provider);

    if (requiresApiKey && !config.apiKey) {
      errors.push('API key is required for this provider');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  buildPrompt(message, extractedLinks, extractedDomains, userMetadata, images = []) {
    const metadata = userMetadata
      ? `\nUser Account Age: ${userMetadata.accountAgeDays} days\nMessage History: ${userMetadata.messageCount} messages\n`
      : '';

    const imageInfo = images.length > 0
      ? `\nIMAGES ATTACHED: ${images.length} image(s)\n${images.map((img, i) => `Image ${i + 1}: ${img.name} (${(img.size / 1024).toFixed(1)}KB)`).join('\n')}\n`
      : '';

    return `You are a scam detection AI assistant trained to identify phishing, scam, and spam messages in Discord servers.

Analyze the following Discord message and determine if it contains scam/spam/phishing content.

MESSAGE TEXT:
${message || '(no text, images only)'}

EXTRACTED LINKS:
${extractedLinks.length > 0 ? extractedLinks.join('\n') : 'None'}

EXTRACTED DOMAINS:
${extractedDomains.length > 0 ? extractedDomains.join('\n') : 'None'}
${imageInfo}
USER METADATA:${metadata}

${images.length > 0 ? 'IMPORTANT: Analyze the attached image(s) carefully for:\n- QR codes linking to phishing sites\n- Fake Discord Nitro/gift promotions\n- Cryptocurrency scam screenshots\n- Fake verification requests\n- Impersonation of official services\n\n' : ''}Respond in JSON format with exactly these fields:
{
  "classification": "likely scam" | "suspicious" | "likely safe",
  "confidence": <number 0-100>,
  "reason": "<short explanation>",
  "suggestedAction": "delete" | "timeout" | "flag" | "none"
}

Keep the reason under 100 characters. Be accurate and balanced - only flag content with clear scam indicators. Regular images should be classified as "likely safe".`;
  }

  parseAIResponse(responseText) {
    try {

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (
        !parsed.classification ||
        typeof parsed.confidence !== 'number' ||
        !parsed.reason
      ) {
        throw new Error('Missing required fields in AI response');
      }

      return {
        valid: true,
        data: {
          classification: parsed.classification.toLowerCase(),
          confidence: Math.min(100, Math.max(0, parsed.confidence)),
          reason: parsed.reason.substring(0, 100),
          suggestedAction: parsed.suggestedAction || 'flag',
        },
      };
    } catch (error) {
      logger.error('Failed to parse AI response', {
        error: error.message,
        response: responseText.substring(0, 200),
      });
      return {
        valid: false,
        error: `Failed to parse AI response: ${error.message}`,
      };
    }
  }

  async makeAPIRequest(url, options, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('API request failed', {
          url,
          status: response.status,
          error: errorText.substring(0, 500),
        });
        throw new Error(`API returned status ${response.status}: ${errorText.substring(0, 200)}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  async callOpenAI(config, prompt) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!config.baseUrl) {
      throw new Error('OpenAI base URL not configured');
    }

    const response = await this.makeAPIRequest(
      `${config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      },
      config.timeout || 15000
    );

    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Unexpected OpenAI response format');
    }

    return response.choices[0].message.content;
  }

  async callOllama(config, prompt, images = []) {
    if (!config.baseUrl) {
      throw new Error('Ollama base URL not configured');
    }

    try {
      const requestBody = {
        model: config.model,
        prompt: prompt,
        stream: false,
      };

      if (images && images.length > 0) {
        const base64Images = await Promise.all(
          images.map(async (img) => {
            try {
              const response = await fetch(img.url);
              if (!response.ok) {
                logger.warn('Failed to fetch image for AI analysis', { url: img.url, status: response.status });
                return null;
              }
              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              return base64;
            } catch (error) {
              logger.warn('Error fetching image for AI analysis', { url: img.url, error: error.message });
              return null;
            }
          })
        );

        requestBody.images = base64Images.filter(img => img !== null);
        
        if (requestBody.images.length === 0) {
          logger.warn('No images could be downloaded for AI analysis');
        }
      }

      const response = await this.makeAPIRequest(
        `${config.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        config.timeout
      );

      if (!response.response) {
        logger.error('Unexpected Ollama response format', {
          response: JSON.stringify(response).substring(0, 500),
        });
        throw new Error('Unexpected Ollama response format - no response field');
      }

      return response.response;
    } catch (error) {
      logger.error('Ollama API call failed', {
        baseUrl: config.baseUrl,
        model: config.model,
        timeout: config.timeout,
        hasImages: images && images.length > 0,
        imageCount: images ? images.length : 0,
        error: error.message,
      });
      throw error;
    }
  }

  async callOpenRouter(config, prompt) {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    if (!config.baseUrl) {
      throw new Error('OpenRouter base URL not configured');
    }

    const response = await this.makeAPIRequest(
      `${config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://opensource-scam-detection.local',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      },
      config.timeout || 15000
    );

    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Unexpected OpenRouter response format');
    }

    return response.choices[0].message.content;
  }

  async callAnthropic(config, prompt) {
    if (!config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    if (!config.baseUrl) {
      throw new Error('Anthropic base URL not configured');
    }

    const response = await this.makeAPIRequest(
      `${config.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      config.timeout
    );

    if (!response.content || !response.content[0]) {
      throw new Error('Unexpected Anthropic response format');
    }

    return response.content[0].text;
  }

  async callGenericProvider(config, prompt) {
    const response = await this.makeAPIRequest(
      `${config.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 200,
        }),
      },
      config.timeout || 15000
    );

    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Unexpected provider response format');
    }

    return response.choices[0].message.content;
  }

  async callAIProvider(config, prompt, retries = 1, images = []) {
    const provider = config.provider.toLowerCase();
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const providerFunc = this.providers.get(provider);
        
        if (providerFunc) {
          return await providerFunc(config, prompt, images);
        } else {
          logger.warn('Provider not registered, using generic provider', {
            provider,
            registeredProviders: Array.from(this.providers.keys()),
          });
          return await this.callGenericProvider(config, prompt);
        }
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          logger.warn(`AI provider attempt ${attempt + 1} failed, retrying...`, {
            provider,
            error: error.message,
            attempt: attempt + 1,
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  async performHealthCheck(config) {
    try {
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return {
          healthy: false,
          reason: validation.errors[0],
        };
      }

      const testPrompt = 'Respond with exactly {"status": "ok"}';
      await this.callAIProvider(config, testPrompt);

      return {
        healthy: true,
        reason: null,
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
      };
    }
  }

  async detectScam(
    guildId,
    userId,
    author,
    message,
    aiConfig,
    defaultConfig = {}
  ) {
    const images = this.defaultEngine.extractImages(message);
    const hasImages = images.length > 0;
    
    let selectedConfig = aiConfig;
    let modelType = 'default';
    
    if (hasImages && aiConfig.visionModel) {
      selectedConfig = aiConfig.visionModel;
      modelType = 'vision';
      logger.debug('Auto-selected vision model for image analysis', {
        guildId,
        provider: selectedConfig.provider,
        model: selectedConfig.model,
        imageCount: images.length,
      });
    } else if (!hasImages && aiConfig.textModel) {
      selectedConfig = aiConfig.textModel;
      modelType = 'text';
      logger.debug('Auto-selected text model for text-only analysis', {
        guildId,
        provider: selectedConfig.provider,
        model: selectedConfig.model,
      });
    }
    
    const validation = this.validateConfig(selectedConfig);
    if (!validation.valid) {
      logger.warn('AI config validation failed, using default detection', {
        guildId,
        userId,
        modelType,
        errors: validation.errors,
      });

      return {
        modeUsed: 'default',
        fallbackTriggered: true,
        fallbackReason: validation.errors[0],
        ...(await this.defaultEngine.detectScam(
          guildId,
          userId,
          author,
          message,
          defaultConfig
        )),
      };
    }

    try {
      const links = this.defaultEngine.extractLinks(message.content);
      const domains = links
        .map(link => this.defaultEngine.extractDomain(link))
        .filter(Boolean);

      const userMetadata = {
        accountAgeDays: Math.floor(
          (Date.now() - author.createdTimestamp) / (1000 * 60 * 60 * 24)
        ),
      };

      const prompt = this.buildPrompt(
        message.content,
        links,
        domains,
        userMetadata,
        images
      );

      logger.info('Calling AI provider for detection', {
        guildId,
        provider: selectedConfig.provider,
        model: selectedConfig.model,
        modelType,
        hasImages: images.length > 0,
        imageCount: images.length,
      });

      const aiResponse = await this.callAIProvider(selectedConfig, prompt, 0, images);
      
      const parseResult = this.parseAIResponse(aiResponse);
      if (!parseResult.valid) {
        logger.warn('AI response parsing failed, using default detection', {
          guildId,
          userId,
          error: parseResult.error,
          rawResponse: aiResponse.substring(0, 500),
        });

        return {
          modeUsed: 'default',
          fallbackTriggered: true,
          fallbackReason: parseResult.error,
          ...(await this.defaultEngine.detectScam(
            guildId,
            userId,
            author,
            message,
            defaultConfig
          )),
        };
      }

      const aiData = parseResult.data;
      const riskScore = this.classificationToRiskScore(aiData.classification, aiData.confidence);
      const riskLevel = this.calculateRiskLevel(riskScore);

      return {
        modeUsed: 'ai',
        fallbackTriggered: false,
        isScam: riskScore >= 60,
        riskScore,
        riskLevel,
        reasons: [aiData.reason],
        aiProvider: selectedConfig.provider,
        aiModel: selectedConfig.model,
        aiModelType: modelType, 
        aiClassification: aiData.classification,
        aiConfidence: aiData.confidence,
        aiReason: aiData.reason,
        extractedLinks: links,
        extractedDomains: domains,
        extractedImages: images.map(img => ({ name: img.name, size: img.size })),
        hasImages: images.length > 0,
      };
    } catch (error) {
      logger.warn('AI detection failed, falling back to default detection', {
        guildId,
        userId,
        error: error.message,
      });

      return {
        modeUsed: 'default',
        fallbackTriggered: true,
        fallbackReason: error.message,
        ...(await this.defaultEngine.detectScam(
          guildId,
          userId,
          author,
          message,
          defaultConfig
        )),
      };
    }
  }

  classificationToRiskScore(classification, confidence) {
    const classLower = classification.toLowerCase();

    if (classLower.includes('scam')) {
      return Math.min(100, 40 + (confidence / 100) * 35);
    } else if (classLower.includes('suspicious')) {
      return Math.min(100, 30 + (confidence / 100) * 25);
    } else {
      return Math.max(0, 10 - (confidence / 100) * 10);
    }
  }

  calculateRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }
}

module.exports = AIDetectionEngine;
