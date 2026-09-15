import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { LocketApiClient } from './locket-api.client';
import { SessionData } from '../session/session.service';
import { extractUidFromToken, isTokenExpiringSoon } from '../common/utils/jwt.util';

export interface ValidatedTokenResult {
  idToken: string;
  updatedSession: SessionData | null;
}

@Injectable()
export class LocketAuthService {
  private readonly logger = new Logger(LocketAuthService.name);

  constructor(private readonly apiClient: LocketApiClient) {}

  /**
   * Log in using Locket email and password
   */
  async loginWithEmail(email: string, password: string): Promise<SessionData> {
    const trimmedEmail = email.trim().toLowerCase();
    const authRes = await this.apiClient.signInWithPassword(
      trimmedEmail,
      password,
    );

    const verifiedUserId =
      extractUidFromToken(authRes.idToken) || authRes.localId;

    let displayName = authRes.displayName;
    let photoUrl: string | undefined;

    try {
      const accountInfo = await this.apiClient.getAccountInfo(authRes.idToken);
      const user = accountInfo.users?.[0];
      if (user) {
        displayName = user.displayName || displayName;
        photoUrl = user.photoUrl;
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch account info during login: ${err.message}`);
    }

    const expiresInSeconds = parseInt(authRes.expiresIn, 10) || 3600;
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    return {
      userId: verifiedUserId,
      email: authRes.email,
      displayName: displayName || authRes.email.split('@')[0],
      photoUrl,
      idToken: authRes.idToken,
      refreshToken: authRes.refreshToken,
      expiresAt,
    };
  }

  /**
   * Ensures an active, unexpired idToken is available.
   * Checks both JWT exp claim (< 300s buffer) and session.expiresAt.
   */
  async getValidAccessToken(session: SessionData): Promise<ValidatedTokenResult> {
    const bufferTimeMs = 300 * 1000; // 5 minutes buffer
    const isExpiringSession = Date.now() >= session.expiresAt - bufferTimeMs;
    const isExpiringJwt = isTokenExpiringSoon(session.idToken, 300);

    if (!isExpiringSession && !isExpiringJwt && session.idToken) {
      return {
        idToken: session.idToken,
        updatedSession: null,
      };
    }

    return this.forceRefreshToken(session);
  }

  /**
   * Forces a token refresh regardless of current expiry timestamp.
   * Crucial when an external service (like Firebase Storage) rejects with 401/403.
   */
  async forceRefreshToken(session: SessionData): Promise<ValidatedTokenResult> {
    this.logger.log(`Refreshing ID token for user ${session.userId}...`);

    try {
      const refreshRes = await this.apiClient.refreshToken(session.refreshToken);
      const expiresInSeconds = parseInt(refreshRes.expires_in, 10) || 3600;
      const verifiedUserId =
        refreshRes.user_id ||
        extractUidFromToken(refreshRes.id_token) ||
        session.userId;

      const updatedSession: SessionData = {
        ...session,
        userId: verifiedUserId,
        idToken: refreshRes.id_token,
        refreshToken: refreshRes.refresh_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      };

      return {
        idToken: refreshRes.id_token,
        updatedSession,
      };
    } catch (err: any) {
      this.logger.error(`Token refresh failed: ${err.message}`);
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Your Locket session has expired. Please sign in again.',
      });
    }
  }

  /**
   * Get fresh account details
   */
  async getAccountDetails(session: SessionData) {
    const { idToken } = await this.getValidAccessToken(session);
    try {
      const accountInfo = await this.apiClient.getAccountInfo(idToken);
      const user = accountInfo.users?.[0];
      return {
        uid: session.userId,
        email: session.email,
        displayName: user?.displayName || session.displayName,
        photoUrl: user?.photoUrl || session.photoUrl,
      };
    } catch {
      return {
        uid: session.userId,
        email: session.email,
        displayName: session.displayName,
        photoUrl: session.photoUrl,
      };
    }
  }
}
