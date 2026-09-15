'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { Camera, Sparkles, MessageCircle, Crown } from 'lucide-react';

export default function BottomNav() {
  const { user } = useAuth();
  const { activeTab, switchTab, hasUnreadMessages, isEditingOrPosting, openGoldModal } =
    useNavigation();

  // Hide completely if unauthenticated or when in photo editing/posting flows
  if (!user || isEditingOrPosting) {
    return null;
  }

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#16181F]/95 backdrop-blur-xl border-t border-[#242731] shadow-[0_-8px_30px_rgba(0,0,0,0.5)] px-3 pt-2 pb-3">
      <div className="flex items-center justify-around gap-2 max-w-md mx-auto">
        {/* Tab 1: Upload */}
        <button
          type="button"
          onClick={() => switchTab('upload')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === 'upload'
              ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black font-bold shadow-lg shadow-yellow-400/25 scale-[1.02]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Camera className={`w-5 h-5 ${activeTab === 'upload' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] tracking-tight">Đăng ảnh</span>
        </button>

        {/* Tab 2: Feed */}
        <button
          type="button"
          onClick={() => switchTab('feed')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === 'feed'
              ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black font-bold shadow-lg shadow-yellow-400/25 scale-[1.02]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Sparkles className={`w-5 h-5 ${activeTab === 'feed' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] tracking-tight">Locket Feed</span>
        </button>

        {/* Tab 3: Chat */}
        <button
          type="button"
          onClick={() => switchTab('chat')}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === 'chat'
              ? 'bg-gradient-to-r from-yellow-400 to-amber-400 text-black font-bold shadow-lg shadow-yellow-400/25 scale-[1.02]'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <div className="relative">
            <MessageCircle className={`w-5 h-5 ${activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            {hasUnreadMessages && (
              <span
                className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${
                  activeTab === 'chat' ? 'bg-red-500 ring-2 ring-yellow-400' : 'bg-yellow-400 ring-2 ring-[#16181F]'
                } animate-pulse`}
              />
            )}
          </div>
          <span className="text-[11px] tracking-tight">Tin nhắn</span>
        </button>

        {/* Tab 4: Locket Gold */}
        <button
          type="button"
          onClick={openGoldModal}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-2xl transition-all duration-200 active:scale-95 text-neutral-400 hover:text-white hover:bg-white/[0.04]"
        >
          <Crown className="w-5 h-5 text-yellow-400 stroke-[2.5]" />
          <span className="text-[11px] tracking-tight font-bold text-yellow-400">Gold VIP</span>
        </button>
      </div>
    </nav>
  );
}
