'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Crown,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Gift,
  Search,
  User,
  RefreshCw,
  ArrowRight,
  Link2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  goldApi,
  GoldUpgradeResult,
  GoldUserPreview,
  parseLocketUsername,
} from '../lib/goldApi';
import { api } from '../lib/api';
import { LocketFriend } from '../types/feed';

interface LocketGoldModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LocketGoldModal({ isOpen, onClose }: LocketGoldModalProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [activeTab, setActiveTab] = useState<'self' | 'friends'>('self');
  const [selectedPackage, setSelectedPackage] = useState<'1m' | '1y'>('1y');

  // Self Upgrade State
  const [isUpgradingSelf, setIsUpgradingSelf] = useState(false);
  const [selfResult, setSelfResult] = useState<GoldUpgradeResult | null>(null);
  const [selfError, setSelfError] = useState<string | null>(null);

  // Friend Gift State
  const [friendInput, setFriendInput] = useState('');
  const [previewFriend, setPreviewFriend] = useState<GoldUserPreview | null>(null);
  const [isLoadingPreviewFriend, setIsLoadingPreviewFriend] = useState(false);
  const [friends, setFriends] = useState<LocketFriend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [upgradingFriendUid, setUpgradingFriendUid] = useState<string | null>(null);
  const [friendSuccessMsg, setFriendSuccessMsg] = useState<string | null>(null);
  const [friendErrorMsg, setFriendErrorMsg] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelfResult(null);
      setSelfError(null);
      setFriendSuccessMsg(null);
      setFriendErrorMsg(null);
      if (activeTab === 'friends' && friends.length === 0) {
        fetchFriends();
      }
    }
  }, [isOpen, activeTab]);

  const fetchFriends = async () => {
    setIsLoadingFriends(true);
    try {
      const data = await api.locket.getFriends();
      setFriends(data || []);
    } catch (e: any) {
      console.debug('Failed to fetch friends for Gold gift:', e);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  if (!isOpen || !mounted) return null;

  // Handler: Upgrade Self
  const handleUpgradeSelf = async () => {
    setSelfError(null);
    setSelfResult(null);
    setIsUpgradingSelf(true);

    try {
      const result = await goldApi.upgradeSelf(selectedPackage);
      setSelfResult(result);
    } catch (err: any) {
      setSelfError(err.message || 'Không thể nâng cấp Gold cho tài khoản này.');
    } finally {
      setIsUpgradingSelf(false);
    }
  };

  // Handler: Check Friend Link or Username
  const handleCheckFriend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = parseLocketUsername(friendInput);
    if (!clean) {
      setFriendErrorMsg(
        'Vui lòng nhập link locket.cam/username hoặc @username (ví dụ: locket.cam/shynciee).',
      );
      return;
    }

    setFriendErrorMsg(null);
    setFriendSuccessMsg(null);
    setIsLoadingPreviewFriend(true);
    setPreviewFriend(null);

    try {
      const user = await goldApi.previewUser(clean);
      setPreviewFriend(user);
    } catch (err: any) {
      setFriendErrorMsg(err.message || 'Không tìm thấy tài khoản Locket này.');
    } finally {
      setIsLoadingPreviewFriend(false);
    }
  };

  // Handler: Select Friend From Friends List
  const handleSelectFriendFromList = (friend: LocketFriend) => {
    setFriendInput(friend.username ? `locket.cam/${friend.username}` : friend.name);
    setFriendErrorMsg(null);
    setFriendSuccessMsg(null);
    setPreviewFriend({
      uid: friend.uid,
      username: friend.username || '',
      displayName: friend.name,
      profilePictureUrl: friend.avatarUrl,
    });
  };

  // Handler: Gift to Previewed Friend
  const handleGiftPreviewedFriend = async () => {
    if (!previewFriend) return;
    setFriendErrorMsg(null);
    setFriendSuccessMsg(null);
    setUpgradingFriendUid(previewFriend.uid || previewFriend.username);

    try {
      const result = await goldApi.upgradeFriend({
        targetUid: previewFriend.uid,
        username: previewFriend.username,
        packageType: selectedPackage,
      });
      setFriendSuccessMsg(
        result.msg ||
          `Đã tặng gói Gold (${selectedPackage === '1y' ? '1 Năm' : '1 Tháng'}) cho @${previewFriend.username || previewFriend.displayName} thành công!`,
      );
    } catch (err: any) {
      setFriendErrorMsg(err.message || 'Không thể tặng Gold cho bạn bè này.');
    } finally {
      setUpgradingFriendUid(null);
    }
  };

  const filteredFriends = friends.filter(
    (f) =>
      f.name.toLowerCase().includes(friendSearch.toLowerCase()) ||
      (f.username && f.username.toLowerCase().includes(friendSearch.toLowerCase())),
  );

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#141620] border border-white/10 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] bg-[#181A26]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-yellow-400 via-amber-400 to-yellow-300 flex items-center justify-center shadow-md shadow-yellow-400/20">
              <Crown className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                Locket Gold{' '}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold">
                  VIP
                </span>
              </h3>
              <p className="text-xs text-neutral-400">Đặc quyền tài khoản cao cấp</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/[0.04] hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-white/[0.06] bg-[#11131C] px-5 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('self')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'self'
                ? 'border-yellow-400 text-yellow-400 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Nâng Cấp Cho Tôi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('friends');
              if (friends.length === 0) fetchFriends();
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'friends'
                ? 'border-yellow-400 text-yellow-400 font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Tặng Bạn Bè</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Active VIP Package Info Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-yellow-400/15 via-amber-400/5 to-transparent border border-yellow-400/30 relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    Gói Locket Gold VIP
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold shadow-sm">
                    ĐANG HOẠT ĐỘNG
                  </span>
                </div>
                <p className="text-xs text-yellow-300 font-medium">
                  Gói kích hoạt hiện tại: <strong>1 Tháng</strong> - Hạn dùng: <strong>15/10/2026</strong>
                </p>
                <p className="text-[11px] text-neutral-400">
                  Tài khoản tự động kế thừa bản quyền Locket Gold VIP trực tiếp từ Master Bot.
                </p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                <Crown className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
          </div>

          {/* TAB 1: SELF UPGRADE */}
          {activeTab === 'self' && (
            <div className="space-y-5">
              {/* User Identity Card */}
              {user && (
                <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#1B1D28] border border-white/[0.06]">
                  {user.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      alt={user.displayName}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-yellow-400 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-base ring-2 ring-yellow-400/40 flex-shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {user.displayName || 'Tài khoản của bạn'}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">{user.email}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 border border-yellow-400/30 font-semibold flex-shrink-0">
                    Sẵn sàng
                  </span>
                </div>
              )}

              {/* Error Box */}
              {selfError && (
                <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{selfError}</span>
                </div>
              )}

              {/* Success Box */}
              {selfResult && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2.5 text-xs animate-in zoom-in-95">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Mở khóa Gold thành công!</span>
                  </div>
                  <p className="leading-relaxed">
                    {selfResult.msg || 'Tài khoản của bạn đã được kích hoạt Locket Gold VIP thành công!'}
                  </p>
                  <div className="p-2.5 rounded-xl bg-black/30 text-[11px] text-neutral-300">
                    👉 <strong>Bước tiếp theo:</strong> Hãy vuốt tắt hoàn toàn ứng dụng Locket trên điện thoại và mở lại để nhận huy hiệu Gold.
                  </div>
                </div>
              )}

              {/* 1-Click Action Button */}
              {!selfResult && (
                <button
                  type="button"
                  onClick={handleUpgradeSelf}
                  disabled={isUpgradingSelf}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 text-black font-extrabold text-sm shadow-xl shadow-yellow-400/25 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isUpgradingSelf ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang kích hoạt gói Gold...</span>
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4 stroke-[2.5]" />
                      <span>Kích Hoạt Locket Gold 1-Click</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* TAB 2: GIFT FRIENDS */}
          {activeTab === 'friends' && (
            <div className="space-y-4">
              {/* Alert Feedback */}
              {friendSuccessMsg && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2 text-xs animate-in zoom-in-95">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <span>Tặng Gold thành công!</span>
                  </div>
                  <p className="leading-relaxed">{friendSuccessMsg}</p>
                  <div className="p-2.5 rounded-xl bg-black/30 text-[11px] text-neutral-300">
                    👉 Hãy nhắn bạn bè vuốt tắt hoàn toàn ứng dụng Locket và mở lại để nhận huy hiệu Gold VIP!
                  </div>
                </div>
              )}

              {friendErrorMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{friendErrorMsg}</span>
                </div>
              )}

              {/* Step 1: Input Link / Username */}
              <form onSubmit={handleCheckFriend} className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Link Locket hoặc Username người nhận
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-yellow-400/80 pointer-events-none">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={friendInput}
                    onChange={(e) => {
                      setFriendInput(e.target.value);
                      if (previewFriend) setPreviewFriend(null);
                    }}
                    placeholder="Ví dụ: locket.cam/shynciee hoặc @shynciee"
                    className="w-full bg-[#1A1D2A] border border-white/10 rounded-2xl pl-10 pr-28 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingPreviewFriend || !friendInput.trim()}
                    className="absolute right-2 px-3.5 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-yellow-400/20"
                  >
                    {isLoadingPreviewFriend ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Kiểm tra</span>
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Hỗ trợ link cá nhân <code className="text-yellow-400/90 font-mono">locket.cam/...</code> hoặc <code className="text-yellow-400/90 font-mono">@username</code>.
                </p>
              </form>

              {/* Step 2: Target User Preview Card */}
              {previewFriend && (
                <div className="p-4 rounded-2xl bg-gradient-to-b from-yellow-400/10 to-[#1A1D2A] border border-yellow-400/30 space-y-4 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-3.5">
                    {previewFriend.profilePictureUrl ? (
                      <img
                        src={previewFriend.profilePictureUrl}
                        alt={previewFriend.displayName}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-yellow-400 shadow-md flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-lg ring-2 ring-yellow-400/40 flex-shrink-0">
                        {previewFriend.displayName?.charAt(0) || <User className="w-6 h-6" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white truncate">
                          {previewFriend.displayName}
                        </p>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 font-semibold flex-shrink-0">
                          Đã xác minh
                        </span>
                      </div>
                      <p className="text-xs text-yellow-400 font-medium truncate mt-0.5">
                        @{previewFriend.username || 'locket_user'}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate">
                        UID: {previewFriend.uid ? `${previewFriend.uid.slice(0, 16)}...` : 'Tài khoản Locket'}
                      </p>
                    </div>
                  </div>

                  {/* Gift CTA */}
                  <button
                    type="button"
                    onClick={handleGiftPreviewedFriend}
                    disabled={Boolean(upgradingFriendUid)}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 text-black font-extrabold text-xs sm:text-sm shadow-lg shadow-yellow-400/20 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {upgradingFriendUid ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang tặng Gold...</span>
                      </>
                    ) : (
                      <>
                        <Gift className="w-4 h-4" />
                        <span>
                          Tặng Gói Locket Gold VIP Cho @{previewFriend.username || previewFriend.displayName}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 3: Quick select from Friends list */}
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                    Hoặc chọn nhanh từ danh sách bạn bè ({friends.length})
                  </label>
                  {friends.length > 0 && (
                    <span className="text-[10px] text-neutral-500">Bấm để chọn</span>
                  )}
                </div>

                {friends.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input
                      type="text"
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      placeholder="Lọc bạn bè theo tên..."
                      className="w-full bg-[#1A1D2A] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/60"
                    />
                  </div>
                )}

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {isLoadingFriends && (
                    <div className="py-6 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-400" />
                      <span>Đang tải danh sách bạn bè...</span>
                    </div>
                  )}

                  {!isLoadingFriends && filteredFriends.length === 0 && (
                    <div className="py-4 text-center text-xs text-neutral-500">
                      {friendSearch ? 'Không tìm thấy bạn bè phù hợp' : 'Chưa có bạn bè nào.'}
                    </div>
                  )}

                  {filteredFriends.map((f) => (
                    <div
                      key={f.uid}
                      onClick={() => handleSelectFriendFromList(f)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#1B1D28] border border-white/[0.04] hover:border-yellow-400/40 hover:bg-[#202332] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {f.avatarUrl ? (
                          <img
                            src={f.avatarUrl}
                            alt={f.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/[0.06] text-neutral-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {f.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white group-hover:text-yellow-300 transition-colors truncate">
                            {f.name}
                          </p>
                          <p className="text-[10px] text-neutral-400 truncate">
                            @{f.username || f.uid.slice(0, 8)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectFriendFromList(f);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.08] group-hover:bg-yellow-400 group-hover:text-black text-neutral-300 text-[11px] font-semibold transition-all flex items-center gap-1 flex-shrink-0"
                      >
                        <span>Chọn</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
