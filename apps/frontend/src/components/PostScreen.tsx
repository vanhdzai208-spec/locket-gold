'use client';

import React, { useState, useEffect } from 'react';
import { api, PostMomentResponse } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { LocketFriend, LocketFeedItem } from '../types/feed';
import {
  Send,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RotateCcw,
  Users,
  UserX,
  ChevronDown,
  ChevronUp,
  Check,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface PostScreenProps {
  imageBlob: Blob;
  previewUrl: string;
  videoBlob?: Blob;
  videoUrl?: string;
  onBackToEdit: () => void;
  onResetAll: () => void;
  onGoToFeed?: () => void;
}

type PostStatus = 'idle' | 'uploading' | 'processing' | 'posting' | 'success' | 'failed';

export default function PostScreen({
  imageBlob,
  previewUrl,
  videoBlob,
  videoUrl,
  onBackToEdit,
  onResetAll,
  onGoToFeed,
}: PostScreenProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<PostStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PostMomentResponse | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Audience & Friend selection state
  const [friends, setFriends] = useState<LocketFriend[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState<boolean>(true);
  const [isAudienceOpen, setIsAudienceOpen] = useState<boolean>(false);

  const maxCaptionLength = 150;
  const charsRemaining = maxCaptionLength - caption.length;

  useEffect(() => {
    let isMounted = true;
    api.locket
      .getFriends()
      .then((data) => {
        if (isMounted) {
          setFriends(data);
          setSelectedUids(data.map((f) => f.uid));
          setIsLoadingFriends(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load friends list:', err);
        if (isMounted) setIsLoadingFriends(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const isAllSelected = friends.length > 0 && selectedUids.length === friends.length;
  const excludedCount = Math.max(0, friends.length - selectedUids.length);

  const toggleFriend = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const selectAll = () => {
    setSelectedUids(friends.map((f) => f.uid));
  };

  const deselectAll = () => {
    setSelectedUids([]);
  };

  const handlePost = async () => {
    if (status !== 'idle' && status !== 'failed') return;
    if (friends.length > 0 && selectedUids.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 bạn bè hoặc chọn tất cả để đăng bài.');
      return;
    }

    setStatus('uploading');
    setErrorMessage(null);

    try {
      // Simulate realistic phase progression for smooth UX
      const progressTimer = setTimeout(() => {
        setStatus('processing');
      }, 700);

      const postTimer = setTimeout(() => {
        setStatus('posting');
      }, 1600);

      // If all friends are selected (or no friends), recipients is undefined (sent_to_all: true)
      // Otherwise send the specific list of allowed recipients (excluding unchecked friends)
      const recipientsToPass =
        isAllSelected || friends.length === 0 ? undefined : selectedUids;

      const res = await api.locket.postMoment(
        imageBlob,
        caption,
        recipientsToPass,
        videoBlob,
      );

      clearTimeout(progressTimer);
      clearTimeout(postTimer);

      // Optimistically insert newly posted moment directly into feed cache so it renders immediately
      if (user?.uid) {
        try {
          const normalizeTimestampToIso = (ts?: number | string): string => {
            if (!ts) return new Date().toISOString();
            if (typeof ts === 'number') {
              const ms = ts < 1e11 ? ts * 1000 : ts;
              return new Date(ms).toISOString();
            }
            const num = Number(ts);
            if (!isNaN(num) && String(ts).trim() !== '') {
              const ms = num < 1e11 ? num * 1000 : num;
              return new Date(ms).toISOString();
            }
            const parsed = new Date(ts);
            if (!isNaN(parsed.getTime())) {
              if (parsed.getFullYear() < 2000) {
                const t = parsed.getTime();
                const ms = t > 0 && t < 1e11 ? t * 1000 : t;
                return new Date(ms).toISOString();
              }
              return parsed.toISOString();
            }
            return new Date().toISOString();
          };

          const newMomentItem: LocketFeedItem = {
            id: res.momentUid,
            authorUid: user.uid,
            authorName: user.displayName || 'Bạn',
            authorAvatarUrl: user.photoUrl,
            imageUrl: res.downloadUrl || previewUrl,
            thumbnailUrl: res.downloadUrl || previewUrl,
            videoUrl: res.videoUrl || videoUrl || undefined,
            caption: caption.trim() || undefined,
            createdAt: normalizeTimestampToIso(res.createdAt),
            isMine: true,
            recipients: recipientsToPass || [],
            sentToAll: !recipientsToPass || recipientsToPass.length === 0,
          };

          const cacheKey = `locket_feed_moments_${user.uid}`;
          const rawCached = localStorage.getItem(cacheKey);
          let cachedList: LocketFeedItem[] = [];
          if (rawCached) {
            try {
              cachedList = JSON.parse(rawCached);
            } catch {}
          }
          const updatedList = [
            newMomentItem,
            ...cachedList.filter((item) => item.id !== res.momentUid),
          ];
          localStorage.setItem(cacheKey, JSON.stringify(updatedList));
          localStorage.setItem(`locket_feed_last_sync_${user.uid}`, String(Date.now()));

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('locket_moment_posted', { detail: newMomentItem }),
            );
          }
        } catch (e) {
          console.warn('Could not insert new moment into local feed cache:', e);
        }
      }

      setResult(res);
      setStatus('success');
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(
        err.message ||
          'Failed to post to Locket. Please check your connection or token.',
      );
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto py-6 px-4">
      <div className="bg-[#16181F] border border-[#242731] rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#242731] pb-4">
          <button
            onClick={onBackToEdit}
            disabled={status !== 'idle' && status !== 'failed'}
            className="flex items-center space-x-1.5 text-xs font-semibold text-neutral-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Editor</span>
          </button>
          <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
            Ready to Share
          </span>
        </div>

        {/* Locket Widget Simulation */}
        <div className="relative mx-auto w-[280px] sm:w-[320px] aspect-square rounded-[2.25rem] overflow-hidden bg-black shadow-2xl border-4 border-[#242731] ring-1 ring-yellow-400/20">
          {/* Main Media (Video or Image) */}
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              loop
              playsInline
              muted={isMuted}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Preview Moment"
              className="w-full h-full object-cover"
            />
          )}

          {/* Mute/Unmute Audio Toggle Button for Video */}
          {videoUrl && (
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              className="absolute bottom-3.5 right-3.5 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all active:scale-90 z-10"
              title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-neutral-300" />
              ) : (
                <Volume2 className="w-4 h-4 text-yellow-400" />
              )}
            </button>
          )}

          {/* Time Badge (Locket Style Top-Left) */}
          <div className="absolute top-3.5 left-3.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md flex items-center space-x-1 border border-white/10 text-[11px] font-medium text-white shadow-sm">
            <Clock className="w-3 h-3 text-yellow-400" />
            <span>Now</span>
          </div>

          {/* User Badge (Locket Style Top-Right) */}
          {user && (
            <div className="absolute top-3.5 right-3.5 flex items-center space-x-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 shadow-sm">
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.displayName}
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-yellow-400 text-black font-bold text-[9px] flex items-center justify-center">
                  {(user.displayName || user.email)[0].toUpperCase()}
                </div>
              )}
              <span className="text-[10px] text-white font-medium max-w-[80px] truncate">
                {user.displayName || user.email.split('@')[0]}
              </span>
            </div>
          )}

          {/* Simulated Live Caption Overlay (Locket Pill at Bottom) */}
          {caption.trim().length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <div className="inline-block max-w-full px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-lg">
                <p className="text-xs font-semibold text-white/90 break-words line-clamp-3">
                  {caption}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Caption Input Field */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-neutral-300">
              Add a Caption (Optional)
            </label>
            <span
              className={`font-mono text-[11px] ${
                charsRemaining < 20 ? 'text-amber-400' : 'text-neutral-500'
              }`}
            >
              {charsRemaining} chars left
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={caption}
              onChange={(e) => {
                if (e.target.value.length <= maxCaptionLength) {
                  setCaption(e.target.value);
                }
              }}
              placeholder="Say something to your friends..."
              disabled={status !== 'idle' && status !== 'failed'}
              className="w-full bg-[#1F222B] border border-[#2D313E] focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 rounded-2xl px-4 py-3 text-sm text-white placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
            />
          </div>
        </div>

        {/* Audience Selector (Custom recipients / Exclude friends) */}
        <div className="space-y-3 bg-[#1A1D26] border border-[#262A36] rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-yellow-400 shrink-0">
                {excludedCount > 0 ? (
                  <UserX className="w-4 h-4 text-amber-400" />
                ) : (
                  <Users className="w-4 h-4 text-yellow-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  Đối tượng xem khoảnh khắc
                </p>
                <p className="text-[11px] text-neutral-400">
                  {isLoadingFriends
                    ? 'Đang tải danh sách bạn bè...'
                    : friends.length === 0
                    ? 'Tất cả bạn bè'
                    : isAllSelected
                    ? `Tất cả bạn bè (${friends.length} người)`
                    : selectedUids.length === 0
                    ? 'Chưa chọn ai (Hãy chọn ít nhất 1 người)'
                    : `${selectedUids.length} người xem • ${excludedCount} người bị loại trừ`}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isLoadingFriends || friends.length === 0 || (status !== 'idle' && status !== 'failed')}
              onClick={() => setIsAudienceOpen((prev) => !prev)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-[#242834] hover:bg-[#2C3140] text-xs font-semibold text-neutral-300 hover:text-white transition-colors disabled:opacity-40"
            >
              <span>{isAudienceOpen ? 'Đóng' : 'Tùy chỉnh'}</span>
              {isAudienceOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Expandable Friend Selection List */}
          {isAudienceOpen && (
            <div className="pt-3 border-t border-[#262A36] space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-neutral-400">
                  Chọn người được xem bài viết này:
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] font-semibold text-yellow-400 hover:underline"
                  >
                    Chọn tất cả
                  </button>
                  <span className="text-neutral-600">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-[11px] font-semibold text-neutral-400 hover:text-white"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
              </div>

              {friends.length === 0 ? (
                <p className="text-xs text-neutral-500 py-2 text-center">
                  Không tìm thấy bạn bè nào trong danh sách.
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {friends.map((friend) => {
                    const isSelected = selectedUids.includes(friend.uid);
                    return (
                      <div
                        key={friend.uid}
                        onClick={() => toggleFriend(friend.uid)}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors border ${
                          isSelected
                            ? 'bg-neutral-800/60 border-neutral-700/60 hover:bg-neutral-800'
                            : 'bg-red-950/20 border-red-900/30 hover:bg-red-950/30 opacity-75'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          {friend.avatarUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={friend.avatarUrl}
                              alt={friend.name}
                              className="w-7 h-7 rounded-full object-cover border border-neutral-700"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 text-xs">
                              {friend.name ? friend.name[0].toUpperCase() : '?'}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-white line-clamp-1">
                              {friend.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {isSelected ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Được xem
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                              Bị loại trừ
                            </span>
                          )}
                          <div
                            className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-colors ${
                              isSelected
                                ? 'bg-yellow-400 border-yellow-400 text-black'
                                : 'border-neutral-600 bg-neutral-800 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Indicators & Alerts */}
        {status === 'failed' && errorMessage && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start space-x-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-red-300">Failed to Post</p>
              <p className="text-xs text-red-200/90 leading-relaxed font-medium">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center space-x-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-300">
                Posted Successfully!
              </p>
              <p className="text-xs text-emerald-200/80">
                Your moment is now live on your friends&apos; Locket widgets.
              </p>
              {result?.momentUid && (
                <p className="text-[10px] text-neutral-400 font-mono mt-1">
                  UID: {result.momentUid}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div>
          {status === 'success' ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onGoToFeed || onResetAll}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-3.5 px-6 rounded-2xl transition-all shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2"
              >
                <span>Xem trên Locket Feed</span>
              </button>
              <button
                onClick={onResetAll}
                className="flex-1 bg-[#1F222B] hover:bg-[#252934] text-neutral-300 hover:text-white font-semibold py-3.5 px-6 rounded-2xl border border-[#2D313E] transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Đăng ảnh khác</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handlePost}
              disabled={
                (status !== 'idle' && status !== 'failed') ||
                (friends.length > 0 && selectedUids.length === 0)
              }
              className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black font-extrabold py-3.5 px-6 rounded-2xl transition-all shadow-lg shadow-yellow-400/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              {status === 'uploading' && (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Uploading Image...</span>
                </>
              )}

              {status === 'processing' && (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Saving to Firebase Storage...</span>
                </>
              )}

              {status === 'posting' && (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Broadcasting to Locket...</span>
                </>
              )}

              {(status === 'idle' || status === 'failed') && (
                <>
                  <span>Post to Locket</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
