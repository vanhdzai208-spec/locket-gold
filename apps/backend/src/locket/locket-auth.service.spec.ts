import { LocketAuthService } from './locket-auth.service';
import { LocketApiClient } from './locket-api.client';
import { SessionData } from '../session/session.service';

describe('LocketAuthService', () => {
  let authService: LocketAuthService;
  let mockApiClient: Partial<LocketApiClient>;

  beforeEach(() => {
    mockApiClient = {
      signInWithPassword: jest.fn(),
      refreshToken: jest.fn(),
      getAccountInfo: jest.fn(),
    };

    authService = new LocketAuthService(mockApiClient as LocketApiClient);
  });

  describe('getValidAccessToken', () => {
    it('should return existing idToken if still valid', async () => {
      const validSession: SessionData = {
        userId: 'user123',
        email: 'test@example.com',
        idToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 10 * 60 * 1000, // Expires in 10 minutes
      };

      const result = await authService.getValidAccessToken(validSession);
      expect(result.idToken).toBe('valid-token');
      expect(result.updatedSession).toBeNull();
      expect(mockApiClient.refreshToken).not.toHaveBeenCalled();
    });

    it('should refresh token when expired or close to expiry (< 60s)', async () => {
      const expiringSession: SessionData = {
        userId: 'user123',
        email: 'test@example.com',
        idToken: 'old-token',
        refreshToken: 'refresh-token-123',
        expiresAt: Date.now() + 30 * 1000, // Expires in 30 seconds (within 60s buffer)
      };

      (mockApiClient.refreshToken as jest.Mock).mockResolvedValue({
        id_token: 'new-refreshed-token',
        refresh_token: 'new-refresh-token',
        expires_in: '3600',
        user_id: 'user123',
        project_id: 'locket-4252a',
      });

      const result = await authService.getValidAccessToken(expiringSession);

      expect(mockApiClient.refreshToken).toHaveBeenCalledWith('refresh-token-123');
      expect(result.idToken).toBe('new-refreshed-token');
      expect(result.updatedSession).toBeDefined();
      expect(result.updatedSession?.idToken).toBe('new-refreshed-token');
      expect(result.updatedSession?.refreshToken).toBe('new-refresh-token');
    });
  });
});
