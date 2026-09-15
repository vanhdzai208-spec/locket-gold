import { NotFoundException } from '@nestjs/common';
import { LocketFeedService } from './locket-feed.service';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { SessionData } from '../session/session.service';

describe('LocketFeedService', () => {
  let feedService: LocketFeedService;
  let mockApiClient: Partial<LocketApiClient>;
  let mockAuthService: Partial<LocketAuthService>;

  const mockSession: SessionData = {
    userId: 'my-user-uid',
    email: 'test@example.com',
    displayName: 'My Name',
    photoUrl: 'https://cdn.example.com/me.jpg',
    idToken: 'initial-id-token',
    refreshToken: 'initial-refresh-token',
    expiresAt: Date.now() + 3600000,
  };

  beforeEach(() => {
    mockApiClient = {
      getLatestMoments: jest.fn(),
      getHistoryEntries: jest.fn().mockResolvedValue({ documents: [] }),
      getHistoryEntry: jest.fn().mockResolvedValue(null),
      getMomentViews: jest.fn().mockResolvedValue({ result: { data: { moment_views: [], count: 0 }, status: 200 } }),
      getMomentReactions: jest.fn().mockResolvedValue([]),
      fetchUserV2: jest.fn(),
      listFriendUids: jest.fn().mockResolvedValue([]),
      callLocketEndpoint: jest.fn(),
      getFirestoreDocOrCollection: jest.fn().mockResolvedValue({}),
      deleteMomentV2: jest.fn().mockResolvedValue({ result: { data: ['deleted-uid'] } }),
    };
    mockAuthService = {
      getValidAccessToken: jest.fn().mockResolvedValue({
        idToken: 'initial-id-token',
        updatedSession: null,
      }),
      forceRefreshToken: jest.fn(),
    };

    feedService = new LocketFeedService(
      mockApiClient as LocketApiClient,
      mockAuthService as LocketAuthService,
    );
  });

  it('should fetch moments and enrich author details', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1']);
    (mockApiClient.getLatestMoments as jest.Mock).mockImplementation(async (_token, users) => {
      if (users && users.includes('friend-1')) {
        return {
          result: {
            status: 200,
            missed_moments_count: 1,
            data: [
              {
                canonical_uid: 'moment-1',
                user: 'friend-1',
                thumbnail_url: 'https://cdn.example.com/moment1.webp',
                caption: 'Having coffee!',
                date: { _seconds: 1710000000, _nanoseconds: 0 },
              },
            ],
          },
        };
      }
      if (users && users.includes('my-user-uid')) {
        return {
          result: {
            status: 200,
            missed_moments_count: 1,
            data: [
              {
                canonical_uid: 'moment-2',
                user: 'my-user-uid',
                thumbnail_url: 'https://cdn.example.com/moment2.webp',
                caption: 'My sunny day',
                date: { _seconds: 1710005000, _nanoseconds: 0 },
              },
            ],
          },
        };
      }
      return {
        result: {
          status: 200,
          data: [],
        },
      };
    });

    (mockApiClient.fetchUserV2 as jest.Mock).mockResolvedValue({
      result: {
        status: 200,
        data: {
          uid: 'friend-1',
          first_name: 'John',
          last_name: 'Doe',
          profile_picture_url: 'https://cdn.example.com/john.jpg',
        },
      },
    });

    const result = await feedService.getFeed(mockSession);

    expect(result.feed.items).toHaveLength(2);

    // Moment 2 has larger timestamp, so should be first
    const firstItem = result.feed.items[0];
    expect(firstItem.id).toBe('moment-2');
    expect(firstItem.isMine).toBe(true);
    expect(firstItem.authorName).toBe('My Name');
    expect(firstItem.authorAvatarUrl).toBe('https://cdn.example.com/me.jpg');

    const secondItem = result.feed.items[1];
    expect(secondItem.id).toBe('moment-1');
    expect(secondItem.isMine).toBe(false);
    expect(secondItem.authorName).toBe('John Doe');
    expect(secondItem.authorAvatarUrl).toBe('https://cdn.example.com/john.jpg');
    expect(secondItem.caption).toBe('Having coffee!');
  });

  it('should force refresh token and retry if TOKEN_EXPIRED is thrown', async () => {
    (mockApiClient.listFriendUids as jest.Mock)
      .mockRejectedValueOnce(new Error('TOKEN_EXPIRED: Please sign in again'))
      .mockResolvedValue([]);

    (mockApiClient.getLatestMoments as jest.Mock).mockResolvedValue({
      result: {
        status: 200,
        data: [],
      },
    });

    (mockAuthService.forceRefreshToken as jest.Mock).mockResolvedValue({
      idToken: 'fresh-id-token',
      updatedSession: {
        ...mockSession,
        idToken: 'fresh-id-token',
      },
    });

    const result = await feedService.getFeed(mockSession);

    expect(mockAuthService.forceRefreshToken).toHaveBeenCalledWith(mockSession);
    expect(result.updatedSession?.idToken).toBe('fresh-id-token');
  });

  describe('getProxyImageStream SSRF protection', () => {
    it('should reject invalid or non-whitelisted URLs', async () => {
      await expect(feedService.getProxyImageStream('ftp://invalid')).rejects.toThrow();
      await expect(feedService.getProxyImageStream('')).rejects.toThrow('Image URL is required');
      await expect(
        feedService.getProxyImageStream('https://evil.com/malicious.jpg'),
      ).rejects.toThrow('not permitted for proxying');
    });

    it('should reject URLs resolving to private or cloud metadata IPs', async () => {
      const dns = require('dns');
      const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '169.254.169.254', family: 4 },
      ]);

      await expect(
        feedService.getProxyImageStream('https://firebasestorage.googleapis.com/test.jpg'),
      ).rejects.toThrow('resolved to private or reserved IP');

      lookupSpy.mockRestore();
    });

    it('should reject response when Content-Type is not an image', async () => {
      const dns = require('dns');
      const axios = require('axios');
      const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '142.250.190.46', family: 4 },
      ]);
      const mockDestroy = jest.fn();
      const axiosSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce({
        data: { destroy: mockDestroy },
        headers: { 'content-type': 'application/json' },
      });

      await expect(
        feedService.getProxyImageStream('https://firebasestorage.googleapis.com/data.json'),
      ).rejects.toThrow('only safe raster images');

      expect(mockDestroy).toHaveBeenCalled();

      lookupSpy.mockRestore();
      axiosSpy.mockRestore();
    });

    it('should reject response when Content-Type is image/svg+xml (BLOCKER-4 XSS protection)', async () => {
      const dns = require('dns');
      const axios = require('axios');
      const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '142.250.190.46', family: 4 },
      ]);
      const mockDestroy = jest.fn();
      const axiosSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce({
        data: { destroy: mockDestroy },
        headers: { 'content-type': 'image/svg+xml' },
      });

      await expect(
        feedService.getProxyImageStream('https://storage.googleapis.com/bucket/xss.svg'),
      ).rejects.toThrow('SVG and non-image formats are blocked');

      expect(mockDestroy).toHaveBeenCalled();

      lookupSpy.mockRestore();
      axiosSpy.mockRestore();
    });

    it('should reject when request returns 302 redirect (BLOCKER-4 SSRF protection)', async () => {
      const dns = require('dns');
      const axios = require('axios');
      const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '142.250.190.46', family: 4 },
      ]);
      const redirectError: any = new Error('maxRedirects exceeded');
      redirectError.response = { status: 302 };
      const axiosSpy = jest.spyOn(axios, 'get').mockRejectedValueOnce(redirectError);

      await expect(
        feedService.getProxyImageStream('https://firebasestorage.googleapis.com/redirect-target'),
      ).rejects.toThrow('Redirects are forbidden for proxied images');

      lookupSpy.mockRestore();
      axiosSpy.mockRestore();
    });

    it('should succeed when domain is whitelisted and content-type is image', async () => {
      const dns = require('dns');
      const axios = require('axios');
      const lookupSpy = jest.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([
        { address: '142.250.190.46', family: 4 },
      ]);
      const mockStream = { pipe: jest.fn() };
      const axiosSpy = jest.spyOn(axios, 'get').mockResolvedValueOnce({
        data: mockStream,
        headers: {
          'content-type': 'image/webp',
          'content-length': '12345',
        },
      });

      const result = await feedService.getProxyImageStream(
        'https://firebasestorage.googleapis.com/v0/b/bucket/image.webp',
      );

      expect(result.contentType).toBe('image/webp');
      expect(result.contentLength).toBe('12345');
      expect(result.stream).toBe(mockStream);

      lookupSpy.mockRestore();
      axiosSpy.mockRestore();
    });
  });

  it('should fetch moments from Firestore history entries and deduplicate', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1']);
    (mockApiClient.getHistoryEntries as jest.Mock).mockImplementation(async (_token, uid) => {
      if (uid === 'my-user-uid') {
        return {
          documents: [
            {
              name: 'projects/locket-4252a/databases/locket/documents/history/my-user-uid/entries/entry-1',
              fields: {
                canonical_uid: { stringValue: 'canonical-hist-1' },
                user: { stringValue: 'my-user-uid' },
                thumbnail_url: { stringValue: 'https://cdn.example.com/hist1.webp' },
                caption: { stringValue: 'Historical photo 1' },
                date: { timestampValue: '2024-03-10T10:00:00Z' },
              },
            },
          ],
        };
      }
      if (uid === 'friend-1') {
        return {
          documents: [
            {
              name: 'projects/locket-4252a/databases/locket/documents/history/friend-1/entries/entry-2',
              fields: {
                canonical_uid: { stringValue: 'canonical-hist-2' },
                user: { stringValue: 'friend-1' },
                thumbnail_url: { stringValue: 'https://cdn.example.com/hist2.webp' },
                overlays: {
                  arrayValue: {
                    values: [
                      {
                        mapValue: {
                          fields: {
                            alt_text: { stringValue: 'Friend history moment' },
                          },
                        },
                      },
                    ],
                  },
                },
                date: { timestampValue: '2024-03-11T12:00:00Z' },
              },
            },
          ],
        };
      }
      return { documents: [] };
    });

    (mockApiClient.getLatestMoments as jest.Mock).mockResolvedValue({
      result: { status: 200, data: [] },
    });

    (mockApiClient.fetchUserV2 as jest.Mock).mockResolvedValue({
      result: {
        status: 200,
        data: {
          uid: 'friend-1',
          first_name: 'Jane',
          last_name: 'Smith',
        },
      },
    });

    const result = await feedService.getFeed(mockSession);
    expect(result.feed.items).toHaveLength(2);
    expect(result.feed.items[0].id).toBe('canonical-hist-2');
    expect(result.feed.items[0].caption).toBe('Friend history moment');
    expect(result.feed.items[0].authorName).toBe('Jane Smith');
    expect(result.feed.items[1].id).toBe('canonical-hist-1');
    expect(result.feed.items[1].isMine).toBe(true);
  });

  it('should return friends list with names and avatars', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1', 'friend-2']);
    (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation(async (_token, uid) => {
      if (uid === 'friend-1') {
        return {
          result: {
            data: { uid: 'friend-1', first_name: 'Alice', last_name: 'Smith' },
          },
        };
      }
      return {
        result: {
          data: { uid: 'friend-2', first_name: 'Bob', username: 'bobbie' },
        },
      };
    });

    const friends = await feedService.getFriendsList(mockSession);
    expect(friends).toHaveLength(2);
    expect(friends[0].name).toBe('Alice Smith');
    expect(friends[1].name).toBe('Bob');
  });

  it('should return moment details with viewers and excluded friends', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1', 'friend-2', 'friend-3']);
    (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation(async (_token, uid) => {
      return {
        result: {
          data: { uid, first_name: `User_${uid}` },
        },
      };
    });

    // Moment was sent only to friend-1, excluding friend-2 and friend-3
    (mockApiClient.getHistoryEntries as jest.Mock).mockResolvedValue({
      documents: [
        {
          name: 'projects/locket-4252a/databases/locket/documents/history/my-user-uid/entries/test-moment-1',
          fields: {
            canonical_uid: { stringValue: 'test-moment-1' },
            user: { stringValue: 'my-user-uid' },
            caption: { stringValue: 'Selective moment' },
            recipients: {
              arrayValue: {
                values: [{ stringValue: 'friend-1' }],
              },
            },
            sent_to_all: { booleanValue: false },
          },
        },
      ],
    });

    (mockApiClient.getMomentViews as jest.Mock).mockResolvedValue({
      result: {
        data: {
          moment_views: [
            { user: 'friend-1', viewed_at: '2024-03-10T12:00:00Z' },
          ],
          count: 1,
        },
        status: 200,
      },
    });

    (mockApiClient.getMomentReactions as jest.Mock).mockResolvedValue([
      {
        fields: {
          user: { stringValue: 'friend-1' },
          reaction: { stringValue: '❤️' },
        },
      },
    ]);

    const details = await feedService.getMomentDetails(mockSession, 'test-moment-1');
    expect(details.isMine).toBe(true);
    expect(details.viewers).toHaveLength(1);
    expect(details.viewers[0].uid).toBe('friend-1');
    expect(details.viewers[0].reaction).toBe('❤️');
    expect(details.audience.sentToAll).toBe(false);
    expect(details.audience.allowedFriends.map((f) => f.uid)).toEqual(['friend-1']);
    expect(details.audience.excludedFriends.map((f) => f.uid)).toEqual(['friend-2', 'friend-3']);
  });

  it('should deduce excluded friends from viewers when selective post has no recipients array in Firestore', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1', 'friend-2']);
    (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation((_, uid) => ({
      result: { data: { first_name: uid, username: uid } },
    }));

    (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue({
      fields: {
        canonical_uid: { stringValue: 'mobile-moment-1' },
        user: { stringValue: 'my-user-uid' },
        sent_to_all: { booleanValue: false },
        sent_to_self_only: { booleanValue: false },
      },
    });

    (mockApiClient.getMomentViews as jest.Mock).mockResolvedValue({
      result: {
        data: {
          moment_views: [{ user: 'friend-1', viewed_at: '2024-03-10T12:00:00Z' }],
          count: 1,
        },
        status: 200,
      },
    });

    const details = await feedService.getMomentDetails(mockSession, 'mobile-moment-1');
    expect(details.audience.sentToAll).toBe(false);
    expect(details.audience.allowedFriends.map((f) => f.uid)).toEqual(['friend-1']);
    expect(details.audience.excludedFriends.map((f) => f.uid)).toEqual(['friend-2']);
  });

  it('should resolve former friends who viewed a selective post and include them in allowedFriends', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1', 'friend-2']);
    (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation(async (_, uid) => {
      if (uid === 'former-friend-99') {
        return {
          result: {
            data: {
              uid: 'former-friend-99',
              first_name: 'Meow',
              last_name: 'Meow',
              username: 'arian.iris',
              profile_picture_url: 'https://example.com/meow.jpg',
            },
          },
        };
      }
      return {
        result: { data: { first_name: uid, username: uid } },
      };
    });

    (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue({
      fields: {
        canonical_uid: { stringValue: 'moment-with-former-friend' },
        user: { stringValue: 'my-user-uid' },
        sent_to_all: { booleanValue: false },
        sent_to_self_only: { booleanValue: false },
      },
    });

    (mockApiClient.getMomentViews as jest.Mock).mockResolvedValue({
      result: {
        data: {
          moment_views: [{ user: 'former-friend-99', viewed_at: '2026-03-22T17:00:00Z' }],
          count: 1,
        },
        status: 200,
      },
    });
    (mockApiClient.getMomentReactions as jest.Mock).mockResolvedValue([]);

    const details = await feedService.getMomentDetails(mockSession, 'moment-with-former-friend');
    expect(details.audience.sentToAll).toBe(false);
    expect(details.viewers).toHaveLength(1);
    expect(details.viewers[0].uid).toBe('former-friend-99');
    expect(details.viewers[0].name).toBe('Meow Meow');
    expect(details.viewers[0].isFormerFriend).toBe(true);
    expect(details.audience.allowedFriends).toHaveLength(1);
    expect(details.audience.allowedFriends[0].uid).toBe('former-friend-99');
    expect(details.audience.allowedFriends[0].isFormerFriend).toBe(true);
    expect(details.audience.excludedFriends.map((f) => f.uid)).toEqual(['friend-1', 'friend-2']);
  });

  it('should compute unviewed friends when post is public to all friends', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1', 'friend-2', 'friend-3']);
    (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation((_, uid) => ({
      result: { data: { first_name: uid, username: uid } },
    }));

    (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue({
      fields: {
        canonical_uid: { stringValue: 'public-moment' },
        user: { stringValue: 'my-user-uid' },
        sent_to_all: { booleanValue: true },
      },
    });

    (mockApiClient.getMomentViews as jest.Mock).mockResolvedValue({
      result: {
        data: {
          moment_views: [{ user: 'friend-1', viewed_at: '2026-03-22T17:00:00Z' }],
          count: 1,
        },
        status: 200,
      },
    });
    (mockApiClient.getMomentReactions as jest.Mock).mockResolvedValue([]);

    const details = await feedService.getMomentDetails(mockSession, 'public-moment');
    expect(details.audience.sentToAll).toBe(true);
    expect(details.audience.allowedFriends).toHaveLength(3);
    expect(details.audience.excludedFriends).toHaveLength(0);
    expect(details.audience.unviewedFriends?.map((f) => f.uid)).toEqual(['friend-2', 'friend-3']);
  });

  it('should throw NotFoundException (SEC-04) if moment is not owned by user and never call views/reactions', async () => {
    (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend-1']);
    (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue(null);
    (mockApiClient.getHistoryEntries as jest.Mock).mockResolvedValue({ documents: [] });
    (mockApiClient.getMomentViews as jest.Mock).mockClear();
    (mockApiClient.getMomentReactions as jest.Mock).mockClear();

    await expect(
      feedService.getMomentDetails(mockSession, 'foreign-user-moment-id'),
    ).rejects.toThrow(NotFoundException);

    expect(mockApiClient.getMomentViews).not.toHaveBeenCalled();
    expect(mockApiClient.getMomentReactions).not.toHaveBeenCalled();
  });

  describe('deleteMoment', () => {
    it('should call deleteMomentV2 with ownerUid and return success if owned by user', async () => {
      (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue({
        fields: {
          canonical_uid: { stringValue: 'moment-to-delete-123' },
          user: { stringValue: mockSession.userId },
        },
      });
      (mockApiClient.getHistoryEntries as jest.Mock).mockResolvedValue({ documents: [] });

      const result = await feedService.deleteMoment(mockSession, 'moment-to-delete-123');

      expect(mockApiClient.deleteMomentV2).toHaveBeenCalledWith(
        'initial-id-token',
        'moment-to-delete-123',
        mockSession.userId,
        true,
      );
      expect(result).toEqual({
        success: true,
        momentUid: 'moment-to-delete-123',
        deletedCount: 1,
        deletedUids: ['moment-to-delete-123'],
        updatedSession: null,
      });
    });

    it('should throw NotFoundException (BLOCKER-1 IDOR) and NEVER call deleteMomentV2 if moment is not owned by user', async () => {
      (mockApiClient.getHistoryEntry as jest.Mock).mockResolvedValue(null);
      (mockApiClient.getHistoryEntries as jest.Mock).mockResolvedValue({ documents: [] });
      (mockApiClient.deleteMomentV2 as jest.Mock).mockClear();

      await expect(
        feedService.deleteMoment(mockSession, 'victim-user-moment-456'),
      ).rejects.toThrow(NotFoundException);

      expect(mockApiClient.deleteMomentV2).not.toHaveBeenCalled();
    });

    it('should throw error if momentUid is missing', async () => {
      await expect(feedService.deleteMoment(mockSession, '')).rejects.toThrow('Moment UID is required');
    });
  });
});
