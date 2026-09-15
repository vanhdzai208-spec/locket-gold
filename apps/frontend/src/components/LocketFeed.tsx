'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  RotateCcw,
  Download,
  Maximize2,
  Sparkles,
  X,
  Clock,
  User,
  AlertCircle,
  Camera,
  ExternalLink,
  Users,
  Calendar,
  ChevronDown,
  Search,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
  UserX,
  UserPlus,
  Heart,
  ShieldCheck,
  Trash2,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  LocketFeedItem,
  LocketFeedResponse,
  MomentDetailsResponse,
} from '../types/feed';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { prefetchChatData } from '../lib/chatCache';

interface LocketFeedProps {
  onRemixMoment: (imageUrl: string, caption?: string) => void;
  onGoToUpload: () => void;
}

function autoHealDate(dateValue?: any): Date {
  if (!dateValue) return new Date();
  try {
    if (typeof dateValue === 'number') {
      const ms = dateValue < 1e11 ? dateValue * 1000 : dateValue;
      return new Date(ms);
    }
    const num = Number(dateValue);
    if (!isNaN(num) && String(dateValue).trim() !== '') {
      const ms = num < 1e11 ? num * 1000 : num;
      return new Date(ms);
    }
    const parsed = new Date(dateValue);
    if (!isNaN(parsed.getTime())) {
      // Auto-heal 1970 timestamp bug caused by seconds being parsed as ms
      if (parsed.getFullYear() < 2000) {
        const t = parsed.getTime();
        const ms = t > 0 && t < 1e11 ? t * 1000 : t;
        return new Date(ms);
      }
      return parsed;
    }
    return new Date();
  } catch {
    return new Date();
  }
}

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date();
    const date = autoHealDate(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHour < 24) return `${diffHour} giờ trước`;
    if (diffDay === 1) return 'Hôm qua';
    if (diffDay < 7) return `${diffDay} ngày trước`;

    return date.toLocaleDateString('vi-VN', {
      day: 'numeric',
      month: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateString;
  }
}

