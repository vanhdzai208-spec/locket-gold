import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { CryptoUtil } from '../common/utils/crypto.util';

export interface SessionData {
  userId: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
}

export const SESSION_COOKIE_NAME = 'locket_session';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionSecret: string;
  private readonly isProd: boolean;
  private readonly cookieSameSite: 'lax' | 'none' | 'strict';

  constructor(private readonly configService: ConfigService) {
    this.isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const secret = this.configService.get<string>('SESSION_SECRET')?.trim();

    if (this.isProd) {
      if (!secret || secret.length < 32) {
        throw new Error(
          '[FATAL] SESSION_SECRET must be defined and at least 32 characters long in production mode! Server startup aborted.',
        );
      }
      this.sessionSecret = secret;
    } else {
      if (secret && secret.length >= 32) {
        this.sessionSecret = secret;
      } else {
        this.sessionSecret = crypto.randomBytes(32).toString('hex');
        this.logger.warn(
          '⚠️ Đang chạy với SESSION_SECRET ngẫu nhiên tạm thời (development only). Không dùng cho production!',
        );
      }
    }

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
   * Encrypt and store session in HttpOnly cookie
   */
  setSession(res: Response, data: SessionData): void {
    try {
      const payload = JSON.stringify(data);
      const encrypted = CryptoUtil.encrypt(payload, this.sessionSecret);
      const isSecure = this.isProd || this.cookieSameSite === 'none';

      res.cookie(SESSION_COOKIE_NAME, encrypted, {
        httpOnly: true,
        secure: isSecure, // Must be true in production or if sameSite is 'none'
        sameSite: this.cookieSameSite,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    } catch (err: any) {
      this.logger.error(`Failed to encrypt session: ${err.message}`);
      throw new Error('Session encryption failed');
    }
  }

  /**
   * Read and decrypt session from request cookie
   */
  getSession(req: Request): SessionData | null {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawCookie) {
      return null;
    }

    try {
      const decrypted = CryptoUtil.decrypt(rawCookie, this.sessionSecret);
      return JSON.parse(decrypted) as SessionData;
    } catch (err: any) {
      this.logger.warn(`Failed to decrypt session cookie: ${err.message}`);
      return null;
    }
  }

  /**
   * Clear session cookie on logout
   */
  clearSession(res: Response): void {
    const isSecure = this.isProd || this.cookieSameSite === 'none';
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isSecure,
      sameSite: this.cookieSameSite,
      path: '/',
    });
  }
}
