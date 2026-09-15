'use client';

import React, { useState } from 'react';
import {
  Camera,
  Heart,
  Video,
  Clock,
  Sliders,
  Zap,
  MessageCircle,
  Sparkles,
} from 'lucide-react';

interface Widget3DPreviewProps {
  mousePos: { x: number; y: number }; // normalized -1 to 1
}

export default function Widget3DPreview({ mousePos }: Widget3DPreviewProps) {
  const [reactionCount, setReactionCount] = useState(24);
  const [hasLiked, setHasLiked] = useState(false);

  // Smooth tilt calculations
  const rotX = -mousePos.y * 10;
  const rotY = mousePos.x * 12;

  // Glare position
  const glareX = 50 + mousePos.x * 35;
  const glareY = 50 + mousePos.y * 35;

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasLiked) {
      setReactionCount((prev) => prev + 1);
      setHasLiked(true);
    } else {
      setReactionCount((prev) => prev - 1);
      setHasLiked(false);
    }
  };

  return (
    <div className="relative w-full max-w-[290px] sm:max-w-[310px] mx-auto perspective-1200 select-none py-4">
      {/* 3D Master Card */}
      <div
        className="relative w-full aspect-square rounded-[2.25rem] p-2.5 bg-gradient-to-b from-[#252834] via-[#161822] to-[#0E1017] border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(255,223,0,0.12)] transform-style-3d transition-transform duration-200 ease-out"
        style={{
          transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        }}
      >
        {/* Dynamic Specular Glass Glare */}
        <div
          className="absolute inset-0 rounded-[2.25rem] pointer-events-none opacity-40 mix-blend-overlay transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.7) 0%, transparent 60%)`,
          }}
        />

        {/* Inner Widget Canvas */}
        <div className="relative w-full h-full rounded-[1.85rem] overflow-hidden bg-neutral-900 border border-white/5 flex flex-col justify-between">
          {/* Simulated Moment Media Background */}
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-700/60 via-purple-900/40 to-slate-900 flex items-center justify-center">
            <div className="w-full h-full relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/30 via-orange-600/20 to-transparent" />
              <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-yellow-400/25 blur-2xl" />
              <div className="absolute top-8 left-8 w-28 h-28 rounded-full bg-amber-400/20 blur-xl" />

              {/* Center camera crosshair */}
              <div className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
                <div className="w-16 h-16 rounded-full border border-dashed border-white/60 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Top Bar: Sender Profile & Time */}
          <div
            className="relative z-10 p-3 flex items-center justify-between transform-style-3d"
            style={{ transform: 'translateZ(25px)' }}
          >
            <div className="flex items-center space-x-1.5 bg-black/55 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 shadow-md">
              <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-200 flex items-center justify-center text-[9px] font-bold text-black ring-1 ring-yellow-300">
                A
              </div>
              <span className="text-[11px] font-semibold text-white tracking-tight">Alex</span>
              <span className="text-[9px] text-neutral-400 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                10m
              </span>
            </div>

            {/* Video / Live Indicator */}
            <div className="flex items-center gap-1 bg-yellow-400/20 backdrop-blur-md px-2 py-0.5 rounded-full border border-yellow-400/40 text-yellow-300 text-[10px] font-bold tracking-wider">
              <Video className="w-3 h-3 text-yellow-400" />
              <span>0:10</span>
            </div>
          </div>

          {/* Bottom Bar: Caption & Interactive Reactions */}
          <div
            className="relative z-10 p-3 flex items-end justify-between gap-2 transform-style-3d"
            style={{ transform: 'translateZ(35px)' }}
          >
            {/* Signature Locket Translucent Caption Pill */}
            <div className="max-w-[70%] bg-black/70 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-white/10 shadow-lg">
              <p className="text-[11px] text-white/95 font-medium leading-tight line-clamp-2">
                Golden hour from the rooftop ☕️✨
              </p>
            </div>

            {/* Micro Emoji Reaction Pill */}
            <button
              onClick={handleLike}
              type="button"
              title="Thả cảm xúc"
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md border transition-all duration-200 cursor-pointer shadow-lg active:scale-95 ${
                hasLiked
                  ? 'bg-red-500/25 border-red-500/50 text-red-400'
                  : 'bg-black/60 border-white/15 text-neutral-300 hover:text-white hover:border-yellow-400/40'
              }`}
            >
              <Heart
                className={`w-3 h-3 ${hasLiked ? 'fill-red-400 text-red-400' : ''}`}
              />
              <span className="text-[10px] font-bold">{reactionCount}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          4 ORBITING INTERACTIVE FEATURE NODES (With Depth & Tooltips)
         ======================================================== */}

      {/* 1. TOP-LEFT: Video & Photo 10s */}
      <div
        className="absolute -top-1 -left-2 sm:-left-6 transform-style-3d group z-30"
        style={{
          transform: `translate3d(${mousePos.x * 12}px, ${mousePos.y * 12}px, 45px)`,
        }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181B26]/90 backdrop-blur-xl border border-white/15 hover:border-yellow-400/60 shadow-lg shadow-black/50 cursor-pointer transition-all duration-200 group-hover:scale-105 group-hover:bg-[#202433]">
          <div className="w-4 h-4 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center">
            <Video className="w-2.5 h-2.5" />
          </div>
          <span className="text-[10px] font-semibold text-neutral-200 group-hover:text-yellow-300 transition-colors">
            Video 10s
          </span>
        </div>

        {/* Tooltip */}
        <div className="absolute top-full left-0 mt-1.5 w-48 p-2.5 rounded-xl bg-[#12141C]/95 border border-yellow-400/30 shadow-2xl backdrop-blur-2xl opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
          <p className="text-[11px] font-bold text-yellow-300">Đăng Video 10s & Ảnh</p>
          <p className="text-[10px] text-neutral-300 mt-0.5 leading-snug">
            Quay trực tiếp từ webcam hoặc tải file MP4/WebM tối đa 10s có âm thanh.
          </p>
        </div>
      </div>

      {/* 2. TOP-RIGHT: Home Widget Sync */}
      <div
        className="absolute -top-1 -right-2 sm:-right-6 transform-style-3d group z-30"
        style={{
          transform: `translate3d(${-mousePos.x * 12}px, ${mousePos.y * 12}px, 45px)`,
        }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181B26]/90 backdrop-blur-xl border border-white/15 hover:border-yellow-400/60 shadow-lg shadow-black/50 cursor-pointer transition-all duration-200 group-hover:scale-105 group-hover:bg-[#202433]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
          </span>
          <span className="text-[10px] font-semibold text-neutral-200 group-hover:text-yellow-300 transition-colors">
            Widget Sync
          </span>
        </div>

        {/* Tooltip */}
        <div className="absolute top-full right-0 mt-1.5 w-48 p-2.5 rounded-xl bg-[#12141C]/95 border border-yellow-400/30 shadow-2xl backdrop-blur-2xl opacity-0 translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
          <p className="text-[11px] font-bold text-yellow-300">Đồng Bộ Widget Tức Thì</p>
          <p className="text-[10px] text-neutral-300 mt-0.5 leading-snug">
            Khoảnh khắc của bạn hiển thị ngay trên màn hình chính của bạn bè.
          </p>
        </div>
      </div>

      {/* 3. BOTTOM-LEFT: Canvas Studio 1:1 */}
      <div
        className="absolute -bottom-1 -left-2 sm:-left-6 transform-style-3d group z-30"
        style={{
          transform: `translate3d(${mousePos.x * 10}px, ${-mousePos.y * 10}px, 45px)`,
        }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181B26]/90 backdrop-blur-xl border border-white/15 hover:border-yellow-400/60 shadow-lg shadow-black/50 cursor-pointer transition-all duration-200 group-hover:scale-105 group-hover:bg-[#202433]">
          <div className="w-4 h-4 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center">
            <Sliders className="w-2.5 h-2.5" />
          </div>
          <span className="text-[10px] font-semibold text-neutral-200 group-hover:text-yellow-300 transition-colors">
            Studio 1:1
          </span>
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full left-0 mb-1.5 w-48 p-2.5 rounded-xl bg-[#12141C]/95 border border-yellow-400/30 shadow-2xl backdrop-blur-2xl opacity-0 -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
          <p className="text-[11px] font-bold text-yellow-300">Canvas Studio 1:1</p>
          <p className="text-[10px] text-neutral-300 mt-0.5 leading-snug">
            Cắt vuông chuẩn widget, 6 thông số tinh chỉnh màu và 8 bộ lọc phim.
          </p>
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT: Chat & Audit */}
      <div
        className="absolute -bottom-1 -right-2 sm:-right-6 transform-style-3d group z-30"
        style={{
          transform: `translate3d(${-mousePos.x * 10}px, ${-mousePos.y * 10}px, 45px)`,
        }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#181B26]/90 backdrop-blur-xl border border-white/15 hover:border-yellow-400/60 shadow-lg shadow-black/50 cursor-pointer transition-all duration-200 group-hover:scale-105 group-hover:bg-[#202433]">
          <div className="w-4 h-4 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center">
            <MessageCircle className="w-2.5 h-2.5" />
          </div>
          <span className="text-[10px] font-semibold text-neutral-200 group-hover:text-yellow-300 transition-colors">
            Chat & Audit
          </span>
        </div>

        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-1.5 w-48 p-2.5 rounded-xl bg-[#12141C]/95 border border-yellow-400/30 shadow-2xl backdrop-blur-2xl opacity-0 -translate-y-1 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 z-50">
          <p className="text-[11px] font-bold text-yellow-300">Chat & Audit Thu Hồi</p>
          <p className="text-[10px] text-neutral-300 mt-0.5 leading-snug">
            Trò chuyện trực tiếp & phát hiện tin nhắn bạn bè đã xóa/thu hồi.
          </p>
        </div>
      </div>
    </div>
  );
}
