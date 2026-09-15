import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocketStorageService } from './locket-storage.service';
import { LocketApiClient } from './locket-api.client';

describe('LocketStorageService', () => {
  let storageService: LocketStorageService;
  let mockApiClient: Partial<LocketApiClient>;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockApiClient = {
      initResumableUpload: jest.fn(),
      uploadBinaryBuffer: jest.fn(),
      getStorageMetadata: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('locket-img'),
    };

    storageService = new LocketStorageService(
      mockApiClient as LocketApiClient,
      mockConfigService as ConfigService,
    );
  });

  describe('validateImage', () => {
    it('should correctly identify a valid WebP image', () => {
      // Create mock WebP header: RIFF....WEBP
      const buffer = Buffer.alloc(32);
      buffer.write('RIFF', 0);
      buffer.write('WEBP', 8);

      const result = storageService.validateImage(buffer);
      expect(result.contentType).toBe('image/webp');
      expect(result.extension).toBe('webp');
    });

    it('should correctly identify a valid JPEG image', () => {
      // Create mock JPEG header: FF D8 FF
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      const result = storageService.validateImage(buffer);
      expect(result.contentType).toBe('image/jpeg');
      expect(result.extension).toBe('jpeg');
    });

    it('should correctly identify a valid PNG image', () => {
      // Create mock PNG header: 89 50 4E 47 0D 0A 1A 0A
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]);

      const result = storageService.validateImage(buffer);
      expect(result.contentType).toBe('image/png');
      expect(result.extension).toBe('png');
    });

    it('should reject invalid files with unsupported magic bytes', () => {
      const fakeExecutable = Buffer.from('MZ...fake_binary_executable');
      expect(() => {
        storageService.validateImage(fakeExecutable);
      }).toThrow(BadRequestException);
    });

    it('should reject files that exceed maximum size', () => {
      // 5MB buffer
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024);
      oversizedBuffer.write('RIFF', 0);
      oversizedBuffer.write('WEBP', 8);

      expect(() => {
        storageService.validateImage(oversizedBuffer);
      }).toThrow(BadRequestException);
    });
  });

  describe('validateVideo', () => {
    it('should correctly identify a valid MP4 video via ftyp box signature', () => {
      // Create mock MP4 header: 4 bytes length, 'ftyp', 'isom'
      const buffer = Buffer.alloc(32);
      buffer.writeUInt32BE(32, 0);
      buffer.write('ftyp', 4);
      buffer.write('isom', 8);

      const result = storageService.validateVideo(buffer);
      expect(result.contentType).toBe('video/mp4');
      expect(result.extension).toBe('mp4');
    });

    it('should correctly identify a valid WebM video via EBML magic signature', () => {
      // WebM: 1A 45 DF A3
      const buffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);

      const result = storageService.validateVideo(buffer);
      expect(result.contentType).toBe('video/webm');
      expect(result.extension).toBe('webm');
    });

    it('should reject non-video or corrupt binary files', () => {
      const corrupt = Buffer.from('NOT_A_VIDEO_FILE_DATA');
      expect(() => {
        storageService.validateVideo(corrupt);
      }).toThrow(BadRequestException);
    });

    it('should reject video exceeding 15MB limit', () => {
      const oversized = Buffer.alloc(16 * 1024 * 1024);
      oversized.write('ftyp', 4);
      oversized.write('mp42', 8);

      expect(() => {
        storageService.validateVideo(oversized);
      }).toThrow(BadRequestException);
    });
  });

  describe('uploadMomentVideo', () => {
    it('should upload video and return download URL', async () => {
      (mockApiClient.initResumableUpload as jest.Mock).mockResolvedValue({
        uploadUrl: 'https://upload.goog/session_123',
        bucket: 'locket-video',
      });
      (mockApiClient.uploadBinaryBuffer as jest.Mock).mockResolvedValue(undefined);
      (mockApiClient.getStorageMetadata as jest.Mock).mockResolvedValue({
        downloadTokens: 'token_video_abc,token_second',
      });

      const video = {
        buffer: Buffer.from('mock_video_bytes'),
        contentType: 'video/mp4' as const,
        extension: 'mp4' as const,
        size: 16,
      };

      const url = await storageService.uploadMomentVideo(
        'user_123',
        'token_xyz',
        video,
      );

      expect(url).toContain('https://firebasestorage.googleapis.com/v0/b/locket-video/o/');
      expect(url).toContain('token=token_video_abc');
      expect(mockApiClient.initResumableUpload).toHaveBeenCalledWith(
        'user_123',
        'token_xyz',
        expect.stringMatching(/^[a-zA-Z0-9]{20}\.mp4$/),
        16,
        'video/mp4',
        'videos',
      );
    });
  });
});
