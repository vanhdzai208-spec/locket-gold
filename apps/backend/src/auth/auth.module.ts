import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocketModule } from '../locket/locket.module';
import { CsrfService } from '../common/services/csrf.service';

@Module({
  imports: [LocketModule],
  controllers: [AuthController],
  providers: [AuthService, CsrfService],
  exports: [AuthService, CsrfService],
})
export class AuthModule {}

