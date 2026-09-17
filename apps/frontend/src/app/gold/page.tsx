'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Crown,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Zap,
  Users,
  RefreshCw,
  Link2,
  Fingerprint,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import {
  goldApi,
  GoldUserPreview,
  GoldQueueStatus,
  MasterStatusResult,
  parseLocketUsername,
} from '../../lib/goldApi';

const CHECK_STORAGE_KEY = 'locket_check_gold_recent_history';

interface RecentCheckItem {
  uid: string;
  username: string;
  displayName: string;
  profilePictureUrl?: string;
  hasGold: boolean;
  expiresDate?: string;
  daysLeft: number;
  isAliasLimited?: boolean;
  timestamp: number;
}

function calculateDaysLeft(expiresDate?: string): number {
  if (!expiresDate) return 0;
  const expTime = new Date(expiresDate).getTime();
  if (isNaN(expTime)) return 0;
  const now = Date.now();
  const diff = expTime - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDateVi(expiresDate?: string): string {
  if (!expiresDate) return 'Chưa kích hoạt';
  const d = new Date(expiresDate);
  if (isNaN(d.getTime())) return expiresDate;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function GoldUnifiedContent() {
  const searchParams = useSearchParams();

  // Refs for smooth scroll and input focus
  const upgradeCardRef = useRef<HTMLDivElement | null>(null);
  const checkCardRef = useRef<HTMLDivElement | null>(null);
  const upgradeInputRef = useRef<HTMLInputElement | null>(null);
  const checkInputRef = useRef<HTMLInputElement | null>(null);

  // ==========================================
  // CARD 1: NÂNG CẤP GOLD STATE
  // ==========================================
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewUser, setPreviewUser] = useState<GoldUserPreview | null>(null);
  const [selectedPackage] = useState<'1m' | '1y'>('1y');
  const [upgradeErrorMessage, setUpgradeErrorMessage] = useState<string | null>(null);

  // Master UUID state
  const [masterUidInput, setMasterUidInput] = useState('');
  const [masterStatus, setMasterStatus] = useState<MasterStatusResult | null>(null);
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);

  // Queue polling state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queueStatus, setQueueStatus] = useState<GoldQueueStatus | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // ==========================================
  // CARD 2: KIỂM TRA GOLD & UID STATE
  // ==========================================
  const [checkInput, setCheckInput] = useState('');
  const [isLoadingCheck, setIsLoadingCheck] = useState(false);
  const [checkUserData, setCheckUserData] = useState<GoldUserPreview | null>(null);
  const [checkErrorMessage, setCheckErrorMessage] = useState<string | null>(null);
  const [copiedCheckUid, setCopiedCheckUid] = useState(false);
  const [recentCheckList, setRecentCheckList] = useState<RecentCheckItem[]>([]);

  // ------------------------------------------
  // Countdown timer ticker for Queue
  // ------------------------------------------
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  // Load saved Master UID or default status on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMaster = localStorage.getItem('locket_custom_master_uid') || '';
      if (savedMaster) {
        setMasterUidInput(savedMaster);
      }
      handleCheckMaster(savedMaster || undefined);
    }
  }, []);

  // Load recent check history from localStorage on mount
  useEffect(() => {
    try {
      const savedCheck = localStorage.getItem(CHECK_STORAGE_KEY);
      if (savedCheck) setRecentCheckList(JSON.parse(savedCheck));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // URL Query Sync: initial user
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initialUser = searchParams.get('username') || searchParams.get('u');
      if (initialUser) {
        setUsernameInput(initialUser);
        setCheckInput(initialUser);

        const clean = parseLocketUsername(initialUser);
        if (clean) {
          handleLookupCheck(clean);
          handleLookupUpgradePreview(clean);
        }
      }
    }
  }, []);

  // ------------------------------------------
  // Master UID Handlers
  // ------------------------------------------
  const handleCheckMaster = async (customUid?: string) => {
    const raw = customUid !== undefined ? customUid : masterUidInput;
    const uidToCheck = raw.trim().replace(/\s+/g, '');
    setIsLoadingMaster(true);
    try {
      const status = await goldApi.getMasterStatus(uidToCheck || undefined);
      setMasterStatus(status);
      if (uidToCheck) {
        localStorage.setItem('locket_custom_master_uid', uidToCheck);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingMaster(false);
    }
  };

  const handleResetMaster = () => {
    localStorage.removeItem('locket_custom_master_uid');
    setMasterUidInput('');
    handleCheckMaster('');
  };

  // ------------------------------------------
  // Card 1 (Upgrade) Handlers
  // ------------------------------------------
  const handleLookupUpgradePreview = async (overrideValue?: string) => {
    const raw = overrideValue !== undefined ? overrideValue : usernameInput;
    const clean = parseLocketUsername(raw);
    if (!clean) {
      setUpgradeErrorMessage(
        'Vui lòng nhập link locket.cam/username hoặc @username (ví dụ: locket.cam/shynciee).',
      );
      return;
    }

    setUpgradeErrorMessage(null);
    setIsLoadingPreview(true);
    setPreviewUser(null);
    setIsSuccess(false);

    try {
      const user = await goldApi.previewUser(clean);
      setPreviewUser(user);
    } catch (err: any) {
      setUpgradeErrorMessage(err.message || 'Không tìm thấy tài khoản Locket này.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmitUpgrade = async () => {
    if (!previewUser) return;

    setUpgradeErrorMessage(null);
    setIsSubmitting(true);
    setQueueStatus(null);

    try {
      const cleanMaster = masterUidInput ? masterUidInput.trim().replace(/\s+/g, '') : undefined;
      const initialStatus = await goldApi.submitPublicUpgrade(
        previewUser.username,
        selectedPackage,
        cleanMaster,
      );
      setQueueStatus(initialStatus);
      setCountdown(initialStatus.estimatedSeconds || 5);
      pollTicket(initialStatus.ticketId);
    } catch (err: any) {
      setUpgradeErrorMessage(err.message || 'Không thể đưa yêu cầu vào hàng đợi.');
      setIsSubmitting(false);
    }
  };

  const pollTicket = async (ticketId: string) => {
    try {
      const status = await goldApi.getQueueStatus(ticketId);
      setQueueStatus(status);

      if (status.status === 'completed') {
        setIsSubmitting(false);
        setIsSuccess(true);
        return;
      }

      if (status.status === 'error') {
        setIsSubmitting(false);
        setUpgradeErrorMessage(
          status.error || 'Có lỗi xảy ra trong quá trình kích hoạt Gold.',
        );
        return;
      }

      pollingTimerRef.current = setTimeout(() => {
        pollTicket(ticketId);
      }, 1800);
    } catch {
      pollingTimerRef.current = setTimeout(() => {
        pollTicket(ticketId);
      }, 2000);
    }
  };

  const handleResetUpgrade = () => {
    setUsernameInput('');
    setPreviewUser(null);
    setIsSuccess(false);
    setQueueStatus(null);
    setUpgradeErrorMessage(null);
  };

  // ------------------------------------------
  // Card 2 (Check Gold & UID) Handlers
  // ------------------------------------------
  const saveToRecentCheck = useCallback(
    (user: GoldUserPreview) => {
      try {
        const hasGold = !!user.goldInfo?.hasGold;
        const expiresDate = user.goldInfo?.expiresDate;
        const daysLeft = hasGold ? calculateDaysLeft(expiresDate) : 0;
        const isAliasLimited = !!user.goldInfo?.isAliasLimited;

        const item: RecentCheckItem = {
          uid: user.uid,
          username: user.username,
          displayName: user.displayName,
          profilePictureUrl: user.profilePictureUrl,
          hasGold,
          expiresDate,
          daysLeft,
          isAliasLimited,
          timestamp: Date.now(),
        };

        setRecentCheckList((prev) => {
          const updated = [
            item,
            ...prev.filter((r) => r.username.toLowerCase() !== user.username.toLowerCase()),
          ].slice(0, 8);
          try {
            localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } catch {
        // Ignore
      }
    },
    [],
  );

  const handleClearCheckHistory = () => {
    setRecentCheckList([]);
    try {
      localStorage.removeItem(CHECK_STORAGE_KEY);
    } catch {}
  };

  const handleLookupCheck = useCallback(
    async (overrideValue?: string) => {
      const raw = overrideValue !== undefined ? overrideValue : checkInput;
      const clean = parseLocketUsername(raw);

      if (!clean) {
        setCheckErrorMessage(
          'Vui lòng nhập Username (ví dụ: @shynciee) hoặc dán đường dẫn Locket.',
        );
        return;
      }

      setCheckErrorMessage(null);
      setIsLoadingCheck(true);
      setCheckUserData(null);
      setCopiedCheckUid(false);

      try {
        const user = await goldApi.previewUser(clean);
        setCheckUserData(user);
        saveToRecentCheck(user);
      } catch (err: any) {
        setCheckErrorMessage(
          err.message || 'Không tìm thấy tài khoản Locket hoặc link không hợp lệ.',
        );
      } finally {
        setIsLoadingCheck(false);
      }
    },
    [checkInput, saveToRecentCheck],
  );

  const handleCopyCheckUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedCheckUid(true);
    setTimeout(() => setCopiedCheckUid(false), 2000);
  };

  // ------------------------------------------
  // Cross-Card Actions
  // ------------------------------------------
  // Transfer username from Card 2 to Card 1's input
  const handleFillUsernameToUpgrade = (username: string) => {
    setUsernameInput(username);
    if (upgradeInputRef.current) {
      upgradeInputRef.current.focus();
    }
    upgradeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#0C0D12] text-white flex flex-col selection:bg-yellow-400 selection:text-black">
      {/* Background Ambience Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[400px] bg-gradient-to-b from-yellow-500/15 via-amber-500/5 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 bg-yellow-400/5 rounded-full blur-3xl" />
        <div className="absolute top-2/3 -right-32 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="w-full max-w-6xl xl:max-w-7xl mx-auto">
          {/* 2-Column Responsive Card Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* ============================================================== */}
            {/* CARD 1: NÂNG CẤP LOCKET GOLD                                   */}
            {/* ============================================================== */}
            <div
              ref={upgradeCardRef}
              className="rounded-3xl bg-[#141620]/95 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl p-5 sm:p-7 space-y-5"
            >
              {/* Card 1 Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shadow-sm">
                  <Crown className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Nâng Cấp Locket Gold</h2>
                </div>
              </div>

              {/* Error Banner */}
              {upgradeErrorMessage && (
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{upgradeErrorMessage}</span>
                </div>
              )}

              {/* State A: Success Screen */}
              {isSuccess && previewUser && (
                <div className="text-center space-y-5 py-3 animate-in zoom-in-95 duration-300">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-400 via-amber-400 to-yellow-300 mx-auto flex items-center justify-center shadow-xl shadow-yellow-400/30">
                    <CheckCircle2 className="w-9 h-9 text-black stroke-[2.5]" />
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-xl font-bold text-white">
                      Mở Khóa Thành Công!
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-300">
                      Tài khoản{' '}
                      <span className="text-yellow-400 font-semibold">
                        @{previewUser.username}
                      </span>{' '}
                      đã được kích hoạt gói Locket Gold VIP (Gói {selectedPackage === '1y' ? '1 Năm' : '1 Tháng'}
                      {queueStatus?.result?.expiresDate || masterStatus?.expiresDate
                        ? ` - Hạn: ${new Date(queueStatus?.result?.expiresDate || masterStatus?.expiresDate || '').toLocaleDateString('vi-VN')}`
                        : ` - Hạn: ${new Date(Date.now() + (selectedPackage === '1y' ? 365 : 30) * 86400000).toLocaleDateString('vi-VN')}`}).
                    </p>
                  </div>

                  {/* Instructions Box */}
                  <div className="text-left rounded-2xl bg-[#1A1D2A] border border-white/[0.06] p-4 space-y-2 text-xs text-neutral-300">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      Các bước nhận Gold trên điện thoại:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-neutral-400 text-[11px] leading-relaxed">
                      <li>
                        <strong className="text-white">Đóng hoàn toàn app Locket</strong> (vuốt lên tắt hẳn ứng dụng trong đa nhiệm).
                      </li>
                      <li>Mở lại app Locket trên điện thoại iPhone của bạn.</li>
                      <li>Tận hưởng các tính năng Gold: huy hiệu vàng, biểu tượng mới và bạn bè VIP.</li>
                    </ol>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      onClick={handleResetUpgrade}
                      className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-white/[0.08] hover:bg-white/[0.14] text-white transition-all"
                    >
                      Nâng cấp tài khoản khác
                    </button>
                    <Link
                      href="/"
                      className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-gradient-to-r from-yellow-400 to-amber-400 text-black shadow-lg shadow-yellow-400/20 hover:brightness-105 transition-all text-center"
                    >
                      Vào Locket Web ngay
                    </Link>
                  </div>
                </div>
              )}

              {/* State B: Queue Status / In-Progress */}
              {isSubmitting && queueStatus && !isSuccess && (
                <div className="space-y-5 py-4 text-center animate-in fade-in duration-200">
                  <div className="relative w-14 h-14 mx-auto">
                    <div className="w-14 h-14 rounded-full bg-yellow-400/20 flex items-center justify-center animate-pulse">
                      <Crown className="w-7 h-7 text-yellow-400" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white">
                      {queueStatus.position === 0
                        ? 'Đang gửi yêu cầu kích hoạt...'
                        : 'Đang xếp hàng chờ xử lý'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Đang áp dụng gói Gold cho @{previewUser?.username}. Vui lòng không đóng trang.
                    </p>
                  </div>

                  {/* Live Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#1B1D28] border border-white/[0.06]">
                      <div className="text-[11px] text-neutral-400 flex items-center justify-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>Vị trí</span>
                      </div>
                      <div className="text-lg font-extrabold text-yellow-400 mt-1">
                        {queueStatus.position === 0 ? 'Xử lý ngay' : `#${queueStatus.position}`}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#1B1D28] border border-white/[0.06]">
                      <div className="text-[11px] text-neutral-400 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Ước tính</span>
                      </div>
                      <div className="text-lg font-extrabold text-white mt-1">
                        {countdown > 0 ? `~${countdown}s` : 'Vài giây'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-gradient-to-r from-yellow-400 to-amber-500 h-full w-full animate-[shimmer_2s_infinite]" />
                    </div>
                    <p className="text-[10px] text-neutral-500">
                      Xử lý tuần tự đảm bảo an toàn 100% cho tài khoản.
                    </p>
                  </div>
                </div>
              )}

              {/* State C: Search & Preview & Select Flow */}
              {!isSubmitting && !isSuccess && (
                <>
                  {/* Master Gold Donor Configuration */}
                  <div className="p-4 rounded-2xl bg-[#151722] border border-white/[0.08] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-yellow-400">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Master UUID nguồn Gold</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 font-normal">
                            {masterUidInput ? 'Tùy chỉnh' : 'Mặc định'}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {isLoadingMaster ? (
                        <div className="flex items-center gap-1 text-[11px] text-neutral-400 bg-white/[0.04] px-2.5 py-1 rounded-full">
                          <RefreshCw className="w-3 h-3 animate-spin text-yellow-400" />
                          <span>Kiểm tra...</span>
                        </div>
                      ) : masterStatus?.isStillValid ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Active ({masterStatus.durationLabel || (masterStatus.isYearly ? '1 Năm' : '1 Tháng')})</span>
                        </div>
                      ) : masterStatus?.isAliasLimited ? (
                        <div className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full font-semibold">
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <span>LIMIT 50/50</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-semibold">
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                          <span>Chưa xác thực</span>
                        </div>
                      )}
                    </div>

                    {/* Input & Action */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={masterUidInput}
                          onChange={(e) => setMasterUidInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckMaster();
                            }
                          }}
                          placeholder={
                            masterStatus?.masterUid
                              ? `UID: ${masterStatus.masterUid.slice(0, 14)}...`
                              : 'Nhập Firebase UID có Gold...'
                          }
                          className="w-full bg-[#1A1D2A] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 transition-all"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCheckMaster()}
                        disabled={isLoadingMaster}
                        className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold transition-all flex items-center gap-1 disabled:opacity-50 flex-shrink-0"
                      >
                        {isLoadingMaster ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>Check</span>
                      </button>
                      {masterUidInput && (
                        <button
                          type="button"
                          onClick={handleResetMaster}
                          disabled={isLoadingMaster}
                          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-all flex-shrink-0"
                          title="Đặt lại về UUID mặc định"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Input Username / Link */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleLookupUpgradePreview();
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider">
                      Link Locket hoặc Username người nhận
                    </label>
                    <div className="relative flex items-center">
                      <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                        <Link2 className="w-4 h-4 text-yellow-400/90" />
                      </div>
                      <input
                        ref={upgradeInputRef}
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="Ví dụ: locket.cam/shynciee hoặc @shynciee"
                        className="w-full bg-[#1A1D2A] border border-white/10 rounded-2xl pl-10 pr-28 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={isLoadingPreview || !usernameInput.trim()}
                        className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs transition-all flex items-center gap-1 shadow-md shadow-yellow-400/20"
                      >
                        {isLoadingPreview ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                        <span>Kiểm tra</span>
                      </button>
                    </div>
                  </form>

                  {/* User Preview & Action Card */}
                  {previewUser && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="p-3.5 rounded-2xl bg-[#1A1D2A] border border-yellow-400/30 flex items-center gap-3">
                        {previewUser.profilePictureUrl ? (
                          <img
                            src={previewUser.profilePictureUrl}
                            alt={previewUser.username}
                            className="w-11 h-11 rounded-full object-cover ring-2 ring-yellow-400/60 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-base ring-2 ring-yellow-400/40 flex-shrink-0">
                            {previewUser.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-white text-sm truncate">
                              {previewUser.displayName}
                            </h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 font-semibold">
                              Hợp lệ
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400 truncate">
                            @{previewUser.username}
                          </p>
                        </div>
                      </div>

                      {/* Package info */}
                      {(() => {
                        const userGold = previewUser.goldInfo?.hasGold;
                        const durationLabel = userGold
                          ? (previewUser.goldInfo?.durationLabel || (previewUser.goldInfo?.isYearly ? '1 Năm' : '1 Tháng'))
                          : (masterStatus?.durationLabel || (masterStatus?.isYearly ? '1 Năm' : (selectedPackage === '1y' ? '1 Năm' : '1 Tháng')));
                        const expiryDisplay = userGold
                          ? (previewUser.goldInfo?.expiresDate
                              ? new Date(previewUser.goldInfo.expiresDate).toLocaleDateString('vi-VN')
                              : 'Vĩnh viễn')
                          : (masterStatus?.expiresDate
                              ? new Date(masterStatus.expiresDate).toLocaleDateString('vi-VN')
                              : new Date(Date.now() + (selectedPackage === '1y' ? 365 : 30) * 86400000).toLocaleDateString('vi-VN'));

                        return (
                          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-yellow-400/15 via-amber-400/5 to-transparent border border-yellow-400/30">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                                  <span className="text-xs font-bold text-white">Gói Locket Gold VIP</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold">
                                    {userGold ? 'ĐÃ CÓ GOLD' : 'SẴN SÀNG'}
                                  </span>
                                </div>
                                <p className="text-xs text-yellow-300 font-medium mt-1">
                                  Gói: <strong>{durationLabel}</strong> - Hạn: <strong>{expiryDisplay}</strong>
                                </p>
                              </div>
                              <div className="w-9 h-9 rounded-xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                                <Crown className="w-4 h-4 text-yellow-400" />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Action Button */}
                      <button
                        type="button"
                        onClick={handleSubmitUpgrade}
                        className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 text-black font-extrabold text-sm shadow-xl shadow-yellow-400/25 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                      >
                        <Crown className="w-4 h-4 stroke-[2.5]" />
                        <span>Xác Nhận Nâng Cấp Gold Miễn Phí</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ============================================================== */}
            {/* CARD 2: KIỂM TRA GOLD & FIREBASE UID                           */}
            {/* ============================================================== */}
            <div
              ref={checkCardRef}
              className="rounded-3xl bg-[#141620]/95 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl p-5 sm:p-7 space-y-5"
            >
              {/* Card 2 Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shadow-sm">
                  <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Kiểm Tra Gold & UID</h2>
                </div>
              </div>

              {/* Search Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLookupCheck();
                }}
                className="space-y-2"
              >
                <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider">
                  Nhập Username hoặc dán link Locket
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-neutral-400 pointer-events-none">
                    <ShieldCheck className="w-4 h-4 text-yellow-400/90" />
                  </div>
                  <input
                    ref={checkInputRef}
                    type="text"
                    value={checkInput}
                    onChange={(e) => setCheckInput(e.target.value)}
                    placeholder="Ví dụ: @shynciee hoặc locket.cam/shynciee"
                    className="w-full bg-[#1A1D2A] border border-white/10 rounded-2xl pl-10 pr-28 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingCheck || !checkInput.trim()}
                    className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs transition-all flex items-center gap-1 shadow-md shadow-yellow-400/20"
                  >
                    {isLoadingCheck ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3" />
                    )}
                    <span>Kiểm tra</span>
                  </button>
                </div>
              </form>

              {/* Error Banner */}
              {checkErrorMessage && (
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="flex-1 leading-relaxed">{checkErrorMessage}</span>
                </div>
              )}

              {/* Check Result Card */}
              {checkUserData && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[#161824] border border-yellow-400/30 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  {/* User profile & Gold status badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {checkUserData.profilePictureUrl ? (
                        <img
                          src={checkUserData.profilePictureUrl}
                          alt={checkUserData.username}
                          className="w-11 h-11 rounded-full object-cover ring-2 ring-yellow-400/60 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-base ring-2 ring-yellow-400/40 flex-shrink-0">
                          {checkUserData.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white text-sm sm:text-base truncate">
                            {checkUserData.displayName}
                          </h4>
                          {checkUserData.goldInfo?.hasGold && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 font-bold flex items-center gap-1">
                              <Crown className="w-3 h-3" /> VIP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400">@{checkUserData.username}</p>
                      </div>
                    </div>

                    {/* Action button: Send username to Card 1 */}
                    <button
                      type="button"
                      onClick={() => handleFillUsernameToUpgrade(checkUserData.username)}
                      className="px-3 py-1.5 rounded-xl bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0"
                      title="Chuyển username sang Card Nâng Cấp bên trái"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      <span>Điền sang Card Nâng Cấp</span>
                    </button>
                  </div>

                  {/* Gold Detail Stats */}
                  {checkUserData.goldInfo?.hasGold ? (
                    <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                      <div className="p-3 rounded-xl bg-[#1D202F] border border-white/[0.06]">
                        <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-yellow-400" />
                          <span>Thời gian còn lại</span>
                        </div>
                        <div className="text-base sm:text-lg font-extrabold text-yellow-400 mt-0.5">
                          {calculateDaysLeft(checkUserData.goldInfo.expiresDate) > 0 ? (
                            <span>{calculateDaysLeft(checkUserData.goldInfo.expiresDate)} ngày</span>
                          ) : (
                            <span>Hết hạn</span>
                          )}
                        </div>
                        <p className="text-[10px] text-neutral-500 truncate">
                          Hạn: {formatDateVi(checkUserData.goldInfo.expiresDate)}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-[#1D202F] border border-white/[0.06]">
                        <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Crown className="w-3 h-3 text-yellow-400" />
                          <span>Gói bản quyền</span>
                        </div>
                        <div className="text-base sm:text-lg font-extrabold text-white mt-0.5 truncate">
                          {checkUserData.goldInfo.durationLabel ||
                            (checkUserData.goldInfo.isYearly ? 'Gói 1 Năm' : 'Gói 1 Tháng')}
                        </div>
                        <p className="text-[10px] text-neutral-500 truncate">
                          {checkUserData.goldInfo.isAliasLimited ? (
                            <span className="text-red-400">Đạt 50 alias</span>
                          ) : (
                            <span className="text-emerald-400">Bình thường</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#1D202F] border border-white/[0.06] text-xs text-neutral-400 flex items-center justify-between gap-2">
                      <span>Tài khoản chưa kích hoạt Locket Gold.</span>
                      <button
                        type="button"
                        onClick={() => handleFillUsernameToUpgrade(checkUserData.username)}
                        className="text-yellow-400 hover:text-yellow-300 font-bold text-xs"
                      >
                        Nâng cấp ngay →
                      </button>
                    </div>
                  )}

                  {/* UID Display Box with 1-touch copy */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <Fingerprint className="w-3 h-3 text-yellow-400" />
                        Firebase UID
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {checkUserData.uid.length} ký tự
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#1D202F] border border-white/10 font-mono text-xs text-yellow-300 break-all select-all">
                      <span className="flex-1 text-[11px] sm:text-xs">{checkUserData.uid}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCheckUid(checkUserData.uid)}
                        className="p-1.5 px-2 rounded-lg bg-white/[0.08] hover:bg-yellow-400 hover:text-black text-neutral-300 transition-all flex-shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold"
                        title="Sao chép Firebase UID"
                      >
                        {copiedCheckUid ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Check History */}
              {recentCheckList.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Lịch sử kiểm tra gần đây
                    </span>
                    <button
                      type="button"
                      onClick={handleClearCheckHistory}
                      className="text-neutral-500 hover:text-red-400 transition-colors flex items-center gap-1 text-[11px]"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {recentCheckList.map((item) => (
                      <div
                        key={item.uid}
                        className="p-2.5 rounded-xl bg-[#161824] border border-white/[0.06] hover:border-white/15 transition-all flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCheckInput(item.username);
                            handleLookupCheck(item.username);
                          }}
                          className="flex items-center gap-2 min-w-0 text-left flex-1"
                        >
                          {item.profilePictureUrl ? (
                            <img
                              src={item.profilePictureUrl}
                              alt={item.username}
                              className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-yellow-400/10 text-yellow-400 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                              {item.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {item.displayName}
                            </p>
                            <p className="text-[10px] text-neutral-400 truncate">
                              @{item.username}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {item.hasGold ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              {item.daysLeft}d
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-500/15 text-neutral-400">
                              No Gold
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyCheckUid(item.uid)}
                            className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-all"
                            title="Sao chép UID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function GoldPublicPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0C0D12] text-white flex items-center justify-center">
          <div className="flex items-center gap-3 text-neutral-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-yellow-400" />
            <span>Đang tải Locket Gold...</span>
          </div>
        </div>
      }
    >
      <GoldUnifiedContent />
    </Suspense>
  );
}
