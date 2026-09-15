import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';
import { CsrfService, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../services/csrf.service';

describe('CsrfGuard & CsrfService', () => {
  let csrfService: CsrfService;
  let csrfGuard: CsrfGuard;
  let reflector: Reflector;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'CSRF_SECRET') return 'test_csrf_secret_32_chars_long_minimum!';
        return undefined;
      }),
    } as unknown as ConfigService;

    csrfService = new CsrfService(mockConfig);
    reflector = new Reflector();
    csrfGuard = new CsrfGuard(csrfService, reflector);
  });

  const createMockContext = (method: string, cookies: any = {}, headers: any = {}): ExecutionContext => {
    const req = {
      method,
      cookies,
      headers,
    };
    const res = {
      cookie: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('Safe HTTP Methods (GET, HEAD, OPTIONS)', () => {
    it('should allow GET request and attach CSRF cookie if not present', () => {
      const context = createMockContext('GET');
      const canActivate = csrfGuard.canActivate(context);

      expect(canActivate).toBe(true);
      const res = context.switchToHttp().getResponse();
      expect(res.cookie).toHaveBeenCalledWith(
        CSRF_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ httpOnly: false, path: '/' }),
      );
    });

    it('should allow HEAD and OPTIONS without error', () => {
      expect(csrfGuard.canActivate(createMockContext('HEAD'))).toBe(true);
      expect(csrfGuard.canActivate(createMockContext('OPTIONS'))).toBe(true);
    });
  });

  describe('State-Changing Methods (POST, PUT, PATCH, DELETE)', () => {
    it('should block POST if CSRF cookie is missing', () => {
      const context = createMockContext('POST', {}, { [CSRF_HEADER_NAME]: 'some-token' });
      expect(() => csrfGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block POST if CSRF header is missing', () => {
      const token = csrfService.generateToken();
      const context = createMockContext('POST', { [CSRF_COOKIE_NAME]: token }, {});
      expect(() => csrfGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block POST if header token does not match cookie token', () => {
      const token1 = csrfService.generateToken();
      const token2 = csrfService.generateToken();
      const context = createMockContext(
        'POST',
        { [CSRF_COOKIE_NAME]: token1 },
        { [CSRF_HEADER_NAME]: token2 },
      );
      expect(() => csrfGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block POST if token signature is forged/invalid', () => {
      const fakeToken = 'fakeTokenRaw.invalidSignature12345';
      const context = createMockContext(
        'POST',
        { [CSRF_COOKIE_NAME]: fakeToken },
        { [CSRF_HEADER_NAME]: fakeToken },
      );
      expect(() => csrfGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow POST when cookie and header match with valid HMAC signature', () => {
      const validToken = csrfService.generateToken();
      const context = createMockContext(
        'POST',
        { [CSRF_COOKIE_NAME]: validToken },
        { [CSRF_HEADER_NAME]: validToken },
      );
      expect(csrfGuard.canActivate(context)).toBe(true);
    });

    it('should allow DELETE when cookie and header match with valid HMAC signature', () => {
      const validToken = csrfService.generateToken();
      const context = createMockContext(
        'DELETE',
        { [CSRF_COOKIE_NAME]: validToken },
        { [CSRF_HEADER_NAME]: validToken },
      );
      expect(csrfGuard.canActivate(context)).toBe(true);
    });
  });
});
