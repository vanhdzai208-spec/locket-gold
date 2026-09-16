'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { LogOut, Camera, User, Crown, Fingerprint, ShieldCheck } from 'lucide-react';

export default function Header() {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();

  const isHome = pathname === '/';
  const isGold = pathname.startsWith('/gold');
  const isUid = pathname.startsWith('/uid') || pathname.startsWith('/get-uid');
  const isCheckGold = pathname.startsWith('/check-gold');

  return (
    <header className="w-full bg-[#16181F]/90 backdrop-blur-md border-b border-[#242731] sticky top-0 z-50">
      <div className="w-full px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Left: Logo / Title */}
        <div className="flex items-center justify-start flex-shrink-0">
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-[#FFC800] to-[#FFE866] flex items-center justify-center shadow-lg shadow-yellow-500/20 group-hover:scale-105 transition-transform">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-black stroke-[2.5]" />
            </div>
            <div className="hidden md:block">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                Locket{' '}
                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 font-medium">
                  Web
                </span>
              </h1>
              <p className="text-[11px] text-neutral-400 hidden xl:block leading-tight">
                Post moments to your widget
              </p>
            </div>
          </Link>
        </div>

        {/* Center: Global Page Navigation Tabs (Always visible on all pages, responsive) */}
        <nav className="flex items-center justify-center flex-1 max-w-xl mx-auto">
          <div className="inline-flex p-1 sm:p-1.5 rounded-2xl bg-[#1A1D27]/90 backdrop-blur-md border border-white/[0.08] shadow-lg gap-0.5 sm:gap-1.5 overflow-x-auto max-w-full">
            {/* Tab 1: Locket Web */}
            <Link
              href="/"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs md:text-sm transition-all whitespace-nowrap ${
                isHome
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/25 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] font-semibold'
              }`}
              title="Locket Web - Đăng ảnh & Xem Feed"
            >
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>Locket Web</span>
            </Link>

            {/* Tab 2: Locket Gold */}
            <Link
              href="/gold"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs md:text-sm transition-all whitespace-nowrap ${
                isGold
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/25 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] font-semibold'
              }`}
              title="Locket Gold - Nâng cấp tài khoản VIP"
            >
              <Crown
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${
                  isGold ? 'text-black' : 'text-yellow-400'
                }`}
              />
              <span>Locket Gold</span>
            </Link>

            {/* Tab 3: Tra Cứu UID */}
            <Link
              href="/uid"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs md:text-sm transition-all whitespace-nowrap ${
                isUid
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/25 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] font-semibold'
              }`}
              title="Tra Cứu UID Locket qua link"
            >
              <Fingerprint className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>Tra Cứu UID</span>
            </Link>

            {/* Tab 4: Kiểm Tra Gold */}
            <Link
              href="/check-gold"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs md:text-sm transition-all whitespace-nowrap ${
                isCheckGold
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/25 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04] font-semibold'
              }`}
              title="Kiểm tra số ngày Locket Gold"
            >
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>Kiểm Tra Gold</span>
            </Link>
          </div>
        </nav>

        {/* Right: User Profile or Live Indicator */}
        <div className="flex items-center justify-end flex-shrink-0">
          {user ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 bg-[#1F222B] px-2 sm:px-3 py-1.5 rounded-full border border-[#2D313E]">
                {user.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt={user.displayName}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover ring-2 ring-yellow-400"
                  />
                ) : (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center text-xs font-bold ring-2 ring-yellow-400/40">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="text-left hidden lg:block">
                  <p className="text-xs font-medium text-white leading-tight max-w-[100px] truncate">
                    {user.displayName || user.email.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-neutral-400 leading-tight max-w-[100px] truncate">
                    {user.email}
                  </p>
                </div>
              </div>

              <button
                onClick={() => logout()}
                disabled={isLoading}
                title="Đăng xuất"
                className="p-2 text-neutral-400 hover:text-white bg-[#1F222B] hover:bg-red-500/20 hover:border-red-500/40 border border-[#2D313E] rounded-full transition-all flex-shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs text-neutral-400 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-neutral-300 font-medium hidden sm:inline">
                Locket Cloud
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
