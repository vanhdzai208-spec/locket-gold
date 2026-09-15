import { Module } from '@nestjs/common';
import { LocketModule } from '../locket/locket.module';
import { SessionModule } from '../session/session.module';
import { GoldController } from './gold.controller';
import { GoldService } from './gold.service';

@Module({
  imports: [LocketModule, SessionModule],
  controllers: [GoldController],
  providers: [GoldService],
  exports: [GoldService],
})
export class GoldModule {}
