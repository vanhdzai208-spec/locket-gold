'use client';

import React, { useState, useEffect, useCallback } from 'react';
import BackgroundGlow from './login/BackgroundGlow';
import HeroSection from './login/HeroSection';
import LoginFormCard from './login/LoginFormCard';

export default function LoginScreen() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    // Check user preference for reduced motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setIsReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleMotionChange);
    return () => {
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  // Smooth throttled pointer move listener
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isReducedMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      setMousePos({
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
      });
    },
    [isReducedMotion],
  );

  const handlePointerLeave = useCallback(() => {
    setMousePos({ x: 0, y: 0 });
  }, []);

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-4rem)] w-full flex items-center justify-center overflow-x-hidden lg:overflow-hidden bg-[#08090C]"
    >
      {/* 1. Ambient Background & Mesh Grid */}
      <BackgroundGlow mousePos={mousePos} />

      {/* 2. Main Content Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          {/* Left Column: Hero & 3D Interactive Locket Showcase */}
          <div className="lg:col-span-7 xl:col-span-7 order-2 lg:order-1 flex flex-col justify-center">
            <HeroSection mousePos={mousePos} />
          </div>

          {/* Right Column: Floating Glassmorphism Login Card */}
          <div className="lg:col-span-5 xl:col-span-5 order-1 lg:order-2 flex justify-center items-center">
            <LoginFormCard />
          </div>
        </div>
      </div>
    </div>
  );
}
