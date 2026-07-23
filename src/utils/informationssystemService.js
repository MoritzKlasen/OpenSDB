const { normalizeBaseUrl, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } = require('./informationssystemConfig');

function createQueryError(code, message, cause) {
  const err = new Error(message, cause !== undefined ? { cause } : undefined);
  err.code = code;
  return err;
}

function describeErrorDetail(errorBody, status) {
  const detail = errorBody?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => item?.msg).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return `HTTP ${status}`;
}

async function queryInformationssystem(question, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl) || DEFAULT_BASE_URL;
  const timeoutMs = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}/api/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw createQueryError('IS_TIMEOUT', `Informationssystem request timed out after ${timeoutMs}ms`, err);
    }
    throw createQueryError('IS_UNREACHABLE', `Informationssystem server unreachable at ${baseUrl}`, err);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = describeErrorDetail(errorBody, response.status);

    if (response.status === 503) {
      throw createQueryError('IS_SERVICE_UNAVAILABLE', `Informationssystem backend dependency unavailable: ${detail}`);
    }
    if (response.status === 422) {
      throw createQueryError('IS_VALIDATION_ERROR', `Informationssystem rejected the question: ${detail}`);
    }
    throw createQueryError('IS_HTTP_ERROR', `Informationssystem returned an error: ${detail}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw createQueryError('IS_INVALID_JSON', 'Informationssystem returned a non-JSON response', err);
  }

  if (typeof data?.refused !== 'boolean') {
    throw createQueryError('IS_INVALID_RESPONSE', 'Informationssystem response is missing the "refused" field');
  }

  return {
    refused: data.refused,
    answer: typeof data.answer === 'string' ? data.answer : null,
    citations: Array.isArray(data.citations) ? data.citations : []
  };
}

function formatCitations(citations) {
  return citations
    .slice()
    .sort((a, b) => a.marker - b.marker)
    .map(citation => {
      const locators = [];
      if (citation.section) locators.push(citation.section);
      if (citation.page != null) locators.push(`p. ${citation.page}`);
      const suffix = locators.length ? ` — ${locators.join(', ')}` : '';
      return `[${citation.marker}] ${citation.document_title}${suffix}`;
    })
    .join('\n');
}

function findSplitIndex(str, maxLength) {
  const slice = str.slice(0, maxLength);

  let idx = slice.lastIndexOf('\n\n');
  if (idx >= 1) return idx + 2;

  idx = slice.lastIndexOf('\n');
  if (idx >= 1) return idx + 1;

  idx = slice.lastIndexOf(' ');
  if (idx >= 1) return idx + 1;

  return maxLength;
}

function splitDiscordMessage(text, maxLength = 1900) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const parts = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const cutAt = findSplitIndex(remaining, maxLength);

    const chunk = remaining.slice(0, cutAt).replace(/\s+$/, '');
    const rest = remaining.slice(cutAt).replace(/^\s+/, '');

    parts.push(chunk);
    remaining = rest;
  }

  if (remaining) parts.push(remaining);

  return parts;
}

module.exports = {
  queryInformationssystem,
  formatCitations,
  splitDiscordMessage
};
