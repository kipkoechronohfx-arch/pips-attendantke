const revokedTokens = new Set();
const TTL = 30 * 24 * 60 * 60 * 1000; // 30 days (matches JWT expiry)

// Adds a token JTI (JWT ID) to the revocation list
function revokeToken(jti) {
  if (jti) {
    revokedTokens.add(jti);
    // Cleanup to prevent memory leak
    setTimeout(() => {
      revokedTokens.delete(jti);
    }, TTL);
  }
}

// Checks if a token JTI is revoked
function isTokenRevoked(jti) {
  return revokedTokens.has(jti);
}

module.exports = {
  revokeToken,
  isTokenRevoked
};
