const { logger } = require('./logger');
const { generateRequestSignature: _genSig } = require('./security');

function generateRequestSignature(payload, secret) {
  const timestamp = Date.now();
  const signaturePayload = { type: payload.type, timestamp };
  const signature = _genSig(signaturePayload, secret);

  return { signature, timestamp };
}

// Defaults to the docker-compose service name; override ADMIN_SERVER_URL when running outside Docker
function getNotifyUrl() {
  const base = process.env.ADMIN_SERVER_URL || `http://web:${process.env.ADMIN_UI_PORT || 8001}`;
  return `${base.replace(/\/+$/, '')}/api/internal/notify-change`;
}

async function notifyAdminServer(type, secret) {
  try {
    const payload = { type };
    const { signature, timestamp } = generateRequestSignature(payload, secret);

    const response = await fetch(getNotifyUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error('Failed to notify admin server', { status: response.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Could not notify admin server', { error: err.message });
    return false;
  }
}

module.exports = { notifyAdminServer, generateRequestSignature };

