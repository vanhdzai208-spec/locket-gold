export interface LocketFeedItem {
  id: string;
  authorUid: string;
  authorName: string;
  authorAvatarUrl?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  caption?: string;
  createdAt: string;
  isMine: boolean;
  recipients?: string[];
  sentToAll?: boolean;
}

export interface LocketFeedResponse {
  items: LocketFeedItem[];
  missedMomentsCount: number;
  syncToken?: string;
  syncedAt?: number;
  totalCount?: number;
}

export interface LocketFriend {
  uid: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  isFormerFriend?: boolean;
  friendedAt?: string;
  exclusionReason?: 'blocked_at_post' | 'new_friend';
}

export interface MomentViewer {
  uid: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  viewedAt?: string;
  reaction?: string;
  isFormerFriend?: boolean;
}

export interface MomentDetailsResponse {
  momentId: string;
  isMine: boolean;
  createdAt?: string;
  caption?: string;
  viewers: MomentViewer[];
  viewsCount: number;
  audience: {
    sentToAll: boolean;
    recipients: string[];
    excludedFriends: LocketFriend[];
    blockedFriends?: LocketFriend[];
    newFriends?: LocketFriend[];
    allowedFriends: LocketFriend[];
    unviewedFriends?: LocketFriend[];
  };
}
