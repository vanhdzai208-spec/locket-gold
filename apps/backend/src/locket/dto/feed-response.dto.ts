export interface LocketFeedItemDto {
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

export interface LocketFeedResponseDto {
  items: LocketFeedItemDto[];
  missedMomentsCount: number;
  syncToken?: string;
  syncedAt?: number;
  totalCount?: number;
}

export interface LocketFriendDto {
  uid: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  isFormerFriend?: boolean;
  friendedAt?: string;
  exclusionReason?: 'blocked_at_post' | 'new_friend';
}

export interface MomentViewerDto {
  uid: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  viewedAt?: string;
  reaction?: string;
  isFormerFriend?: boolean;
}

export interface MomentDetailsResponseDto {
  momentId: string;
  isMine: boolean;
  createdAt?: string;
  caption?: string;
  viewers: MomentViewerDto[];
  viewsCount: number;
  audience: {
    sentToAll: boolean;
    recipients: string[];
    excludedFriends: LocketFriendDto[];
    blockedFriends?: LocketFriendDto[];
    newFriends?: LocketFriendDto[];
    allowedFriends: LocketFriendDto[];
    unviewedFriends?: LocketFriendDto[];
  };
}
