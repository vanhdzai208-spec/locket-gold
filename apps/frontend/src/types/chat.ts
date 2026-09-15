export interface LatestReaction {
  emoji: string;
  sender: string;
  createdAt?: string;
}

export interface LatestMessage {
  body?: string;
  sender: string;
  isMine: boolean;
  createdAt: string;
  thumbnailUrl?: string;
  replyMoment?: string;
  latestReaction?: LatestReaction;
}

export interface LocketConversation {
  id: string;
  friendUid: string;
  friendName: string;
  friendAvatarUrl?: string;
  friendUsername?: string;
  isFriend: boolean;
  unreadCount: number;
  lastUpdated: string;
  latestMessage?: LatestMessage;
}

export interface LocketMessage {
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

export interface MessagesResponse {
  messages: LocketMessage[];
  deletedCount: number;
}

export interface DeletedFriend {
  uid: string;
  name: string;
  avatarUrl?: string;
  username?: string;
  conversationId?: string;
  lastInteractionAt?: string;
  sharedMomentsCount?: number;
  messagesCount?: number;
}

export interface SendMessagePayload {
  body: string;
  replyMoment?: string;
}

export interface ActiveFriend {
  uid: string;
  name: string;
  avatarUrl?: string;
  username?: string;
  conversationId?: string;
  hasConversation: boolean;
}

