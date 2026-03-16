const crypto = require('crypto');
const { logger } = require('./logger');

function stringifyForSigning(obj) {
  return JSON.stringify(Object.keys(obj).sort().reduce((result, key) => {
    result[key] = obj[key];
    return result;
  }, {}));
}

function generateRequestSignature(payload, secret) {
  const timestamp = Date.now();
  const signaturePayload = { type: payload.type, timestamp };
  const payloadString = stringifyForSigning(signaturePayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  return { signature, timestamp };
}

async function notifyAdminServer(type, secret) {
  try {
    const payload = { type };
    const { signature, timestamp } = generateRequestSignature(payload, secret);

    const response = await fetch('http://web:8001/api/internal/notify-change', {
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

