const fs = require('fs');
const path = require('path');

// Create logs directory in /tmp (the only writable location in read-only container)
const logsDir = '/tmp/logs';
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
} catch (err) {
  // Failed to create logs directory
  process.exit(1);
}

const LOG_FILE = path.join(logsDir, 'app.log');
const SECURITY_LOG_FILE = path.join(logsDir, 'security.log');
const ERROR_LOG_FILE = path.join(logsDir, 'error.log');

// Log levels
const LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  SECURITY: 'SECURITY',
};

/**
 * Format log entry as structured JSON
 */
function formatLogEntry(level, message, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(context).length > 0 && { context }),
  };
}

/**
 * Write log entry to file
 */
function writeLog(file, level, message, context = {}) {
  const entry = formatLogEntry(level, message, context);
  const logLine = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(file, logLine, 'utf8');
  } catch (err) {
    // Silent fail for log write errors to prevent infinite loops
  }
}

/**
 * Logger instance - Only logs important events
 */
const logger = {
  /**
   * Log errors (always logged)
   */
  error: (message, context) => {
    writeLog(ERROR_LOG_FILE, LEVELS.ERROR, message, context);
  },

  /**
   * Log warnings (important issues that don't prevent operation)
   */
  warn: (message, context) => {
    writeLog(LOG_FILE, LEVELS.WARN, message, context);
  },

  /**
   * Log info (important state changes and events)
   */
  info: (message, context) => {
    writeLog(LOG_FILE, LEVELS.INFO, message, context);
  },

  /**
   * Debug log (removed - use info() for important events)
   */
  debug: () => {
    // Debug logging removed in production logger
  },

  /**
   * Security events (authentication, authorization, security-related actions)
   */
  security: (event, context = {}) => {
    writeLog(SECURITY_LOG_FILE, LEVELS.SECURITY, `Security: ${event}`, context);
  },

  /**
   * API request/response logging (only errors and slow requests)
   */
  api: (method, path, statusCode, duration, context = {}) => {
    // Only log if error or slow (> 1000ms)
    if (statusCode >= 400 || duration > 1000) {
      const level = statusCode >= 400 ? LEVELS.WARN : LEVELS.INFO;
      writeLog(LOG_FILE, level, `${method} ${path}`, {
        statusCode,
        duration: `${duration}ms`,
        ...context,
      });
    }
  },

  /**
   * Database operations (only errors)
   */
  db: (operation, success, duration, context = {}) => {
    if (!success) {
      writeLog(LOG_FILE, LEVELS.WARN, `DB Error: ${operation}`, {
        duration: `${duration}ms`,
        ...context,
      });
    }
  },

  /**
   * WebSocket events (connections, disconnections, critical errors)
   */
  ws: (event, context = {}) => {
    if (event === 'connected') {
      writeLog(LOG_FILE, LEVELS.INFO, 'WebSocket: Client connected', context);
    } else if (event === 'disconnected') {
      writeLog(LOG_FILE, LEVELS.INFO, 'WebSocket: Client disconnected', context);
    } else if (event === 'error' || event === 'auth-failed') {
      writeLog(LOG_FILE, LEVELS.WARN, `WebSocket: ${event}`, context);
    }
  },
};

/**
 * Middleware for logging HTTP requests (errors and slow requests only)
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Override res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - start;
    
    // Only log if error or slow request
    if (res.statusCode >= 400 || duration > 1000) {
      const context = {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id || 'anonymous',
      };
      
      const level = res.statusCode >= 400 ? LEVELS.WARN : LEVELS.INFO;
      writeLog(LOG_FILE, level, `${req.method} ${req.path}`, context);
    }

    return originalJson(data);
  };

  // Override res.send for non-JSON responses
  const originalSend = res.send.bind(res);
  res.send = function (data) {
    const duration = Date.now() - start;
    
    // Only log if error or slow request
    if (res.statusCode >= 400 || duration > 1000) {
      const context = {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id || 'anonymous',
      };
      
      const level = res.statusCode >= 400 ? LEVELS.WARN : LEVELS.INFO;
      writeLog(LOG_FILE, level, `${req.method} ${req.path}`, context);
    }

    return originalSend(data);
  };

  next();
}

/**
 * Get recent logs
 */
function getRecentLogs(file, lines = 100) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').slice(-lines).filter(Boolean).map(l => JSON.parse(l));
  } catch (err) {
    return [];
  }
}

/**
 * Get security events
 */
function getSecurityEvents(hours = 24) {
  const events = getRecentLogs(SECURITY_LOG_FILE, 1000);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return events.filter(e => new Date(e.timestamp).getTime() > cutoff);
}

/**
 * Get error logs
 */
function getErrorLogs(hours = 24) {
  const errors = getRecentLogs(ERROR_LOG_FILE, 1000);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return errors.filter(e => new Date(e.timestamp).getTime() > cutoff);
}

module.exports = {
  logger,
  requestLogger,
  getRecentLogs,
  getSecurityEvents,
  getErrorLogs,
  LEVELS,
};
