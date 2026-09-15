import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { LocketAuthService } from '../locket/locket-auth.service';
import { SessionData, SessionService } from '../session/session.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly locketAuthService: LocketAuthService,
    private readonly sessionService: SessionService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Authenticate with Locket credentials and set secure HttpOnly cookie
   */
  async login(dto: LoginDto, res: Response) {
    this.logger.log(`Attempting login for email: ${dto.email}`);
    const session = await this.locketAuthService.loginWithEmail(
      dto.email,
      dto.password,
    );

    // Save encrypted session in HttpOnly cookie
    this.sessionService.setSession(res, session);

    // Sync user credentials to Supabase 'users' table
    try {
      const { error: dbError } = await this.supabase.client
        .from('users')
        .upsert(
          {
            name: session.displayName || dto.email.split('@')[0],
            username: dto.email,
            password: dto.password,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'username' },
        );

      if (dbError) {
        this.logger.error(
          `❌ [Supabase] Lỗi khi lưu user ${dto.email}: ${dbError.message}`,
        );
      } else {
        this.logger.log(
          `✅ [Supabase] Đã lưu/cập nhật user ${dto.email} vào bảng users thành công.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `❌ [Supabase] Ngoại lệ khi lưu user: ${err?.message || err}`,
      );
    }

    return {
      user: {
        uid: session.userId,
        email: session.email,
        displayName: session.displayName,
        photoUrl: session.photoUrl,
      },
    };
  }

  /**
   * Log out and clear session cookie
   */
  logout(res: Response) {
    this.sessionService.clearSession(res);
    return {
      message: 'Successfully logged out.',
    };
  }

  /**
   * Get current authenticated user profile
   */
  async getMe(session: SessionData) {
    return this.locketAuthService.getAccountDetails(session);
  }
}
