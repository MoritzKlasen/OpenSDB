const { z } = require('zod');
const { logger } = require('./logger');

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(50, 'DISCORD_TOKEN must be provided'),
  CLIENT_ID: z.string().min(15, 'CLIENT_ID must be provided'),
  ALLOWED_GUILD_ID: z.string().min(15, 'ALLOWED_GUILD_ID must be provided'),

  DB_URI: z.string().startsWith('mongodb://', 'DB_URI must be a MongoDB connection string'),

  ADMIN_USERNAME: z.string().min(3, 'ADMIN_USERNAME must be at least 3 chars'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 chars'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 chars'),
  ADMIN_UI_PORT: z.string().min(1, 'ADMIN_UI_PORT must be provided'),

  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS must be provided'),
  NODE_ENV: z.enum(['development', 'production', 'test']),

  METRICS_BASIC_USER: z.string().min(1, 'METRICS_BASIC_USER must be provided'),
  METRICS_BASIC_PASS: z.string().min(8, 'METRICS_BASIC_PASS must be at least 8 chars'),

  DEBUG: z.string().optional(),
});

function validateEnvironment() {
  require('dotenv').config();

  const warnings = [];
  const errors = [];

  try {
    const result = envSchema.parse(process.env);
    
    if (process.env.NODE_ENV === 'production') {
      if (process.env.JWT_SECRET === 'anotherSuperSecret') {
        errors.push('JWT_SECRET is using default value - MUST CHANGE before production!');
      }
      if (process.env.INTERNAL_SECRET === 'botInternalSecret123') {
        errors.push('INTERNAL_SECRET is using default value - MUST CHANGE before production!');
      }
      if (process.env.ADMIN_PASSWORD === 'supersecret') {
        errors.push('ADMIN_PASSWORD is using default value - MUST CHANGE before production!');
      }
      if (process.env.CORS_ORIGINS === 'http://localhost:3000') {
        errors.push('CORS_ORIGINS is set to localhost - Should be production domain!');
      }
    }

    if (process.env.DEBUG === 'true' && process.env.NODE_ENV === 'production') {
      warnings.push('DEBUG mode is enabled in production - Should be disabled for security');
    }

    if (errors.length > 0) {
      logger.error('Environment validation failed', { errors });
      process.exit(1);
    }

    if (warnings.length > 0) {
      logger.warn('Environment validation warnings', { warnings });
    }

    logger.info('Environment validation passed');
    return result;
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      logger.error('Environment validation failed', { errors });
    } else {
      logger.error('Failed to validate environment', { error: err.message });
    }
    process.exit(1);
  }
}

module.exports = { validateEnvironment, envSchema };
