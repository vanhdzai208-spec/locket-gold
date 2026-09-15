import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { LocketFeedService } from './locket-feed.service';
import { SessionData } from '../session/session.service';
import {
  LocketConversationDto,
  LocketMessageDto,
  DeletedFriendDto,
  LatestMessageDto,
  ActiveFriendDto,
} from './dto/chat-response.dto';

interface CachedMessageRecord {
  id: string;
  senderUid: string;
  isMine: boolean;
  body?: string;
  createdAt: string;
  thumbnailUrl?: string;
  replyMoment?: string;
  reactions?: string[];
  isDeleted?: boolean;
  deletedAt?: string;
}

@Injectable()
export class LocketChatService {
  private readonly logger = new Logger(LocketChatService.name);

  // In-memory persistent cache to detect deleted/recalled messages per conversation
  // convId -> Map<messageId, CachedMessageRecord>
  private readonly conversationMessagesCache = new Map<
    string,
    Map<string, CachedMessageRecord>
  >();

  // In-memory cache for user profile lookups (TTL: 1 hour)
  private readonly userProfileCache = new Map<
    string,
    { name: string; username?: string; avatarUrl?: string; cachedAt: number }
  >();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(
    private readonly locketApiClient: LocketApiClient,
    private readonly locketAuthService: LocketAuthService,
    private readonly locketFeedService: LocketFeedService,
  ) {}

  private async fetchUserProfile(
    activeToken: string,
    uid: string,
  ): Promise<{ name: string; username?: string; avatarUrl?: string }> {
    const cached = this.userProfileCache.get(uid);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return {
        name: cached.name,
        username: cached.username,
        avatarUrl: cached.avatarUrl,
      };
    }

    try {
      const resp = await this.locketApiClient.fetchUserV2(activeToken, uid);
      const data = resp.result?.data;
      if (data) {
        const fullName = [data.first_name, data.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        const profile = {
          name: fullName || data.username || 'Bạn bè',
          username: data.username,
          avatarUrl: data.profile_picture_url || undefined,
          cachedAt: Date.now(),
        };
        this.userProfileCache.set(uid, profile);
        return profile;
      }
    } catch (e: any) {
      this.logger.debug(`fetchUserProfile failed for ${uid}: ${e.message}`);
    }

    return { name: 'Người dùng Locket' };
  }

