/**
 * Safely decodes a JWT token's payload without external dependencies.
 */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Extracts the user's UID ('user_id' or 'sub') directly from the Firebase ID token.
 */
export function extractUidFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return payload?.user_id || payload?.sub || null;
}

/**
 * Checks if a JWT token will expire within the given buffer in seconds (defaults to 5 minutes = 300s).
 */
export function isTokenExpiringSoon(token: string, bufferSeconds = 300): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowSeconds <= bufferSeconds;
}
