'use client';

import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import Widget3DPreview from './Widget3DPreview';

interface HeroSectionProps {
  mousePos: { x: number; y: number };
}

export default function HeroSection({ mousePos }: HeroSectionProps) {
  return (
    <div className="flex flex-col justify-center space-y-4 lg:space-y-6 lg:pr-6 max-w-lg mx-auto lg:mx-0">
      {/* 1. Header Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 text-xs font-semibold shadow-sm backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span>Locket Web Studio</span>
          <span className="text-[10px] px-1 py-0.2 rounded bg-yellow-400/20 text-yellow-300 font-mono">
            v2.0
          </span>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-neutral-400 text-xs font-medium backdrop-blur-md">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-neutral-300">Direct Firebase Auth</span>
        </div>
      </div>

      {/* 2. Main Typography Headline */}
      <div>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-white leading-[1.12]">
          Your moments.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFDF00] via-[#FFC800] to-[#FFF599]">
            Live on their screen.
          </span>
        </h1>
      </div>

      {/* 3. 3D Interactive Widget Visual Showcase with Orbiting Feature Nodes */}
      <div className="pt-1">
        <Widget3DPreview mousePos={mousePos} />
      </div>

      {/* 4. Subtle Interactive Hint */}
      <div className="flex items-center justify-center lg:justify-start gap-2 text-[11px] text-neutral-300">
        <Sparkles className="w-3 h-3 text-yellow-400/70" />
        <span>Rê chuột quanh widget để khám phá các tính năng cốt lõi</span>
      </div>
    </div>
  );
}
