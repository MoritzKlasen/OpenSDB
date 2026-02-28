const { z } = require('zod');

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(50, 'DISCORD_TOKEN must be provided'),
  CLIENT_ID: z.string().min(15, 'CLIENT_ID must be provided'),
  ALLOWED_GUILD_ID: z.string().min(15, 'ALLOWED_GUILD_ID must be provided'),

  // Database
  DB_URI: z.string().startsWith('mongodb://', 'DB_URI must be a MongoDB connection string'),

  // Admin Web UI
  ADMIN_USERNAME: z.string().min(3, 'ADMIN_USERNAME must be at least 3 chars'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 chars'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 chars'),
  ADMIN_UI_PORT: z.string().default('8001'),

  // Security
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Metrics
  METRICS_BASIC_USER: z.string().default('grafana'),
  METRICS_BASIC_PASS: z.string().min(8, 'METRICS_BASIC_PASS must be at least 8 chars'),

  // Optional
  DEBUG: z.string().default('false'),
});

/**
 * Validate and load environment variables
 */
function validateEnvironment() {
  // Load from .env if it exists
  require('dotenv').config();

  const warnings = [];
  const errors = [];

  // Try to parse
  try {
    const result = envSchema.parse(process.env);
    
    // Additional checks
    if (process.env.NODE_ENV === 'production') {
      // Check for weak secrets
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

    // Check for development in production
    if (process.env.DEBUG === 'true' && process.env.NODE_ENV === 'production') {
      warnings.push('DEBUG mode is enabled in production - Should be disabled for security');
    }

    // Print results
    if (errors.length > 0) {
      console.error('\nENVIRONMENT VALIDATION FAILED:\n');
      errors.forEach(err => console.error(err));
      console.error('\n');
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.warn('\nENVIRONMENT WARNINGS:\n');
      warnings.forEach(warn => console.warn(warn));
      console.warn('\n');
    }

    console.log('Environment validation passed\n');
    return result;
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('\nENVIRONMENT VALIDATION FAILED:\n');
      err.errors.forEach(e => {
        console.error(`${e.path.join('.')}: ${e.message}`);
      });
      console.error('\n');
    } else {
      console.error('Failed to validate environment:', err.message);
    }
    process.exit(1);
  }
}

module.exports = { validateEnvironment, envSchema };
