const crypto = require('crypto');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL_SECONDS = 60 * 60;

// Logged-out tokens until they expire (jti -> exp in seconds). Kept in memory, so a
// restart of the admin server re-admits revoked tokens for at most TOKEN_TTL_SECONDS.
const revokedTokens = new Map();

function issueToken(username) {
  return jwt.sign({ username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
    jwtid: crypto.randomUUID(),
  });
}

// Returns the payload, or throws if the token is invalid, expired or revoked
function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (!payload.jti || revokedTokens.has(payload.jti)) {
    throw new Error('Token revoked');
  }
  return payload;
}

// Returns the revoked token's payload, or null if it was already invalid
function revokeToken(token) {
  try {
    const payload = verifyToken(token);
    revokedTokens.set(payload.jti, payload.exp);
    return payload;
  } catch {
    return null;
  }
}

setInterval(() => {
  const nowSeconds = Date.now() / 1000;
  for (const [jti, exp] of revokedTokens) {
    if (exp < nowSeconds) revokedTokens.delete(jti);
  }
}, 10 * 60 * 1000).unref();

module.exports = { issueToken, verifyToken, revokeToken, TOKEN_TTL_SECONDS };
