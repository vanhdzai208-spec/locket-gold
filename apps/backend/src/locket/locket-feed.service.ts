import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { validateProxyUrl } from '../common/utils/ip.util';
import { SessionData } from '../session/session.service';
import {
  LocketApiClient,
  LocketMomentRaw,
  HistoryEntriesResponse,
} from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import {
  LocketFeedItemDto,
  LocketFeedResponseDto,
  LocketFriendDto,
  MomentDetailsResponseDto,
  MomentViewerDto,
} from './dto/feed-response.dto';

interface CachedUserProfile {
  name: string;
  avatarUrl?: string;
  cachedAt: number;
}

@Injectable()
export class LocketFeedService {
  private readonly logger = new Logger(LocketFeedService.name);

  // In-memory cache for user profiles (TTL: 1 hour)
  private readonly profileCache = new Map<string, CachedUserProfile>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  // In-memory cache for selective post recipients (momentUid -> recipients[])
  private readonly postRecipientsCache = new Map<string, string[]>();

  recordMomentRecipients(momentUid: string, recipients: string[]) {
    if (momentUid && Array.isArray(recipients)) {
      this.postRecipientsCache.set(momentUid, recipients);
    }
  }

  getCleanPhotoKey(url?: string): string {
    if (!url) return '';
    try {
      let clean = url;
      if (clean.includes('proxy-image?url=')) {
        clean = decodeURIComponent(clean.split('proxy-image?url=')[1]);
      }
      while (clean.includes('%2F') || clean.includes('%3A')) {
        clean = decodeURIComponent(clean);
      }
      const pathOnly = clean.split('?')[0].split('#')[0];
      const filename = pathOnly.split('/').pop() || '';
      return filename.replace(/\.[^/.]+$/, '').toLowerCase();
    } catch {
      return url;
    }
  }

  constructor(
    private readonly locketApiClient: LocketApiClient,
    private readonly locketAuthService: LocketAuthService,
  ) {}

  /**
   * Helper to normalize any API response or Firestore doc into LocketMomentRaw[]
   */
  private extractMoments(
    sourceName: string,
    raw: any,
    defaultUser?: string,
  ): LocketMomentRaw[] {
    const list: LocketMomentRaw[] = [];
    if (!raw) return list;

    // A. Direct array or result.data
    const dataArray =
      (Array.isArray(raw) ? raw : null) ||
      (Array.isArray(raw?.result?.data) ? raw.result.data : null) ||
      (Array.isArray(raw?.data?.data) ? raw.data.data : null) ||
      (Array.isArray(raw?.data) ? raw.data : null);

    if (dataArray) {
      for (const item of dataArray) {
        if (!item) continue;
        const id = item.canonical_uid || item.moment_uid || item.id;
        const img = item.image_url || item.thumbnail_url;
        const recipients = Array.isArray(item.recipients) ? item.recipients : [];
        const sent_to_all =
          item.sent_to_all !== undefined
            ? Boolean(item.sent_to_all)
            : recipients.length === 0;

        if (id && img) {
          list.push({
            canonical_uid: id,
            user: item.user || item.owner_uid || item.author || defaultUser || '',
            thumbnail_url: item.thumbnail_url || img,
            image_url: item.image_url || img,
            video_url: item.video_url,
            caption: item.caption,
            date: item.date || item.created_at || new Date().toISOString(),
            recipients,
            sent_to_all,
          });
        }
      }
    }

    // B. Firestore documents (either raw.documents array or runQuery array)
    const docs =
      (Array.isArray(raw?.documents) ? raw.documents : null) ||
      (Array.isArray(raw) && raw.length > 0 && (raw[0]?.document || raw[0]?.name)
        ? raw.map((r: any) => r.document || r)
        : null);

    if (docs) {
      for (const doc of docs) {
        if (!doc) continue;
        const fields = doc.fields || {};
        const id = fields.canonical_uid?.stringValue || doc.name?.split('/').pop();
        const thumb =
          fields.thumbnail_url?.stringValue ||
          fields.thumbnail?.stringValue ||
          fields.image_url?.stringValue ||
          fields.image?.stringValue ||
          fields.download_url?.stringValue ||
          fields.media_url?.stringValue ||
          fields.url?.stringValue;
        const user =
          fields.user?.stringValue ||
          fields.owner_uid?.stringValue ||
          defaultUser ||
          '';

        let caption = fields.caption?.stringValue || fields.text?.stringValue;
        if (!caption && fields.overlays?.arrayValue?.values) {
          for (const ov of fields.overlays.arrayValue.values) {
            const ovFields = ov.mapValue?.fields;
            const textCandidate =
              ovFields?.data?.mapValue?.fields?.text?.stringValue ||
              ovFields?.alt_text?.stringValue ||
              ovFields?.text?.stringValue;
            if (textCandidate) {
              caption = textCandidate;
              break;
            }
          }
        }

        const date =
          fields.date?.timestampValue ||
          fields.created_at?.timestampValue ||
          doc.createTime ||
          new Date().toISOString();

        const recipients =
          fields.recipients?.arrayValue?.values
            ?.map((v: any) => v.stringValue)
            .filter(Boolean) || [];
        const sent_to_all =
          fields.sent_to_all?.booleanValue !== undefined
            ? fields.sent_to_all.booleanValue
            : (fields.recipients ? recipients.length === 0 : true);

        if (id && thumb) {
          list.push({
            canonical_uid: id,
            user,
            thumbnail_url: thumb,
            image_url: fields.image_url?.stringValue || thumb,
            video_url: fields.video_url?.stringValue || undefined,
            caption,
            date,
            recipients,
            sent_to_all,
          });
        }
      }
    }

    return list;
  }