  /**
   * List all conversations with current friend status and deleted friend markers
   */
  async getConversations(session: SessionData): Promise<LocketConversationDto[]> {
    const validToken = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validToken.idToken;

    // 1. Fetch current friends
    const currentFriends = await this.locketFeedService.getFriendsList(session);
    const friendsMap = new Map(currentFriends.map((f) => [f.uid, f]));

    // 2. Fetch raw conversation documents from Firestore
    const convDocs = await this.locketApiClient.listConversations(
      activeToken,
      session.userId,
    );

    const conversations: LocketConversationDto[] = [];

    await Promise.all(
      convDocs.map(async (doc) => {
        const fields = doc.fields || {};
        const convId =
          fields.uid?.stringValue || doc.name?.split('/').pop() || '';
        const members: string[] =
          fields.members?.arrayValue?.values
            ?.map((v: any) => v.stringValue)
            .filter(Boolean) || [];

        const friendUid = members.find((m) => m !== session.userId) || '';
        if (!friendUid) return;

        const isFriend = friendsMap.has(friendUid);
        let friendName = 'Bạn bè Locket';
        let friendAvatarUrl: string | undefined;
        let friendUsername: string | undefined;

        if (isFriend) {
          const friendInfo = friendsMap.get(friendUid);
          friendName = friendInfo?.name || 'Bạn bè';
          friendAvatarUrl = friendInfo?.avatarUrl;
        } else {
          // Ex-friend (Unfriended / Deleted friend)! Fetch their profile
          const profile = await this.fetchUserProfile(activeToken, friendUid);
          friendName = profile.name;
          friendAvatarUrl = profile.avatarUrl;
          friendUsername = profile.username;
        }

        // Parse latest message
        let latestMessage: LatestMessageDto | undefined;
        if (fields.latest_message?.mapValue?.fields) {
          const lm = fields.latest_message.mapValue.fields;
          const sender = lm.sender?.stringValue || '';
          latestMessage = {
            body: lm.body?.stringValue,
            sender,
            isMine: sender === session.userId,
            createdAt:
              lm.created_at?.timestampValue ||
              fields.last_updated?.timestampValue ||
              new Date().toISOString(),
            thumbnailUrl: lm.thumbnail_url?.stringValue || undefined,
            replyMoment: lm.reply_moment?.stringValue || undefined,
          };

          if (lm.latest_reaction?.mapValue?.fields) {
            const rx = lm.latest_reaction.mapValue.fields;
            latestMessage.latestReaction = {
              emoji: rx.emoji?.stringValue || '❤️',
              sender: rx.sender?.stringValue || '',
              createdAt: rx.created_at?.timestampValue,
            };
          }
        }

        const unreadCount = parseInt(
          fields.unread_count?.integerValue || '0',
          10,
        );
        const lastUpdated =
          fields.last_updated?.timestampValue ||
          latestMessage?.createdAt ||
          doc.updateTime ||
          new Date().toISOString();

        conversations.push({
          id: convId,
          friendUid,
          friendName,
          friendAvatarUrl,
          friendUsername,
          isFriend,
          unreadCount,
          lastUpdated,
          latestMessage,
        });
      }),
    );

    // Sort newest conversations first
    return conversations.sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );
  }

  /**
   * Security (BLOCKER-5): Validates that session.userId is an authorized participant of convId.
   * Prevents Chat IDOR / unauthorized message snooping or tampering.
   */
  async verifyConversationMembership(
    activeToken: string,
    userId: string,
    convId: string,
  ): Promise<string> {
    if (!convId || typeof convId !== 'string') {
      throw new BadRequestException('Conversation ID is required.');
    }

    // 1. Check user's own conversations list from Firestore
    try {
      const convDocs = await this.locketApiClient.listConversations(activeToken, userId);
      for (const doc of convDocs) {
        const fields = doc.fields || {};
        const id = fields.uid?.stringValue || doc.name?.split('/').pop();
        const members: string[] =
          fields.members?.arrayValue?.values
            ?.map((v: any) => v.stringValue)
            .filter(Boolean) || [];

        // Match either direct conversation ID or friend UID that represents this direct message
        if (id === convId || members.includes(convId)) {
          if (members.length === 0 || members.includes(userId)) {
            return id || convId;
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`listConversations check failed for ${convId}: ${err.message}`);
    }

    // 2. Direct lookup for conversation document in Firestore
    try {
      const convDoc = await this.locketApiClient.getFirestoreDocOrCollection(
        activeToken,
        `conversations/${convId}`,
      );
      if (convDoc && convDoc.fields) {
        const members: string[] =
          convDoc.fields.members?.arrayValue?.values
            ?.map((v: any) => v.stringValue)
            .filter(Boolean) || [];
        if (members.includes(userId)) {
          return convId;
        }
      }
    } catch (err: any) {
      this.logger.debug(`getFirestoreDoc check failed for conversation ${convId}: ${err.message}`);
    }

    this.logger.warn(
      `[SECURITY] Unauthorized chat access denied for user ${userId} on conversation ${convId}`,
    );
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Conversation not found or you do not have permission to access it.',
    });
  }

  /**
   * Get all messages in a conversation and detect deleted/recalled messages
   */
  async getMessages(
    session: SessionData,
    convId: string,
  ): Promise<{ messages: LocketMessageDto[]; deletedCount: number }> {
    const validToken = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validToken.idToken;

    // Security (BLOCKER-5): Enforce conversation membership verification before querying messages
    const targetConvId = await this.verifyConversationMembership(
      activeToken,
      session.userId,
      convId,
    );

    // 1. Fetch raw messages from Firestore
    const rawDocs = await this.locketApiClient.getConversationMessages(
      activeToken,
      targetConvId,
      100,
    );

    let convCache = this.conversationMessagesCache.get(convId);
    if (!convCache) {
      convCache = new Map<string, CachedMessageRecord>();
      this.conversationMessagesCache.set(convId, convCache);
    }

    const currentDocIds = new Set<string>();

    for (const doc of rawDocs) {
      const msgId = doc.name?.split('/').pop() || '';
      if (!msgId) continue;
      currentDocIds.add(msgId);

      const f = doc.fields || {};
      const senderUid = f.sender?.stringValue || '';
      const body = f.body?.stringValue;
      const createdAt =
        f.created_at?.timestampValue || doc.createTime || new Date().toISOString();
      const thumbnailUrl = f.thumbnail_url?.stringValue || undefined;
      const replyMoment = f.reply_moment?.stringValue || undefined;

      const reactions: string[] =
        f.reactions?.arrayValue?.values
          ?.map((v: any) => v.stringValue)
          .filter(Boolean) || [];

      convCache.set(msgId, {
        id: msgId,
        senderUid,
        isMine: senderUid === session.userId,
        body,
        createdAt,
        thumbnailUrl,
        replyMoment,
        reactions: reactions.length > 0 ? reactions : undefined,
        isDeleted: false,
      });
    }

    // Check for deleted / recalled messages (were present in previous cache snapshot but missing now)
    for (const [cachedId, cachedMsg] of convCache.entries()) {
      if (!currentDocIds.has(cachedId) && !cachedMsg.isDeleted) {
        cachedMsg.isDeleted = true;
        cachedMsg.deletedAt = new Date().toISOString();
        this.logger.log(
          `[Chat Audit] Detected deleted/recalled message in conversation ${convId}: ${cachedId}`,
        );
      }
    }

    // In-memory cache retains snapshot for process lifetime (no plaintext disk writes)

    const allMessages: LocketMessageDto[] = Array.from(convCache.values()).map(
      (m) => ({
        id: m.id,
        senderUid: m.senderUid,
        isMine: m.isMine,
        body: m.body,
        createdAt: m.createdAt,
        thumbnailUrl: m.thumbnailUrl,
        replyMoment: m.replyMoment,
        reactions: m.reactions,
        isDeleted: m.isDeleted,
        deletedAt: m.deletedAt,
      }),
    );

    // Sort chronologically ascending (oldest to newest)
    allMessages.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const deletedCount = allMessages.filter((m) => m.isDeleted).length;

    return {
      messages: allMessages,
      deletedCount,
    };
  }

  /**
   * Scan past interactions to detect friends who have unfriended / been deleted
   */
  async getDeletedFriends(session: SessionData): Promise<DeletedFriendDto[]> {
    const validToken = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validToken.idToken;

    // 1. Current friends
    const currentFriendUids = new Set(
      await this.locketApiClient.listFriendUids(activeToken, session.userId),
    );

    // 2. Discover former friends from conversations
    const convDocs = await this.locketApiClient.listConversations(
      activeToken,
      session.userId,
    );
    const formerFriendsMap = new Map<
      string,
      { convId?: string; lastInteraction?: string; messageCount?: number }
    >();

    for (const doc of convDocs) {
      const fields = doc.fields || {};
      const convId = fields.uid?.stringValue || doc.name?.split('/').pop();
      const members: string[] =
        fields.members?.arrayValue?.values
          ?.map((v: any) => v.stringValue)
          .filter(Boolean) || [];

      const friendUid = members.find((m) => m !== session.userId);
      if (friendUid && !currentFriendUids.has(friendUid)) {
        formerFriendsMap.set(friendUid, {
          convId,
          lastInteraction: fields.last_updated?.timestampValue,
        });
      }
    }

    // 3. Discover former friends from historical moments history
    try {
      const historyRes = await this.locketApiClient.getHistoryEntries(
        activeToken,
        session.userId,
        { pageSize: 100 },
      );
      for (const doc of historyRes.documents || []) {
        const author = doc.fields?.user?.stringValue;
        if (author && author !== session.userId && !currentFriendUids.has(author)) {
          if (!formerFriendsMap.has(author)) {
            formerFriendsMap.set(author, {
              lastInteraction:
                doc.fields?.date?.timestampValue || doc.createTime,
            });
          }
        }
      }
    } catch (e: any) {
      this.logger.debug(`getDeletedFriends history scan failed: ${e.message}`);
    }

    // 4. Fetch rich profiles for each deleted friend
    const deletedFriends: DeletedFriendDto[] = [];
    await Promise.all(
      Array.from(formerFriendsMap.entries()).map(
        async ([uid, meta]) => {
          const profile = await this.fetchUserProfile(activeToken, uid);
          deletedFriends.push({
            uid,
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            username: profile.username,
            conversationId: meta.convId,
            lastInteractionAt: meta.lastInteraction,
          });
        },
      ),
    );

    return deletedFriends.sort((a, b) => {
      const timeA = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
      const timeB = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  /**
   * Send a new message into a conversation
   */
  async sendMessage(
    session: SessionData,
    convId: string,
    body: string,
    replyMoment?: string,
  ): Promise<LocketMessageDto> {
    const validToken = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validToken.idToken;

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error('Nội dung tin nhắn không được để trống.');
    }

    // Security (BLOCKER-5): Enforce conversation membership verification before sending message
    const targetConvId = await this.verifyConversationMembership(
      activeToken,
      session.userId,
      convId,
    );

    const res = await this.locketApiClient.createMessage(
      activeToken,
      targetConvId,
      session.userId,
      trimmedBody,
      replyMoment,
    );

    const msgId = res.name?.split('/').pop() || `msg_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const createdMsg: LocketMessageDto = {
      id: msgId,
      senderUid: session.userId,
      isMine: true,
      body: trimmedBody,
      createdAt,
      replyMoment,
    };

    // Cache immediately
    let convCache = this.conversationMessagesCache.get(convId);
    if (!convCache) {
      convCache = new Map<string, CachedMessageRecord>();
      this.conversationMessagesCache.set(convId, convCache);
    }
    convCache.set(msgId, {
      ...createdMsg,
      isDeleted: false,
    });

    return createdMsg;
  }

  /**
   * Get all active (not deleted) friends from past to present with conversation metadata
   */
  async getAllActiveFriends(session: SessionData): Promise<ActiveFriendDto[]> {
    const validToken = await this.locketAuthService.getValidAccessToken(session);
    const activeToken = validToken.idToken;

    // 1. Fetch current friends
    const currentFriends = await this.locketFeedService.getFriendsList(session);

    // 2. Fetch conversations
    const convDocs = await this.locketApiClient.listConversations(
      activeToken,
      session.userId,
    );

    // Map friendUid -> convId
    const friendToConvMap = new Map<string, string>();
    for (const doc of convDocs) {
      const fields = doc.fields || {};
      const convId = fields.uid?.stringValue || doc.name?.split('/').pop() || '';
      const members: string[] =
        fields.members?.arrayValue?.values
          ?.map((v: any) => v.stringValue)
          .filter(Boolean) || [];
      const friendUid = members.find((m) => m !== session.userId);
      if (friendUid && convId) {
        friendToConvMap.set(friendUid, convId);
      }
    }

    // 3. Build ActiveFriendDto list
    const activeFriends: ActiveFriendDto[] = await Promise.all(
      currentFriends.map(async (friend) => {
        const convId = friendToConvMap.get(friend.uid);
        let username: string | undefined;

        try {
          const profile = await this.fetchUserProfile(activeToken, friend.uid);
          username = profile.username;
        } catch {
          // ignore
        }

        return {
          uid: friend.uid,
          name: friend.name,
          avatarUrl: friend.avatarUrl,
          username,
          conversationId: convId,
          hasConversation: Boolean(convId),
        };
      }),
    );

    // Sort: friends with conversations first, then alphabetically by name
    return activeFriends.sort((a, b) => {
      if (a.hasConversation && !b.hasConversation) return -1;
      if (!a.hasConversation && b.hasConversation) return 1;
      return a.name.localeCompare(b.name);
    });
  }
}
