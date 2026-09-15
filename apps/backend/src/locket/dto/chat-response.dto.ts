import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class LatestMessageDto {
  body?: string;
  sender: string;
  isMine: boolean;
  createdAt: string;
  thumbnailUrl?: string;
  replyMoment?: string;
  latestReaction?: {
    emoji: string;
    sender: string;
    createdAt?: string;
  };
}

export class LocketConversationDto {
  id: string;
  friendUid: string;
  friendName: string;
  friendAvatarUrl?: string;
  friendUsername?: string;
  isFriend: boolean;
  unreadCount: number;
  lastUpdated: string;
  latestMessage?: LatestMessageDto;
}

export class LocketMessageDto {
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

export class DeletedFriendDto {
  uid: string;
  name: string;
  avatarUrl?: string;
  username?: string;
  conversationId?: string;
  lastInteractionAt?: string;
  sharedMomentsCount?: number;
  messagesCount?: number;
}

export class ActiveFriendDto {
  uid: string;
  name: string;
  avatarUrl?: string;
  username?: string;
  conversationId?: string;
  hasConversation: boolean;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, {
    message: 'Message body cannot exceed 1000 characters.',
  })
  body: string;

  @IsOptional()
  @IsString()
  replyMoment?: string;
}
