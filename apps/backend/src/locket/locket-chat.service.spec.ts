import { LocketChatService } from './locket-chat.service';
import { LocketApiClient } from './locket-api.client';
import { LocketAuthService } from './locket-auth.service';
import { LocketFeedService } from './locket-feed.service';
import { SessionData } from '../session/session.service';

describe('LocketChatService', () => {
  let chatService: LocketChatService;
  let mockApiClient: Partial<LocketApiClient>;
  let mockAuthService: Partial<LocketAuthService>;
  let mockFeedService: Partial<LocketFeedService>;

  const mockSession: SessionData = {
    userId: 'my_user_id',
    email: 'test@example.com',
    idToken: 'valid_token',
    refreshToken: 'refresh_token',
    expiresAt: Date.now() + 3600000,
  };

  beforeEach(() => {
    mockApiClient = {
      listConversations: jest.fn(),
      getConversationMessages: jest.fn(),
      createMessage: jest.fn(),
      fetchUserV2: jest.fn(),
      listFriendUids: jest.fn(),
      getHistoryEntries: jest.fn(),
      getFirestoreDocOrCollection: jest.fn(),
    };
    mockAuthService = {
      getValidAccessToken: jest.fn().mockResolvedValue({
        idToken: 'valid_token',
        sessionNeedsUpdate: false,
      }),
    };
    mockFeedService = {
      getFriendsList: jest.fn(),
    };

    chatService = new LocketChatService(
      mockApiClient as LocketApiClient,
      mockAuthService as LocketAuthService,
      mockFeedService as LocketFeedService,
    );
  });

  describe('getConversations', () => {
    it('should list conversations with current friend and former friend resolution', async () => {
      (mockFeedService.getFriendsList as jest.Mock).mockResolvedValue([
        { uid: 'friend_1', name: 'Alice Friend', avatarUrl: 'alice.jpg' },
      ]);

      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_1',
          fields: {
            uid: { stringValue: 'conv_1' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'friend_1' },
                ],
              },
            },
            latest_message: {
              mapValue: {
                fields: {
                  body: { stringValue: 'Hi Alice!' },
                  sender: { stringValue: 'my_user_id' },
                  created_at: { timestampValue: '2026-09-12T10:00:00Z' },
                },
              },
            },
            unread_count: { integerValue: '0' },
            last_updated: { timestampValue: '2026-09-12T10:00:00Z' },
          },
        },
        {
          name: 'projects/.../conversations/conv_2',
          fields: {
            uid: { stringValue: 'conv_2' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'ex_friend_2' },
                ],
              },
            },
            latest_message: {
              mapValue: {
                fields: {
                  body: { stringValue: 'Long time no see' },
                  sender: { stringValue: 'ex_friend_2' },
                  created_at: { timestampValue: '2026-09-12T11:00:00Z' },
                },
              },
            },
            unread_count: { integerValue: '1' },
            last_updated: { timestampValue: '2026-09-12T11:00:00Z' },
          },
        },
      ]);

      (mockApiClient.fetchUserV2 as jest.Mock).mockResolvedValue({
        result: {
          data: {
            first_name: 'Bob',
            last_name: 'ExFriend',
            username: 'bob_ex',
            profile_picture_url: 'bob.jpg',
          },
        },
      });

      const res = await chatService.getConversations(mockSession);

      expect(res).toHaveLength(2);
      // Newest first: conv_2 at 11:00
      expect(res[0].id).toBe('conv_2');
      expect(res[0].friendUid).toBe('ex_friend_2');
      expect(res[0].isFriend).toBe(false);
      expect(res[0].friendName).toBe('Bob ExFriend');
      expect(res[0].unreadCount).toBe(1);

      // conv_1 at 10:00
      expect(res[1].id).toBe('conv_1');
      expect(res[1].friendUid).toBe('friend_1');
      expect(res[1].isFriend).toBe(true);
      expect(res[1].friendName).toBe('Alice Friend');
      expect(res[1].latestMessage?.isMine).toBe(true);
    });
  });

  describe('getMessages and Deleted Message Detection', () => {
    it('should fetch messages and detect deleted/recalled message across snapshots', async () => {
      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_123',
          fields: {
            uid: { stringValue: 'conv_123' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'friend_1' },
                ],
              },
            },
          },
        },
      ]);

      // First snapshot: msg_1 and msg_2 exist
      (mockApiClient.getConversationMessages as jest.Mock).mockResolvedValueOnce([
        {
          name: 'projects/.../messages/msg_1',
          fields: {
            sender: { stringValue: 'my_user_id' },
            body: { stringValue: 'First message' },
            created_at: { timestampValue: '2026-09-12T08:00:00Z' },
          },
        },
        {
          name: 'projects/.../messages/msg_2',
          fields: {
            sender: { stringValue: 'friend_1' },
            body: { stringValue: 'Secret that will be deleted' },
            created_at: { timestampValue: '2026-09-12T08:05:00Z' },
          },
        },
      ]);

      const firstCall = await chatService.getMessages(mockSession, 'conv_123');
      expect(firstCall.messages).toHaveLength(2);
      expect(firstCall.deletedCount).toBe(0);
      expect(firstCall.messages[0].isDeleted).toBe(false);
      expect(firstCall.messages[1].isDeleted).toBe(false);

      // Second snapshot: msg_2 has been deleted from Firestore!
      (mockApiClient.getConversationMessages as jest.Mock).mockResolvedValueOnce([
        {
          name: 'projects/.../messages/msg_1',
          fields: {
            sender: { stringValue: 'my_user_id' },
            body: { stringValue: 'First message' },
            created_at: { timestampValue: '2026-09-12T08:00:00Z' },
          },
        },
      ]);

      const secondCall = await chatService.getMessages(mockSession, 'conv_123');
      expect(secondCall.messages).toHaveLength(2);
      expect(secondCall.deletedCount).toBe(1);

      const deletedMsg = secondCall.messages.find((m) => m.id === 'msg_2');
      expect(deletedMsg).toBeDefined();
      expect(deletedMsg?.isDeleted).toBe(true);
      expect(deletedMsg?.body).toBe('Secret that will be deleted');
      expect(deletedMsg?.deletedAt).toBeDefined();
    });

    it('should throw NotFoundException if user is not a member of the conversation (IDOR prevention)', async () => {
      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_other',
          fields: {
            uid: { stringValue: 'conv_other' },
            members: {
              arrayValue: {
                values: [{ stringValue: 'my_user_id' }, { stringValue: 'friend_1' }],
              },
            },
          },
        },
      ]);
      (mockApiClient.getFirestoreDocOrCollection as jest.Mock).mockResolvedValue({
        fields: {
          members: {
            arrayValue: {
              values: [{ stringValue: 'victim_user_1' }, { stringValue: 'victim_user_2' }],
            },
          },
        },
      });

      await expect(
        chatService.getMessages(mockSession, 'conv_hacked'),
      ).rejects.toThrow('Conversation not found or you do not have permission to access it.');

      expect(mockApiClient.getConversationMessages).not.toHaveBeenCalled();
    });
  });

  describe('getDeletedFriends', () => {
    it('should find un-friended friends from conversations and moments history', async () => {
      (mockApiClient.listFriendUids as jest.Mock).mockResolvedValue(['friend_current']);

      // Conversations contains an ex-friend
      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_old',
          fields: {
            uid: { stringValue: 'conv_old' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'unfriended_1' },
                ],
              },
            },
            last_updated: { timestampValue: '2026-09-01T12:00:00Z' },
          },
        },
      ]);

      // Moments history contains another ex-friend
      (mockApiClient.getHistoryEntries as jest.Mock).mockResolvedValue({
        documents: [
          {
            fields: {
              user: { stringValue: 'unfriended_2' },
              date: { timestampValue: '2026-08-20T12:00:00Z' },
            },
          },
        ],
      });

      (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation((_, uid) => {
        if (uid === 'unfriended_1') {
          return Promise.resolve({
            result: {
              data: { first_name: 'Old', last_name: 'Pal', username: 'oldpal' },
            },
          });
        }
        return Promise.resolve({
          result: {
            data: { first_name: 'Past', last_name: 'Friend', username: 'pastfriend' },
          },
        });
      });

      const deletedFriends = await chatService.getDeletedFriends(mockSession);

      expect(deletedFriends).toHaveLength(2);
      expect(deletedFriends.find((f) => f.uid === 'unfriended_1')?.name).toBe('Old Pal');
      expect(deletedFriends.find((f) => f.uid === 'unfriended_2')?.name).toBe('Past Friend');
    });
  });

  describe('sendMessage', () => {
    it('should create message via client and update cache', async () => {
      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_1',
          fields: {
            uid: { stringValue: 'conv_1' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'friend_1' },
                ],
              },
            },
          },
        },
      ]);
      (mockApiClient.createMessage as jest.Mock).mockResolvedValue({
        name: 'projects/.../messages/new_msg_id',
      });

      const result = await chatService.sendMessage(
        mockSession,
        'conv_1',
        'Hello there!',
        'moment_999',
      );

      expect(result.id).toBe('new_msg_id');
      expect(result.senderUid).toBe('my_user_id');
      expect(result.body).toBe('Hello there!');
      expect(result.replyMoment).toBe('moment_999');
      expect(result.isMine).toBe(true);
    });

    it('should throw error if message body is empty', async () => {
      await expect(
        chatService.sendMessage(mockSession, 'conv_1', '   '),
      ).rejects.toThrow('Nội dung tin nhắn không được để trống.');
    });

    it('should throw NotFoundException if user is not a member of the conversation (IDOR tampering prevention)', async () => {
      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([]);
      (mockApiClient.getFirestoreDocOrCollection as jest.Mock).mockResolvedValue({
        fields: {
          members: {
            arrayValue: {
              values: [{ stringValue: 'victim_user_1' }, { stringValue: 'victim_user_2' }],
            },
          },
        },
      });

      await expect(
        chatService.sendMessage(mockSession, 'conv_victim', 'Unauthorized injection'),
      ).rejects.toThrow('Conversation not found or you do not have permission to access it.');

      expect(mockApiClient.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('getAllActiveFriends', () => {
    it('should list all active friends and map them with conversation presence', async () => {
      (mockFeedService.getFriendsList as jest.Mock).mockResolvedValue([
        { uid: 'friend_a', name: 'Alice', avatarUrl: 'alice.jpg' },
        { uid: 'friend_b', name: 'Bob', avatarUrl: 'bob.jpg' },
      ]);

      (mockApiClient.listConversations as jest.Mock).mockResolvedValue([
        {
          name: 'projects/.../conversations/conv_alice',
          fields: {
            uid: { stringValue: 'conv_alice' },
            members: {
              arrayValue: {
                values: [
                  { stringValue: 'my_user_id' },
                  { stringValue: 'friend_a' },
                ],
              },
            },
          },
        },
      ]);

      (mockApiClient.fetchUserV2 as jest.Mock).mockImplementation((_, uid) => {
        return Promise.resolve({
          result: {
            data: { username: `${uid}_handle` },
          },
        });
      });

      const result = await chatService.getAllActiveFriends(mockSession);

      expect(result).toHaveLength(2);
      // friend_a has conversation -> prioritized first
      expect(result[0].uid).toBe('friend_a');
      expect(result[0].hasConversation).toBe(true);
      expect(result[0].conversationId).toBe('conv_alice');

      // friend_b has no conversation
      expect(result[1].uid).toBe('friend_b');
      expect(result[1].hasConversation).toBe(false);
      expect(result[1].conversationId).toBeUndefined();
    });
  });
});

