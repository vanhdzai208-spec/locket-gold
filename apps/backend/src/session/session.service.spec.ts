import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SessionService, SessionData, SESSION_COOKIE_NAME } from './session.service';

describe('SessionService', () => {
  const createConfigService = (env: Record<string, string | undefined>) => {
    return {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
  };

  describe('Production Environment Fail-Fast', () => {
    it('should throw fatal error when SESSION_SECRET is missing in production', () => {
      const config = createConfigService({
        NODE_ENV: 'production',
        SESSION_SECRET: undefined,
      });

      expect(() => new SessionService(config)).toThrow(
        /\[FATAL\] SESSION_SECRET must be defined and at least 32 characters/,
      );
    });

    it('should throw fatal error when SESSION_SECRET is less than 32 characters in production', () => {
      const config = createConfigService({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short_insecure_secret_12345',
      });

      expect(() => new SessionService(config)).toThrow(
        /\[FATAL\] SESSION_SECRET must be defined and at least 32 characters/,
      );
    });

    it('should start successfully when SESSION_SECRET is at least 32 characters in production', () => {
      const config = createConfigService({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a_very_long_secure_session_secret_32_characters_minimum!',
      });

      expect(() => new SessionService(config)).not.toThrow();
    });
  });

  describe('Development Environment', () => {
    it('should generate a random secret without crashing when SESSION_SECRET is missing in development', () => {
      const config = createConfigService({
        NODE_ENV: 'development',
        SESSION_SECRET: undefined,
      });

      let service: SessionService | null = null;
      expect(() => {
        service = new SessionService(config);
      }).not.toThrow();
      expect(service).toBeDefined();
    });

    it('should encrypt and set session cookie in development', () => {
      const config = createConfigService({
        NODE_ENV: 'development',
        SESSION_SECRET: 'test_secret_for_development_purposes_only_32_chars!',
      });

      const service = new SessionService(config);
      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const sessionData: SessionData = {
        userId: 'user_123',
        email: 'user@example.com',
        idToken: 'token_123',
        refreshToken: 'refresh_123',
        expiresAt: Date.now() + 3600000,
      };

      service.setSession(mockRes, sessionData);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });
  });
});
