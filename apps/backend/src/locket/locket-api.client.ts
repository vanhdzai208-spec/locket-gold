import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface FirebaseVerifyPasswordResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
  displayName?: string;
}

export interface FirebaseRefreshTokenResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
  project_id: string;
}

export interface FirebaseAccountInfoUser {
  localId: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface FirebaseAccountInfoResponse {
  users: FirebaseAccountInfoUser[];
}

export interface StorageMetadataResponse {
  name: string;
  bucket: string;
  downloadTokens?: string;
  size?: string;
  contentType?: string;
}

export interface PostMomentV2Response {
  result?: {
    status?: number;
    moment_uid?: string;
    created_at?: number;
    data?: {
      canonical_uid?: string;
      user?: string;
      thumbnail_url?: string;
      date?: any;
      caption?: string;
      image_url?: string;
      [key: string]: any;
    };
    errors?: string[];
    [key: string]: any;
  };
  error?: {
    message?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface LocketMomentRaw {
  canonical_uid: string;
  user: string;
  date: { _seconds: number; _nanoseconds: number } | string;
  md5?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_url?: string;
  caption?: string;
  recipients?: string[];
  sent_to_all?: boolean;
  [key: string]: any;
}

export interface GetLatestMomentsResponse {
  result?: {
    data?: LocketMomentRaw[];
    missed_moments_count?: number;
    sync_token?: string;
    status?: number;
  };
  error?: {
    message?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface GetLatestMomentsOptions {
  syncToken?: string;
  lastFetch?: number;
  shouldCountMissedMoments?: boolean;
  excludedUsers?: string[];
}

export interface LocketUserRaw {
  uid: string;
  first_name: string | null;
  last_name: string | null;
  badge?: string | null;
  profile_picture_url?: string;
  username?: string | null;
  [key: string]: any;
}

export interface FetchUserV2Response {
  result?: {
    data?: LocketUserRaw;
    errors?: string[];
    status?: number;
  };
  error?: {
    message?: string;
    status?: string;
    [key: string]: any;
  };
}

export interface HistoryEntriesResponse {
  documents?: Array<{
    name: string;
    fields: Record<string, any>;
    createTime: string;
    updateTime: string;
  }>;
  nextPageToken?: string;
}

export interface GetHistoryEntriesOptions {
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
}

export interface MomentViewRaw {
  user?: string;
  viewed_at?: any;
  [key: string]: any;
}

export interface GetMomentViewsApiResponse {
  result?: {
    data?: {
      moment_views?: MomentViewRaw[];
      count?: number;
    };
    errors?: string[];
    status?: number;
  };
  error?: {
    message?: string;
    status?: string;
  };
}

@Injectable()
export class LocketApiClient {
  private readonly logger = new Logger(LocketApiClient.name);
  private readonly axiosInstance: AxiosInstance;

  private readonly apiKey: string;
  private readonly projectId: string;
  private readonly locketBaseUrl: string;
  private readonly storageBucket: string;
  private readonly bundleId = 'com.locket.Locket';
  private readonly clientUserAgent =
    'com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3';
  private readonly authUserAgent =
    'FirebaseAuth.iOS/10.23.1 com.locket.Locket/1.82.0 iPhone/18.0 hw/iPhone12_1';

  private readonly appCheckToken?: string;
  private readonly iosAppHeaders: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    this.appCheckToken = this.configService.get<string>('FIREBASE_APPCHECK_TOKEN')?.trim();

    if (!this.appCheckToken && isProd) {
      this.logger.warn(
        '[SECURITY] FIREBASE_APPCHECK_TOKEN is not configured in production. Upstream Locket Cloud Functions requiring AppCheck validation may reject requests.',
      );
    }

    this.iosAppHeaders = {
      'User-Agent':
        'FirebaseAuth.iOS/10.23.1 com.locket.Locket/1.82.0 iPhone/18.0 hw/iPhone12_1',
      'X-Ios-Bundle-Identifier': 'com.locket.Locket',
      'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS',
      'X-Firebase-GMPID': '1:641029076083:ios:cc8eb46290d69b234fa606',
      ...(this.appCheckToken ? { 'X-Firebase-AppCheck': this.appCheckToken } : {}),
    };

    const envApiKey = this.configService.get<string>('FIREBASE_API_KEY')?.trim();
    this.apiKey = envApiKey || 'AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So';
    if (!envApiKey && isProd) {
      this.logger.warn(
        '[SECURITY] FIREBASE_API_KEY is not defined in environment; using public client key fallback.',
      );
    }

    this.projectId =
      this.configService.get<string>('FIREBASE_PROJECT_ID') || 'locket-4252a';
    this.locketBaseUrl =
      this.configService.get<string>('LOCKET_API_BASE_URL') ||
      'https://api.locketcamera.com';
    this.storageBucket =
      this.configService.get<string>('FIREBASE_STORAGE_BUCKET') || 'locket-img';

    this.axiosInstance = axios.create({
      timeout: 30000,
    });
  }

  /**
   * 1. Firebase Identity Toolkit: Sign In With Password
   */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<FirebaseVerifyPasswordResponse> {
    const url = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${this.apiKey}`;
    try {
      const response = await this.axiosInstance.post<FirebaseVerifyPasswordResponse>(
        url,
        {
          email,
          password,
          returnSecureToken: true,
          clientType: 'CLIENT_TYPE_IOS',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-ios-bundle-identifier': this.bundleId,
            'User-Agent': this.authUserAgent,
          },
        },
      );
      return response.data;
    } catch (error: any) {
      this.handleFirebaseError('signInWithPassword', error);
    }
  }

  /**
   * 2. Firebase Secure Token: Refresh ID Token
   */
  async refreshToken(refreshToken: string): Promise<FirebaseRefreshTokenResponse> {
    const url = `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`;
    try {
      const response = await this.axiosInstance.post<FirebaseRefreshTokenResponse>(
        url,
        {
          grantType: 'refresh_token',
          refreshToken,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-ios-bundle-identifier': this.bundleId,
          },
        },
      );
      return response.data;
    } catch (error: any) {
      this.handleFirebaseError('refreshToken', error);
    }
  }

  /**
   * 3. Firebase Identity Toolkit: Get Account Info
   */
  async getAccountInfo(idToken: string): Promise<FirebaseAccountInfoResponse> {
    const url = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${this.apiKey}`;
    try {
      const response = await this.axiosInstance.post<FirebaseAccountInfoResponse>(
        url,
        { idToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-ios-bundle-identifier': this.bundleId,
          },
        },
      );
      return response.data;
    } catch (error: any) {
      this.handleFirebaseError('getAccountInfo', error);
    }
  }

  /**
   * 4. Firebase Storage: Start Resumable Upload Session
   * Uses multi-strategy fallback across candidate buckets and headers.
   */
  async initResumableUpload(
    userId: string,
    idToken: string,
    imageName: string,
    contentLength: number,
    contentType: string = 'image/webp',
    folder: 'thumbnails' | 'videos' = 'thumbnails',
  ): Promise<{ uploadUrl: string; bucket: string }> {
    const objectPath = `users/${userId}/moments/${folder}/${imageName}`;
    const encodedPath = encodeURIComponent(objectPath);

    const isVideo = folder === 'videos';
    const strategies = isVideo
      ? [
          {
            name: 'locket-video / video/mp4 / gmpid-609',
            bucket: 'locket-video',
            bodyContentType: 'video/mp4',
            uploadContentType: 'video/mp4',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          {
            name: 'locket-img / video/mp4 / gmpid-609',
            bucket: this.storageBucket, // locket-img
            bodyContentType: 'video/mp4',
            uploadContentType: 'video/mp4',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          {
            name: 'locket-4252a.appspot.com / video/mp4 / gmpid-606',
            bucket: 'locket-4252a.appspot.com',
            bodyContentType: 'video/mp4',
            uploadContentType: 'video/mp4',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa606',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          {
            name: 'locket-video / video/* / gmpid-606',
            bucket: 'locket-video',
            bodyContentType: 'video/*',
            uploadContentType: 'video/mp4',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa606',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          {
            name: 'locket-img / video/* / gmpid-609',
            bucket: this.storageBucket,
            bodyContentType: 'video/*',
            uploadContentType: 'video/mp4',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.13.0',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)',
          },
        ]
      : [
          // 1. luckit spec: locket-img, image/webp body, gmpid fa609
          {
            name: 'locket-img / image/webp / gmpid-609',
            bucket: this.storageBucket, // locket-img
            bodyContentType: 'image/webp',
            uploadContentType: 'image/webp',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          // 2. LocketUploader_BE spec: locket-img, image/* body, gmpid fa609
          {
            name: 'locket-img / image/* / gmpid-609',
            bucket: this.storageBucket,
            bodyContentType: 'image/*',
            uploadContentType: 'image/webp',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.13.0',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)',
          },
          // 3. Official registered Firebase App ID: locket-img with gmpid fa606
          {
            name: 'locket-img / image/webp / gmpid-606',
            bucket: this.storageBucket,
            bodyContentType: 'image/webp',
            uploadContentType: 'image/webp',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa606',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          // 4. Default Firebase project bucket: locket-4252a.appspot.com (from naive-locket)
          {
            name: 'locket-4252a.appspot.com / image/webp / gmpid-606',
            bucket: 'locket-4252a.appspot.com',
            bodyContentType: 'image/webp',
            uploadContentType: 'image/webp',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa606',
            storageVersion: 'ios/10.28.1',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
          // 5. Default Firebase project bucket with image/*
          {
            name: 'locket-4252a.appspot.com / image/* / gmpid-609',
            bucket: 'locket-4252a.appspot.com',
            bodyContentType: 'image/*',
            uploadContentType: 'image/webp',
            gmpid: '1:641029076083:ios:cc8eb46290d69b234fa609',
            storageVersion: 'ios/10.13.0',
            userAgent: 'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)',
          },
        ];

    let lastError: any = null;

    for (const strat of strategies) {
      const url = `https://firebasestorage.googleapis.com/v0/b/${strat.bucket}/o/${encodedPath}?uploadType=resumable&name=${encodedPath}`;

      try {
        this.logger.log(`[initResumableUpload] Trying strategy: ${strat.name}...`);
        const response = await this.axiosInstance.post(
          url,
          {
            name: objectPath,
            contentType: strat.bodyContentType,
            bucket: '',
            metadata: {
              creator: userId,
              visibility: 'private',
            },
          },
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
              Accept: '*/*',
              'X-Goog-Upload-Protocol': 'resumable',
              'X-Goog-Upload-Command': 'start',
              'X-Goog-Upload-Content-Length': contentLength.toString(),
              'X-Goog-Upload-Content-Type': strat.uploadContentType,
              'X-Firebase-Storage-Version': strat.storageVersion,
              'User-Agent': strat.userAgent,
              'x-firebase-gmpid': strat.gmpid,
              'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            },
          },
        );

        const uploadUrl =
          response.headers['x-goog-upload-url'] ||
          response.headers['X-Goog-Upload-URL'];

        if (uploadUrl) {
          this.logger.log(`[initResumableUpload] Strategy "${strat.name}" succeeded! URL acquired.`);
          return { uploadUrl, bucket: strat.bucket };
        }
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `[initResumableUpload] Strategy "${strat.name}" failed (${err.response?.status}): ${err.response?.data?.error?.message || err.message}`,
        );
      }
    }

    this.handleStorageError('initResumableUpload', lastError);
  }

  /**
   * 5. Firebase Storage: Upload Binary Buffer
   */
  async uploadBinaryBuffer(
    uploadUrl: string,
    buffer: Buffer,
  ): Promise<void> {
    try {
      await this.axiosInstance.put(uploadUrl, buffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
          'Upload-Incomplete': '?0',
          'Upload-Draft-Interop-Version': '3',
          'User-Agent':
            'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (error: any) {
      this.handleStorageError('uploadBinaryBuffer', error);
    }
  }

  /**
   * 6. Firebase Storage: Get Object Metadata (Download Token)
   */
  async getStorageMetadata(
    userId: string,
    idToken: string,
    imageName: string,
    bucket?: string,
    folder: 'thumbnails' | 'videos' = 'thumbnails',
  ): Promise<StorageMetadataResponse> {
    const targetBucket = bucket || this.storageBucket;
    const objectPath = `users/${userId}/moments/${folder}/${imageName}`;
    const encodedPath = encodeURIComponent(objectPath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${targetBucket}/o/${encodedPath}`;

    try {
      const response = await this.axiosInstance.get<StorageMetadataResponse>(
        url,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            Accept: 'application/json',
            'User-Agent':
              'com.locket.Locket/1.43.1 iPhone/18.1 hw/iPhone15_3 (GTMSUF/1)',
          },
        },
      );
      return response.data;
    } catch (error: any) {
      this.handleStorageError('getStorageMetadata', error);
    }
  }

  /**
   * 7. Locket API Gateway: Post Moment V2
   */
  async postMomentV2(
    idToken: string,
    dataPayload: Record<string, any>,
  ): Promise<PostMomentV2Response> {
    const url = `${this.locketBaseUrl}/postMomentV2`;
    try {
      const response = await this.axiosInstance.post<PostMomentV2Response>(
        url,
        { data: dataPayload },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            ...this.iosAppHeaders,
          },
        },
      );

      if (response.data?.error) {
        throw new Error(
          `LOCKET_API_FAILED: ${response.data.error.message || 'Unknown Locket error'}`,
        );
      }

      if (response.data?.result?.errors && response.data.result.errors.length > 0) {
        const errorDetails = response.data.result.errors.join(', ');
        if (response.data.result.status === 401 && errorDetails.toLowerCase().includes('sign in')) {
          throw new Error('TOKEN_EXPIRED: Please sign in again');
        }
        throw new Error(`LOCKET_API_FAILED: ${errorDetails}`);
      }

      return response.data;
    } catch (error: any) {
      if (error.response?.data?.error?.status === 'UNAUTHENTICATED') {
        throw new Error('TOKEN_EXPIRED: Token is invalid or expired');
      }
      if (error.response?.data?.result?.status === 401) {
        throw new Error('TOKEN_EXPIRED: Please sign in again');
      }
      const msg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`postMomentV2 failed: ${msg}`);
      throw new Error(`LOCKET_API_FAILED: ${msg}`);
    }
  }

  /**
   * 7b. Locket API: Delete Moment V2
   */
  async deleteMomentV2(
    idToken: string,
    momentUid: string,
    ownerUid: string,
    deleteGlobally = true,
  ): Promise<any> {
    const url = `${this.locketBaseUrl}/deleteMomentV2`;
    try {
      const response = await this.axiosInstance.post(
        url,
        {
          data: {
            delete_globally: deleteGlobally,
            moment_uid: momentUid,
            owner_uid: ownerUid,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            ...this.iosAppHeaders,
          },
          timeout: 10000,
        },
      );

      const resData = response.data;
      if (resData?.result?.errors && resData.result.errors.length > 0) {
        throw new Error(resData.result.errors.join(', '));
      }
      return resData;
    } catch (error: any) {
      const status = error.response?.status;
      const msg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`deleteMomentV2 failed for ${momentUid}: ${msg}`);

      // Security (BLOCKER-1): Never swallow 502 or 404 as success. Throw clear error.
      throw new Error(`DELETE_MOMENT_FAILED: ${msg}`);
    }
  }

  /**
   * 8. Locket API Gateway: Get Latest Moments V2
   */
  async getLatestMoments(
    idToken: string,
    users?: string[],
    options: GetLatestMomentsOptions = {},
  ): Promise<GetLatestMomentsResponse> {
    const url = `${this.locketBaseUrl}/getLatestMomentV2`;
    const dataPayload: Record<string, any> = {
      excluded_users: options.excludedUsers ?? [],
      should_count_missed_moments: options.shouldCountMissedMoments ?? true,
      users: users ?? [],
    };

    if (options.lastFetch !== undefined) {
      dataPayload.last_fetch = options.lastFetch;
    }

    if (options.syncToken) {
      dataPayload.sync_token = options.syncToken;
    }

    const postPayload = async (payload: any) => {
      return await this.axiosInstance.post<GetLatestMomentsResponse>(
        url,
        { data: payload },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            'User-Agent': this.clientUserAgent,
          },
        },
      );
    };

    try {
      let response;
      try {
        response = await postPayload(dataPayload);
      } catch (err: any) {
        // If plain number last_fetch fails, retry with protobuf wrapper
        if (options.lastFetch !== undefined) {
          const protoPayload = {
            ...dataPayload,
            last_fetch: {
              '@type': 'type.googleapis.com/google.protobuf.Int64Value',
              value: String(options.lastFetch),
            },
          };
          response = await postPayload(protoPayload);
        } else {
          throw err;
        }
      }

      if (response.data?.error) {
        throw new Error(
          `LOCKET_API_FAILED: ${response.data.error.message || 'Unknown Locket error'}`,
        );
      }

      return response.data;
    } catch (error: any) {
      if (error.response?.data?.error?.status === 'UNAUTHENTICATED') {
        throw new Error('TOKEN_EXPIRED: Token is invalid or expired');
      }
      if (error.response?.data?.result?.status === 401) {
        throw new Error('TOKEN_EXPIRED: Please sign in again');
      }
      const msg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`getLatestMoments failed: ${msg}`);
      throw new Error(`LOCKET_API_FAILED: ${msg}`);
    }
  }

  /**
   * 9. Locket API Gateway: Fetch User Profile V2
   */
  async fetchUserV2(
    idToken: string,
    userUid: string,
  ): Promise<FetchUserV2Response> {
    const url = `${this.locketBaseUrl}/fetchUserV2`;
    try {
      const response = await this.axiosInstance.post<FetchUserV2Response>(
        url,
        { data: { user_uid: userUid } },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            'User-Agent': this.clientUserAgent,
          },
        },
      );

      return response.data;
    } catch (error: any) {
      this.logger.warn(`fetchUserV2 failed for uid ${userUid}: ${error.message}`);
      return { result: { status: error.response?.status || 500 } };
    }
  }

  /**
   * 10. Firestore: List Friends of User
   */
  async listFriendDetails(
    idToken: string,
    userUid: string,
  ): Promise<{ uid: string; friendedAt?: string }[]> {
    const url = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${userUid}/friends`;
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'User-Agent': this.clientUserAgent,
        },
      });
      const docs = response.data?.documents || [];
      return docs
        .map((doc: any) => {
          const uid = doc.fields?.user?.stringValue || doc.name?.split('/').pop();
          if (!uid) return null;
          const friendedAt =
            doc.fields?.created_at?.timestampValue ||
            doc.fields?.date?.timestampValue ||
            doc.createTime;
          return { uid, friendedAt };
        })
        .filter((item): item is { uid: string; friendedAt?: string } => Boolean(item));
    } catch (err: any) {
      this.logger.debug(`listFriendDetails failed: ${err.message}`);
      return [];
    }
  }

  async listFriendUids(idToken: string, userUid: string): Promise<string[]> {
    const friends = await this.listFriendDetails(idToken, userUid);
    return friends.map((f) => f.uid);
  }

  /**
   * 11. Generic Locket API Caller for Diagnostics and Extension
   */
  async callLocketEndpoint(idToken: string, endpoint: string, dataPayload: any): Promise<any> {
    const url = `${this.locketBaseUrl}/${endpoint}`;
    const response = await this.axiosInstance.post(
      url,
      { data: dataPayload },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
          'User-Agent': this.clientUserAgent,
        },
      },
    );
    return response.data;
  }

  /**
   * 12. Firestore: Fetch User Moments History (from dedicated 'locket' database)
   */
  async getHistoryEntries(
    idToken: string,
    userUid: string,
    options: GetHistoryEntriesOptions = {},
  ): Promise<HistoryEntriesResponse> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/locket/documents/history/${userUid}/entries`;
    const params: Record<string, any> = {
      pageSize: options.pageSize || 100,
    };
    if (options.orderBy !== undefined) {
      if (options.orderBy) params.orderBy = options.orderBy;
    } else {
      params.orderBy = 'date desc';
    }
    if (options.pageToken) {
      params.pageToken = options.pageToken;
    }

    try {
      const response = await this.axiosInstance.get<HistoryEntriesResponse>(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
          'User-Agent': this.clientUserAgent,
        },
        params,
      });
      return response.data;
    } catch (error: any) {
      if (params.orderBy && error.response?.status === 400) {
        this.logger.warn(
          `getHistoryEntries with orderBy failed for ${userUid}: ${error.response?.data?.error?.message || error.message}, retrying without orderBy...`,
        );
        return this.getHistoryEntries(idToken, userUid, {
          ...options,
          orderBy: '',
        });
      }
      this.logger.debug(
        `getHistoryEntries failed for user ${userUid}: ${error.response?.status || error.message}`,
      );
      return { documents: [] };
    }
  }

  /**
   * 12b. Firestore: Fetch Single Moment History Entry directly by UID
   */
  async getHistoryEntry(
    idToken: string,
    userUid: string,
    momentUid: string,
  ): Promise<any | null> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/locket/documents/history/${userUid}/entries/${momentUid}`;
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
          'User-Agent': this.clientUserAgent,
        },
        timeout: 7000,
      });
      return response.data;
    } catch (err: any) {
      this.logger.debug(
        `getHistoryEntry failed for ${momentUid}: ${err.response?.status || err.message}`,
      );
      return null;
    }
  }

  /**
   * 13. Locket API: Get Moment Views (Viewers list)
   */
  async getMomentViews(
    idToken: string,
    momentUid: string,
  ): Promise<GetMomentViewsApiResponse> {
    const url = `${this.locketBaseUrl}/getMomentViews`;
    try {
      const response = await this.axiosInstance.post<GetMomentViewsApiResponse>(
        url,
        { data: { moment_uid: momentUid } },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            'User-Agent': this.clientUserAgent,
          },
        },
      );
      return response.data;
    } catch (err: any) {
      this.logger.debug(
        `getMomentViews failed for moment ${momentUid}: ${err.response?.status || err.message}`,
      );
      return {
        result: {
          data: { moment_views: [], count: 0 },
          status: err.response?.status || 500,
        },
      };
    }
  }

  /**
   * 14. Firestore: Get Moment Reactions
   */
  async getMomentReactions(idToken: string, momentUid: string): Promise<any[]> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/moments/${momentUid}/reactions`;
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'User-Agent': this.clientUserAgent,
        },
        timeout: 5000,
      });
      return response.data?.documents || [];
    } catch (err: any) {
      this.logger.debug(
        `getMomentReactions failed for moment ${momentUid}: ${err.response?.status || err.message}`,
      );
      return [];
    }
  }

  /**
   * 15. Generic Firestore Reader
   */
  async getFirestoreDocOrCollection(idToken: string, path: string): Promise<any> {
    const url = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/${path}`;
    const response = await this.axiosInstance.get(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
        'User-Agent': this.clientUserAgent,
      },
    });
    return response.data;
  }

  /**
   * 16. Firestore: List Conversations of User
   */
  async listConversations(idToken: string, userUid: string): Promise<any[]> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/users/${userUid}/conversations?pageSize=50`;
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'User-Agent': this.clientUserAgent,
        },
        timeout: 10000,
      });
      return response.data?.documents || [];
    } catch (err: any) {
      this.logger.debug(`listConversations failed: ${err.message}`);
      return [];
    }
  }

  /**
   * 17. Firestore: Get Messages in Conversation
   */
  async getConversationMessages(
    idToken: string,
    convId: string,
    pageSize: number = 100,
  ): Promise<any[]> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/conversations/${convId}/messages?pageSize=${pageSize}&orderBy=created_at%20asc`;
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'User-Agent': this.clientUserAgent,
        },
        timeout: 10000,
      });
      return response.data?.documents || [];
    } catch (err: any) {
      this.logger.debug(`getConversationMessages failed: ${err.message}`);
      return [];
    }
  }

  /**
   * 18. Firestore: Send Message in Conversation
   */
  async createMessage(
    idToken: string,
    convId: string,
    userUid: string,
    body: string,
    replyMoment?: string,
  ): Promise<any> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/conversations/${convId}/messages`;
    const nowIso = new Date().toISOString();
    const fields: Record<string, any> = {
      sender: { stringValue: userUid },
      body: { stringValue: body },
      created_at: { timestampValue: nowIso },
      reply_moment: replyMoment ? { stringValue: replyMoment } : { nullValue: null },
      thumbnail_url: { nullValue: null },
      client_token: { nullValue: null },
    };

    const response = await this.axiosInstance.post(
      url,
      { fields },
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'User-Agent': this.clientUserAgent,
        },
        timeout: 10000,
      },
    );
    return response.data;
  }

  private handleFirebaseError(operation: string, error: any): never {
    const errorData = error.response?.data?.error;
    const msg = errorData?.message || error.message || 'Firebase error';
    this.logger.error(`${operation} failed: ${msg}`);

    if (
      msg.includes('EMAIL_NOT_FOUND') ||
      msg.includes('INVALID_PASSWORD') ||
      msg.includes('INVALID_LOGIN_CREDENTIALS') ||
      msg.includes('USER_DISABLED') ||
      msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')
    ) {
      throw new Error(msg);
    }

    throw new Error(msg);
  }

  private handleStorageError(operation: string, error: any): never {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const msg =
      errorData?.error?.message ||
      errorData?.message ||
      error.response?.statusText ||
      error.message;
    this.logger.error(
      `${operation} failed (Status: ${status}): ${msg}. Response body: ${JSON.stringify(errorData)}`,
    );
    const err: any = new Error(`STORAGE_FAILED: ${msg}`);
    err.status = status;
    throw err;
  }
}
