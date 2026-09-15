import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentSession } from '../common/decorators/current-session.decorator';
import { SessionData, SessionService } from '../session/session.service';
import { LocketPostService } from './locket-post.service';
import { LocketFeedService } from './locket-feed.service';
import { LocketChatService } from './locket-chat.service';
import { PostMomentDto } from './dto/post-moment.dto';
import { SendMessageDto } from './dto/chat-response.dto';

@Controller('locket')
@UseGuards(AuthGuard)
export class LocketController {
  constructor(
    private readonly locketPostService: LocketPostService,
    private readonly locketFeedService: LocketFeedService,
    private readonly locketChatService: LocketChatService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('post')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Max 5 posts per minute
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 15 * 1024 * 1024, // 15MB maximum
        },
      },
    ),
  )
  async postMoment(
    @CurrentSession() session: SessionData,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      video?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
    @Body() dto: PostMomentDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const videoFile = files?.video?.[0];
    const imageFile = files?.image?.[0];
    const thumbnailFile = files?.thumbnail?.[0];

    if (!videoFile && !imageFile) {
      throw new BadRequestException({
        code: 'INVALID_FILE',
        message: 'Please provide an image or video file to post.',
      });
    }

    const recipientsList = Array.isArray(dto?.recipients)
      ? dto.recipients
      : undefined;

    let result: any;

    if (videoFile) {
      const thumb = thumbnailFile || imageFile;
      if (!thumb || !thumb.buffer) {
        throw new BadRequestException({
          code: 'INVALID_THUMBNAIL',
          message: 'Video upload requires a thumbnail image.',
        });
      }

      result = await this.locketPostService.postMoment(
        session,
        videoFile.buffer,
        videoFile.mimetype,
        dto?.caption,
        recipientsList,
        thumb.buffer,
        thumb.mimetype,
      );
    } else {
      result = await this.locketPostService.postMoment(
        session,
        imageFile!.buffer,
        imageFile!.mimetype,
        dto?.caption,
        recipientsList,
      );
    }

    // If token was refreshed during the operation, update the client's cookie
    if (result.updatedSession) {
      this.sessionService.setSession(res, result.updatedSession);
    }

    if (result.momentUid && recipientsList && recipientsList.length > 0) {
      this.locketFeedService.recordMomentRecipients(result.momentUid, recipientsList);
    }

    return {
      momentUid: result.momentUid,
      downloadUrl: result.downloadUrl,
      videoUrl: result.videoUrl,
      createdAt: result.createdAt,
    };
  }

  @Get('friends')
  @HttpCode(HttpStatus.OK)
  async getFriends(@CurrentSession() session: SessionData) {
    return this.locketFeedService.getFriendsList(session);
  }

  @Get('moments/:id/details')
  @HttpCode(HttpStatus.OK)
  async getMomentDetails(
    @CurrentSession() session: SessionData,
    @Param('id') id: string,
  ) {
    if (!id) {
      throw new BadRequestException('Moment ID is required');
    }
    return this.locketFeedService.getMomentDetails(session, id);
  }

  @Delete('moments/:id')
  @HttpCode(HttpStatus.OK)
  async deleteMoment(
    @CurrentSession() session: SessionData,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!id) {
      throw new BadRequestException('Moment ID is required');
    }
    const result = await this.locketFeedService.deleteMoment(session, id);

    if (result.updatedSession) {
      this.sessionService.setSession(res, result.updatedSession);
    }

    return {
      success: true,
      data: {
        success: true,
        momentUid: result.momentUid,
        deletedCount: result.deletedCount,
        deletedUids: result.deletedUids,
      },
    };
  }

  @Get('feed')
  @HttpCode(HttpStatus.OK)
  async getFeed(
    @CurrentSession() session: SessionData,
    @Res({ passthrough: true }) res: Response,
    @Query('since') since?: string,
    @Query('full') full?: string,
    @Query('quick') quick?: string,
  ) {
    const sinceTimestamp = since ? parseInt(since, 10) : undefined;
    const isFull = full === 'true' || full === '1';
    const isQuick = quick === 'true' || quick === '1';

    const result = await this.locketFeedService.getFeed(session, {
      since: sinceTimestamp,
      full: isFull,
      quick: isQuick,
    });

    if (result.updatedSession) {
      this.sessionService.setSession(res, result.updatedSession);
    }

    return result.feed;
  }

  @Get('proxy-image')
  async proxyImage(
    @Query('url') imageUrl: string,
    @Res() res: Response,
  ) {
    if (!imageUrl) {
      throw new BadRequestException('Image URL is required');
    }

    try {
      const { stream, contentType, contentLength } =
        await this.locketFeedService.getProxyImageStream(imageUrl);

      res.setHeader('Content-Type', String(contentType));
      if (contentLength) {
        res.setHeader('Content-Length', String(contentLength));
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');

      stream.pipe(res);
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new BadRequestException(`Failed to proxy image: ${err.message}`);
    }
  }

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  async getConversations(@CurrentSession() session: SessionData) {
    return this.locketChatService.getConversations(session);
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  async getConversationMessages(
    @CurrentSession() session: SessionData,
    @Param('id') id: string,
  ) {
    if (!id) {
      throw new BadRequestException('Conversation ID is required');
    }
    return this.locketChatService.getMessages(session, id);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @CurrentSession() session: SessionData,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    if (!id) {
      throw new BadRequestException('Conversation ID is required');
    }
    return this.locketChatService.sendMessage(
      session,
      id,
      dto.body,
      dto.replyMoment,
    );
  }

  @Get('friends/deleted')
  @HttpCode(HttpStatus.OK)
  async getDeletedFriends(@CurrentSession() session: SessionData) {
    return this.locketChatService.getDeletedFriends(session);
  }

  @Get('friends/active')
  @HttpCode(HttpStatus.OK)
  async getActiveFriends(@CurrentSession() session: SessionData) {
    return this.locketChatService.getAllActiveFriends(session);
  }
}
