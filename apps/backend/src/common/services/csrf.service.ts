import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

export const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
export const CSRF_HEADER_NAME = 'x-csrf-token';

@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly secret: string;
  private readonly isProd: boolean;
  private readonly cookieSameSite: 'lax' | 'none' | 'strict';

  constructor(private readonly configService: ConfigService) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
    
    // Derive CSRF secret from dedicated CSRF_SECRET or SESSION_SECRET
    const configuredSecret =
      this.configService.get<string>('CSRF_SECRET') ||
      this.configService.get<string>('SESSION_SECRET');

    if (this.isProd && (!configuredSecret || configuredSecret.length < 32)) {
      throw new Error(
        '[FATAL] CSRF_SECRET (or SESSION_SECRET) must be at least 32 characters in production!',
      );
    }

    this.secret =
      configuredSecret && configuredSecret.length >= 32
        ? configuredSecret
        : crypto.randomBytes(32).toString('hex');

    const envSameSite = this.configService.get<string>('COOKIE_SAME_SITE')?.toLowerCase();
    if (envSameSite === 'none') {
      this.cookieSameSite = 'none';
    } else if (envSameSite === 'strict') {
      this.cookieSameSite = 'strict';
    } else {
      this.cookieSameSite = 'lax';
    }
  }

  /**
   * Generates a cryptographically secure HMAC-SHA256 signed CSRF token
   */
  generateToken(): string {
    const raw = crypto.randomBytes(24).toString('hex');
    const hmac = crypto
      .createHmac('sha256', this.secret)
      .update(raw)
      .digest('hex');
    return `${raw}.${hmac}`;
  }

  /**
   * Validates a token's HMAC signature
   */
  validateTokenSignature(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [raw, signature] = parts;
    if (!raw || !signature) return false;

    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(raw)
      .digest('hex');

    if (expected.length !== signature.length) return false;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Validates double-submit cookie token against header token
   */
  verify(cookieToken?: string, headerToken?: string): boolean {
    if (!cookieToken || !headerToken) {
      return false;
    }

    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
      return false;
    }

    // Both must match exactly
    if (cookieToken.length !== headerToken.length) {
      return false;
    }

    const tokensMatch = crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken),
    );

    if (!tokensMatch) {
      return false;
    }

    // And token must have a valid HMAC signature
    return this.validateTokenSignature(cookieToken);
  }

  /**
   * Attaches the CSRF cookie to the outgoing response if missing or invalid
   */
  attachCsrfCookie(req: Request, res: Response): string {
    const existingCookie = req.cookies?.[CSRF_COOKIE_NAME];
    if (existingCookie && this.validateTokenSignature(existingCookie)) {
      return existingCookie;
    }

    const newToken = this.generateToken();
    const isSecure = this.isProd || this.cookieSameSite === 'none';

    res.cookie(CSRF_COOKIE_NAME, newToken, {
      httpOnly: false, // Required for double-submit cookie (client JS must read it)
      secure: isSecure, // Must be true in production or when sameSite is 'none'
      sameSite: this.cookieSameSite,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return newToken;
  }
}
