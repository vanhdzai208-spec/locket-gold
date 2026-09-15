import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { LocketStorageService } from './locket-storage.service';
import { LocketPostService } from './locket-post.service';
import { LocketFeedService } from './locket-feed.service';
import { LocketChatService } from './locket-chat.service';
import { LocketController } from './locket.controller';

@Module({
  imports: [ConfigModule],
  controllers: [LocketController],
  providers: [
    LocketApiClient,
    LocketAuthService,
    LocketStorageService,
    LocketPostService,
    LocketFeedService,
    LocketChatService,
  ],
  exports: [
    LocketApiClient,
    LocketAuthService,
    LocketStorageService,
    LocketPostService,
    LocketFeedService,
    LocketChatService,
  ],
})
export class LocketModule {}
