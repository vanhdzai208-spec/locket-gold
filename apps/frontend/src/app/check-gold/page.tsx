'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Copy,
  Check,
  Clipboard,
  Clock,
  Trash2,
  AlertCircle,
  User,
  Crown,
  Calendar,
  Sparkles,
  Link2,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  goldApi,
  GoldUserPreview,
  parseLocketUsername,
} from '../../lib/goldApi';

const STORAGE_KEY = 'locket_check_gold_recent_history';

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

function CheckGoldContent() {
  const searchParams = useSearchParams();
  const initialUsername = searchParams.get('u') || searchParams.get('username') || '';

  const [inputVal, setInputVal] = useState(initialUsername);
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState<GoldUserPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [recentList, setRecentList] = useState<RecentCheckItem[]>([]);

  // Load recent lookups from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRecentList(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveToRecent = useCallback(
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

        setRecentList((prev) => {
          const updated = [item, ...prev.filter((r) => r.username.toLowerCase() !== user.username.toLowerCase())].slice(0, 8);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } catch {
        // Ignore
      }
    },
    [],
  );

  const handleClearHistory = () => {
    setRecentList([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handleLookup = useCallback(
    async (overrideValue?: string) => {
      const raw = overrideValue !== undefined ? overrideValue : inputVal;
      const clean = parseLocketUsername(raw);

      if (!clean) {
        setErrorMessage(
          'Vui lòng nhập Username (ví dụ: @ca25) hoặc dán đường dẫn Locket.',
        );
        return;
      }

      setErrorMessage(null);
      setIsLoading(true);
      setUserData(null);
      setCopiedUid(false);

      try {
        const user = await goldApi.previewUser(clean);
        setUserData(user);
        saveToRecent(user);
      } catch (err: any) {
        setErrorMessage(
          err.message || 'Không tìm thấy tài khoản Locket hoặc link không hợp lệ.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [inputVal, saveToRecent],
  );

  // Auto lookup if query param is provided
  useEffect(() => {
    if (initialUsername) {
      handleLookup(initialUsername);
    }
  }, [initialUsername, handleLookup]);

  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputVal(text.trim());
          handleLookup(text.trim());
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const hasGold = !!userData?.goldInfo?.hasGold;
  const expiresDate = userData?.goldInfo?.expiresDate;
  const daysLeft = hasGold ? calculateDaysLeft(expiresDate) : 0;

  return (
    <div className="min-h-screen bg-[#0D0E12] text-white selection:bg-yellow-400/30 selection:text-yellow-200 pb-20 pt-8 sm:pt-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Title Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-semibold">
            <Crown className="w-3.5 h-3.5" />
            <span>Tra Cứu Gói Locket Gold</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Kiểm Tra Số Ngày Locket Gold
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Nhập Username để xem ngay trạng thái Gold, ngày hết hạn và số ngày còn lại
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-[#16181F]/90 backdrop-blur-xl border border-[#242731] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup();
            }}
            className="space-y-3"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300">
              Nhập Username Locket
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                <span className="font-bold text-yellow-400/80 text-base">@</span>
              </div>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="@ca25 hoặc link locket.cam/username"
                className="w-full pl-9 pr-24 py-3.5 bg-[#0D0E12] border border-[#2D313E] focus:border-yellow-400/80 rounded-2xl text-sm sm:text-base text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/20 transition-all font-mono sm:font-sans"
              />

              {/* Paste Button */}
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute inset-y-0 right-2 my-auto h-8 px-2.5 flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white bg-[#1F222B] hover:bg-[#2A2E3B] border border-[#343846] rounded-xl transition-all"
                title="Dán từ Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dán</span>
              </button>
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#FFC800] via-amber-400 to-[#FFD54F] text-black font-extrabold text-sm sm:text-base shadow-lg shadow-yellow-400/20 hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none transition-all"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 stroke-[2.5]" />
                  <span>Kiểm tra</span>
                </>
              )}
            </button>
          </form>

          {/* Sample quick picks */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-400">
            <span className="text-neutral-500">Mẫu thử:</span>
            {['ca25', 'shynciee', 'thanhthuy2001'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setInputVal(sample);
                  handleLookup(sample);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-yellow-400/10 hover:text-yellow-400 border border-white/5 transition-colors font-mono"
              >
                @{sample}
              </button>
            ))}
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Tra cứu thất bại</p>
                <p className="text-xs text-red-300/90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Result Profile & Status Card */}
        {userData && (
          <div className="bg-[#16181F]/90 backdrop-blur-xl border border-[#2D313E] rounded-3xl p-6 shadow-2xl space-y-6 animate-fadeIn relative overflow-hidden">
            {/* Ambient subtle glow */}
            <div
              className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
                hasGold ? 'bg-emerald-500/10' : 'bg-amber-500/10'
              }`}
            />

            {/* Profile Avatar with Yellow Gold Ring (Centered like sample) */}
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr from-[#FFC800] via-amber-400 to-[#FFE866] shadow-xl shadow-yellow-500/20">
                  {userData.profilePictureUrl ? (
                    <img
                      src={userData.profilePictureUrl}
                      alt={userData.displayName}
                      className="w-full h-full rounded-full object-cover bg-neutral-900"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#1F222B] flex items-center justify-center text-yellow-400 font-bold text-xl sm:text-2xl">
                      {userData.displayName
                        ? userData.displayName.slice(0, 2).toUpperCase()
                        : <User className="w-8 h-8" />}
                    </div>
                  )}
                </div>

                {hasGold && (
                  <div
                    className="absolute bottom-0 right-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center shadow-md shadow-yellow-500/40 ring-2 ring-[#16181F]"
                    title="Tài khoản đã kích hoạt Locket Gold"
                  >
                    <Crown className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  </div>
                )}
              </div>

              {/* Username centered */}
              <div className="space-y-0.5">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  @{userData.username}
                </h2>
                {userData.displayName && userData.displayName !== userData.username && (
                  <p className="text-xs text-neutral-400 font-medium">
                    {userData.displayName}
                  </p>
                )}
              </div>

              {/* UID Pill Badge with quick copy */}
              <button
                type="button"
                onClick={() => handleCopyUid(userData.uid)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D0E12] hover:bg-[#1f222d] border border-[#2D313E] text-xs font-mono text-neutral-300 hover:text-white transition-all shadow-sm group"
                title="Bấm để sao chép UID"
              >
                <span className="text-neutral-500 font-bold">UID :</span>
                <span className="font-semibold tracking-wide select-all">
                  {userData.uid}
                </span>
                {copiedUid ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-neutral-500 group-hover:text-yellow-400 transition-colors" />
                )}
              </button>
            </div>

            {/* Status Card - Matching user reference image structure */}
            <div className="rounded-2xl overflow-hidden border shadow-lg transition-all border-[#242731]">
              {/* Header banner */}
              {hasGold ? (
                <div className="bg-[#057A55] text-white px-5 py-3.5 flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded bg-emerald-300 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-emerald-950 stroke-[3.5]" />
                  </div>
                  <span className="font-bold text-sm sm:text-base tracking-tight">
                    Tài khoản này đã có Gold!
                  </span>
                </div>
              ) : (
                <div className="bg-[#854D0E] text-white px-5 py-3.5 flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded bg-amber-300 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-950 stroke-[3]" />
                  </div>
                  <span className="font-bold text-sm sm:text-base tracking-tight">
                    Tài khoản này chưa có Gold!
                  </span>
                </div>
              )}

              {/* Content table */}
              <div className="bg-[#0D0E12] divide-y divide-[#1F242D] px-5 py-2">
                {/* Row 1: Hết hạn */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-neutral-400 font-medium text-xs sm:text-sm">
                    Hết hạn
                  </span>
                  <span className="font-bold text-white text-xs sm:text-sm font-mono sm:font-sans">
                    {hasGold
                      ? (expiresDate ? formatDateVi(expiresDate) : 'Vĩnh viễn')
                      : (expiresDate ? `Đã hết hạn (${formatDateVi(expiresDate)})` : 'Chưa kích hoạt')}
                  </span>
                </div>

                {/* Row 2: Còn lại */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-neutral-400 font-medium text-xs sm:text-sm">
                    Còn lại
                  </span>
                  <span
                    className={`font-extrabold text-sm sm:text-base ${
                      hasGold ? 'text-emerald-400' : 'text-neutral-400'
                    }`}
                  >
                    {hasGold
                      ? (expiresDate ? `${daysLeft} ngày` : 'Không giới hạn')
                      : '0 ngày'}
                  </span>
                </div>

                {/* Row 3: Hạn mức chia sẻ (Limit) */}
                <div className="flex items-center justify-between py-3">
                  <div className="space-y-0.5 text-left">
                    <span className="text-neutral-400 font-medium text-xs sm:text-sm block">
                      Hạn mức chia sẻ
                    </span>
                    <span className="text-[11px] text-neutral-500 block">
                      Giới hạn 50 alias RevenueCat
                    </span>
                  </div>
                  <div className="text-right">
                    {hasGold ? (
                      userData.goldInfo?.isAliasLimited ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          Đã Limit (50/50 lượt)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Chưa Limit (Có thể chia sẻ)
                        </span>
                      )
                    ) : (
                      <span className="text-neutral-500 text-xs font-medium">
                        Không khả dụng
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Note if alias limited */}
              {hasGold && userData.goldInfo?.isAliasLimited && (
                <div className="bg-red-500/10 border-t border-red-500/20 px-5 py-3 text-xs text-red-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    Tài khoản này <b>vẫn dùng Locket Gold bình thường</b>, nhưng <b>đã đạt giới hạn 50/50 lượt alias</b> của RevenueCat. Bạn không thể dùng UID này làm nguồn để up Gold cho tài khoản khác.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Lookups History */}
        {recentList.length > 0 && (
          <div className="bg-[#16181F]/90 backdrop-blur-xl border border-[#242731] rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Lịch sử kiểm tra gần đây
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10">
                  {recentList.length}
                </span>
              </div>

              <button
                type="button"
                onClick={handleClearHistory}
                className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                title="Xóa toàn bộ lịch sử"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentList.map((item) => (
                <div
                  key={item.uid}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-[#0D0E12] border border-[#242731] hover:border-yellow-400/40 transition-all group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setInputVal(item.username);
                      handleLookup(item.username);
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    {item.profilePictureUrl ? (
                      <img
                        src={item.profilePictureUrl}
                        alt={item.displayName}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-white/20 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-yellow-400/10 text-yellow-400 flex items-center justify-center font-bold text-xs ring-1 ring-yellow-400/20 flex-shrink-0">
                        {item.displayName ? item.displayName.slice(0, 2).toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate group-hover:text-yellow-400 transition-colors">
                        @{item.username}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate flex items-center gap-1.5">
                        {item.hasGold ? (
                          <>
                            <span className="text-emerald-400 font-semibold">
                              Gold: {item.daysLeft} ngày
                            </span>
                            {item.isAliasLimited ? (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                                Limit
                              </span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                                Share OK
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-neutral-500">Chưa có Gold</span>
                        )}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyUid(item.uid);
                    }}
                    className="p-2 text-neutral-400 hover:text-yellow-400 rounded-xl hover:bg-white/5 transition-all flex-shrink-0"
                    title="Sao chép UID"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckGoldPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D0E12] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CheckGoldContent />
    </Suspense>
  );
}
