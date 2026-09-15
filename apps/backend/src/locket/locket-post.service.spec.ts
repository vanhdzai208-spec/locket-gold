import { LocketPostService } from './locket-post.service';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { LocketStorageService } from './locket-storage.service';

describe('LocketPostService', () => {
  let postService: LocketPostService;
  let mockApiClient: Partial<LocketApiClient>;
  let mockAuthService: Partial<LocketAuthService>;
  let mockStorageService: Partial<LocketStorageService>;

  beforeEach(() => {
    mockApiClient = {
      postMomentV2: jest.fn(),
    };
    mockAuthService = {
      getValidAccessToken: jest.fn(),
    };
    mockStorageService = {
      validateImage: jest.fn(),
      uploadMomentImage: jest.fn(),
    };

    postService = new LocketPostService(
      mockApiClient as LocketApiClient,
      mockAuthService as LocketAuthService,
      mockStorageService as LocketStorageService,
    );
  });

  describe('buildMomentPayload', () => {
    const fakeUrl =
      'https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2F123%2Fmoments%2Fthumbnails%2Fpic.webp?alt=media&token=token123';

    it('should build payload without caption correctly', () => {
      const payload = postService.buildMomentPayload(fakeUrl, '');
      expect(payload).toEqual({
        thumbnail_url: fakeUrl,
        sent_to_all: true,
        recipients: [],
        overlays: [],
      });
    });

    it('should build payload with caption and standard overlay format', () => {
      const caption = 'Hello Locket!';
      const payload = postService.buildMomentPayload(fakeUrl, caption);

      expect(payload.thumbnail_url).toBe(fakeUrl);
      expect(payload.caption).toBe(caption);
      expect(payload.recipients).toEqual([]);
      expect(payload.overlays).toHaveLength(1);
      expect(payload.overlays[0]).toMatchObject({
        overlay_id: 'caption:standard',
        overlay_type: 'caption',
        data: {
          text: caption,
          text_color: '#FFFFFFE6',
          type: 'standard',
          max_lines: 4,
        },
      });
    });

    it('should build payload with selective recipients (excluded friends)', () => {
      const payload = postService.buildMomentPayload(fakeUrl, 'Secret', ['friend-1', 'friend-2']);
      expect(payload.sent_to_all).toBe(false);
      expect(payload.recipients).toEqual(['friend-1', 'friend-2']);
      expect(payload.caption).toBe('Secret');
    });

    it('should include video_url in payload when video is provided', () => {
      const videoUrl = 'https://firebasestorage.googleapis.com/v0/b/locket-video/o/video.mp4?alt=media&token=xyz';
      const payload = postService.buildMomentPayload(
        fakeUrl,
        'Watch this video!',
        [],
        videoUrl,
      );
      expect(payload.thumbnail_url).toBe(fakeUrl);
      expect(payload.video_url).toBe(videoUrl);
      expect(payload.caption).toBe('Watch this video!');
    });
  });

  describe('postMoment with Video', () => {
    it('should process video and thumbnail, upload both, and invoke postMomentV2', async () => {
      (mockAuthService.getValidAccessToken as jest.Mock).mockResolvedValue({
        idToken: 'token_valid',
        updatedSession: null,
      });

      mockStorageService.validateVideo = jest.fn().mockReturnValue({
        buffer: Buffer.from('video_bytes'),
        contentType: 'video/mp4',
        extension: 'mp4',
        size: 11,
      });
      mockStorageService.validateImage = jest.fn().mockReturnValue({
        buffer: Buffer.from('thumb_bytes'),
        contentType: 'image/webp',
        extension: 'webp',
        size: 11,
      });
      mockStorageService.uploadMomentImage = jest.fn().mockResolvedValue('https://storage/thumb.webp');
      mockStorageService.uploadMomentVideo = jest.fn().mockResolvedValue('https://storage/vid.mp4');

      (mockApiClient.postMomentV2 as jest.Mock).mockResolvedValue({
        result: {
          data: {
            canonical_uid: 'moment_video_123',
            date: { _seconds: 1700000000 },
          },
        },
      });

      const session = {
        userId: 'my_user_id',
        email: 'user@test.com',
        idToken: 'token_valid',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
      };

      const result = await postService.postMoment(
        session,
        Buffer.from('video_bytes'),
        'video/mp4',
        'Awesome clip',
        [],
        Buffer.from('thumb_bytes'),
        'image/webp',
      );

      expect(result.momentUid).toBe('moment_video_123');
      expect(result.downloadUrl).toBe('https://storage/thumb.webp');
      expect(result.videoUrl).toBe('https://storage/vid.mp4');
      expect(mockStorageService.uploadMomentImage).toHaveBeenCalled();
      expect(mockStorageService.uploadMomentVideo).toHaveBeenCalled();
      expect(mockApiClient.postMomentV2).toHaveBeenCalledWith(
        'token_valid',
        expect.objectContaining({
          thumbnail_url: 'https://storage/thumb.webp',
          video_url: 'https://storage/vid.mp4',
          caption: 'Awesome clip',
        }),
      );
    });
  });
});
