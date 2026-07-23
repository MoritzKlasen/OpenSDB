const DEFAULT_BASE_URL = process.env.INFORMATIONSSYSTEM_BASE_URL || 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = Number(process.env.INFORMATIONSSYSTEM_TIMEOUT_MS) || 150000;
const MAX_URL_LENGTH = 2048;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 600000;

function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;

  return trimmed.replace(/\/+$/, '');
}

function normalizeTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return null;
  if (timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) return null;
  return timeout;
}

function resolveEndpointConfig(settings) {
  const config = settings && settings.informationssystemConfig ? settings.informationssystemConfig : {};
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  return {
    enabled: config.enabled === true,
    baseUrl: baseUrl || DEFAULT_BASE_URL,
    timeout: normalizeTimeout(config.timeout) || DEFAULT_TIMEOUT_MS,
    isCustom: baseUrl != null
  };
}

module.exports = {
  normalizeBaseUrl,
  normalizeTimeout,
  resolveEndpointConfig,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  MAX_URL_LENGTH,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS
};