  /**
   * Directly list all historical moment images stored in Firebase Storage for a user
   */
  private async fetchMomentsFromStorage(
    activeToken: string,
    userUid: string,
    maxResults = 500,
  ): Promise<LocketMomentRaw[]> {
    const list: LocketMomentRaw[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const encodedPrefix = encodeURIComponent(`users/${userUid}/moments/thumbnails/`);
        let url = `https://firebasestorage.googleapis.com/v0/b/locket-img/o?prefix=${encodedPrefix}&maxResults=100`;
        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }

        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'User-Agent':
              'com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3',
          },
          timeout: 8000,
        });

        const items = response.data?.items || [];
        for (const item of items) {
          if (!item.name) continue;
          const fileName = item.name.split('/').pop() || '';
          const token = item.downloadTokens ? `&token=${item.downloadTokens.split(',')[0]}` : '';
          const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/locket-img/o/${encodeURIComponent(item.name)}?alt=media${token}`;
          const id = fileName.replace(/\.[^/.]+$/, '');

          list.push({
            canonical_uid: id,
            user: userUid,
            thumbnail_url: downloadUrl,
            image_url: downloadUrl,
            date: item.timeCreated || item.updated || new Date().toISOString(),
          });
        }

        pageToken = response.data?.nextPageToken;
      } while (pageToken && list.length < maxResults);
    } catch (err: any) {
      this.logger.debug(`Firebase Storage list for ${userUid}: ${err.response?.status || err.message}`);
    }

    return list;
  }

  /**
   * Directly read moments collection/subcollection from Firestore
   */
  private async fetchMomentsFromFirestore(
    activeToken: string,
    userUid: string,
    maxResults = 500,
  ): Promise<LocketMomentRaw[]> {
    const list: LocketMomentRaw[] = [];
    let pageToken: string | undefined;

    try {
      do {
        let url = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${userUid}/moments?pageSize=100`;
        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }

        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'User-Agent':
              'com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3',
          },
          timeout: 8000,
        });

        const extracted = this.extractMoments(`Firestore ${userUid}`, response.data);
        list.push(...extracted);

        pageToken = response.data?.nextPageToken;
      } while (pageToken && list.length < maxResults);
    } catch (err: any) {
      this.logger.debug(`Firestore subcollection for ${userUid}: ${err.response?.status || err.message}`);
    }

    return list;
  }

  /**
   * Run Firestore query against root collection moments
   */
  private async fetchMomentsFromRunQuery(
    activeToken: string,
    userUid: string,
  ): Promise<LocketMomentRaw[]> {
    try {
      const payload = {
        structuredQuery: {
          from: [{ collectionId: 'moments' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user' },
              op: 'EQUAL',
              value: { stringValue: userUid },
            },
          },
          limit: 100,
        },
      };

      const res = await axios.post(
        `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents:runQuery`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'User-Agent':
              'com.locket.Locket.LocketWidget/1.100.0 iPhone/18.2 hw/iPhone14_3',
          },
          timeout: 8000,
        },
      );

      return this.extractMoments(`RunQuery ${userUid}`, res.data);
    } catch (err: any) {
      this.logger.debug(`Firestore runQuery for ${userUid}: ${err.response?.status || err.message}`);
      return [];
    }
  }

  /**
   * Fetch historical moments from dedicated 'locket' database history entries
   * Path: databases/locket/documents/history/${userUid}/entries
   */
  private async fetchMomentsFromHistory(
    activeToken: string,
    userUid: string,
    maxMoments = 1000,
  ): Promise<LocketMomentRaw[]> {
    const list: LocketMomentRaw[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const response: HistoryEntriesResponse =
          await this.locketApiClient.getHistoryEntries(activeToken, userUid, {
            pageSize: 100,
            pageToken,
            orderBy: 'date desc',
          });

        const docs = response?.documents || [];
        if (docs.length === 0) {
          break;
        }

        const extracted = this.extractMoments(`History ${userUid}`, response, userUid);
        list.push(...extracted);

        this.logger.debug(
          `[History ${userUid}] Fetched batch of ${docs.length} docs (accumulated: ${list.length})`,
        );

        pageToken = response.nextPageToken;
      } while (pageToken && list.length < maxMoments);
    } catch (err: any) {
      this.logger.warn(
        `fetchMomentsFromHistory failed for ${userUid}: ${err.message}`,
      );
    }

    return list;
  }

  /**
   * Fetch all historical moments for a specific user (friend or self)
   * Combining Locket History API (databases/locket) and Widget API
   */
  private async fetchUserMomentsDeep(
    activeToken: string,
    userUid: string,
    maxMoments = 500,
    sinceTimestamp?: number,
  ): Promise<LocketMomentRaw[]> {
    const userMoments: LocketMomentRaw[] = [];
    const seenUids = new Set<string>();

    const addToList = (items: LocketMomentRaw[]) => {
      for (const m of items) {
        if (!seenUids.has(m.canonical_uid)) {
          userMoments.push(m);
          seenUids.add(m.canonical_uid);
        }
      }
    };

    // 1. Primary: Fetch from dedicated history entries (databases/locket/documents/history/${userUid}/entries)
    try {
      const historyMoments = await this.fetchMomentsFromHistory(
        activeToken,
        userUid,
        maxMoments,
      );
      if (historyMoments.length > 0) {
        this.logger.log(`[Target ${userUid}] History entries found ${historyMoments.length} moments`);
        addToList(historyMoments);
      }
    } catch (err: any) {
      this.logger.debug(`History fetch error for ${userUid}: ${err.message}`);
    }

    // 2. Fetch latest moments via Locket API (captures instant widget state and overlay metadata)
    try {
      const resp = await this.locketApiClient.getLatestMoments(
        activeToken,
        [userUid],
        {
          shouldCountMissedMoments: true,
          lastFetch: sinceTimestamp || 1,
        },
      );
      const apiMoments = this.extractMoments(`User ${userUid} API`, resp, userUid);
      addToList(apiMoments);
    } catch (err: any) {
      this.logger.debug(`API getLatestMoments for ${userUid}: ${err.message}`);
    }

    // 3. Fallback: If no history entries found, try Firebase Storage / Firestore
    if (userMoments.length === 0) {
      try {
        const storageMoments = await this.fetchMomentsFromStorage(
          activeToken,
          userUid,
          maxMoments,
        );
        if (storageMoments.length > 0) {
          addToList(storageMoments);
        }
      } catch (err: any) {
        this.logger.debug(`Storage fetch error for ${userUid}: ${err.message}`);
      }

      try {
        const firestoreMoments = await this.fetchMomentsFromFirestore(
          activeToken,
          userUid,
          maxMoments,
        );
        if (firestoreMoments.length > 0) {
          addToList(firestoreMoments);
        }
      } catch (err: any) {
        this.logger.debug(`Firestore fetch error for ${userUid}: ${err.message}`);
      }
    }

    return userMoments;
  }


  /**
   * Fetch latest moments feed for the authenticated user, enriched with author info
   */
  async getFeed(
    session: SessionData,
    options: { since?: number; full?: boolean; quick?: boolean } = {},
  ): Promise<{
    feed: LocketFeedResponseDto;
    updatedSession?: SessionData;
  }> {
    const isQuick = Boolean(options.quick);
    this.logger.log(
      `Starting getFeed for user: ${session.userId} (${session.email}) [full: ${Boolean(options.full)}, quick: ${isQuick}, since: ${options.since || 'none'}]`,
    );

    const validTokenResult = await this.locketAuthService.getValidAccessToken(session);
    let activeToken = validTokenResult.idToken;
    let updatedSession: SessionData | undefined =
      validTokenResult.updatedSession || undefined;

    // Helper to safely execute an API call with automatic token refresh
    const executeWithRetry = async <T>(apiCall: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await apiCall(activeToken);
      } catch (error: any) {
        if (error.message?.includes('TOKEN_EXPIRED')) {
          this.logger.warn('ID token rejected during feed fetch. Force refreshing...');
          const refreshed = await this.locketAuthService.forceRefreshToken(session);
          activeToken = refreshed.idToken;
          updatedSession = refreshed.updatedSession || undefined;
          return await apiCall(activeToken);
        }
        throw error;
      }
    };

    // 1. Fetch friend UIDs from Firestore
    let friendUids: string[] = [];
    try {
      friendUids = await executeWithRetry((token) =>
        this.locketApiClient.listFriendUids(token, session.userId),
      );
      this.logger.log(`Found ${friendUids.length} friends for user ${session.userId}`);
    } catch (e: any) {
      this.logger.warn(`Could not list friends from Firestore: ${e.message}`);
    }


    const rawMoments: LocketMomentRaw[] = [];
    const seenIds = new Set<string>();

    const addMoments = (source: string, list: LocketMomentRaw[]) => {
      for (const m of list) {
        const stem = this.getCleanPhotoKey(m.thumbnail_url || m.image_url);

        if (!seenIds.has(m.canonical_uid) && (!stem || !seenIds.has(stem))) {
          rawMoments.push(m);
          seenIds.add(m.canonical_uid);
          if (stem) seenIds.add(stem);
        } else {
          // If we already have this moment without caption, but now have one with caption, enrich it!
          const existing = rawMoments.find(
            (em) =>
              em.canonical_uid === m.canonical_uid ||
              (stem && this.getCleanPhotoKey(em.thumbnail_url || em.image_url) === stem),
          );
          if (existing) {
            if (!existing.caption && m.caption) existing.caption = m.caption;
            if (m.date && (!existing.date || existing.date === new Date().toISOString())) {
              existing.date = m.date;
            }
            if ((!existing.recipients || existing.recipients.length === 0) && m.recipients && m.recipients.length > 0) {
              existing.recipients = m.recipients;
            }
            if (m.sent_to_all !== undefined) {
              existing.sent_to_all = m.sent_to_all;
            }
          }
        }
      }
    };

    // 2. Concurrently query history for each friend and self
    const targetUsers = isQuick
      ? Array.from(new Set([session.userId, ...friendUids.slice(0, 15)]))
      : Array.from(new Set([session.userId, ...friendUids]));
    this.logger.log(`Querying moments history for ${targetUsers.length} targets (self + friends) [quick: ${isQuick}]...`);

    await Promise.all(
      targetUsers.map(async (uid) => {
        const maxForThisUser = isQuick
          ? uid === session.userId
            ? 100
            : 50
          : uid === session.userId
            ? options.full
              ? 5000
              : 2000
            : options.full
              ? 1000
              : 500;
        try {
          const userMoments = await executeWithRetry((token) =>
            this.fetchUserMomentsDeep(token, uid, maxForThisUser, options.since),
          );
          if (userMoments.length > 0) {
            this.logger.log(`[Target ${uid}] Fetched ${userMoments.length} moments`);
            addMoments(`User ${uid}`, userMoments);
          }
        } catch (err: any) {
          this.logger.warn(`Failed to fetch moments for target ${uid}: ${err.message}`);
        }
      }),
    );

    // 2.1 Attempt direct Firestore fetch for user's own moments collection only if no moments found
    if (rawMoments.length === 0) {
      try {
        const ownMomentsDoc = await executeWithRetry((token) =>
          this.locketApiClient.getFirestoreDocOrCollection(
            token,
            `users/${session.userId}/moments`,
          ),
        );
        const ownMoments = this.extractMoments('FirestoreOwn', ownMomentsDoc);
        if (ownMoments.length > 0) {
          this.logger.log(`Found ${ownMoments.length} own moments directly from Firestore!`);
          addMoments('FirestoreOwn', ownMoments);
        }
      } catch (e: any) {
        this.logger.debug(`Could not read own moments from Firestore: ${e.message}`);
      }
    }

    // 3. Fallback: Also run fan-out without user filter to ensure nothing was missed (skip in quick mode if already found moments)
    if (!isQuick || rawMoments.length < 20) {
      try {
        const respFanout = await executeWithRetry((token) =>
          this.locketApiClient.getLatestMoments(token, [], {
            shouldCountMissedMoments: true,
            lastFetch: options.since || 1,
          }),
        );
        const fanoutMoments = this.extractMoments('Fanout', respFanout);
        this.logger.log(`Fanout returned ${fanoutMoments.length} moments`);
        addMoments('Fanout', fanoutMoments);
      } catch (err: any) {
        this.logger.warn(`Fanout fallback error: ${err.message}`);
      }
    }

    this.logger.log(`getFeed complete: found ${rawMoments.length} total unique moments.`);

    // In quick mode, keep top 120 newest moments for instant response
    if (isQuick && rawMoments.length > 120) {
      rawMoments.sort((a, b) => {
        const timeA = typeof a.date === 'string' ? new Date(a.date).getTime() : 0;
        const timeB = typeof b.date === 'string' ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
      rawMoments.splice(120);
    }

    // 4. Collect all distinct author UIDs (only for the moments we actually return)
    const authorUids = Array.from(
      new Set(rawMoments.map((m) => m.user).filter(Boolean)),
    );

    // Fetch author profiles in parallel (with caching)
    await Promise.all(
      authorUids.map(async (uid) => {
        if (uid === session.userId) {
          return;
        }
        const cached = this.profileCache.get(uid);
        if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
          return;
        }

        try {
          const userRes = await this.locketApiClient.fetchUserV2(activeToken, uid);
          const userData = userRes.result?.data;
          let name = 'Friend';
          if (userData?.first_name || userData?.last_name) {
            name = [userData.first_name, userData.last_name]
              .filter(Boolean)
              .join(' ');
          } else if (userData?.username) {
            name = `@${userData.username}`;
          }

          this.profileCache.set(uid, {
            name,
            avatarUrl: userData?.profile_picture_url || undefined,
            cachedAt: Date.now(),
          });
        } catch (err: any) {
          this.logger.debug(`Could not fetch user info for ${uid}: ${err.message}`);
        }
      }),
    );

    // 5. Map raw moments to typed DTO
    const items: LocketFeedItemDto[] = rawMoments
      .map((moment) => {
        const isMine = !moment.user || moment.user === session.userId;
        let authorName = 'Friend';
        let authorAvatarUrl: string | undefined;

        if (isMine) {
          authorName = session.displayName || 'You';
          authorAvatarUrl = session.photoUrl;
        } else {
          const profile = this.profileCache.get(moment.user);
          if (profile) {
            authorName = profile.name;
            authorAvatarUrl = profile.avatarUrl;
          }
        }

        // Parse date
        let createdAt = new Date().toISOString();
        try {
          if (
            typeof moment.date === 'object' &&
            moment.date !== null &&
            '_seconds' in moment.date
          ) {
            createdAt = new Date(moment.date._seconds * 1000).toISOString();
          } else if (typeof moment.date === 'number') {
            const ms = moment.date < 1e11 ? moment.date * 1000 : moment.date;
            createdAt = new Date(ms).toISOString();
          } else if (typeof moment.date === 'string') {
            const num = Number(moment.date);
            if (!isNaN(num) && moment.date.trim() !== '') {
              const ms = num < 1e11 ? num * 1000 : num;
              createdAt = new Date(ms).toISOString();
            } else {
              const parsed = new Date(moment.date);
              if (!isNaN(parsed.getTime())) {
                if (parsed.getFullYear() < 2000) {
                  const t = parsed.getTime();
                  const ms = t > 0 && t < 1e11 ? t * 1000 : t;
                  createdAt = new Date(ms).toISOString();
                } else {
                  createdAt = parsed.toISOString();
                }
              }
            }
          }
        } catch {
          createdAt = new Date().toISOString();
        }

        const imageUrl = moment.image_url || moment.thumbnail_url || '';
        const thumbnailUrl = moment.thumbnail_url || moment.image_url || '';

        return {
          id: moment.canonical_uid,
          authorUid: moment.user || session.userId,
          authorName,
          authorAvatarUrl,
          imageUrl,
          thumbnailUrl,
          videoUrl: moment.video_url || undefined,
          caption: moment.caption || undefined,
          createdAt,
          isMine,
          recipients: moment.recipients || [],
          sentToAll: moment.sent_to_all ?? true,
        };
      })
      .filter((item) => Boolean(item.imageUrl))
      // Sort newest first
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return {
      feed: {
        items,
        missedMomentsCount: 0,
        syncedAt: Date.now(),
        totalCount: items.length,
      },
      updatedSession,
    };
  }

  /**
   * Fetch all friends of user with display names and avatars
   */
  async getFriendsList(session: SessionData): Promise<LocketFriendDto[]> {
    const validTokenResult = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validTokenResult.idToken;

    let friendRelations: { uid: string; friendedAt?: string }[] = [];
    try {
      if (typeof this.locketApiClient.listFriendDetails === 'function') {
        friendRelations = await this.locketApiClient.listFriendDetails(activeToken, session.userId);
      }
    } catch (e: any) {
      this.logger.debug(`listFriendDetails error: ${e.message}`);
    }

    if (!friendRelations || friendRelations.length === 0) {
      const friendUids = await this.locketApiClient.listFriendUids(activeToken, session.userId);
      friendRelations = friendUids.map((uid) => ({ uid }));
    }

    const friends: LocketFriendDto[] = [];

    await Promise.all(
      friendRelations.map(async ({ uid, friendedAt }) => {
        let name = 'Friend';
        let avatarUrl: string | undefined;

        const cached = this.profileCache.get(uid);
        if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
          name = cached.name;
          avatarUrl = cached.avatarUrl;
        } else {
          try {
            const userRes = await this.locketApiClient.fetchUserV2(activeToken, uid);
            const userData = userRes.result?.data;
            if (userData) {
              const fullName = [userData.first_name, userData.last_name]
                .filter(Boolean)
                .join(' ')
                .trim();
              name = fullName || userData.username || 'Friend';
              avatarUrl = userData.profile_picture_url || undefined;
              this.profileCache.set(uid, {
                name,
                avatarUrl,
                cachedAt: Date.now(),
              });
            }
          } catch (e: any) {
            this.logger.debug(`Could not fetch profile for friend ${uid}: ${e.message}`);
          }
        }

        friends.push({
          uid,
          name,
          avatarUrl,
          friendedAt,
        });
      }),
    );

    return friends.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Fetch detailed audience information and viewers for a specific moment
   */
  /**
   * Fetch detailed audience information and viewers for a specific moment
   */
  async getMomentDetails(
    session: SessionData,
    momentUid: string,
  ): Promise<MomentDetailsResponseDto> {
    const validTokenResult = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validTokenResult.idToken;

    // 1. Fetch all friends of user
    const friends = await this.getFriendsList(session);
    const friendsMap = new Map<string, LocketFriendDto>(
      friends.map((f) => [f.uid, f]),
    );

    // Helper to resolve user info for viewers/reactors (including former/unfriended friends)
    const userProfileCache = new Map<string, LocketFriendDto>();
    const resolveUser = async (uid: string): Promise<LocketFriendDto> => {
      const existingFriend = friendsMap.get(uid);
      if (existingFriend) {
        return existingFriend;
      }
      const cached = userProfileCache.get(uid);
      if (cached) {
        return cached;
      }
      try {
        const userRes = await this.locketApiClient.fetchUserV2(activeToken, uid);
        const userData = userRes.result?.data;
        if (userData) {
          const fullName = [userData.first_name, userData.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();
          const displayName = fullName || userData.username || 'Bạn bè cũ';
          const resolved: LocketFriendDto = {
            uid,
            name: displayName,
            username: userData.username,
            avatarUrl: userData.profile_picture_url,
            isFormerFriend: true,
          };
          userProfileCache.set(uid, resolved);
          return resolved;
        }
      } catch (e: any) {
        this.logger.debug(`Failed to fetchUserV2 for viewer ${uid}: ${e.message}`);
      }
      const fallback: LocketFriendDto = {
        uid,
        name: 'Bạn bè cũ',
        isFormerFriend: true,
      };
      userProfileCache.set(uid, fallback);
      return fallback;
    };

    // 2. Fetch moment metadata directly from Firestore history entry of user
    let momentDoc: any = null;
    let recipients: string[] = [];
    let sentToAll = true;
    let sentToSelfOnly = false;
    let caption: string | undefined;
    let createdAt = new Date().toISOString();

    // Check memory cache first (for moments posted via our web app)
    const cachedRecipients = this.postRecipientsCache.get(momentUid);
    if (cachedRecipients && cachedRecipients.length > 0) {
      recipients = cachedRecipients;
      sentToAll = false;
    }

    try {
      momentDoc = await this.locketApiClient.getHistoryEntry(
        activeToken,
        session.userId,
        momentUid,
      );
    } catch (e: any) {
      this.logger.debug(`Direct getHistoryEntry failed for ${momentUid}: ${e.message}`);
    }

    // Fallback: If not found directly, scan recent history entries
    if (!momentDoc) {
      try {
        const historyRes = await this.locketApiClient.getHistoryEntries(
          activeToken,
          session.userId,
          { pageSize: 100 },
        );
        momentDoc = (historyRes.documents || []).find((d: any) => {
          const id = d.fields?.canonical_uid?.stringValue || d.name?.split('/').pop();
          return id === momentUid;
        });
      } catch (e: any) {
        this.logger.debug(`getHistoryEntries fallback failed for ${momentUid}: ${e.message}`);
      }
    }

    // Security (SEC-04): Prevent IDOR. If the moment does not exist in the caller's history,
    // they do NOT have permission to view this moment's details, viewers, or reactions.
    if (!momentDoc || !momentDoc.fields) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Moment not found or you do not have permission to view its details.',
      });
    }

    const f = momentDoc.fields;
    caption = f.caption?.stringValue || f.text?.stringValue;
      if (!caption && f.overlays?.arrayValue?.values) {
        for (const ov of f.overlays.arrayValue.values) {
          const ovFields = ov.mapValue?.fields;
          const textCandidate =
            ovFields?.data?.mapValue?.fields?.text?.stringValue ||
            ovFields?.alt_text?.stringValue ||
            ovFields?.text?.stringValue;
          if (textCandidate) {
            caption = textCandidate;
            break;
          }
        }
      }

      if (f.date?.timestampValue) {
        createdAt = new Date(f.date.timestampValue).toISOString();
      } else if (momentDoc.createTime) {
        createdAt = new Date(momentDoc.createTime).toISOString();
      }

      if (f.sent_to_self_only?.booleanValue !== undefined) {
        sentToSelfOnly = f.sent_to_self_only.booleanValue;
      }
      if (f.sent_to_all?.booleanValue !== undefined) {
        sentToAll = f.sent_to_all.booleanValue;
      }

      if (f.recipients?.arrayValue?.values) {
        const docRecipients = f.recipients.arrayValue.values
          .map((v: any) => v.stringValue)
          .filter(Boolean);
        if (docRecipients.length > 0) {
          recipients = docRecipients;
          sentToAll = false;
        }
      }

    // 3. Fetch Views from Locket API
    const viewersMap = new Map<string, MomentViewerDto>();
    try {
      const viewsResp = await this.locketApiClient.getMomentViews(activeToken, momentUid);
      const rawViews = viewsResp.result?.data?.moment_views || [];
      for (const v of rawViews) {
        const viewerUid = v.user;
        if (viewerUid && viewerUid !== session.userId) {
          const uInfo = await resolveUser(viewerUid);
          let viewedAt: string | undefined;
          if (v.viewed_at) {
            if (typeof v.viewed_at === 'string') {
              viewedAt = v.viewed_at;
            } else if (v.viewed_at._seconds) {
              viewedAt = new Date(v.viewed_at._seconds * 1000).toISOString();
            }
          }
          viewersMap.set(viewerUid, {
            uid: viewerUid,
            name: uInfo.name,
            username: uInfo.username,
            avatarUrl: uInfo.avatarUrl,
            isFormerFriend: uInfo.isFormerFriend,
            viewedAt,
          });
        }
      }
    } catch (e: any) {
      this.logger.debug(`getMomentViews error: ${e.message}`);
    }

    // 4. Fetch Reactions from Firestore (reactions confirm viewing!)
    try {
      const reactions = await this.locketApiClient.getMomentReactions(activeToken, momentUid);
      for (const r of reactions) {
        const fields = r.fields || {};
        const reactorUid = fields.user?.stringValue || fields.owner_uid?.stringValue;
        const reactionEmoji =
          fields.reaction?.stringValue ||
          fields.string?.stringValue ||
          fields.emoji?.stringValue ||
          '❤️';
        if (reactorUid && reactorUid !== session.userId) {
          const existing = viewersMap.get(reactorUid);
          if (existing) {
            existing.reaction = reactionEmoji;
          } else {
            const uInfo = await resolveUser(reactorUid);
            viewersMap.set(reactorUid, {
              uid: reactorUid,
              name: uInfo.name,
              username: uInfo.username,
              avatarUrl: uInfo.avatarUrl,
              isFormerFriend: uInfo.isFormerFriend,
              reaction: reactionEmoji,
              viewedAt:
                fields.created_at?.timestampValue ||
                fields.date?.timestampValue ||
                r.createTime,
            });
          }
        }
      }
    } catch (e: any) {
      this.logger.debug(`getMomentReactions error: ${e.message}`);
    }

    const viewers = Array.from(viewersMap.values());

    // 5. Compute audience (Allowed, Excluded, Blocked, New Friends, and Unviewed)
    let excludedFriends: LocketFriendDto[] = [];
    let blockedFriends: LocketFriendDto[] = [];
    let newFriends: LocketFriendDto[] = [];
    let allowedFriends: LocketFriendDto[] = [];
    let unviewedFriends: LocketFriendDto[] = [];

    // All UIDs that definitely received or were able to view the moment
    const knownAllowedUids = new Set<string>([
      ...recipients,
      ...viewersMap.keys(),
    ]);

    const momentTime = createdAt ? new Date(createdAt).getTime() : 0;

    const classifyExcluded = (friendList: LocketFriendDto[]) => {
      const blocked: LocketFriendDto[] = [];
      const newer: LocketFriendDto[] = [];

      for (const f of friendList) {
        const friendTime = f.friendedAt ? new Date(f.friendedAt).getTime() : 0;
        // If friendedAt exists and is after momentTime (+5s tolerance for clock drift):
        // this person became a friend AFTER the moment was published
        if (friendTime && momentTime && friendTime > momentTime + 5000) {
          newer.push({
            ...f,
            exclusionReason: 'new_friend',
          });
        } else {
          blocked.push({
            ...f,
            exclusionReason: 'blocked_at_post',
          });
        }
      }

      return { blocked, newer };
    };

    if (sentToSelfOnly && viewers.length === 0) {
      // Strictly self-only moment (no recipients, no viewers, marked as self only)
      sentToAll = false;
      allowedFriends = [];
      const classified = classifyExcluded(friends);
      blockedFriends = classified.blocked;
      newFriends = classified.newer;
      excludedFriends = [...blockedFriends, ...newFriends];
      unviewedFriends = [];
    } else if (!sentToAll) {
      // Selective / Restricted post (sent to specific friends or excluded friends)
      sentToAll = false;

      // Build allowed friends list
      const allowedFriendsList: LocketFriendDto[] = [];
      for (const uid of knownAllowedUids) {
        const uInfo = await resolveUser(uid);
        allowedFriendsList.push(uInfo);
      }
      allowedFriends = allowedFriendsList;

      // Excluded friends are current friends who were NOT in knownAllowedUids
      const rawExcluded = friends.filter((f) => !knownAllowedUids.has(f.uid));
      const classified = classifyExcluded(rawExcluded);
      blockedFriends = classified.blocked;
      newFriends = classified.newer;
      excludedFriends = [...blockedFriends, ...newFriends];
      unviewedFriends = [];
    } else {
      // Public to all friends (sent_to_all is true or undefined on regular posts)
      sentToAll = true;
      allowedFriends = friends;
      excludedFriends = [];
      blockedFriends = [];
      newFriends = [];
      unviewedFriends = friends.filter((f) => !viewersMap.has(f.uid));
    }

    return {
      momentId: momentUid,
      isMine: true,
      createdAt,
      caption,
      viewers,
      viewsCount: viewers.length,
      audience: {
        sentToAll,
        recipients: allowedFriends.map((f) => f.uid),
        excludedFriends,
        blockedFriends,
        newFriends,
        allowedFriends,
        unviewedFriends,
      },
    };
  }

  /**
   * Proxies an image stream to bypass CORS restrictions when rendering to canvas.
   * Hardened against SSRF and XSS attacks:
   * 1. Protocol validation (HTTP/HTTPS only)
   * 2. Strict domain whitelist
   * 3. Pre-flight DNS resolution checking for private/loopback/cloud-metadata IPs
   * 4. maxRedirects: 0 to prevent redirect-based SSRF bypass
   * 5. Strict MIME-type whitelist (JPEG, PNG, WebP, GIF) rejecting dangerous types like SVG (XSS)
   * 6. Stream size limits (15MB)
   */
  async getProxyImageStream(imageUrl: string) {
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new BadRequestException('Image URL is required');
    }

    // SSRF Defense: Validate URL protocol, domain whitelist, and private/reserved IP DNS resolution
    await validateProxyUrl(imageUrl);

    const MAX_PROXY_SIZE_BYTES = 15 * 1024 * 1024; // 15MB limit to prevent DoS

    let response: any;
    try {
      response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 15000,
        maxContentLength: MAX_PROXY_SIZE_BYTES,
        maxBodyLength: MAX_PROXY_SIZE_BYTES,
        maxRedirects: 0, // Security (BLOCKER-4): Never follow redirects to prevent SSRF bypass
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
    } catch (err: any) {
      if (err.response?.status >= 300 && err.response?.status < 400) {
        throw new BadRequestException(
          `Redirects are forbidden for proxied images (status: ${err.response.status})`,
        );
      }
      if (err.code === 'ERR_FR_TOO_MANY_REDIRECTS' || err.message?.toLowerCase().includes('redirect')) {
        throw new BadRequestException('Redirects are forbidden for proxied images');
      }
      throw err;
    }

    const rawContentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

    // Security (BLOCKER-4): Whitelist safe raster image formats only.
    // Explicitly reject image/svg+xml to prevent SVG-based stored/reflected XSS.
    const ALLOWED_IMAGE_TYPES = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    if (!rawContentType || !ALLOWED_IMAGE_TYPES.has(rawContentType)) {
      if (response.data && typeof response.data.destroy === 'function') {
        response.data.destroy();
      }
      throw new BadRequestException(
        `Invalid or forbidden content type "${rawContentType}": only safe raster images (JPEG, PNG, WebP, GIF) are allowed. SVG and non-image formats are blocked.`,
      );
    }

    return {
      stream: response.data,
      contentType: rawContentType,
      contentLength: response.headers['content-length'],
    };
  }

  /**
   * Permanently deletes a moment created by the user and all its duplicates on Locket
   */
  async deleteMoment(
    session: SessionData,
    momentUid: string,
  ): Promise<{
    success: boolean;
    momentUid: string;
    deletedCount: number;
    deletedUids: string[];
    updatedSession: SessionData | null;
  }> {
    if (!momentUid) {
      throw new Error('Moment UID is required');
    }

    const validTokenResult = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validTokenResult.idToken;

    this.logger.log(`Initiating deletion for moment ${momentUid} (user: ${session.userId})...`);

    // 1. Fetch history entries and verify that the moment belongs to the caller (Prevent IDOR)
    let targetDoc: any = null;
    try {
      targetDoc = await this.locketApiClient.getHistoryEntry(
        activeToken,
        session.userId,
        momentUid,
      );
    } catch (e: any) {
      this.logger.debug(`Direct getHistoryEntry failed for ${momentUid}: ${e.message}`);
    }

    let docs: any[] = [];
    try {
      const historyRes = await this.locketApiClient.getHistoryEntries(
        activeToken,
        session.userId,
        { pageSize: 100 },
      );
      docs = historyRes?.documents || [];
      if (!targetDoc) {
        targetDoc = docs.find((d) => {
          const id = d.fields?.canonical_uid?.stringValue || d.name?.split('/').pop();
          return id === momentUid;
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not check history entries: ${err.message}`);
    }

    // Security (BLOCKER-1): Enforce strict ownership verification.
    // If the moment is not found in the user's history, they do NOT have permission to delete it.
    if (!targetDoc || !targetDoc.fields) {
      this.logger.warn(
        `[SECURITY] Unauthorized deletion attempt by user ${session.userId} for moment ${momentUid}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Moment not found or you do not have permission to delete it.',
      });
    }

    const uidsToDelete = new Set<string>([momentUid]);
    const targetThumb =
      targetDoc.fields?.thumbnail_url?.stringValue ||
      targetDoc.fields?.image_url?.stringValue;
    const targetStem = this.getCleanPhotoKey(targetThumb);

    if (targetStem) {
      // If storage file was missing (404), provision a placeholder webp so Locket Cloud Function deleteMomentV2 doesn't crash with 502
      if (/^[a-zA-Z0-9]{20}$/.test(targetStem)) {
        try {
          const checkFileName = `${targetStem}.webp`;
          const exists = await this.locketApiClient
            .getStorageMetadata(session.userId, activeToken, checkFileName)
            .then(() => true)
            .catch(() => false);

          if (!exists) {
            this.logger.log(
              `Storage file ${checkFileName} missing. Provisioning placeholder so Locket deleteMomentV2 can process cleanly...`,
            );
            const placeholderBuffer = Buffer.from(
              'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
              'base64',
            );
            const { uploadUrl } = await this.locketApiClient.initResumableUpload(
              session.userId,
              activeToken,
              checkFileName,
              placeholderBuffer.length,
              'image/webp',
            );
            await this.locketApiClient.uploadBinaryBuffer(uploadUrl, placeholderBuffer);
            this.logger.log(`Provisioned storage placeholder for ${checkFileName}`);
          }
        } catch (storageErr: any) {
          this.logger.debug(`Could not check/provision storage placeholder: ${storageErr.message}`);
        }
      }

      for (const doc of docs) {
        const docUser = doc.fields?.user?.stringValue || session.userId;
        if (docUser !== session.userId) continue;

        const docThumb =
          doc.fields?.thumbnail_url?.stringValue ||
          doc.fields?.image_url?.stringValue;
        const docStem = this.getCleanPhotoKey(docThumb);
        const docUid =
          doc.fields?.canonical_uid?.stringValue || doc.name?.split('/').pop();

        if (docStem && docStem === targetStem && docUid) {
          uidsToDelete.add(docUid);
        }
      }
    }

    this.logger.log(
      `Deleting ${uidsToDelete.size} moment record(s) on Locket: [${Array.from(uidsToDelete).join(', ')}]`,
    );

    // 2. Call deleteMomentV2 for each verified duplicate
    const deletedUids: string[] = [];
    for (const uid of uidsToDelete) {
      try {
        await this.locketApiClient.deleteMomentV2(
          activeToken,
          uid,
          session.userId,
          true,
        );
        this.postRecipientsCache.delete(uid);
        deletedUids.push(uid);
      } catch (err: any) {
        this.logger.warn(`Failed to delete moment record ${uid}: ${err.message}`);
        if (uid === momentUid) {
          throw err;
        }
      }
    }

    this.logger.log(
      `Moment ${momentUid} and duplicates deleted successfully (${deletedUids.length} purged).`,
    );

    return {
      success: true,
      momentUid,
      deletedCount: deletedUids.length,
      deletedUids,
      updatedSession: validTokenResult.updatedSession,
    };
  }
}
