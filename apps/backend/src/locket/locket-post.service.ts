import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { LocketStorageService } from './locket-storage.service';
import { SessionData } from '../session/session.service';

import { extractUidFromToken } from '../common/utils/jwt.util';

export interface PostMomentResult {
  momentUid: string;
  downloadUrl: string;
  videoUrl?: string;
  createdAt: number;
  updatedSession: SessionData | null;
}

@Injectable()
export class LocketPostService {
  private readonly logger = new Logger(LocketPostService.name);

  constructor(
    private readonly apiClient: LocketApiClient,
    private readonly authService: LocketAuthService,
    private readonly storageService: LocketStorageService,
  ) {}

  /**
   * Complete end-to-end moment posting (Photos & Videos):
   * 1. Check token validity / auto refresh
   * 2. Detect if file is image or video, validate buffer integrity
   * 3. Upload thumbnail (and video if present) to Firebase Storage & obtain download URLs
   * 4. Call Locket postMomentV2 API
   */
  async postMoment(
    session: SessionData,
    fileBuffer: Buffer,
    mimetype?: string,
    caption?: string,
    recipients?: string[],
    thumbnailBuffer?: Buffer,
    thumbnailMimetype?: string,
  ): Promise<PostMomentResult> {
    this.logger.log(`Initiating moment post for user ${session.userId}...`);

    // 1. Ensure access token is valid
    const tokenResult = await this.authService.getValidAccessToken(session);
    let activeToken = tokenResult.idToken;
    let latestSession = tokenResult.updatedSession;

    // Extract verified UID directly from token's sub/user_id claim
    const verifiedUserId =
      extractUidFromToken(activeToken) ||
      latestSession?.userId ||
      session.userId;

    // 2. Detect file type (Video vs Image)
    const isVideo =
      Boolean(thumbnailBuffer) ||
      mimetype?.startsWith('video/') ||
      (fileBuffer.length > 8 && fileBuffer.toString('ascii', 4, 8) === 'ftyp') ||
      (fileBuffer.length > 4 &&
        fileBuffer[0] === 0x1a &&
        fileBuffer[1] === 0x45 &&
        fileBuffer[2] === 0xdf &&
        fileBuffer[3] === 0xa3);

    let downloadUrl: string;
    let videoDownloadUrl: string | undefined;

    if (isVideo) {
      this.logger.log(`Processing video moment for user ${verifiedUserId}...`);
      const validatedVideo = this.storageService.validateVideo(
        fileBuffer,
        mimetype,
      );

      // Validate thumbnail image (required by Locket)
      if (!thumbnailBuffer || thumbnailBuffer.length === 0) {
        throw new BadRequestException({
          code: 'INVALID_THUMBNAIL',
          message: 'Video upload requires a valid thumbnail image.',
        });
      }
      const validatedThumbnail = this.storageService.validateImage(
        thumbnailBuffer,
        thumbnailMimetype,
      );

      // Upload thumbnail
      downloadUrl = await this.storageService.uploadMomentImage(
        verifiedUserId,
        activeToken,
        validatedThumbnail,
      );

      // Upload video
      videoDownloadUrl = await this.storageService.uploadMomentVideo(
        verifiedUserId,
        activeToken,
        validatedVideo,
      );
    } else {
      // Standard image flow
      const validatedImage = this.storageService.validateImage(
        fileBuffer,
        mimetype,
      );

      try {
        downloadUrl = await this.storageService.uploadMomentImage(
          verifiedUserId,
          activeToken,
          validatedImage,
        );
      } catch (err: any) {
        if (
          err?.message?.includes('Permission denied') ||
          err?.status === 403 ||
          err?.status === 401
        ) {
          this.logger.warn(
            `Storage permission denied. Forcing token refresh and retrying upload...`,
          );
          const refreshed = await this.authService.forceRefreshToken(
            latestSession || session,
          );
          activeToken = refreshed.idToken;
          latestSession = refreshed.updatedSession;
          const freshUid =
            extractUidFromToken(activeToken) ||
            latestSession?.userId ||
            verifiedUserId;

          this.logger.log(
            `Retrying upload with fresh token for user ${freshUid}...`,
          );
          downloadUrl = await this.storageService.uploadMomentImage(
            freshUid,
            activeToken,
            validatedImage,
          );
        } else {
          throw err;
        }
      }
    }

    // 4. Build postMomentV2 payload
    const trimmedCaption = caption ? caption.trim() : '';
    const payload = this.buildMomentPayload(
      downloadUrl,
      trimmedCaption,
      recipients,
      videoDownloadUrl,
    );

    this.logger.log(`Calling Locket postMomentV2...`);
    let response: any;
    try {
      response = await this.apiClient.postMomentV2(activeToken, payload);
    } catch (err: any) {
      if (
        err?.message?.includes('502') ||
        err?.message?.includes('TOKEN_EXPIRED') ||
        err?.message?.includes('401')
      ) {
        this.logger.warn(
          `postMomentV2 failed (${err.message}). Force refreshing token and retrying...`,
        );
        const refreshed = await this.authService.forceRefreshToken(
          latestSession || session,
        );
        activeToken = refreshed.idToken;
        latestSession = refreshed.updatedSession;
        response = await this.apiClient.postMomentV2(activeToken, payload);
      } else {
        throw err;
      }
    }

    const momentUid =
      response.result?.data?.canonical_uid ||
      response.result?.data?.moment_uid ||
      response.result?.moment_uid;

    if (!momentUid) {
      throw new Error(
        'LOCKET_API_FAILED: Server did not return a valid moment UID',
      );
    }

    const rawSeconds =
      response.result?.data?.date?._seconds ||
      (typeof response.result?.created_at === 'number' &&
      response.result.created_at < 1e11
        ? response.result.created_at
        : null);

    const createdAt = rawSeconds ? rawSeconds * 1000 : Date.now();

    this.logger.log(`Moment successfully posted! UID: ${momentUid}`);

    return {
      momentUid,
      downloadUrl,
      videoUrl: videoDownloadUrl,
      createdAt,
      updatedSession: latestSession,
    };
  }

  /**
   * Constructs the callable payload matching Locket's mobile specification
   */
  buildMomentPayload(
    thumbnailUrl: string,
    caption?: string,
    recipients: string[] = [],
    videoUrl?: string,
  ): Record<string, any> {
    const isSentToAll = !recipients || recipients.length === 0;

    const basePayload: Record<string, any> = {
      thumbnail_url: thumbnailUrl,
      sent_to_all: isSentToAll,
      recipients: isSentToAll ? [] : recipients,
    };

    if (videoUrl) {
      basePayload.video_url = videoUrl;
    }

    if (!caption || caption.length === 0) {
      return {
        ...basePayload,
        overlays: [],
      };
    }

    return {
      ...basePayload,
      caption,
      overlays: [
        {
          overlay_id: 'caption:standard',
          overlay_type: 'caption',
          data: {
            text_color: '#FFFFFFE6',
            text: caption,
            type: 'standard',
            max_lines: 4,
            background: {
              colors: [],
              material_blur: 'ultra-thin',
            },
          },
          alt_text: caption,
        },
      ],
    };
  }
}
