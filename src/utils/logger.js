const fs = require('fs');
const path = require('path');

const logsDir = '/tmp/logs';
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
} catch (err) {
  process.exit(1);
}

const LOG_FILE = path.join(logsDir, 'app.log');
const SECURITY_LOG_FILE = path.join(logsDir, 'security.log');
const ERROR_LOG_FILE = path.join(logsDir, 'error.log');

const LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  SECURITY: 'SECURITY',
};

function formatLogEntry(level, message, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(context).length > 0 && { context }),
  };
}

function writeLog(file, level, message, context = {}) {
  const entry = formatLogEntry(level, message, context);
  const logLine = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(file, logLine, 'utf8');
  } catch (err) {
  }
}

const logger = {
  error: (message, context) => {
    writeLog(ERROR_LOG_FILE, LEVELS.ERROR, message, context);
  },

  warn: (message, context) => {
    writeLog(LOG_FILE, LEVELS.WARN, message, context);
  },

  info: (message, context) => {
    writeLog(LOG_FILE, LEVELS.INFO, message, context);
  },

  debug: () => {},

  security: (event, context = {}) => {
    writeLog(SECURITY_LOG_FILE, LEVELS.SECURITY, `Security: ${event}`, context);
  },

  api: (method, path, statusCode, duration, context = {}) => {
    if (statusCode >= 400 || duration > 1000) {
      const level = statusCode >= 400 ? LEVELS.WARN : LEVELS.INFO;
      writeLog(LOG_FILE, level, `${method} ${path}`, {
        statusCode,
        duration: `${duration}ms`,
        ...context,
      });
    }
  },

  db: (operation, success, duration, context = {}) => {
    if (!success) {
      writeLog(LOG_FILE, LEVELS.WARN, `DB Error: ${operation}`, {
        duration: `${duration}ms`,
        ...context,
      });
    }
  },

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

function requestLogger(req, res, next) {
  const start = Date.now();

  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const duration = Date.now() - start;
    
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

  const originalSend = res.send.bind(res);
  res.send = function (data) {
    const duration = Date.now() - start;
    

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

function getRecentLogs(file, lines = 100) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').slice(-lines).filter(Boolean).map(l => JSON.parse(l));
  } catch (err) {
    return [];
  }
}

function getSecurityEvents(hours = 24) {
  const events = getRecentLogs(SECURITY_LOG_FILE, 1000);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return events.filter(e => new Date(e.timestamp).getTime() > cutoff);
}

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
