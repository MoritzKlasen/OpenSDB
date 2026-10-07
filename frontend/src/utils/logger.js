const isDevelopment = import.meta.env.DEV;
const DEBUG_MODE = isDevelopment && (localStorage.getItem('DEBUG') === 'true' || import.meta.env.VITE_DEBUG === 'true');

const logger = {
  error: (message, data = {}) => {
    if (isDevelopment) {
      console.error(`[OpenSDB Error] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  warn: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.warn(`[OpenSDB Warn] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  info: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.info(`[OpenSDB Info] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  debug: (message, data = {}) => {
    if (DEBUG_MODE) {
      console.debug(`[OpenSDB Debug] ${message}`, Object.keys(data).length > 0 ? data : '');
    }
  },

  setDebug: (enabled) => {
    if (enabled) {
      localStorage.setItem('DEBUG', 'true');
    } else {
      localStorage.removeItem('DEBUG');
    }
  },
};

export default logger;
