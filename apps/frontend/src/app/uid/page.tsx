'use client';

import React, { useState, useEffect } from 'react';
import {
  Fingerprint,
  Search,
  Copy,
  Check,
  Crown,
  Clipboard,
  Sparkles,
  Clock,
  Trash2,
  AlertCircle,
  User,
  Link2,
} from 'lucide-react';
import {
  goldApi,
  GoldUserPreview,
  parseLocketUsername,
} from '../../lib/goldApi';

const STORAGE_KEY = 'locket_uid_recent_lookups';

interface RecentLookupItem {
  uid: string;
  username: string;
  displayName: string;
  profilePictureUrl?: string;
  hasGold?: boolean;
  timestamp: number;
}

export default function UidLookupPage() {
  const [inputLink, setInputLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState<GoldUserPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [recentList, setRecentList] = useState<RecentLookupItem[]>([]);

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

  const saveToRecent = (user: GoldUserPreview) => {
    try {
      const item: RecentLookupItem = {
        uid: user.uid,
        username: user.username,
        displayName: user.displayName,
        profilePictureUrl: user.profilePictureUrl,
        hasGold: user.goldInfo?.hasGold,
        timestamp: Date.now(),
      };
      const updated = [item, ...recentList.filter((r) => r.uid !== user.uid)].slice(0, 8);
      setRecentList(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const handleClearHistory = () => {
    setRecentList([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handleLookup = async (overrideValue?: string) => {
    const raw = overrideValue ?? inputLink;
    const clean = parseLocketUsername(raw);

    if (!clean) {
      setErrorMessage(
        'Vui lòng dán link Locket (ví dụ: locket.cam/username hoặc locket.camera/invites/...) hoặc nhập username.',
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
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputLink(text.trim());
          handleLookup(text.trim());
        }
      }
    } catch {
      // Fallback if clipboard permission denied
    }
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0D0E12] text-white selection:bg-yellow-400/30 selection:text-yellow-200 pb-20 pt-8 sm:pt-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Main Search Card */}
        <div className="bg-[#16181F]/90 backdrop-blur-xl border border-[#242731] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup();
            }}
            className="space-y-3"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
              Dán liên kết Locket hoặc Username:
            </label>

            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Link2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={inputLink}
                  onChange={(e) => {
                    setInputLink(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="https://locket.cam/username hoặc locket.camera/invites/..."
                  className="w-full pl-11 pr-24 py-3.5 bg-[#0D0E12] border border-[#2D313E] focus:border-yellow-400/80 rounded-2xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-yellow-400/20 transition-all font-mono sm:font-sans"
                />

                {/* Paste Button inside input */}
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-400 text-black font-bold text-sm shadow-lg shadow-yellow-400/20 hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Đang tìm...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 stroke-[2.5]" />
                    <span>Lấy UID</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Samples */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-400">
            <span className="text-neutral-500">Mẫu thử nhanh:</span>
            <button
              type="button"
              onClick={() => {
                setInputLink('https://locket.cam/shynciee');
                handleLookup('https://locket.cam/shynciee');
              }}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-yellow-400/10 hover:text-yellow-400 border border-white/5 transition-colors font-mono"
            >
              locket.cam/shynciee
            </button>
            <button
              type="button"
              onClick={() => {
                setInputLink('https://locket.cam/thanhthuy2001');
                handleLookup('https://locket.cam/thanhthuy2001');
              }}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-yellow-400/10 hover:text-yellow-400 border border-white/5 transition-colors font-mono"
            >
              locket.cam/thanhthuy2001
            </button>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Không thể trích xuất UID</p>
                <p className="text-xs text-red-300/90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}
        </div>

        {/* Result Profile Card */}
        {userData && (
          <div className="bg-[#16181F]/90 backdrop-blur-xl border border-yellow-500/40 rounded-3xl p-6 shadow-2xl shadow-yellow-500/5 space-y-5 animate-fadeIn relative overflow-hidden">
            {/* Ambient gold glow behind */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />

            {/* Profile Overview */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
              {/* Profile Avatar with Golden Frame */}
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1 bg-gradient-to-tr from-[#FFC800] via-amber-400 to-[#FFE866] shadow-xl shadow-yellow-500/20">
                  {userData.profilePictureUrl ? (
                    <img
                      src={userData.profilePictureUrl}
                      alt={userData.displayName}
                      className="w-full h-full rounded-full object-cover bg-neutral-900"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-[#1F222B] flex items-center justify-center text-yellow-400 font-bold text-xl">
                      {userData.displayName
                        ? userData.displayName.slice(0, 2).toUpperCase()
                        : <User className="w-7 h-7" />}
                    </div>
                  )}
                </div>
                {userData.goldInfo?.hasGold && (
                  <div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 flex items-center justify-center shadow-md shadow-yellow-500/40"
                    title="Tài khoản đã kích hoạt Locket Gold"
                  >
                    <Crown className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  </div>
                )}
              </div>

              {/* Names & Badges */}
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate max-w-xs sm:max-w-md">
                    {userData.displayName || userData.username}
                  </h2>
                  {userData.goldInfo?.hasGold ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 text-xs font-bold">
                      <Crown className="w-3 h-3" />
                      Locket Gold VIP
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 border border-white/10 text-xs">
                      Tài khoản thường
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm font-semibold text-neutral-400">
                  @{userData.username}
                </p>

                {/* Subscription Expiry info */}
                {userData.goldInfo?.hasGold && (
                  <p className="text-xs text-yellow-400/90 flex items-center justify-center sm:justify-start gap-1 pt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      Hạn dùng Gold:{' '}
                      {userData.goldInfo.expiresDate
                        ? new Date(userData.goldInfo.expiresDate).toLocaleDateString('vi-VN')
                        : 'Vĩnh viễn'}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-[#242731]" />

            {/* Target UID Box - Highlighted */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4" />
                  Firebase UID (UUID 28 Ký Tự):
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">28 chars</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-[#0D0E12] border border-yellow-500/30 rounded-2xl">
                <code className="flex-1 font-mono text-sm sm:text-base font-bold text-white select-all px-2 break-all sm:break-normal text-center sm:text-left">
                  {userData.uid}
                </code>

                <button
                  type="button"
                  onClick={() => handleCopyUid(userData.uid)}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex-shrink-0 ${
                    copiedUid
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-md shadow-yellow-400/20'
                  }`}
                >
                  {copiedUid ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 stroke-2" />
                      <span>Sao chép UID</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Lookups Section */}
        {recentList.length > 0 && (
          <div className="bg-[#16181F]/90 backdrop-blur-xl border border-[#242731] rounded-3xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-neutral-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Lịch sử tra cứu gần đây
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
                      setInputLink(item.username);
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
                        {item.displayName || item.username}
                      </p>
                      <p className="text-[10px] text-neutral-500 font-mono truncate">
                        {item.uid.slice(0, 8)}...{item.uid.slice(-6)}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(item.uid);
                    }}
                    className="p-2 text-neutral-400 hover:text-yellow-400 rounded-xl hover:bg-white/5 transition-all flex-shrink-0"
                    title="Sao chép nhanh UID"
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
