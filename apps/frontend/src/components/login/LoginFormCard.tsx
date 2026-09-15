'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import {
  Camera,
  Eye,
  EyeOff,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  Crown,
} from 'lucide-react';

export default function LoginFormCard() {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!email || !email.includes('@')) {
      setLocalError('Vui lòng nhập địa chỉ email Locket hợp lệ.');
      return;
    }

    if (!password || password.length < 6) {
      setLocalError('Mật khẩu phải có độ dài từ 6 ký tự trở lên.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
    } catch (err: any) {
      setLocalError(
        err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin tài khoản.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Glassmorphic Floating Login Card */}
      <div className="relative bg-[#13151D]/85 backdrop-blur-2xl border border-white/[0.08] hover:border-yellow-400/25 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] transition-all duration-300">
        {/* Subtle Top-Edge Specular Highlight */}
        <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent" />

        {/* Card Header & Branding */}
        <div className="text-center mb-5">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FFC800] via-[#FFDF00] to-[#FFF599] items-center justify-center shadow-lg shadow-yellow-500/20 mb-2.5 transform hover:scale-105 transition-transform duration-300">
            <Camera className="w-6 h-6 text-black" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Đăng nhập Locket
          </h2>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            Kết nối tài khoản Locket để bắt đầu đăng ảnh & video lên widget
          </p>
        </div>

        {/* Error Alert Box */}
        {displayError && (
          <div className="mb-6 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start space-x-3 animate-shake">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-300 leading-relaxed font-medium">
              {displayError}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label
              htmlFor="locket-email"
              className="block text-[11px] font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider"
            >
              Email Locket
            </label>
            <div className="relative group">
              <Mail className="w-4 h-4 text-neutral-400 group-focus-within:text-yellow-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
              <input
                id="locket-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
                disabled={isSubmitting}
                className="w-full bg-[#1A1D27]/80 border border-[#2B2F3D] focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="locket-password"
              className="block text-[11px] font-semibold text-neutral-300 mb-1.5 uppercase tracking-wider"
            >
              Mật khẩu
            </label>
            <div className="relative group">
              <Lock className="w-4 h-4 text-neutral-400 group-focus-within:text-yellow-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
              <input
                id="locket-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                className="w-full bg-[#1A1D27]/80 border border-[#2B2F3D] focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 rounded-2xl pl-10 pr-11 py-3 text-sm text-white placeholder-neutral-500 outline-none transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={0}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-gradient-to-r from-[#FFDF00] via-[#FFC800] to-[#FFDF00] hover:brightness-105 active:scale-[0.99] text-black font-bold py-3.5 px-6 rounded-2xl transition-all duration-200 shadow-lg shadow-yellow-400/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Đang xác thực với Locket...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập ngay</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Banner Link to /gold */}
        <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
          <Link
            href="/gold"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-yellow-400/10 hover:bg-yellow-400/15 border border-yellow-400/30 text-yellow-400 text-xs font-semibold transition-all group w-full justify-center shadow-sm"
          >
            <Crown className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
            <span>Nâng cấp Locket Gold miễn phí (Không cần mật khẩu) →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
