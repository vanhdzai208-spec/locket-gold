'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import {
  goldApi,
  GoldUserPreview,
  GoldQueueStatus,
  MasterStatusResult,
  parseLocketUsername,
} from '../../lib/goldApi';

export default function GoldPublicPage() {
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewUser, setPreviewUser] = useState<GoldUserPreview | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'1m' | '1y'>('1y');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Master UUID state
  const [masterUidInput, setMasterUidInput] = useState('');
  const [masterStatus, setMasterStatus] = useState<MasterStatusResult | null>(null);
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);

  // Queue polling state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queueStatus, setQueueStatus] = useState<GoldQueueStatus | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Step indicator
  const [isSuccess, setIsSuccess] = useState(false);

  // Countdown timer ticker
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

  const handleCheckMaster = async (customUid?: string) => {
    const uidToCheck = customUid !== undefined ? customUid : masterUidInput;
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

  // Auto-fill and auto-preview if username or u param is passed in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const initialUser = params.get('username') || params.get('u');
      if (initialUser) {
        setUsernameInput(initialUser);
        const clean = parseLocketUsername(initialUser);
        if (clean) {
          setIsLoadingPreview(true);
          goldApi
            .previewUser(clean)
            .then((user) => setPreviewUser(user))
            .catch((err) =>
              setErrorMessage(
                err.message || 'Không tìm thấy tài khoản Locket này.',
              ),
            )
            .finally(() => setIsLoadingPreview(false));
        }
      }
    }
  }, []);

  // Handler: Check User Info
  const handlePreview = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = parseLocketUsername(usernameInput);
    if (!clean) {
      setErrorMessage(
        'Vui lòng nhập link locket.cam/username hoặc @username (ví dụ: locket.cam/shynciee).',
      );
      return;
    }

    setErrorMessage(null);
    setIsLoadingPreview(true);
    setPreviewUser(null);
    setIsSuccess(false);

    try {
      const user = await goldApi.previewUser(clean);
      setPreviewUser(user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không tìm thấy tài khoản Locket này.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handler: Submit to Queue
  const handleSubmitUpgrade = async () => {
    if (!previewUser) return;

    setErrorMessage(null);
    setIsSubmitting(true);
    setQueueStatus(null);

    try {
      const initialStatus = await goldApi.submitPublicUpgrade(
        previewUser.username,
        selectedPackage,
        masterUidInput || undefined,
      );
      setQueueStatus(initialStatus);
      setCountdown(initialStatus.estimatedSeconds || 5);

      // Start polling status
      pollTicket(initialStatus.ticketId);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể đưa yêu cầu vào hàng đợi.');
      setIsSubmitting(false);
    }
  };

  // Poller function
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
        setErrorMessage(
          status.error || 'Có lỗi xảy ra trong quá trình kích hoạt Gold.',
        );
        return;
      }

      // If still waiting or processing, poll again in 1.8s
      pollingTimerRef.current = setTimeout(() => {
        pollTicket(ticketId);
      }, 1800);
    } catch (err: any) {
      // Retry polling after 2s
      pollingTimerRef.current = setTimeout(() => {
        pollTicket(ticketId);
      }, 2000);
    }
  };

  const handleReset = () => {
    setUsernameInput('');
    setPreviewUser(null);
    setIsSuccess(false);
    setQueueStatus(null);
    setErrorMessage(null);
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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-16">
        <div className="w-full max-w-2xl sm:max-w-3xl mx-auto">
          {/* Main Card Container */}
          <div className="rounded-3xl bg-[#141620]/95 border border-white/[0.08] shadow-[0_25px_60px_rgba(0,0,0,0.7)] backdrop-blur-2xl p-6 sm:p-10 space-y-7">
            {/* Error Banner */}
            {errorMessage && (
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs sm:text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* State A: Success Screen */}
            {isSuccess && previewUser && (
              <div className="text-center space-y-6 py-4 animate-in zoom-in-95 duration-300">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-400 via-amber-400 to-yellow-300 mx-auto flex items-center justify-center shadow-xl shadow-yellow-400/30">
                  <CheckCircle2 className="w-10 h-10 text-black stroke-[2.5]" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">
                    Mở Khóa Thành Công!
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Tài khoản{' '}
                    <span className="text-yellow-400 font-semibold">
                      @{previewUser.username}
                    </span>{' '}
                    đã được kích hoạt gói Locket Gold VIP (Gói {selectedPackage === '1y' ? '1 Năm' : '1 Tháng'}
                    {queueStatus?.result?.expiresDate || masterStatus?.expiresDate
                      ? ` - Hạn dùng đến: ${new Date(queueStatus?.result?.expiresDate || masterStatus?.expiresDate || '').toLocaleDateString('vi-VN')}`
                      : ` - Hạn dùng: ${new Date(Date.now() + (selectedPackage === '1y' ? 365 : 30) * 86400000).toLocaleDateString('vi-VN')}`}).
                  </p>
                </div>

                {/* Instructions Box */}
                <div className="text-left rounded-2xl bg-[#1A1D2A] border border-white/[0.06] p-4 space-y-3 text-xs text-neutral-300">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Các bước để nhận Gold trên điện thoại:
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 leading-relaxed">
                    <li>
                      <strong className="text-white">Đóng hoàn toàn app Locket</strong> (vuốt lên tắt hẳn ứng dụng trong đa nhiệm).
                    </li>
                    <li>Mở lại app Locket trên điện thoại iPhone của bạn.</li>
                    <li>
                      Tận hưởng các tính năng Gold: huy hiệu vàng, biểu tượng ứng dụng mới và không giới hạn bạn bè!
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 px-4 rounded-2xl font-semibold text-sm bg-white/[0.08] hover:bg-white/[0.14] text-white transition-all"
                  >
                    Nâng cấp tài khoản khác
                  </button>
                  <Link
                    href="/"
                    className="flex-1 py-3 px-4 rounded-2xl font-semibold text-sm bg-gradient-to-r from-yellow-400 to-amber-400 text-black shadow-lg shadow-yellow-400/20 hover:brightness-105 transition-all text-center"
                  >
                    Vào Locket Web ngay
                  </Link>
                </div>
              </div>
            )}

            {/* State B: Queue Status Modal / In-Progress */}
            {isSubmitting && queueStatus && !isSuccess && (
              <div className="space-y-6 py-4 text-center animate-in fade-in duration-200">
                <div className="relative w-16 h-16 mx-auto">
                  <div className="w-16 h-16 rounded-full bg-yellow-400/20 flex items-center justify-center animate-pulse">
                    <Crown className="w-8 h-8 text-yellow-400" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">
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
                  <div className="p-3.5 rounded-2xl bg-[#1B1D28] border border-white/[0.06]">
                    <div className="text-[11px] text-neutral-400 flex items-center justify-center gap-1">
                      <Users className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Vị trí</span>
                    </div>
                    <div className="text-xl font-extrabold text-yellow-400 mt-1">
                      {queueStatus.position === 0 ? 'Xử lý ngay' : `#${queueStatus.position}`}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#1B1D28] border border-white/[0.06]">
                    <div className="text-[11px] text-neutral-400 flex items-center justify-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Ước tính</span>
                    </div>
                    <div className="text-xl font-extrabold text-white mt-1">
                      {countdown > 0 ? `~${countdown}s` : 'Vài giây'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-white/[0.06] h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-yellow-400 to-amber-500 h-full w-full animate-[shimmer_2s_infinite]" />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Hệ thống xử lý tuần tự để đảm bảo 100% an toàn cho tài khoản.
                  </p>
                </div>
              </div>
            )}

            {/* State C: Search & Preview & Select Flow */}
            {!isSubmitting && !isSuccess && (
              <>
                {/* Master Gold Donor Configuration */}
                <div className="p-5 sm:p-6 rounded-2xl bg-[#151722] border border-white/[0.08] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-yellow-400 shadow-sm">
                        <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div>
                        <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                          <span>Master UUID nguồn Gold</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-400 font-normal">
                            {masterUidInput ? 'Tùy chỉnh' : 'Mặc định hệ thống'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isLoadingMaster ? (
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-neutral-400 bg-white/[0.04] px-3.5 py-1.5 rounded-full">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-400" />
                        <span>Đang kiểm tra...</span>
                      </div>
                    ) : masterStatus?.isStillValid ? (
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Gold Active ({masterStatus.durationLabel || (masterStatus.isYearly ? '1 Năm' : '1 Tháng')})</span>
                        {masterStatus.expiresDate && (
                          <span className="text-emerald-500/80 text-xs">
                            ({new Date(masterStatus.expiresDate).toLocaleDateString('vi-VN')})
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3.5 py-1.5 rounded-full font-semibold">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span>Chưa xác thực Gold</span>
                      </div>
                    )}
                  </div>

                  {/* Input & Action */}
                  <div className="flex items-center gap-2.5">
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
                            ? `Hiện tại: ${masterStatus.masterUid}`
                            : 'Nhập Firebase UID của tài khoản có Gold...'
                        }
                        className="w-full bg-[#1A1D2A] border border-white/10 rounded-2xl px-4 py-3 sm:py-3.5 text-xs sm:text-sm text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckMaster()}
                      disabled={isLoadingMaster}
                      className="px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-50 flex-shrink-0"
                      title="Kiểm tra trạng thái Gold của UUID này"
                    >
                      {isLoadingMaster ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span>Kiểm tra</span>
                    </button>
                    {masterUidInput && (
                      <button
                        type="button"
                        onClick={handleResetMaster}
                        disabled={isLoadingMaster}
                        className="p-3 sm:p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-all flex-shrink-0"
                        title="Đặt lại về UUID mặc định của hệ thống"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="text-xs sm:text-sm text-neutral-400 flex items-center justify-between pt-0.5">
                    <span>Dùng để alias kích hoạt gói Gold sang người nhận qua RevenueCat.</span>
                    <Link
                      href="/uid"
                      className="text-yellow-400 hover:text-yellow-300 font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Fingerprint className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Lấy UID</span>
                    </Link>
                  </div>
                </div>

                {/* Step 1: Input Username / Link */}
                <form onSubmit={handlePreview} className="space-y-3.5">
                  <label className="block text-xs sm:text-sm font-bold text-neutral-200 uppercase tracking-wider">
                    Link Locket hoặc Username người nhận
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 sm:left-5 text-neutral-400 pointer-events-none">
                      <Link2 className="w-5 h-5 text-yellow-400/90" />
                    </div>
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Ví dụ: locket.cam/shynciee hoặc @shynciee"
                      className="w-full bg-[#1A1D2A] border border-white/10 rounded-2xl pl-12 sm:pl-14 pr-36 sm:pr-40 py-4 sm:py-4.5 text-sm sm:text-base text-white placeholder-neutral-500 focus:outline-none focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={isLoadingPreview || !usernameInput.trim()}
                      className="absolute right-2.5 sm:right-3 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs sm:text-sm transition-all flex items-center gap-2 shadow-lg shadow-yellow-400/20"
                    >
                      {isLoadingPreview ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span>Kiểm tra</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm pt-0.5 px-1">
                    <span className="text-neutral-400">Hỗ trợ link locket.cam, link mời, @username</span>
                    <Link
                      href="/uid"
                      className="text-yellow-400 hover:text-yellow-300 font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Fingerprint className="w-4 h-4" />
                      <span>Tra cứu UID bạn bè</span>
                    </Link>
                  </div>
                </form>

                {/* Step 2: User Preview Card (When found) */}
                {previewUser && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* User Info Preview */}
                    <div className="p-5 sm:p-6 rounded-2xl bg-[#1A1D2A] border border-yellow-400/30 flex items-center gap-4">
                      {previewUser.profilePictureUrl ? (
                        <img
                          src={previewUser.profilePictureUrl}
                          alt={previewUser.username}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-2 ring-yellow-400/60 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-xl ring-2 ring-yellow-400/40 flex-shrink-0">
                          {previewUser.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base sm:text-lg truncate">
                            {previewUser.displayName}
                          </h4>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 font-semibold">
                            Hợp lệ
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-neutral-400 truncate mt-0.5">
                          @{previewUser.username}
                        </p>
                      </div>
                    </div>

                    {/* Step 3: Active VIP Package Card */}
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
                        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-yellow-400/15 via-amber-400/5 to-transparent border border-yellow-400/30 relative overflow-hidden">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
                                  <Sparkles className="w-4 h-4 text-yellow-400" />
                                  Gói Locket Gold VIP
                                </span>
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-400 text-black font-extrabold shadow-sm">
                                  {userGold ? 'ĐÃ KÍCH HOẠT' : 'ĐANG HOẠT ĐỘNG'}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-yellow-300 font-medium">
                                Gói kích hoạt hiện tại: <strong>{durationLabel}</strong> - Hạn dùng: <strong>{expiryDisplay}</strong>
                              </p>
                              <p className="text-xs text-neutral-400 leading-relaxed">
                                Hệ thống tự động kích hoạt đặc quyền VIP qua Master Bot bản quyền Apple Store.
                              </p>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                              <Crown className="w-6 h-6 text-yellow-400" />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={handleSubmitUpgrade}
                      className="w-full py-4.5 sm:py-5 px-8 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 text-black font-extrabold text-base sm:text-lg shadow-2xl shadow-yellow-400/25 hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5"
                    >
                      <Crown className="w-6 h-6 stroke-[2.5]" />
                      <span>Xác Nhận Nâng Cấp Gold Miễn Phí</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
