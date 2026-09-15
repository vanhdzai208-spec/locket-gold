import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private clientInstance: SupabaseClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        '⚠️ SUPABASE_URL hoặc SUPABASE_KEY chưa được cấu hình trong biến môi trường.',
      );
      return;
    }

    this.clientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    this.logger.log('✅ Supabase Client đã được khởi tạo thành công!');
  }

  get client(): SupabaseClient {
    if (!this.clientInstance) {
      throw new Error(
        'Supabase client chưa được khởi tạo. Vui lòng kiểm tra biến môi trường SUPABASE_URL & SUPABASE_KEY.',
      );
    }
    return this.clientInstance;
  }
}
