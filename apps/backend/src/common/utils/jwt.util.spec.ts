import {
  decodeJwtPayload,
  extractUidFromToken,
  isTokenExpiringSoon,
} from './jwt.util';

describe('JwtUtil', () => {
  const createMockToken = (payload: Record<string, any>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64');
    return `${header}.${body}.signature`;
  };

  it('should safely decode a valid JWT payload', () => {
    const token = createMockToken({ user_id: 'locket_user_123', exp: 1999999999 });
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual({ user_id: 'locket_user_123', exp: 1999999999 });
  });

  it('should return null for malformed token', () => {
    expect(decodeJwtPayload('invalid-token')).toBeNull();
  });

  it('should extract UID from user_id or sub claim', () => {
    const token1 = createMockToken({ user_id: 'user_from_userId' });
    expect(extractUidFromToken(token1)).toBe('user_from_userId');

    const token2 = createMockToken({ sub: 'user_from_sub' });
    expect(extractUidFromToken(token2)).toBe('user_from_sub');
  });

  it('should detect when token is expiring soon or expired', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredToken = createMockToken({ exp: nowSec - 10 });
    expect(isTokenExpiringSoon(expiredToken, 300)).toBe(true);

    const expiringSoonToken = createMockToken({ exp: nowSec + 100 });
    expect(isTokenExpiringSoon(expiringSoonToken, 300)).toBe(true);

    const validToken = createMockToken({ exp: nowSec + 3600 });
    expect(isTokenExpiringSoon(validToken, 300)).toBe(false);
  });
});