function getCleanPhotoKey(url?: string): string {
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

export default function LocketFeed({ onRemixMoment, onGoToUpload }: LocketFeedProps) {
  const { user } = useAuth();
  const userUid = user?.uid;

  const CACHE_KEY = useMemo(
    () => (userUid ? `locket_feed_moments_${userUid}` : 'locket_feed_moments_guest'),
    [userUid],
  );
  const CACHE_TIME_KEY = useMemo(
    () => (userUid ? `locket_feed_last_sync_${userUid}` : 'locket_feed_last_sync_guest'),
    [userUid],
  );

  const [items, setItems] = useState<LocketFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'friends' | 'mine'>('all');
  const [selectedAuthorUid, setSelectedAuthorUid] = useState<string | null>(null);
  const [activeLightboxItem, setActiveLightboxItem] = useState<LocketFeedItem | null>(null);
  const [momentDetails, setMomentDetails] = useState<MomentDetailsResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'viewers' | 'audience'>('viewers');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [backgroundSyncMsg, setBackgroundSyncMsg] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLightboxMuted, setIsLightboxMuted] = useState(false);

  // Network request concurrency lock & debounce cooldown
  const isFetchingRef = useRef(false);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const MIN_SYNC_COOLDOWN_MS = 20000; // 20s cooldown between visibility/focus triggers

  // Immediate event synchronization for moments newly posted by the user
  useEffect(() => {
    const handleMomentPosted = (e: Event) => {
      const customEvent = e as CustomEvent<LocketFeedItem>;
      if (customEvent.detail) {
        setItems((prev) => {
          if (prev.some((it) => it.id === customEvent.detail.id)) return prev;
          const nextList = [customEvent.detail, ...prev];
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(nextList));
          } catch {}
          return nextList;
        });
      }
    };
    window.addEventListener('locket_moment_posted', handleMomentPosted);
    return () => {
      window.removeEventListener('locket_moment_posted', handleMomentPosted);
    };
  }, [CACHE_KEY]);

  // Friend dropdown states
  const [isFriendsDropdownOpen, setIsFriendsDropdownOpen] = useState(false);
  const [friendSearchTerm, setFriendSearchTerm] = useState('');
  const friendsDropdownRef = useRef<HTMLDivElement>(null);

  // Date Range Filter states
  type DatePreset = 'all' | 'today' | '7days' | '30days' | 'this_month' | 'this_year' | 'custom';
  const [selectedDatePreset, setSelectedDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedDateRange, setAppliedDateRange] = useState<{
    start: Date | null;
    end: Date | null;
    label: string | null;
  }>({ start: null, end: null, label: null });
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  const applyPreset = useCallback((preset: DatePreset) => {
    const now = new Date();
    setSelectedDatePreset(preset);

    if (preset === 'all') {
      setAppliedDateRange({ start: null, end: null, label: null });
      setCustomStartDate('');
      setCustomEndDate('');
      setIsDateDropdownOpen(false);
      return;
    }

    if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      setAppliedDateRange({ start, end, label: 'Hôm nay' });
      setIsDateDropdownOpen(false);
      return;
    }

    if (preset === '7days') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      setAppliedDateRange({ start, end: now, label: '7 ngày qua' });
      setIsDateDropdownOpen(false);
      return;
    }

    if (preset === '30days') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      setAppliedDateRange({ start, end: now, label: '30 ngày qua' });
      setIsDateDropdownOpen(false);
      return;
    }

    if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      setAppliedDateRange({ start, end, label: 'Tháng này' });
      setIsDateDropdownOpen(false);
      return;
    }

    if (preset === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      setAppliedDateRange({ start, end, label: `Năm ${now.getFullYear()}` });
      setIsDateDropdownOpen(false);
      return;
    }
  }, []);

  const applyCustomRange = useCallback(() => {
    if (!customStartDate && !customEndDate) {
      applyPreset('all');
      return;
    }
    const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
    const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : null;

    let label = '';
    if (customStartDate && customEndDate) {
      const [sy, sm, sd] = customStartDate.split('-');
      const [ey, em, ed] = customEndDate.split('-');
      label = `${sd}/${sm} - ${ed}/${em}`;
    } else if (customStartDate) {
      const [sy, sm, sd] = customStartDate.split('-');
      label = `Từ ${sd}/${sm}`;
    } else {
      const [ey, em, ed] = customEndDate.split('-');
      label = `Đến ${ed}/${em}`;
    }

    setSelectedDatePreset('custom');
    setAppliedDateRange({ start, end, label });
    setIsDateDropdownOpen(false);
  }, [customStartDate, customEndDate, applyPreset]);

  const clearDateRange = useCallback(() => {
    applyPreset('all');
  }, [applyPreset]);

  // Close dropdowns on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        friendsDropdownRef.current &&
        !friendsDropdownRef.current.contains(e.target as Node)
      ) {
        setIsFriendsDropdownOpen(false);
      }
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(e.target as Node)
      ) {
        setIsDateDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFriendsDropdownOpen(false);
        setIsDateDropdownOpen(false);
      }
    };
    if (isFriendsDropdownOpen || isDateDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFriendsDropdownOpen, isDateDropdownOpen]);

  // Track recently deleted item IDs and photo keys across sync cycles to prevent race conditions / ghost resurrections
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const deletedPhotoKeysRef = useRef<Set<string>>(new Set());

  // Load previously deleted identifiers from sessionStorage so soft navigation/refresh retains them
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('locket_deleted_moment_ids');
      if (stored) {
        const parsed: string[] = JSON.parse(stored);
        parsed.forEach((id) => deletedIdsRef.current.add(id));
      }
      const storedKeys = sessionStorage.getItem('locket_deleted_photo_keys');
      if (storedKeys) {
        const parsedKeys: string[] = JSON.parse(storedKeys);
        parsedKeys.forEach((key) => deletedPhotoKeysRef.current.add(key));
      }
    } catch {}
  }, []);

  const rememberDeletedMoment = useCallback((id: string, photoKey?: string) => {
    if (id) deletedIdsRef.current.add(id);
    if (photoKey) deletedPhotoKeysRef.current.add(photoKey);
    try {
      sessionStorage.setItem(
        'locket_deleted_moment_ids',
        JSON.stringify(Array.from(deletedIdsRef.current)),
      );
      if (photoKey) {
        sessionStorage.setItem(
          'locket_deleted_photo_keys',
          JSON.stringify(Array.from(deletedPhotoKeysRef.current)),
        );
      }
    } catch {}
  }, []);

  const isMomentDeleted = useCallback((item: { id: string; imageUrl?: string; thumbnailUrl?: string }) => {
    if (deletedIdsRef.current.has(item.id)) return true;
    const photoKey = getCleanPhotoKey(item.imageUrl || item.thumbnailUrl);
    if (photoKey && deletedPhotoKeysRef.current.has(photoKey)) return true;
    return false;
  }, []);

  const handleDeleteMoment = async () => {
    const targetItem = activeLightboxItem;
    if (!targetItem || !targetItem.isMine) return;

    const targetId = targetItem.id;
    const targetPhotoKey = getCleanPhotoKey(targetItem.imageUrl || targetItem.thumbnailUrl);

    // 1. Immediately register in deleted sets to guard against background sync resurrection
    rememberDeletedMoment(targetId, targetPhotoKey);

    // 2. INSTANT OPTIMISTIC UPDATE (0ms):
    // Dismiss lightbox & confirm dialog right away for instant responsive feedback
    setActiveLightboxItem(null);
    setIsConfirmingDelete(false);
    setIsDeleting(false);

    // Immediately remove from items and write to localStorage
    setItems((prev) => {
      const updated = prev.filter((item) => {
        if (item.id === targetId) return false;
        if (isMomentDeleted(item)) return false;
        if (targetPhotoKey) {
          const itemKey = getCleanPhotoKey(item.imageUrl || item.thumbnailUrl);
          if (itemKey && itemKey === targetPhotoKey) {
            rememberDeletedMoment(item.id, itemKey);
            return false;
          }
        }
        return true;
      });
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setToastMessage({ type: 'success', text: 'Đang xóa khoảnh khắc...' });

    // 3. Trigger backend deletion in background
    try {
      const res = await api.locket.deleteMoment(targetId);
      const backendUids = res?.deletedUids || [];
      if (backendUids.length > 0) {
        backendUids.forEach((uid) => rememberDeletedMoment(uid));
        setItems((prev) => {
          const updated = prev.filter((item) => !deletedIdsRef.current.has(item.id));
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
      setToastMessage({ type: 'success', text: 'Đã xóa khoảnh khắc thành công!' });
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error('Delete moment error:', err);
      // Rollback on failure
      deletedIdsRef.current.delete(targetId);
      if (targetPhotoKey) deletedPhotoKeysRef.current.delete(targetPhotoKey);
      setItems((prev) => {
        if (prev.some((it) => it.id === targetItem.id)) return prev;
        const rolledBack = [targetItem, ...prev].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(rolledBack));
        } catch {}
        return rolledBack;
      });
      setToastMessage({
        type: 'error',
        text: `Xóa thất bại: ${err.message || 'Lỗi hệ thống'}`,
      });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // 1. Stage 1: Quick initial feed (~100 items, loads in 1-2s, unlocks UI immediately)
  const fetchQuickFeed = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.locket.getFeed({ quick: true });
      const rawQuick = data.items || [];
      const quickItems = rawQuick.filter((item) => !isMomentDeleted(item));
      if (quickItems.length > 0) {
        setItems(quickItems);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(quickItems));
          localStorage.setItem(CACHE_TIME_KEY, String(data.syncedAt || Date.now()));
        } catch (e) {
          console.warn('Could not save quick feed to localStorage:', e);
        }
      }
    } catch (err: any) {
      console.warn('Quick feed fetch error:', err);
      setError(err.message || 'Không thể tải nhanh feed ảnh từ Locket.');
    } finally {
      setIsLoading(false);
    }
  }, [CACHE_KEY, CACHE_TIME_KEY, isMomentDeleted]);

  // 2. Stage 2: Background deep sync for all older moments
  const startBackgroundDeepSync = useCallback(async () => {
    setIsBackgroundSyncing(true);
    try {
      const data = await api.locket.getFeed({ full: true });
      const deepItems = data.items || [];
      if (deepItems.length > 0) {
        setItems((prevItems) => {
          const itemMap = new Map<string, LocketFeedItem>();
          for (const item of prevItems) {
            if (!isMomentDeleted(item)) {
              itemMap.set(item.id, item);
            }
          }
          for (const item of deepItems) {
            if (!isMomentDeleted(item)) {
              itemMap.set(item.id, item);
            }
          }
          const merged = Array.from(itemMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
            localStorage.setItem(CACHE_TIME_KEY, String(data.syncedAt || Date.now()));
          } catch (e) {
            console.warn('Could not save deep feed to localStorage:', e);
          }
          return merged;
        });
        setBackgroundSyncMsg(`Đã đồng bộ xong toàn bộ kho ảnh!`);
        setTimeout(() => setBackgroundSyncMsg(null), 5000);
      }
    } catch (err: any) {
      console.warn('Background deep sync error:', err);
    } finally {
      setIsBackgroundSyncing(false);
      prefetchChatData();
    }
  }, [CACHE_KEY, CACHE_TIME_KEY, isMomentDeleted]);

  // 3. Incremental auto-sync for newly published moments
  const fetchFeed = useCallback(
    async (options?: { isManualRetry?: boolean; since?: number }) => {
      // Concurrency lock: do not run parallel sync requests
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsSyncing(true);
      if (options?.isManualRetry) {
        setError(null);
      }

      try {
        const data = await api.locket.getFeed({
          since: options?.since,
        });

        lastSyncTimeRef.current = Date.now();
        const newItems = data.items || [];

        if (newItems.length > 0) {
          setItems((prevItems) => {
            const itemMap = new Map<string, LocketFeedItem>();
            for (const item of prevItems) {
              if (!isMomentDeleted(item)) {
                itemMap.set(item.id, item);
              }
            }
            for (const item of newItems) {
              if (!isMomentDeleted(item)) {
                itemMap.set(item.id, item);
              }
            }
            const merged = Array.from(itemMap.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );

            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
              localStorage.setItem(CACHE_TIME_KEY, String(data.syncedAt || Date.now()));
            } catch (e) {
              console.warn('Could not save to localStorage:', e);
            }

            return merged;
          });
        } else {
          try {
            localStorage.setItem(CACHE_TIME_KEY, String(data.syncedAt || Date.now()));
          } catch {}
        }
      } catch (err: any) {
        console.warn('Background auto-sync failed (retaining existing moments):', err);
        if (options?.isManualRetry) {
          setError(err.message || 'Không thể đồng bộ với Locket.');
        }
      } finally {
        isFetchingRef.current = false;
        setIsSyncing(false);
        prefetchChatData();
      }
    },
    [CACHE_KEY, CACHE_TIME_KEY, isMomentDeleted],
  );

  useEffect(() => {
    if (!userUid) return;

    // Reset items for this user/account
    setItems([]);
    setIsLoading(true);

    // 1. Check local cache first for instant 0s rendering
    let cachedItems: LocketFeedItem[] = [];
    let lastSync = 0;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const rawTime = localStorage.getItem(CACHE_TIME_KEY);
      if (raw) {
        cachedItems = JSON.parse(raw);
      }
      if (rawTime) {
        lastSync = parseInt(rawTime, 10);
      }
    } catch (e) {
      console.warn('Error reading cache:', e);
    }

    if (cachedItems.length > 0) {
      // Instant render from local cache, filtering out any deleted items and auto-healing 1970 timestamps!
      let hasHealed = false;
      const cleaned = cachedItems
        .filter((item) => !isMomentDeleted(item))
        .map((item) => {
          const healedIso = autoHealDate(item.createdAt).toISOString();
          if (healedIso !== item.createdAt) {
            hasHealed = true;
            return { ...item, createdAt: healedIso };
          }
          return item;
        });

      if (hasHealed) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cleaned));
        } catch {}
      }

      setItems(cleaned);
      setIsLoading(false);
      // Run incremental sync in background for new moments since lastSync
      fetchFeed({ since: lastSync }).then(() => {
        prefetchChatData();
      });
      prefetchChatData();
    } else {
      // First visit / empty cache / switched user:
      // Stage 1: Rapidly load ~100 latest moments in 1-2s
      fetchQuickFeed().then(() => {
        prefetchChatData();
        // Stage 2: Deep sync older moments silently in background
        startBackgroundDeepSync();
      });
    }
  }, [userUid, CACHE_KEY, CACHE_TIME_KEY, fetchFeed, fetchQuickFeed, startBackgroundDeepSync, isMomentDeleted]);

  // Auto-sync: Silently check for new moments every 45s and whenever returning to the tab (with 20s cooldown)
  useEffect(() => {
    if (!userUid) return;

    const syncIfVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastSyncTimeRef.current < MIN_SYNC_COOLDOWN_MS) {
        return; // Throttled: recently synced
      }
      if (isFetchingRef.current) {
        return; // Already in flight
      }

      const lastSync = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
      fetchFeed({ since: lastSync }).then(() => {
        prefetchChatData();
      });
    };

    window.addEventListener('focus', syncIfVisible);
    document.addEventListener('visibilitychange', syncIfVisible);

    const pollInterval = setInterval(syncIfVisible, 45000);

    return () => {
      window.removeEventListener('focus', syncIfVisible);
      document.removeEventListener('visibilitychange', syncIfVisible);
      clearInterval(pollInterval);
    };
  }, [userUid, CACHE_TIME_KEY, fetchFeed]);

  // Handle ESC key to close lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load viewers & audience details when opening own moment
  useEffect(() => {
    setIsConfirmingDelete(false);
    setIsDeleting(false);
    if (!activeLightboxItem || !activeLightboxItem.isMine) {
      setMomentDetails(null);
      setIsLoadingDetails(false);
      return;
    }

    let isMounted = true;
    setIsLoadingDetails(true);
    setMomentDetails(null);
    setDetailsTab('viewers');

    api.locket
      .getMomentDetails(activeLightboxItem.id)
      .then((data) => {
        if (isMounted) {
          setMomentDetails(data);
        }
      })
      .catch((err) => {
        console.warn('Could not load moment details:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeLightboxItem]);

  // Derived unique authors list with photo count
  const authors = useMemo(() => {
    const map = new Map<
      string,
      { uid: string; name: string; avatarUrl?: string; count: number; isMine: boolean }
    >();
    for (const item of items) {
      const existing = map.get(item.authorUid);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.authorUid, {
          uid: item.authorUid,
          name: item.authorName || 'Người dùng',
          avatarUrl: item.authorAvatarUrl,
          count: 1,
          isMine: item.isMine,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.isMine) return -1;
      if (b.isMine) return 1;
      return b.count - a.count;
    });
  }, [items]);

  // Filter items based on category, specific friend, and date range
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Filter by author
      if (selectedAuthorUid && item.authorUid !== selectedAuthorUid) {
        return false;
      }
      // 2. Filter by category
      if (filter === 'friends' && item.isMine) return false;
      if (filter === 'mine' && !item.isMine) return false;

      // 3. Filter by date range
      if (appliedDateRange.start || appliedDateRange.end) {
        const itemDate = autoHealDate(item.createdAt);
        if (appliedDateRange.start && itemDate < appliedDateRange.start) {
          return false;
        }
        if (appliedDateRange.end && itemDate > appliedDateRange.end) {
          return false;
        }
      }

      return true;
    });
  }, [items, filter, selectedAuthorUid, appliedDateRange]);

  // Selected author object (for display in dropdown trigger button)
  const selectedAuthor = useMemo(() => {
    if (!selectedAuthorUid) return null;
    return authors.find((a) => a.uid === selectedAuthorUid) || null;
  }, [authors, selectedAuthorUid]);

  // Filtered authors for search inside the dropdown
  const filteredAuthors = useMemo(() => {
    if (!friendSearchTerm.trim()) return authors;
    const term = friendSearchTerm.trim().toLowerCase();
    return authors.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.isMine && ('bạn'.includes(term) || 'tôi'.includes(term))),
    );
  }, [authors, friendSearchTerm]);

  // Infinite scroll chunking (initial 20, load +20 smoothly as user scrolls)
  const CHUNK_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedTopRef = useRef<HTMLDivElement>(null);

  // Reset visible count when changing filter, author, or date range
  useEffect(() => {
    setVisibleCount(CHUNK_SIZE);
  }, [filter, selectedAuthorUid, appliedDateRange]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const hasMore = visibleCount < filteredItems.length;

  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + CHUNK_SIZE, filteredItems.length));
        }
      },
      { rootMargin: '350px' },
    );

    const sentinelEl = sentinelRef.current;
    if (sentinelEl) {
      observer.observe(sentinelEl);
    }

    return () => {
      if (sentinelEl) {
        observer.unobserve(sentinelEl);
      }
    };
  }, [hasMore, filteredItems.length]);

  // Handle download
  const handleDownload = async (item: LocketFeedItem) => {
    try {
      setDownloadingId(item.id);
      if (item.videoUrl) {
        // Direct download video file
        const res = await fetch(item.videoUrl);
        if (!res.ok) throw new Error('Không thể tải video');
        const blob = await res.blob();

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `locket_${item.authorName.replace(/\s+/g, '_')}_${item.id}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        // Fetch via proxy to ensure clean download without CORS restriction
        const proxyUrl = `/api/backend/locket/proxy-image?url=${encodeURIComponent(item.imageUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('Không thể tải ảnh');
        const blob = await res.blob();

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `locket_${item.authorName.replace(/\s+/g, '_')}_${item.id}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      alert(`Lỗi khi tải file: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle remix (import to editor)
  const handleRemix = (item: LocketFeedItem) => {
    // Route image through proxy to guarantee clean canvas without CORS taint
    const proxyUrl = `/api/backend/locket/proxy-image?url=${encodeURIComponent(item.imageUrl)}`;
    onRemixMoment(proxyUrl, item.caption);
  };

  return (
    <div ref={feedTopRef} className="w-full space-y-4 sm:space-y-5">
      {/* Top Filter Bar: [Tất cả] [Bạn bè] [Của tôi] + Friends & Date Dropdowns on Left */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
        {/* Left Side: Tabs + Friend Dropdown + Date Range Dropdown */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-neutral-900/90 backdrop-blur-md p-1 rounded-2xl border border-neutral-800 text-xs font-medium shadow-md">
            <button
              onClick={() => {
                setFilter('all');
                setSelectedAuthorUid(null);
              }}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all ${
                filter === 'all' && !selectedAuthorUid
                  ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => {
                setFilter('friends');
                setSelectedAuthorUid(null);
              }}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all ${
                filter === 'friends' && !selectedAuthorUid
                  ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Bạn bè
            </button>
            <button
              onClick={() => {
                setFilter('mine');
                setSelectedAuthorUid(null);
              }}
              className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all ${
                filter === 'mine' && !selectedAuthorUid
                  ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Của tôi
            </button>
          </div>

          {/* Friend Selection Dropdown */}
          {!isLoading && authors.length > 0 && (
            <div ref={friendsDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsFriendsDropdownOpen((prev) => !prev);
                  setFriendSearchTerm('');
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all shadow-sm active:scale-95 ${
                  selectedAuthor
                    ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/25 shadow-yellow-400/5'
                    : 'bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800'
                }`}
                title={
                  selectedAuthor
                    ? `Đang lọc ảnh của: ${selectedAuthor.isMine ? 'Bạn' : selectedAuthor.name}`
                    : 'Lọc khoảnh khắc theo bạn bè'
                }
              >
                {selectedAuthor ? (
                  <>
                    {selectedAuthor.avatarUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={selectedAuthor.avatarUrl}
                        alt={selectedAuthor.name}
                        className="w-4 h-4 rounded-full object-cover border border-yellow-400/40 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-yellow-400/20 flex items-center justify-center text-[9px] text-yellow-400 font-bold flex-shrink-0">
                        {selectedAuthor.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-semibold truncate max-w-[80px] sm:max-w-[120px]">
                      {selectedAuthor.isMine ? 'Bạn' : selectedAuthor.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-yellow-400 text-black flex-shrink-0">
                      {selectedAuthor.count}
                    </span>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAuthorUid(null);
                        setIsFriendsDropdownOpen(false);
                      }}
                      className="p-0.5 hover:bg-yellow-400/30 rounded text-yellow-300 hover:text-white transition-colors ml-0.5"
                      title="Hủy lọc bạn bè"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </>
                ) : (
                  <>
                    <Users className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                    <span>Bạn bè</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-neutral-800 text-neutral-400 border border-neutral-700/80">
                      {authors.length}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                        isFriendsDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </>
                )}
              </button>

              {/* Dropdown Popover */}
              {isFriendsDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-neutral-900/95 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  {/* Search Header */}
                  <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-950/60">
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={friendSearchTerm}
                        onChange={(e) => setFriendSearchTerm(e.target.value)}
                        placeholder="Tìm theo tên bạn bè..."
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/50"
                        autoFocus
                      />
                      {friendSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setFriendSearchTerm('')}
                          className="absolute right-2 p-0.5 text-neutral-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Friends List */}
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
                    {/* Item 1: Tất cả bạn bè */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAuthorUid(null);
                        setIsFriendsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        !selectedAuthorUid
                          ? 'bg-yellow-400/15 text-yellow-300 font-bold border border-yellow-400/30'
                          : 'hover:bg-neutral-800/70 text-neutral-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0 text-neutral-400">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate">Tất cả bạn bè</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-neutral-800 text-neutral-400">
                          {items.length} ảnh
                        </span>
                        {!selectedAuthorUid && (
                          <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>

                    {/* Danh sách từng bạn bè */}
                    {filteredAuthors.length > 0 ? (
                      filteredAuthors.map((author) => {
                        const isSelected = selectedAuthorUid === author.uid;
                        return (
                          <button
                            key={author.uid}
                            type="button"
                            onClick={() => {
                              setSelectedAuthorUid(isSelected ? null : author.uid);
                              setIsFriendsDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                              isSelected
                                ? 'bg-yellow-400/15 text-yellow-300 font-bold border border-yellow-400/30'
                                : 'hover:bg-neutral-800/70 text-neutral-300 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {author.avatarUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={author.avatarUrl}
                                  alt={author.name}
                                  className="w-6 h-6 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] text-neutral-400 font-bold flex-shrink-0">
                                  {author.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate">
                                  {author.isMine ? 'Bạn' : author.name}
                                </span>
                                {author.isMine && (
                                  <span className="px-1 py-0.2 text-[8px] font-bold rounded bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 flex-shrink-0">
                                    Tôi
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                  isSelected
                                    ? 'bg-yellow-400 text-black'
                                    : 'bg-neutral-800 text-neutral-400'
                                }`}
                              >
                                {author.count} ảnh
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-xs text-neutral-500">
                        Không tìm thấy bạn bè nào phù hợp.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Date Range Selection Dropdown */}
          {!isLoading && (
            <div ref={dateDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsDateDropdownOpen((prev) => !prev);
                  setIsFriendsDropdownOpen(false);
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all shadow-sm active:scale-95 ${
                  appliedDateRange.label
                    ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/25 shadow-yellow-400/5'
                    : 'bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800'
                }`}
                title={
                  appliedDateRange.label
                    ? `Đang lọc theo: ${appliedDateRange.label}`
                    : 'Lọc khoảnh khắc theo thời gian'
                }
              >
                <Calendar className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                <span className="font-semibold truncate max-w-[85px] sm:max-w-[130px]">
                  {appliedDateRange.label || 'Thời gian'}
                </span>
                {appliedDateRange.label ? (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearDateRange();
                    }}
                    className="p-0.5 hover:bg-yellow-400/30 rounded text-yellow-300 hover:text-white transition-colors ml-0.5"
                    title="Xóa lọc thời gian"
                  >
                    <X className="w-3 h-3" />
                  </span>
                ) : (
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                      isDateDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {/* Date Dropdown Popover */}
              {isDateDropdownOpen && (
                <div className="absolute left-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-neutral-900/95 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 p-3 space-y-3">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-yellow-400" />
                      Khoảng thời gian
                    </span>
                    {appliedDateRange.label && (
                      <button
                        type="button"
                        onClick={clearDateRange}
                        className="text-[11px] text-neutral-400 hover:text-yellow-400 transition-colors"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  {/* Quick Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                      Chọn nhanh
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'today', label: 'Hôm nay' },
                        { id: '7days', label: '7 ngày qua' },
                        { id: '30days', label: '30 ngày' },
                        { id: 'this_month', label: 'Tháng này' },
                        { id: 'this_year', label: 'Năm nay' },
                      ].map((preset) => {
                        const isActive = selectedDatePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(preset.id as DatePreset)}
                            className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-all text-center truncate ${
                              isActive
                                ? 'bg-yellow-400 text-black font-semibold shadow-sm'
                                : 'bg-neutral-800/80 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-700/50'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Date Inputs */}
                  <div className="space-y-2 border-t border-neutral-800/80 pt-2.5">
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                      Tùy chỉnh ngày
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400">Từ ngày</label>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-yellow-400/50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400">Đến ngày</label>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-yellow-400/50"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={applyCustomRange}
                      disabled={!customStartDate && !customEndDate}
                      className="w-full py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-95"
                    >
                      Áp dụng khoảng ngày
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Total Count Badge & Dedicated Reload Button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto sm:ml-0">
          {!isLoading && (
            <div className="text-xs text-neutral-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 shadow-sm">
              {isSyncing || isBackgroundSyncing ? (
                <span className="flex items-center gap-1 text-yellow-400" title="Đang tự động đồng bộ khoảnh khắc...">
                  <RefreshCw className="w-3 h-3 animate-spin flex-shrink-0" />
                  <span className="hidden sm:inline text-[11px] font-medium">Đang đồng bộ...</span>
                </span>
              ) : (
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"
                  title="Tự động đồng bộ ngầm"
                />
              )}
              <span className="hidden sm:inline">Tổng số:</span>
              <span className="font-semibold text-yellow-400">
                {filteredItems.length}
              </span>
              <span className="hidden sm:inline">khoảnh khắc</span>
            </div>
          )}

          {/* Dedicated Reload Button */}
          {!isLoading && (
            <button
              type="button"
              onClick={() => {
                const lastSync = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
                fetchFeed({ isManualRetry: true, since: lastSync });
              }}
              disabled={isSyncing || isBackgroundSyncing}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
              title="Làm mới để kiểm tra ảnh mới nhất"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-yellow-400 transition-colors ${
                  isSyncing || isBackgroundSyncing ? 'animate-spin text-yellow-400' : ''
                }`}
              />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Non-blocking Background Sync Status Pill */}
      {(isBackgroundSyncing || backgroundSyncMsg) && (
        <div className="flex items-center justify-between p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-neutral-900/90 border border-yellow-400/30 shadow-lg backdrop-blur-md animate-fadeIn">
          <div className="flex items-center gap-2.5">
            {isBackgroundSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-yellow-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
            <span className="text-xs font-semibold text-white">
              {isBackgroundSyncing
                ? 'Đang đồng bộ ngầm toàn bộ kho ảnh cũ từ trước tới nay...'
                : backgroundSyncMsg}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 text-xs font-bold">
              {items.length} khoảnh khắc
            </span>
          </div>
        </div>
      )}



      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Không thể đồng bộ với Locket</p>
            <p className="text-xs text-red-400/90 mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchFeed({ isManualRetry: true })}
            className="px-3 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold text-red-300 transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((idx) => (
            <div
              key={idx}
              className="bg-neutral-900/60 border border-neutral-800/80 rounded-3xl p-3.5 sm:p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-800" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-neutral-800 rounded w-24" />
                  <div className="h-2.5 bg-neutral-800 rounded w-14" />
                </div>
              </div>
              <div className="w-full aspect-square rounded-2xl bg-neutral-800" />
              <div className="h-9 bg-neutral-800/60 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="text-center py-16 px-4 bg-neutral-900/40 rounded-3xl border border-neutral-800/60 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-yellow-400">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">
              {appliedDateRange.label
                ? `Không có khoảnh khắc nào trong ${appliedDateRange.label.toLowerCase()}`
                : selectedAuthorUid
                ? 'Không có khoảnh khắc nào của người này'
                : filter === 'mine'
                ? 'Bạn chưa đăng khoảnh khắc nào'
                : 'Chưa có khoảnh khắc nào'}
            </h3>
            <p className="text-sm text-neutral-400 max-w-sm mx-auto">
              {appliedDateRange.label
                ? 'Thử chọn một khoảng thời gian khác hoặc đặt lại để xem toàn bộ khoảnh khắc.'
                : selectedAuthorUid
                ? 'Người bạn này chưa đăng khoảnh khắc nào hoặc chưa chia sẻ ảnh.'
                : filter === 'mine'
                ? 'Hãy tải ảnh lên và đăng khoảnh khắc đầu tiên của bạn lên Locket ngay bây giờ!'
                : 'Kết bạn trên ứng dụng Locket hoặc đăng ảnh để các khoảnh khắc hiển thị ở đây.'}
            </p>
          </div>
          {appliedDateRange.label ? (
            <button
              onClick={clearDateRange}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-semibold text-sm transition-all active:scale-95 shadow-lg shadow-yellow-400/20"
            >
              <Calendar className="w-4 h-4" />
              Xem tất cả thời gian
            </button>
          ) : (
            <button
              onClick={onGoToUpload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-semibold text-sm transition-all active:scale-95 shadow-lg shadow-yellow-400/20"
            >
              <Camera className="w-4 h-4" />
              Đăng ảnh mới ngay
            </button>
          )}
        </div>
      )}

      {/* Grid of Moments (Responsive 5-column grid) */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="group bg-neutral-900/80 backdrop-blur-md border border-neutral-800/90 hover:border-yellow-400/30 rounded-3xl p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-black/50 hover:-translate-y-1"
            >
              {/* Author header */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {item.authorAvatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.authorAvatarUrl}
                      alt={item.authorName}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border border-neutral-700/80 flex-shrink-0 bg-neutral-800"
                    />
                  ) : (
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[110px] sm:max-w-[130px]">
                        {item.authorName}
                      </span>
                      {item.isMine && (
                        <span className="px-1.5 py-0.2 text-[9px] sm:text-[10px] font-bold rounded-md bg-yellow-400/20 text-yellow-400 border border-yellow-400/30">
                          Bạn
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-neutral-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Quick Lightbox button */}
                <button
                  onClick={() => setActiveLightboxItem(item)}
                  className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors flex-shrink-0"
                  title="Xem phóng to"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Locket Widget Frame Image or Video */}
              <div
                onClick={() => setActiveLightboxItem(item)}
                className="relative w-full aspect-square rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800/80 cursor-pointer select-none group/img"
              >
                {item.videoUrl ? (
                  <video
                    src={item.videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.imageUrl}
                    alt={item.caption || `Khoảnh khắc của ${item.authorName}`}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                  />
                )}

                {/* Video Badge */}
                {item.videoUrl && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md flex items-center gap-1 border border-white/15 text-[10px] font-semibold text-yellow-400 shadow-md pointer-events-none">
                    <Video className="w-3 h-3" />
                    <span>Video</span>
                  </div>
                )}

                {/* Caption Pill Overlay */}
                {item.caption && (
                  <div className="absolute bottom-2.5 inset-x-2.5 flex justify-center pointer-events-none">
                    <div className="bg-black/70 backdrop-blur-md border border-white/10 text-white text-[11px] sm:text-xs px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full font-medium shadow-xl max-w-[95%] truncate text-center">
                      {item.caption}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Bar */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mt-3 pt-1 border-t border-neutral-800/60">
                <button
                  onClick={() => handleDownload(item)}
                  disabled={downloadingId === item.id}
                  className="flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl bg-neutral-800/80 hover:bg-neutral-750 text-neutral-200 hover:text-white text-[11px] sm:text-xs font-medium border border-neutral-700/60 transition-colors active:scale-95 disabled:opacity-50"
                  title="Tải ảnh về máy"
                >
                  <Download className="w-3 sm:w-3.5 h-3 sm:h-3.5 flex-shrink-0" />
                  <span className="truncate">{downloadingId === item.id ? 'Đang tải...' : 'Tải về'}</span>
                </button>

                <button
                  onClick={() => handleRemix(item)}
                  className="flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-400 text-[11px] sm:text-xs font-semibold border border-yellow-400/30 transition-all active:scale-95 shadow-sm"
                  title="Chỉnh sửa ảnh này trong Image Editor để đăng lại"
                >
                  <Sparkles className="w-3 sm:w-3.5 h-3 sm:h-3.5 flex-shrink-0" />
                  <span className="truncate">Sửa ảnh này</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel & Feed Footer */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="py-8 flex flex-col items-center justify-center gap-2">
          {hasMore ? (
            <div ref={sentinelRef} className="flex items-center gap-2 text-xs text-neutral-400 py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-yellow-400" />
              <span>Đang tải thêm khoảnh khắc...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 text-xs text-neutral-400 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Đã hiển thị tất cả <strong className="text-yellow-400">{filteredItems.length}</strong> khoảnh khắc
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxItem && (
        <div
          onClick={() => setActiveLightboxItem(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-lg w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activeLightboxItem.authorAvatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={activeLightboxItem.authorAvatarUrl}
                    alt={activeLightboxItem.authorName}
                    className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {activeLightboxItem.authorName}
                    {activeLightboxItem.isMine && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-yellow-400/20 text-yellow-400 border border-yellow-400/30">
                        Bạn
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {formatRelativeTime(activeLightboxItem.createdAt)} •{' '}
                    {autoHealDate(activeLightboxItem.createdAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveLightboxItem(null)}
                className="p-2 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Media (Video or Image) */}
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-black border border-neutral-800">
              {activeLightboxItem.videoUrl ? (
                <video
                  src={activeLightboxItem.videoUrl}
                  autoPlay
                  loop
                  playsInline
                  muted={isLightboxMuted}
                  className="w-full h-full object-cover"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={activeLightboxItem.imageUrl}
                  alt={activeLightboxItem.caption || 'Khoảnh khắc Locket'}
                  className="w-full h-full object-cover"
                />
              )}

              {/* Sound toggle button for video in Lightbox */}
              {activeLightboxItem.videoUrl && (
                <button
                  type="button"
                  onClick={() => setIsLightboxMuted((prev) => !prev)}
                  className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all active:scale-90 z-10"
                  title={isLightboxMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                >
                  {isLightboxMuted ? (
                    <VolumeX className="w-4 h-4 text-neutral-300" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-yellow-400" />
                  )}
                </button>
              )}

              {activeLightboxItem.caption && (
                <div className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none">
                  <div className="bg-black/75 backdrop-blur-md border border-white/10 text-white text-sm px-4 py-2 rounded-full font-medium shadow-2xl text-center max-w-[90%]">
                    {activeLightboxItem.caption}
                  </div>
                </div>
              )}
            </div>

            {/* Post Analytics & Privacy Details (Only for user's own moments) */}
            {activeLightboxItem.isMine && (
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-3.5 space-y-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800/80 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDetailsTab('viewers')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all ${
                      detailsTab === 'viewers'
                        ? 'bg-neutral-800 text-yellow-400 shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      Đã xem {momentDetails ? `(${momentDetails.viewsCount})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDetailsTab('audience')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all ${
                      detailsTab === 'audience'
                        ? 'bg-neutral-800 text-yellow-400 shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>
                      {momentDetails?.audience.sentToAll
                        ? 'Quyền riêng tư (Tất cả)'
                        : `Ai không cho xem ${
                            momentDetails && momentDetails.audience.excludedFriends.length > 0
                              ? `(${momentDetails.audience.excludedFriends.length})`
                              : ''
                          }`}
                    </span>
                  </button>
                </div>

                {/* Tab content */}
                {isLoadingDetails ? (
                  <div className="flex items-center justify-center py-6 text-neutral-400 gap-2 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-yellow-400" />
                    <span>Đang tải thông tin lượt xem và đối tượng...</span>
                  </div>
                ) : detailsTab === 'viewers' ? (
                  /* Viewers Tab */
                  <div className="space-y-2">
                    {momentDetails && momentDetails.viewers.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {momentDetails.viewers.map((viewer) => (
                          <div
                            key={viewer.uid}
                            className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 border border-neutral-800/50 hover:border-neutral-700/60 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              {viewer.avatarUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={viewer.avatarUrl}
                                  alt={viewer.name}
                                  className="w-7 h-7 rounded-full object-cover border border-neutral-700"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs">
                                  <User className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-medium text-white line-clamp-1">{viewer.name}</p>
                                  {viewer.isFormerFriend && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                      Bạn bè cũ
                                    </span>
                                  )}
                                </div>
                                {viewer.viewedAt && (
                                  <p className="text-[10px] text-neutral-400">
                                    {formatRelativeTime(viewer.viewedAt)}
                                  </p>
                                )}
                              </div>
                            </div>

                            {viewer.reaction && (
                              <div className="flex items-center gap-1 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                                <span className="text-xs">
                                  {viewer.reaction}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-5 text-neutral-500 text-xs">
                        <Eye className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                        Chưa có bạn bè nào xem bài viết này
                      </div>
                    )}
                  </div>
                ) : (
                  /* Audience / Excluded Tab */
                  <div className="space-y-3">
                    {momentDetails?.audience.sentToAll ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs">
                          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-emerald-200">Công khai cho tất cả bạn bè</p>
                            <p className="text-[11px] text-emerald-400/80">
                              Bài viết này được chia sẻ tới tất cả bạn bè (Không chặn hay loại trừ ai).
                            </p>
                          </div>
                        </div>

                        {/* Unviewed friends list */}
                        {momentDetails.audience.unviewedFriends &&
                          momentDetails.audience.unviewedFriends.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-neutral-500" />
                                <span>Bạn bè chưa xem ({momentDetails.audience.unviewedFriends.length} người):</span>
                              </p>
                              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                {momentDetails.audience.unviewedFriends.map((friend) => (
                                  <div
                                    key={friend.uid}
                                    className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/40 border border-neutral-800/40 text-neutral-400"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      {friend.avatarUrl ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                          src={friend.avatarUrl}
                                          alt={friend.name}
                                          className="w-6 h-6 rounded-full object-cover border border-neutral-700 opacity-80"
                                        />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs">
                                          <User className="w-3 h-3" />
                                        </div>
                                      )}
                                      <p className="text-xs text-neutral-300 line-clamp-1">{friend.name}</p>
                                    </div>
                                    <span className="text-[10px] text-neutral-500 font-medium">Chưa mở</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>
                    ) : momentDetails &&
                      (momentDetails.audience.excludedFriends.length > 0 ||
                        (momentDetails.audience.blockedFriends &&
                          momentDetails.audience.blockedFriends.length > 0) ||
                        (momentDetails.audience.newFriends &&
                          momentDetails.audience.newFriends.length > 0)) ? (
                      (() => {
                        const momentTime = momentDetails.createdAt
                          ? new Date(momentDetails.createdAt).getTime()
                          : 0;

                        const blockedFriends =
                          momentDetails.audience.blockedFriends &&
                          momentDetails.audience.blockedFriends.length > 0
                            ? momentDetails.audience.blockedFriends
                            : momentDetails.audience.excludedFriends.filter((f) => {
                                if (f.exclusionReason === 'blocked_at_post') return true;
                                if (f.exclusionReason === 'new_friend') return false;
                                const friendTime = f.friendedAt ? new Date(f.friendedAt).getTime() : 0;
                                return !friendTime || !momentTime || friendTime <= momentTime + 5000;
                              });

                        const newFriends =
                          momentDetails.audience.newFriends &&
                          momentDetails.audience.newFriends.length > 0
                            ? momentDetails.audience.newFriends
                            : momentDetails.audience.excludedFriends.filter((f) => {
                                if (f.exclusionReason === 'new_friend') return true;
                                if (f.exclusionReason === 'blocked_at_post') return false;
                                const friendTime = f.friendedAt ? new Date(f.friendedAt).getTime() : 0;
                                return Boolean(friendTime && momentTime && friendTime > momentTime + 5000);
                              });

                        const totalExcluded = blockedFriends.length + newFriends.length;

                        let summaryText = `Loại trừ ${totalExcluded} bạn bè`;
                        if (blockedFriends.length > 0 && newFriends.length > 0) {
                          summaryText = `Loại trừ ${totalExcluded} bạn bè: ${blockedFriends.length} người bị chặn • ${newFriends.length} bạn mới`;
                        } else if (blockedFriends.length > 0) {
                          summaryText = `Loại trừ ${blockedFriends.length} bạn bè: ${blockedFriends.length} người bị chặn khi đăng`;
                        } else if (newFriends.length > 0) {
                          summaryText = `Loại trừ ${newFriends.length} bạn bè: ${newFriends.length} bạn mới kết bạn sau`;
                        }

                        return (
                          <div className="space-y-3">
                            {/* Summary Header */}
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs">
                              <UserX className="w-4 h-4 text-amber-400 flex-shrink-0" />
                              <span className="font-medium">{summaryText}</span>
                            </div>

                            {/* Section 1: Blocked directly when posting */}
                            {blockedFriends.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <UserX className="w-3.5 h-3.5 text-red-400" />
                                    <span>Chặn trực tiếp khi đăng ({blockedFriends.length} bạn bè):</span>
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-normal">Chủ động bỏ chọn</span>
                                </p>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                  {blockedFriends.map((friend) => (
                                    <div
                                      key={friend.uid}
                                      className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 border border-red-900/30 hover:border-red-800/50 transition-colors"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {friend.avatarUrl ? (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img
                                            src={friend.avatarUrl}
                                            alt={friend.name}
                                            className="w-7 h-7 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                                          />
                                        ) : (
                                          <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs flex-shrink-0">
                                            <User className="w-3.5 h-3.5" />
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-neutral-300 truncate">{friend.name}</p>
                                          {friend.username && (
                                            <p className="text-[10px] text-neutral-500 truncate">@{friend.username}</p>
                                          )}
                                        </div>
                                      </div>

                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap ml-2">
                                        Bị chặn khi đăng
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Section 2: New friends friended after post */}
                            {newFriends.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <UserPlus className="w-3.5 h-3.5 text-sky-400" />
                                    <span>Bạn mới sau khi đăng ({newFriends.length} bạn bè):</span>
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-normal">Kết bạn sau thời điểm đăng</span>
                                </p>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                  {newFriends.map((friend) => (
                                    <div
                                      key={friend.uid}
                                      className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 border border-sky-900/30 hover:border-sky-800/50 transition-colors"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {friend.avatarUrl ? (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img
                                            src={friend.avatarUrl}
                                            alt={friend.name}
                                            className="w-7 h-7 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                                          />
                                        ) : (
                                          <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs flex-shrink-0">
                                            <User className="w-3.5 h-3.5" />
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-neutral-300 truncate">{friend.name}</p>
                                          {friend.username && (
                                            <p className="text-[10px] text-neutral-500 truncate">@{friend.username}</p>
                                          )}
                                        </div>
                                      </div>

                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap ml-2">
                                        Bạn mới
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-emerald-200">Không có ai bị loại trừ</p>
                          <p className="text-[11px] text-emerald-400/80">
                            Tất cả bạn bè của bạn đều có quyền xem bài viết này.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            {isConfirmingDelete ? (
              <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-800/60 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p>
                    Bạn có chắc chắn muốn xóa khoảnh khắc này không? Ảnh sẽ bị xóa vĩnh viễn và gỡ khỏi widget của tất cả bạn bè. Không thể hoàn tác.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={isDeleting}
                    className="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteMoment}
                    disabled={isDeleting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-600/30 active:scale-95"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang xóa...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xác nhận xóa</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleDownload(activeLightboxItem)}
                  disabled={downloadingId === activeLightboxItem.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold border border-neutral-700 transition-all active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {downloadingId === activeLightboxItem.id
                      ? 'Đang tải...'
                      : activeLightboxItem.videoUrl
                      ? 'Tải video MP4'
                      : 'Tải về HD'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    const item = activeLightboxItem;
                    setActiveLightboxItem(null);
                    handleRemix(item);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold shadow-lg shadow-yellow-400/20 transition-all active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Đưa vào Editor</span>
                </button>

                {activeLightboxItem.isMine && (
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    title="Xóa khoảnh khắc này"
                    className="p-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-neutral-900/95 border border-neutral-700 text-white text-xs shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400" />
          )}
          <span className="font-medium">{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
