'use client';

import React from 'react';

interface BackgroundGlowProps {
  mousePos: { x: number; y: number }; // normalized -1 to 1
}

export default function BackgroundGlow({ mousePos }: BackgroundGlowProps) {
  // Calculate subtle shift based on mouse
  const offsetX = mousePos.x * 25;
  const offsetY = mousePos.y * 25;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
      {/* 1. Subtle Dot Grid with radial mask */}
      <div
        className="absolute inset-0 bg-dot-grid opacity-60"
        style={{
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 80%)',
        }}
      />

      {/* 2. Top-Left Golden Aura (Brand Signature) */}
      <div
        className="absolute -top-32 -left-32 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-yellow-400/15 via-yellow-500/5 to-transparent blur-[120px] transition-transform duration-700 ease-out animate-ambient-glow"
        style={{
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`,
        }}
      />

      {/* 3. Center-Right Midnight Contrast Glow (Behind Login Card) */}
      <div
        className="absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full bg-gradient-to-bl from-indigo-500/8 via-amber-500/5 to-transparent blur-[140px] transition-transform duration-700 ease-out"
        style={{
          transform: `translate3d(${-offsetX * 0.8}px, ${-offsetY * 0.8}px, 0)`,
        }}
      />

      {/* 4. Bottom-Left Warm Subtle Anchor */}
      <div
        className="absolute -bottom-40 left-1/4 w-[450px] h-[450px] rounded-full bg-yellow-500/5 blur-[100px] transition-transform duration-700 ease-out"
        style={{
          transform: `translate3d(${offsetX * 0.5}px, ${offsetY * 0.5}px, 0)`,
        }}
      />

      {/* 5. Delicate Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090C]/30 via-transparent to-[#08090C]/80" />
    </div>
  );
}
