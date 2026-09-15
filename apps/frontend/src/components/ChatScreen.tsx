'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageCircle,
  Send,
  Search,
  UserX,
  Users,
  AlertTriangle,
  RotateCcw,
  Check,
  CheckCheck,
  Copy,
  Clock,
  ChevronLeft,
  User,
  Trash2,
  Smile,
  Image as ImageIcon,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  LocketConversation,
  LocketMessage,
  DeletedFriend,
  ActiveFriend,
} from '../types/chat';
import { api } from '../lib/api';
import { chatCache } from '../lib/chatCache';

function formatMessageTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return `${d.toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'numeric',
    })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return dateString;
  }
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHour < 24) return `${diffHour}h`;
    if (diffDay === 1) return 'Hôm qua';
    if (diffDay < 7) return `${diffDay}d`;

    return date.toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export default function ChatScreen() {
  // Retrieve initial state from session cache if present
  const cachedInitial = chatCache.getInitialData();

  // State
  const [conversations, setConversations] = useState<LocketConversation[]>(cachedInitial.conversations);
  const [deletedFriends, setDeletedFriends] = useState<DeletedFriend[]>(cachedInitial.deletedFriends);
  const [activeFriends, setActiveFriends] = useState<ActiveFriend[]>(cachedInitial.activeFriends);

  const [selectedConvId, setSelectedConvId] = useState<string | null>(cachedInitial.selectedConvId);
  const [selectedDeletedFriend, setSelectedDeletedFriend] = useState<DeletedFriend | null>(null);
  const [selectedActiveFriend, setSelectedActiveFriend] = useState<ActiveFriend | null>(null);

  // Initialize messages from cache if selectedConvId is already cached
  const initialConvCache = cachedInitial.selectedConvId
    ? chatCache.getMessages(cachedInitial.selectedConvId)
    : null;

  const [messages, setMessages] = useState<LocketMessage[]>(initialConvCache?.messages || []);
  const [deletedCount, setDeletedCount] = useState<number>(initialConvCache?.deletedCount || 0);
  const [onlyShowDeleted, setOnlyShowDeleted] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'deleted'>('all');

  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(!cachedInitial.hasInitialLoaded);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isRevalidatingMessages, setIsRevalidatingMessages] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  // Mobile layout state
  const [showMobileChat, setShowMobileChat] = useState<boolean>(Boolean(cachedInitial.selectedConvId));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedConvIdRef = useRef<string | null>(selectedConvId);
  selectedConvIdRef.current = selectedConvId;
  const isSwitchingConvRef = useRef<boolean>(false);

  // 1. Fetch Conversations, Deleted Friends, and All-Time Active Friends
  const loadInitialData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh || !chatCache.getInitialData().hasInitialLoaded) {
      setIsLoadingList(true);
    }
    setErrorMsg(null);
    try {
      const [convs, former, active] = await Promise.all([
        api.locket.getConversations().catch(() => [] as LocketConversation[]),
        api.locket.getDeletedFriends().catch(() => [] as DeletedFriend[]),
        api.locket.getActiveFriends().catch(() => [] as ActiveFriend[]),
      ]);

      setConversations(convs);
      setDeletedFriends(former);
      setActiveFriends(active);
      chatCache.setInitialData({
        conversations: convs,
        deletedFriends: former,
        activeFriends: active,
      });

      // Default select first conversation if none selected and on desktop
      if (
        !selectedConvIdRef.current &&
        convs.length > 0 &&
        typeof window !== 'undefined' &&
        window.innerWidth >= 768
      ) {
        setSelectedConvId(convs[0].id);
        chatCache.setSelectedConvId(convs[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể tải danh sách tin nhắn.');
    } finally {
      setIsLoadingList(false);
    }
  }, []); // Empty dependency array prevents re-render reload on conversation switch!

  useEffect(() => {
    if (!chatCache.getInitialData().hasInitialLoaded) {
      loadInitialData();
    }
  }, [loadInitialData]);

  // 2. Fetch Messages when selected conversation changes (SWR Cache)
  const loadMessages = useCallback(async (convId: string, isManualRefresh = false) => {
    const cached = chatCache.getMessages(convId);

    if (cached && !isManualRefresh) {
      // SWR: Show cache immediately, no full-pane spinner!
      setMessages(cached.messages);
      setDeletedCount(cached.deletedCount);
      setIsLoadingMessages(false);
      setIsRevalidatingMessages(true);
    } else if (isManualRefresh) {
      setIsRevalidatingMessages(true);
    } else {
      setIsLoadingMessages(true);
    }

    try {
      const res = await api.locket.getMessages(convId);
      const newMessages = res.messages || [];
      const newDeletedCount = res.deletedCount || 0;

      setMessages(newMessages);
      setDeletedCount(newDeletedCount);
      chatCache.setMessages(convId, newMessages, newDeletedCount);
    } catch (err: any) {
      if (!cached || isManualRefresh) {
        console.error('Failed to load messages', err);
        if (isManualRefresh) {
          alert(`Không thể tải lại tin nhắn: ${err.message || 'Lỗi kết nối mạng.'}`);
        }
      }
    } finally {
      setIsLoadingMessages(false);
      setIsRevalidatingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      isSwitchingConvRef.current = true;
      chatCache.setSelectedConvId(selectedConvId);
      loadMessages(selectedConvId);
      setOnlyShowDeleted(false);
    }
  }, [selectedConvId, loadMessages]);

  // Scroll to bottom when messages load or change
  useEffect(() => {
    if (messagesEndRef.current) {
      if (isSwitchingConvRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        isSwitchingConvRef.current = false;
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, onlyShowDeleted]);

  // Active conversation object
  const activeConv = useMemo(() => {
    return conversations.find((c) => c.id === selectedConvId) || null;
  }, [conversations, selectedConvId]);

  // Filtered conversations list
  const filteredConversations = useMemo(() => {
    let list = [...conversations];

    if (activeTab === 'deleted') {
      list = list.filter((c) => !c.isFriend);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.friendName.toLowerCase().includes(q) ||
          (c.friendUsername && c.friendUsername.toLowerCase().includes(q)) ||
          (c.latestMessage?.body && c.latestMessage.body.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [conversations, activeTab, searchQuery]);

  // Filtered active friends list (all-time current friends)
  const filteredActiveFriends = useMemo(() => {
    if (!searchQuery.trim()) return activeFriends;
    const q = searchQuery.toLowerCase().trim();
    return activeFriends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.username && f.username.toLowerCase().includes(q)),
    );
  }, [activeFriends, searchQuery]);

  // Filtered deleted friends list
  const filteredDeletedFriends = useMemo(() => {
    if (!searchQuery.trim()) return deletedFriends;
    const q = searchQuery.toLowerCase().trim();
    return deletedFriends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.username && f.username.toLowerCase().includes(q)),
    );
  }, [deletedFriends, searchQuery]);

  // Displayed messages in chat pane
  const displayedMessages = useMemo(() => {
    if (!onlyShowDeleted) return messages;
    return messages.filter((m) => m.isDeleted);
  }, [messages, onlyShowDeleted]);

  // Target ID for sending a message
  const effectiveConvId = useMemo(() => {
    if (selectedConvId) return selectedConvId;
    if (selectedActiveFriend) {
      return selectedActiveFriend.conversationId || selectedActiveFriend.uid;
    }
    if (selectedDeletedFriend) {
      return selectedDeletedFriend.conversationId || selectedDeletedFriend.uid;
    }
    return null;
  }, [selectedConvId, selectedActiveFriend, selectedDeletedFriend]);

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || !effectiveConvId || isSending) return;

    setIsSending(true);
    try {
      const newMsg = await api.locket.sendMessage(effectiveConvId, {
        body: text,
      });

      // Append locally
      setMessages((prev) => [...prev, newMsg]);
      setInputText('');

      // If we started chat from a friend with no existing convId, refresh conversations
      if (!selectedConvId) {
        setSelectedConvId(effectiveConvId);
        chatCache.setSelectedConvId(effectiveConvId);
        api.locket.getConversations().then((convs) => {
          setConversations(convs);
          chatCache.setInitialData({
            conversations: convs,
            deletedFriends,
            activeFriends,
          });
        }).catch(() => {});
      } else {
        // Update latest message in conversations list & session cache
        chatCache.updateLatestMessage(selectedConvId, newMsg);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConvId
              ? {
                  ...c,
                  lastUpdated: newMsg.createdAt,
                  latestMessage: {
                    body: newMsg.body,
                    sender: newMsg.senderUid,
                    isMine: true,
                    createdAt: newMsg.createdAt,
                  },
                }
              : c,
          ),
        );
      }

      inputRef.current?.focus();
    } catch (err: any) {
      alert(`Gửi tin nhắn thất bại: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // Select conversation from list
  const handleSelectConv = (conv: LocketConversation) => {
    if (selectedConvId === conv.id) return;
    isSwitchingConvRef.current = true;
    setSelectedConvId(conv.id);
    setSelectedDeletedFriend(null);
    setSelectedActiveFriend(null);
    setShowMobileChat(true);
  };

  // Select active friend (from "Bạn bè hiện tại" tab)
  const handleSelectActiveFriend = (friend: ActiveFriend) => {
    setSelectedActiveFriend(friend);
    setSelectedDeletedFriend(null);
    if (friend.conversationId) {
      if (selectedConvId !== friend.conversationId) {
        isSwitchingConvRef.current = true;
        setSelectedConvId(friend.conversationId);
      }
    } else {
      setSelectedConvId(null);
      setMessages([]);
      setDeletedCount(0);
    }
    setShowMobileChat(true);
  };

  // Select deleted friend
  const handleSelectDeletedFriend = (friend: DeletedFriend) => {
    setSelectedDeletedFriend(friend);
    setSelectedActiveFriend(null);
    const targetConvId =
      friend.conversationId ||
      conversations.find((c) => c.friendUid === friend.uid)?.id;

    if (targetConvId) {
      if (selectedConvId !== targetConvId) {
        isSwitchingConvRef.current = true;
        setSelectedConvId(targetConvId);
      }
    } else {
      setSelectedConvId(null);
      setMessages([]);
      setDeletedCount(0);
    }
    setShowMobileChat(true);
  };

  // Restore deleted message into input field
  const handleRestoreMessage = (body: string) => {
    setInputText(body);
    setRestoreFeedback('Đã đưa nội dung vào khung chat! Bạn có thể xem lại hoặc gửi lại.');
    setTimeout(() => setRestoreFeedback(null), 3000);
    inputRef.current?.focus();
  };

  // Copy message text to clipboard
  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const currentFriendName =
    activeConv?.friendName ||
    selectedActiveFriend?.name ||
    selectedDeletedFriend?.name ||
    'Người dùng Locket';

  const currentFriendUsername =
    activeConv?.friendUsername ||
    selectedActiveFriend?.username ||
    selectedDeletedFriend?.username;

  const currentFriendAvatar =
    activeConv?.friendAvatarUrl ||
    selectedActiveFriend?.avatarUrl ||
    selectedDeletedFriend?.avatarUrl;

  const isCurrentExFriend =
    (activeConv && !activeConv.isFriend) || Boolean(selectedDeletedFriend);

  return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-140px)] min-h-[580px] bg-neutral-900/90 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col backdrop-blur-xl">
      <div className="flex-1 flex overflow-hidden">
        {/* ================= LEFT COLUMN: CONVERSATION LIST ================= */}
        <div
          className={`w-full md:w-[370px] lg:w-[410px] flex-shrink-0 flex flex-col border-r border-neutral-800/80 bg-neutral-950/60 ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header & Title */}
          <div className="p-4 border-b border-neutral-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">Tin nhắn</h2>
                <p className="text-xs text-neutral-400 leading-tight">
                  {conversations.length} cuộc trò chuyện • {activeFriends.length} bạn bè
                </p>
              </div>
            </div>

            <button
              onClick={() => loadInitialData(true)}
              disabled={isLoadingList}
              title="Làm mới danh sách"
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${isLoadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <div className="px-4 py-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bạn bè hoặc tin nhắn..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/60 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs (3 equal columns, evenly distributed) */}
          <div className="px-3 py-1.5 grid grid-cols-3 gap-1.5 border-b border-neutral-800/40">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all text-center truncate ${
                activeTab === 'all'
                  ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900/50'
              }`}
              title={`Tất cả hội thoại (${conversations.length})`}
            >
              Hội thoại ({conversations.length})
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1 truncate ${
                activeTab === 'active'
                  ? 'bg-yellow-400/20 text-yellow-400 font-semibold border border-yellow-400/30'
                  : 'text-neutral-400 hover:text-yellow-400 hover:bg-neutral-900/50'
              }`}
              title={`Bạn bè hiện tại (${activeFriends.length})`}
            >
              <Users className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Bạn bè ({activeFriends.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('deleted')}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1 truncate ${
                activeTab === 'deleted'
                  ? 'bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30'
                  : 'text-neutral-400 hover:text-amber-400/80 hover:bg-neutral-900/50'
              }`}
              title={`Đã hủy kết bạn (${deletedFriends.length})`}
            >
              <UserX className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Đã hủy ({deletedFriends.length})</span>
            </button>
          </div>

          {/* Conversation & Friends List View */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/30">
            {isLoadingList ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-8 h-8 mx-auto border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-neutral-400">Đang tải cuộc trò chuyện & bạn bè...</p>
              </div>
            ) : errorMsg ? (
              <div className="p-6 text-center text-xs text-red-400">
                {errorMsg}
              </div>
            ) : activeTab === 'active' ? (
              // ================= TAB: BẠN BÈ HIỆN TẠI (CHƯA XÓA TỪ TRƯỚC TỚI GIỜ) =================
              <div className="divide-y divide-neutral-800/30">
                {filteredActiveFriends.length === 0 ? (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    Không tìm thấy bạn bè nào phù hợp.
                  </div>
                ) : (
                  filteredActiveFriends.map((af) => {
                    const isSelected =
                      selectedActiveFriend?.uid === af.uid ||
                      (activeConv && activeConv.friendUid === af.uid);

                    return (
                      <div
                        key={af.uid}
                        onClick={() => handleSelectActiveFriend(af)}
                        className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-yellow-400/10 border-l-2 border-yellow-400'
                            : 'hover:bg-neutral-900/60'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          {af.avatarUrl ? (
                            <img
                              src={af.avatarUrl}
                              alt={af.name}
                              className="w-12 h-12 rounded-full object-cover border border-neutral-700"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-sm font-bold">
                              {af.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-950"
                            title="Bạn bè hiện tại"
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-sm font-medium text-white truncate">
                              {af.name}
                            </h4>
                            {af.hasConversation ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                Đã có chat
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 whitespace-nowrap">
                                Chưa nhắn tin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 truncate">
                            {af.username ? `@${af.username}` : 'Bạn bè Locket'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : activeTab === 'deleted' ? (
              // ================= TAB: BẠN BÈ ĐÃ XÓA / ĐÃ HỦY KẾT BẠN =================
              <div className="divide-y divide-neutral-800/30">
                {filteredDeletedFriends.length === 0 ? (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    Không tìm thấy bạn bè đã xóa nào.
                  </div>
                ) : (
                  filteredDeletedFriends.map((df) => {
                    const isSelected =
                      selectedDeletedFriend?.uid === df.uid ||
                      (activeConv && activeConv.friendUid === df.uid);

                    return (
                      <div
                        key={df.uid}
                        onClick={() => handleSelectDeletedFriend(df)}
                        className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 border-l-2 border-amber-400'
                            : 'hover:bg-neutral-900/60'
                        }`}
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          {df.avatarUrl ? (
                            <img
                              src={df.avatarUrl}
                              alt={df.name}
                              className="w-12 h-12 rounded-full object-cover border border-neutral-700 opacity-90"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center text-sm font-bold">
                              {df.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-neutral-950">
                            <UserX className="w-3.5 h-3.5 text-amber-400" />
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-sm font-medium text-white truncate">
                              {df.name}
                            </h4>
                            {df.lastInteractionAt && (
                              <span className="text-[10px] text-neutral-500 whitespace-nowrap">
                                {formatRelativeTime(df.lastInteractionAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 truncate">
                            {df.username ? `@${df.username}` : 'Cựu bạn bè Locket'}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
                              <UserX className="w-2.5 h-2.5" />
                              Đã hủy kết bạn
                            </span>
                            {df.conversationId && (
                              <span className="text-[10px] text-neutral-500">
                                Có lịch sử chat
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : filteredConversations.length === 0 ? (
              // ================= EMPTY CONVERSATIONS =================
              <div className="p-8 text-center text-xs text-neutral-500">
                {searchQuery
                  ? 'Không tìm thấy cuộc trò chuyện phù hợp.'
                  : 'Chưa có cuộc trò chuyện nào.'}
              </div>
            ) : (
              // ================= ALL / UNREAD CONVERSATIONS =================
              filteredConversations.map((conv) => {
                const isSelected = selectedConvId === conv.id;
                const hasUnread = conv.unreadCount > 0;

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConv(conv)}
                    className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-neutral-800/80 border-l-2 border-yellow-400'
                        : 'hover:bg-neutral-900/60'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {conv.friendAvatarUrl ? (
                        <img
                          src={conv.friendAvatarUrl}
                          alt={conv.friendName}
                          className="w-12 h-12 rounded-full object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-sm font-bold">
                          {conv.friendName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {!conv.isFriend ? (
                        <div
                          className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-neutral-950"
                          title="Bạn bè đã hủy kết bạn"
                        >
                          <UserX className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                      ) : (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-neutral-950" />
                      )}
                    </div>

                    {/* Conversation Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4
                            className={`text-sm truncate ${
                              hasUnread ? 'font-bold text-white' : 'font-medium text-neutral-200'
                            }`}
                          >
                            {conv.friendName}
                          </h4>
                          {!conv.isFriend && (
                            <span className="flex-shrink-0 px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Đã xóa
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] whitespace-nowrap ${
                            hasUnread ? 'text-yellow-400 font-semibold' : 'text-neutral-500'
                          }`}
                        >
                          {formatRelativeTime(conv.lastUpdated)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p
                          className={`text-xs truncate ${
                            hasUnread ? 'text-neutral-200 font-semibold' : 'text-neutral-400'
                          }`}
                        >
                          {conv.latestMessage?.isMine && (
                            <span className="text-neutral-500">Bạn: </span>
                          )}
                          {conv.latestMessage?.body ||
                            (conv.latestMessage?.replyMoment ? 'Đã trả lời một khoảnh khắc' : '...')}
                        </p>

                        {/* Reaction or Unread Count */}
                        {conv.latestMessage?.latestReaction && (
                          <span className="text-xs" title="Reaction">
                            {conv.latestMessage.latestReaction.emoji}
                          </span>
                        )}

                        {hasUnread && (
                          <span className="px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[10px] font-bold">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: CHAT PANE ================= */}
        <div
          className={`flex-1 flex flex-col bg-neutral-950/40 relative ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activeConv || selectedActiveFriend || selectedDeletedFriend ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 sm:px-6 sm:py-4 border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mobile Back button */}
                  <button
                    onClick={() => setShowMobileChat(false)}
                    className="p-1.5 -ml-1.5 rounded-xl text-neutral-400 hover:text-white md:hidden"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {/* Avatar */}
                  <div className="relative">
                    {currentFriendAvatar ? (
                      <img
                        src={currentFriendAvatar}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-sm font-bold">
                        {currentFriendName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Profile info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white">
                        {currentFriendName}
                      </h3>
                      {isCurrentExFriend ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <UserX className="w-3 h-3" />
                          Đã hủy kết bạn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Bạn bè hiện tại
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">
                      {currentFriendUsername ? `@${currentFriendUsername}` : 'Locket Friend'}
                    </p>
                  </div>
                </div>

                {/* Filter and Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* Deleted Messages Filter Toggle */}
                  <button
                    onClick={() => setOnlyShowDeleted(!onlyShowDeleted)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                      onlyShowDeleted
                        ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-sm shadow-red-500/10'
                        : deletedCount > 0
                        ? 'bg-neutral-800/80 text-neutral-300 border-neutral-700 hover:border-red-400/50 hover:text-white'
                        : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Tin đã xóa ({deletedCount})</span>
                  </button>

                  {/* Reload Messages button */}
                  {selectedConvId && (
                    <button
                      onClick={() => loadMessages(selectedConvId, true)}
                      disabled={isLoadingMessages || isRevalidatingMessages}
                      title="Làm mới tin nhắn"
                      className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw
                        className={`w-4 h-4 ${
                          isLoadingMessages || isRevalidatingMessages
                            ? 'animate-spin text-yellow-400'
                            : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Feedback toast when restoring message */}
              {restoreFeedback && (
                <div className="px-4 py-2 bg-yellow-400/15 border-b border-yellow-400/30 flex items-center justify-between text-xs text-yellow-300 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <span>{restoreFeedback}</span>
                  </div>
                  <button
                    onClick={() => setRestoreFeedback(null)}
                    className="text-neutral-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Notice Banner if Ex-Friend */}
              {isCurrentExFriend && (
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>
                      Người dùng này không còn trong danh sách bạn bè Locket của bạn. Toàn bộ tin nhắn cũ và tin nhắn đã thu hồi vẫn được lưu giữ an toàn vĩnh viễn tại đây.
                    </span>
                  </div>
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {isLoadingMessages ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-neutral-400">Đang tải tin nhắn...</p>
                  </div>
                ) : displayedMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                      {onlyShowDeleted ? (
                        <Trash2 className="w-6 h-6 text-neutral-500" />
                      ) : (
                        <MessageCircle className="w-6 h-6 text-neutral-500" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-neutral-300">
                      {onlyShowDeleted
                        ? 'Không có tin nhắn nào bị thu hồi hoặc xóa trong cuộc hội thoại này.'
                        : `Chưa có tin nhắn nào với ${currentFriendName}. Hãy gửi lời chào đầu tiên!`}
                    </p>
                  </div>
                ) : (
                  displayedMessages.map((msg) => {
                    const isDeleted = msg.isDeleted;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.isMine ? 'items-end' : 'items-start'
                        }`}
                      >
                        {/* DELETED / RECALLED MESSAGE BADGE */}
                        {isDeleted && (
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Tin nhắn đã bị thu hồi / đã xóa</span>
                            {msg.deletedAt && (
                              <span className="text-[10px] text-rose-300/70 font-normal">
                                • {formatRelativeTime(msg.deletedAt)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Message Bubble */}
                        <div
                          className={`max-w-[88%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-md relative group transition-all ${
                            isDeleted
                              ? 'bg-rose-950/25 border-2 border-dashed border-rose-500/50 text-neutral-200 shadow-rose-950/20'
                              : msg.isMine
                              ? 'bg-yellow-400 text-neutral-950 font-medium rounded-tr-sm'
                              : 'bg-neutral-800/90 text-white rounded-tl-sm border border-neutral-700/60'
                          }`}
                        >
                          {/* Reply Moment Preview if available */}
                          {msg.replyMoment && (
                            <div
                              className={`mb-2 p-2 rounded-xl text-xs flex items-center gap-2 ${
                                msg.isMine
                                  ? 'bg-yellow-500/20 text-neutral-900 border border-yellow-500/30'
                                  : 'bg-neutral-900/60 text-neutral-300 border border-neutral-700'
                              }`}
                            >
                              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate">Trả lời một khoảnh khắc</span>
                            </div>
                          )}

                          {/* Thumbnail / Image Attachment */}
                          {msg.thumbnailUrl && (
                            <div className="mb-2 rounded-xl overflow-hidden max-w-[240px]">
                              <img
                                src={msg.thumbnailUrl}
                                alt="Attachment"
                                className="w-full h-auto object-cover rounded-xl"
                              />
                            </div>
                          )}

                          {/* Message Body */}
                          {msg.body && (
                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {msg.body}
                            </p>
                          )}

                          {/* ACTION BUTTONS FOR RECALLED / DELETED MESSAGE */}
                          {isDeleted && msg.body && (
                            <div className="mt-2.5 pt-2 border-t border-rose-500/30 flex flex-wrap items-center gap-2">
                              {/* Restore into chat input button */}
                              <button
                                onClick={() => handleRestoreMessage(msg.body!)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-yellow-400 text-black hover:bg-yellow-300 active:scale-95 transition-all shadow-sm"
                                title="Đưa nội dung này vào khung chat để xem lại hoặc gửi lại"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Khôi phục nội dung</span>
                              </button>

                              {/* Copy button */}
                              <button
                                onClick={() => handleCopyMessage(msg.id, msg.body!)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-neutral-300 bg-neutral-900/80 hover:bg-neutral-800 hover:text-white transition-all border border-neutral-700/60"
                                title="Sao chép nội dung"
                              >
                                {copiedMsgId === msg.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Đã chép</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Sao chép</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Reactions Display */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="absolute -bottom-2.5 right-2 flex items-center bg-neutral-900 px-1.5 py-0.5 rounded-full border border-neutral-700 text-xs shadow-md">
                              {msg.reactions.join(' ')}
                            </div>
                          )}
                        </div>

                        {/* Timestamp & Meta */}
                        <div className="mt-1 px-1 flex items-center gap-1.5 text-[10px] text-neutral-500">
                          <span>{formatMessageTime(msg.createdAt)}</span>
                          {msg.isMine && !isDeleted && (
                            <CheckCheck className="w-3 h-3 text-neutral-400" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 sm:p-4 border-t border-neutral-800/80 bg-neutral-900/80 backdrop-blur-md">
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2.5"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={`Nhắn tin cho ${currentFriendName}...`}
                    disabled={!effectiveConvId || isSending}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400 transition-colors disabled:opacity-50"
                  />

                  <button
                    type="submit"
                    disabled={!inputText.trim() || !effectiveConvId || isSending}
                    className="p-3 rounded-2xl bg-yellow-400 text-black font-semibold hover:bg-yellow-300 active:scale-95 transition-all shadow-md shadow-yellow-400/20 disabled:opacity-40 disabled:pointer-events-none"
                    title="Gửi tin nhắn"
                  >
                    <Send className={`w-5 h-5 ${isSending ? 'animate-pulse' : ''}`} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            // No Active Conversation Selected Placeholder
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-xl">
                <MessageCircle className="w-10 h-10 text-yellow-400" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-lg font-bold text-white">Tin nhắn Locket</h3>
                <p className="text-xs text-neutral-400">
                  Chọn một cuộc trò chuyện từ danh sách, hoặc xem danh mục <span className="text-yellow-400 font-semibold">Bạn bè hiện tại</span> và <span className="text-amber-400 font-semibold">Đã hủy kết bạn</span> để đọc lại toàn bộ tin nhắn đã lưu hoặc gửi tin nhắn mới.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
