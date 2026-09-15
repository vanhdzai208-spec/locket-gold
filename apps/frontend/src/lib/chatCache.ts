import {
  LocketConversation,
  LocketMessage,
  DeletedFriend,
  ActiveFriend,
} from '../types/chat';
import { api } from './api';

export interface CachedConversationData {
  messages: LocketMessage[];
  deletedCount: number;
  timestamp: number;
}

interface ChatCacheStore {
  conversations: LocketConversation[];
  deletedFriends: DeletedFriend[];
  activeFriends: ActiveFriend[];
  selectedConvId: string | null;
  hasInitialLoaded: boolean;
  messages: Map<string, CachedConversationData>;
}

// Module-level in-memory cache surviving tab changes during the session
const chatCacheStore: ChatCacheStore = {
  conversations: [],
  deletedFriends: [],
  activeFriends: [],
  selectedConvId: null,
  hasInitialLoaded: false,
  messages: new Map<string, CachedConversationData>(),
};

type CacheListener = () => void;
const cacheListeners = new Set<CacheListener>();

function notifyListeners() {
  cacheListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

const CLIENT_STORAGE_PREFIX = 'locket_client_chat_v1_';

/**
 * Security (SEC-08): Use sessionStorage instead of localStorage.
 * Keeps messages transient for the active tab session (instant 0s switching & deleted message diffing)
 * while ensuring zero persistent plaintext message residue remains on shared/public machines after tab closure.
 */
function getLocalMessages(convId: string): LocketMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(CLIENT_STORAGE_PREFIX + convId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(convId: string, messages: LocketMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep max 300 messages per conversation in session memory
    const trimmed = messages.slice(-300);
    sessionStorage.setItem(CLIENT_STORAGE_PREFIX + convId, JSON.stringify(trimmed));
  } catch {}
}

export const chatCache = {
  getInitialData() {
    return {
      conversations: chatCacheStore.conversations,
      deletedFriends: chatCacheStore.deletedFriends,
      activeFriends: chatCacheStore.activeFriends,
      selectedConvId: chatCacheStore.selectedConvId,
      hasInitialLoaded: chatCacheStore.hasInitialLoaded,
    };
  },

  setInitialData(data: {
    conversations: LocketConversation[];
    deletedFriends: DeletedFriend[];
    activeFriends: ActiveFriend[];
  }) {
    chatCacheStore.conversations = data.conversations;
    chatCacheStore.deletedFriends = data.deletedFriends;
    chatCacheStore.activeFriends = data.activeFriends;
    chatCacheStore.hasInitialLoaded = true;
    notifyListeners();
  },

  setSelectedConvId(convId: string | null) {
    chatCacheStore.selectedConvId = convId;
  },

  getMessages(convId: string): CachedConversationData | null {
    const memory = chatCacheStore.messages.get(convId);
    if (memory) return memory;

    const local = getLocalMessages(convId);
    if (local.length > 0) {
      const deletedCount = local.filter((m) => m.isDeleted).length;
      const data: CachedConversationData = {
        messages: local,
        deletedCount,
        timestamp: Date.now(),
      };
      chatCacheStore.messages.set(convId, data);
      return data;
    }

    return null;
  },

  setMessages(convId: string, incomingMessages: LocketMessage[], serverDeletedCount: number) {
    // Client-side detection of deleted/recalled messages (zero server disk persistence)
    const previousLocal = getLocalMessages(convId);
    const incomingMap = new Map(incomingMessages.map((m) => [m.id, m]));
    const merged: LocketMessage[] = [...incomingMessages];

    // Detect previously seen messages that are missing from current response
    for (const oldMsg of previousLocal) {
      if (!incomingMap.has(oldMsg.id)) {
        merged.push({
          ...oldMsg,
          isDeleted: true,
          deletedAt: oldMsg.deletedAt || new Date().toISOString(),
        });
      }
    }

    // Sort by timestamp
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const totalDeleted = merged.filter((m) => m.isDeleted).length;
    saveLocalMessages(convId, merged);

    chatCacheStore.messages.set(convId, {
      messages: merged,
      deletedCount: Math.max(serverDeletedCount, totalDeleted),
      timestamp: Date.now(),
    });
  },

  updateLatestMessage(convId: string, message: LocketMessage) {
    // Update conversation list entry
    chatCacheStore.conversations = chatCacheStore.conversations.map((c) =>
      c.id === convId
        ? {
            ...c,
            lastUpdated: message.createdAt,
            latestMessage: {
              body: message.body,
              sender: message.senderUid,
              isMine: message.isMine,
              createdAt: message.createdAt,
            },
          }
        : c,
    );

    // Update message cache if present
    const cached = chatCacheStore.messages.get(convId);
    if (cached) {
      const updatedMessages = [...cached.messages, message];
      saveLocalMessages(convId, updatedMessages);
      chatCacheStore.messages.set(convId, {
        ...cached,
        messages: updatedMessages,
        timestamp: Date.now(),
      });
    }

    notifyListeners();
  },

  hasUnreadMessages(): boolean {
    return chatCacheStore.conversations.some((c) => c.unreadCount > 0);
  },

  subscribe(listener: CacheListener) {
    cacheListeners.add(listener);
    return () => {
      cacheListeners.delete(listener);
    };
  },

  clear() {
    chatCacheStore.conversations = [];
    chatCacheStore.deletedFriends = [];
    chatCacheStore.activeFriends = [];
    chatCacheStore.selectedConvId = null;
    chatCacheStore.hasInitialLoaded = false;
    chatCacheStore.messages.clear();

    if (typeof window !== 'undefined') {
      // 1. Clear active sessionStorage entries
      try {
        const sessionKeysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(CLIENT_STORAGE_PREFIX)) {
            sessionKeysToRemove.push(k);
          }
        }
        sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
      } catch {}

      // 2. Clean up any leftover legacy localStorage keys from prior versions
      try {
        const localKeysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CLIENT_STORAGE_PREFIX)) {
            localKeysToRemove.push(k);
          }
        }
        localKeysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }

    notifyListeners();
  },
};

