/**
 * Frontend Logger Utility
 * Only logs important events and errors. Respects DEBUG environment variable.
 */

// Determine if debug mode is enabled
const isDevelopment = import.meta.env.DEV;
const DEBUG_MODE = isDevelopment && (localStorage.getItem('DEBUG') === 'true' || import.meta.env.VITE_DEBUG === 'true');

const logger = {
  /**
   * Log errors - always shown
   */
  error: (message, data = {}) => {
    if (isDevelopment) {
      console.error(`[OpenSDB Error] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  /**
   * Log warnings - only in debug mode
   */
  warn: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.warn(`[OpenSDB Warn] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  /**
   * Log info - only in debug mode
   */
  info: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.info(`[OpenSDB Info] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  /**
   * Log debug - only in debug mode
   */
  debug: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.debug(`[OpenSDB Debug] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  /**
   * Set debug mode
   */
  setDebug: (enabled) => {
    if (enabled) {
      localStorage.setItem('DEBUG', 'true');
    } else {
      localStorage.removeItem('DEBUG');
    }
  },
};

export default logger;
