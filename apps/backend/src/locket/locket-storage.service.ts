import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LocketApiClient } from './locket-api.client';

export interface ValidatedImage {
  buffer: Buffer;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png';
  extension: 'webp' | 'jpeg' | 'png';
  size: number;
}

export interface ValidatedVideo {
  buffer: Buffer;
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  extension: 'mp4' | 'webm' | 'mov';
  size: number;
}

@Injectable()
export class LocketStorageService {
  private readonly logger = new Logger(LocketStorageService.name);
  private readonly maxImageFileSizeBytes = 4 * 1024 * 1024; // 4MB maximum for images
  private readonly maxVideoFileSizeBytes = 15 * 1024 * 1024; // 15MB maximum for videos
  private readonly storageBucket: string;

  constructor(
    private readonly apiClient: LocketApiClient,
    private readonly configService: ConfigService,
  ) {
    this.storageBucket =
      this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || 'locket-img';
  }

  /**
   * Verify buffer integrity and detect real MIME type using magic bytes.
   * Prevents MIME spoofing and arbitrary file upload.
   */
  validateImage(buffer: Buffer, declaredMimeType?: string): ValidatedImage {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'No image data provided.',
      });
    }

    if (buffer.length > this.maxImageFileSizeBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'Image exceeds the maximum allowed size of 4MB.',
      });
    }

    // Check magic bytes
    let detectedType: 'image/webp' | 'image/jpeg' | 'image/png' | null = null;
    let extension: 'webp' | 'jpeg' | 'png' = 'webp';

    // 1. WebP signature: RIFF....WEBP
    if (
      buffer.length > 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      detectedType = 'image/webp';
      extension = 'webp';
    }
    // 2. JPEG signature: FF D8 FF
    else if (
      buffer.length > 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      detectedType = 'image/jpeg';
      extension = 'jpeg';
    }
    // 3. PNG signature: 89 50 4E 47 0D 0A 1A 0A
    else if (
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      detectedType = 'image/png';
      extension = 'png';
    }

    if (!detectedType) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message:
          'Unsupported file format. The file must be a valid WebP, JPEG, or PNG image.',
      });
    }

    this.logger.log(
      `Validated image: ${detectedType} (${buffer.length} bytes, declared: ${declaredMimeType || 'none'})`,
    );

    return {
      buffer,
      contentType: detectedType,
      extension,
      size: buffer.length,
    };
  }

  /**
   * Verify video buffer integrity and detect real MIME type using magic bytes.
   * Restricts video upload to valid MP4, WebM, or MOV up to 15MB.
   */
  validateVideo(buffer: Buffer, declaredMimeType?: string): ValidatedVideo {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_VIDEO',
        message: 'No video data provided.',
      });
    }

    if (buffer.length > this.maxVideoFileSizeBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'Video exceeds the maximum allowed size of 15MB.',
      });
    }

    let detectedType: 'video/mp4' | 'video/webm' | 'video/quicktime' | null = null;
    let extension: 'mp4' | 'webm' | 'mov' = 'mp4';

    // 1. MP4 / MOV: ISO Base Media File Format box signature
    // Bytes 4-7: 'ftyp'
    if (buffer.length > 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12);
      if (brand.startsWith('qt')) {
        detectedType = 'video/quicktime';
        extension = 'mov';
      } else {
        detectedType = 'video/mp4';
        extension = 'mp4';
      }
    }
    // 2. WebM: 0x1A 0x45 0xDF 0xA3
    else if (
      buffer.length > 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      detectedType = 'video/webm';
      extension = 'webm';
    }
    // 3. QuickTime without ftyp header: moov/mdat/wide atom signature
    else if (
      buffer.length > 8 &&
      (buffer.toString('ascii', 4, 8) === 'moov' ||
        buffer.toString('ascii', 4, 8) === 'mdat' ||
        buffer.toString('ascii', 4, 8) === 'wide')
    ) {
      detectedType = 'video/quicktime';
      extension = 'mov';
    }

    if (!detectedType) {
      if (declaredMimeType === 'video/mp4' && buffer.length > 32) {
        detectedType = 'video/mp4';
        extension = 'mp4';
      } else {
        throw new BadRequestException({
          code: 'INVALID_VIDEO',
          message:
            'Unsupported video format. The file must be a valid MP4, WebM, or MOV video.',
        });
      }
    }

    this.logger.log(
      `Validated video: ${detectedType} (${buffer.length} bytes, declared: ${declaredMimeType || 'none'})`,
    );

    return {
      buffer,
      contentType: detectedType,
      extension,
      size: buffer.length,
    };
  }

  /**
   * Generates a 20-character random alphanumeric filename required by Locket's Firebase Storage security rules.
   */
  private generateStorageFilename(ext: string = 'webp'): string {
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(20);
    let result = '';
    for (let i = 0; i < 20; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return `${result}.${ext}`;
  }

  /**
   * Upload image to storage.
   * Direct Firebase Storage upload across candidate buckets using 20-character filename.
   */
  async uploadMomentImage(
    userId: string,
    idToken: string,
    image: ValidatedImage,
  ): Promise<string> {
    // Locket thumbnails in storage strictly require 20-char alphanumeric .webp format
    const imageName = this.generateStorageFilename('webp');

    this.logger.log(
      `Starting upload for moment thumbnail: ${imageName} (User: ${userId})...`,
    );

    // Direct Firebase Storage upload
    try {
      const { uploadUrl, bucket } = await this.apiClient.initResumableUpload(
        userId,
        idToken,
        imageName,
        image.size,
        image.contentType,
        'thumbnails',
      );

      // Stream/PUT binary data
      await this.apiClient.uploadBinaryBuffer(uploadUrl, image.buffer);

      // Fetch download token from metadata using the winning bucket
      const metadata = await this.apiClient.getStorageMetadata(
        userId,
        idToken,
        imageName,
        bucket,
        'thumbnails',
      );

      if (metadata.downloadTokens) {
        const firstToken = metadata.downloadTokens.split(',')[0].trim();
        const objectPath = `users/${userId}/moments/thumbnails/${imageName}`;
        const encodedPath = encodeURIComponent(objectPath);

        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${firstToken}`;
        this.logger.log(
          `Upload completed successfully to Firebase Storage bucket "${bucket}".`,
        );
        return downloadUrl;
      }

      throw new Error(
        'No downloadTokens found in object metadata after upload.',
      );
    } catch (firebaseErr: any) {
      this.logger.error(
        `Firebase Storage upload failed: ${firebaseErr.message}`,
      );
      throw new BadGatewayException({
        code: 'STORAGE_FAILED',
        message: 'Upload thất bại, vui lòng thử lại',
      });
    }
  }

  /**
   * Upload video to storage.
   * Uploads to users/{userId}/moments/videos/{videoName}.mp4 across candidate buckets.
   */
  async uploadMomentVideo(
    userId: string,
    idToken: string,
    video: ValidatedVideo,
  ): Promise<string> {
    const videoName = this.generateStorageFilename(video.extension);

    this.logger.log(
      `Starting upload for moment video: ${videoName} (User: ${userId})...`,
    );

    try {
      const { uploadUrl, bucket } = await this.apiClient.initResumableUpload(
        userId,
        idToken,
        videoName,
        video.size,
        video.contentType,
        'videos',
      );

      await this.apiClient.uploadBinaryBuffer(uploadUrl, video.buffer);

      const metadata = await this.apiClient.getStorageMetadata(
        userId,
        idToken,
        videoName,
        bucket,
        'videos',
      );

      if (metadata.downloadTokens) {
        const firstToken = metadata.downloadTokens.split(',')[0].trim();
        const objectPath = `users/${userId}/moments/videos/${videoName}`;
        const encodedPath = encodeURIComponent(objectPath);

        const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${firstToken}`;
        this.logger.log(
          `Video upload completed successfully to Firebase Storage bucket "${bucket}".`,
        );
        return downloadUrl;
      }

      throw new Error(
        'No downloadTokens found in object metadata after video upload.',
      );
    } catch (firebaseErr: any) {
      this.logger.error(
        `Firebase Storage video upload failed: ${firebaseErr.message}`,
      );
      throw new BadGatewayException({
        code: 'STORAGE_FAILED',
        message: 'Upload video thất bại, vui lòng thử lại',
      });
    }
  }
}
