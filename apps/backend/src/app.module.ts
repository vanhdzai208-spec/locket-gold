import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { SessionModule } from './session/session.module';
import { AuthModule } from './auth/auth.module';
import { LocketModule } from './locket/locket.module';
import { GoldModule } from './gold/gold.module';
import { SupabaseModule } from './supabase/supabase.module';
import { CsrfService } from './common/services/csrf.service';
import { CsrfGuard } from './common/guards/csrf.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    SessionModule,
    AuthModule,
    LocketModule,
    GoldModule,
    SupabaseModule,
  ],
  controllers: [AppController],
  providers: [
    CsrfService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