let isPrefetchingChat = false;
let lastChatPrefetchTime = 0;
const CHAT_PREFETCH_COOLDOWN_MS = 60000; // 60s cooldown

/**
 * Silently pre-fetches conversation list and the top conversation's messages in the background
 * so that when the user switches to the Chat tab, it renders with 0s latency.
 */
export async function prefetchChatData(options?: { force?: boolean }): Promise<void> {
  const now = Date.now();
  if (!options?.force && now - lastChatPrefetchTime < CHAT_PREFETCH_COOLDOWN_MS) {
    return;
  }
  if (isPrefetchingChat) {
    return;
  }

  isPrefetchingChat = true;
  try {
    const [convs, former, active] = await Promise.all([
      api.locket.getConversations().catch(() => [] as LocketConversation[]),
      api.locket.getDeletedFriends().catch(() => [] as DeletedFriend[]),
      api.locket.getActiveFriends().catch(() => [] as ActiveFriend[]),
    ]);

    chatCache.setInitialData({
      conversations: convs,
      deletedFriends: former,
      activeFriends: active,
    });
    lastChatPrefetchTime = Date.now();

    // Prefetch messages of the top/latest conversation so clicking chat renders messages immediately
    if (convs.length > 0) {
      const topConvId = convs[0].id;
      if (!chatCache.getInitialData().selectedConvId) {
        chatCache.setSelectedConvId(topConvId);
      }
      const existingMsgs = chatCache.getMessages(topConvId);
      if (!existingMsgs || now - existingMsgs.timestamp > CHAT_PREFETCH_COOLDOWN_MS) {
        try {
          const msgRes = await api.locket.getMessages(topConvId);
          chatCache.setMessages(topConvId, msgRes.messages || [], msgRes.deletedCount || 0);
        } catch (msgErr) {
          console.debug('Latest message prefetch warning:', msgErr);
        }
      }
    }
  } catch (e) {
    console.debug('Chat prefetch warning (silent):', e);
  } finally {
    isPrefetchingChat = false;
  }
}
