import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoldService } from './gold.service';
import { LocketApiClient } from '../locket/locket-api.client';
import axios from 'axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoldService', () => {
  let service: GoldService;
  let apiClientMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    apiClientMock = {
      signInWithPassword: jest.fn().mockResolvedValue({
        idToken: 'fake_bot_id_token',
        refreshToken: 'fake_bot_refresh_token',
        expiresIn: '3600',
      }),
      refreshToken: jest.fn().mockResolvedValue({
        id_token: 'refreshed_bot_id_token',
        refresh_token: 'refreshed_bot_refresh_token',
        expires_in: '3600',
      }),
      callLocketEndpoint: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'LOCKET_BOT_EMAIL') return 'bot@example.com';
        if (key === 'LOCKET_BOT_PASSWORD') return 'bot_password';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoldService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: LocketApiClient, useValue: apiClientMock },
      ],
    }).compile();

    service = module.get<GoldService>(GoldService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('previewUserByUsername', () => {
    it('should throw BadRequestException if username is empty', async () => {
      await expect(service.previewUserByUsername('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return user preview details if found', async () => {
      apiClientMock.callLocketEndpoint.mockResolvedValue({
        result: {
          data: {
            uid: 'uid_12345',
            username: 'hung_dev',
            first_name: 'Hung',
            last_name: 'Nguyen',
            profile_picture_url: 'https://example.com/avatar.jpg',
          },
        },
      });

      const res = await service.previewUserByUsername('@hung_dev');
      expect(res.uid).toBe('uid_12345');
      expect(res.username).toBe('hung_dev');
      expect(res.displayName).toBe('Hung Nguyen');
      expect(apiClientMock.callLocketEndpoint).toHaveBeenCalledWith(
        'fake_bot_id_token',
        'getUserByUsername',
        { username: 'hung_dev' },
      );
    });

    it('should throw NotFoundException if user not found in Locket response', async () => {
      apiClientMock.callLocketEndpoint.mockResolvedValue({
        result: { data: null },
      });

      await expect(service.previewUserByUsername('unknown_user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restorePurchase', () => {
    it('should call RevenueCat API and return success when Gold entitlement exists', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          subscriber: {
            entitlements: {
              Gold: {
                product_identifier: 'locket_3600_1y',
                expires_date: '2027-09-15T00:00:00Z',
              },
            },
          },
        },
      });
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          subscriber: {
            entitlements: {
              Gold: {
                product_identifier: 'locket_3600_1y',
                expires_date: '2027-09-15T00:00:00Z',
              },
            },
          },
        },
      });

      const res = await service.restorePurchase('target_user_uid', '1y');
      expect(res.success).toBe(true);
      expect(res.productId).toBe('locket_3600_1y');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should support 1m package as well', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {
          subscriber: {
            entitlements: {
              Gold: {
                product_identifier: 'locket_199_1m',
                expires_date: '2026-10-15T00:00:00Z',
              },
            },
          },
        },
      });
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          subscriber: {
            entitlements: {
              Gold: {
                product_identifier: 'locket_199_1m',
                expires_date: '2026-10-15T00:00:00Z',
              },
            },
          },
        },
      });

      const res = await service.restorePurchase('target_user_uid', '1m');
      expect(res.success).toBe(true);
      expect(res.productId).toBe('locket_199_1m');
    });

    it('should check master Gold status correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          subscriber: {
            entitlements: {
              Gold: {
                product_identifier: 'locket_3600_1y',
                expires_date: '2027-09-15T00:00:00Z',
              },
            },
          },
        },
      });

      const valid28CharMasterUid = 'CustomMasterUid1234567890123';
      const masterStatus = await service.checkMasterStatus(valid28CharMasterUid);
      expect(masterStatus.masterUid).toBe(valid28CharMasterUid);
      expect(masterStatus.hasGold).toBe(true);
      expect(masterStatus.isStillValid).toBe(true);
      expect(masterStatus.productId).toBe('locket_3600_1y');
    });
  });

  describe('Queue Management', () => {
    it('should add item to queue and report status correctly', () => {
      const status = service.addToQueue('test_user', '1y');
      expect(status.ticketId).toBeDefined();
      expect(status.status).toBe('waiting');
      expect(status.position).toBeGreaterThanOrEqual(0);

      const queried = service.getQueueStatus(status.ticketId);
      expect(queried.ticketId).toBe(status.ticketId);
    });
  });
});
