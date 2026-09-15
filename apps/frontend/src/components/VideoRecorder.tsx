'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, Square, Video } from 'lucide-react';

interface VideoRecorderProps {
  onVideoRecorded: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
}

export default function VideoRecorder({
  onVideoRecorded,
  onCancel,
}: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const MAX_RECORD_SECONDS = 10;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setIsCameraReady(false);
    setError(null);

    // Stop existing stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Trình duyệt của bạn không hỗ trợ truy cập Camera.');
      }

      let stream: MediaStream | null = null;

      // Tier 1: Try requested video + audio
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: true,
        });
      } catch (tier1Err: any) {
        if (tier1Err.name === 'NotAllowedError' || tier1Err.name === 'PermissionDeniedError') {
          throw tier1Err;
        }

        console.warn('Tier 1 camera+mic request failed, falling back to video only...', tier1Err);

        // Tier 2: Try video only (for devices without microphone or audio track busy)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing },
            audio: false,
          });
        } catch (tier2Err: any) {
          if (tier2Err.name === 'NotAllowedError' || tier2Err.name === 'PermissionDeniedError') {
            throw tier2Err;
          }

          // Tier 3: Basic video true fallback
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('Không thể khởi tạo luồng Camera.');
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraReady(true);
    } catch (err: any) {
      console.debug('Camera permission info:', err?.name || err?.message);
      const isDenied =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';

      setError(
        isDenied
          ? 'permission_denied'
          : err.message || 'Không thể kết nối với Camera.',
      );
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [facingMode, startCamera]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = () => {
    if (!streamRef.current || !isCameraReady) return;

    chunksRef.current = [];
    setError(null);

    // Check supported MIME type
    let mimeType = 'video/webm;codecs=vp8,opus';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
    }

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps crisp mobile quality
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mimeType });
        const previewUrl = URL.createObjectURL(finalBlob);

        // Turn off live camera stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        onVideoRecorded(finalBlob, previewUrl);
      };

      mediaRecorder.start(250); // collect chunk every 250ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordedSeconds(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setRecordedSeconds(Math.min(elapsed, MAX_RECORD_SECONDS));

        if (elapsed >= MAX_RECORD_SECONDS) {
          stopRecording();
        }
      }, 100);
    } catch (err: any) {
      console.debug('MediaRecorder info:', err);
      setError('Không thể ghi hình video trên thiết bị này.');
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center space-y-4">
      {/* Video Container (1:1 Aspect Ratio) */}
      <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-black border-2 border-neutral-800 shadow-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${
            facingMode === 'user' ? '-scale-x-100' : ''
          }`}
        />

        {/* Recording pulse overlay */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/40">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-bold text-white tracking-wider">
              {recordedSeconds.toFixed(1)}s / {MAX_RECORD_SECONDS}s
            </span>
          </div>
        )}

        {/* Circular Progress Border when Recording */}
        {isRecording && (
          <div
            className="absolute inset-0 pointer-events-none rounded-3xl border-4 border-yellow-400 transition-all"
            style={{
              opacity: 0.85 + 0.15 * Math.sin(recordedSeconds * 5),
            }}
          />
        )}

        {/* Permission Request / Notice overlay */}
        {error && (
          <div className="absolute inset-0 bg-[#12141C]/95 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center space-y-4 z-10">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shadow-lg shadow-yellow-500/10">
              <Camera className="w-6 h-6" />
            </div>

            <div className="space-y-1.5 max-w-[260px]">
              <h3 className="text-sm font-bold text-white">
                {error === 'permission_denied'
                  ? 'Cần cấp quyền Camera'
                  : 'Không thể mở Camera'}
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {error === 'permission_denied'
                  ? 'Trình duyệt đang chặn truy cập. Bạn hãy bấm vào biểu tượng 🔒 hoặc cài đặt bên trái thanh địa chỉ URL để bật quyền cho Camera & Micrô.'
                  : error}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Thử lại
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-neutral-300 text-xs font-semibold rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Tải file
              </button>
            </div>
          </div>
        )}

        {/* Loading placeholder */}
        {!isCameraReady && !error && (
          <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
            <span className="text-xs text-neutral-400 font-medium">
              Đang mở Camera...
            </span>
          </div>
        )}

        {/* Flip Camera Button */}
        {isCameraReady && !isRecording && (
          <button
            type="button"
            onClick={toggleFacingMode}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all active:scale-90"
            title="Đổi camera trước/sau"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-6 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isRecording}
          className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition-colors disabled:opacity-50"
        >
          Hủy bỏ
        </button>

        {/* Big Shutter Record Button */}
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={!isCameraReady}
            className="group relative w-16 h-16 rounded-full border-4 border-yellow-400 p-1 flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
            title="Nhấn để bắt đầu quay (tối đa 10 giây)"
          >
            <div className="w-12 h-12 rounded-full bg-yellow-400 group-hover:bg-yellow-300 transition-colors flex items-center justify-center shadow-lg shadow-yellow-400/30">
              <Video className="w-5 h-5 text-black" />
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="group relative w-16 h-16 rounded-full border-4 border-red-500 p-1 flex items-center justify-center transition-all active:scale-95"
            title="Dừng quay"
          >
            <div className="w-12 h-12 rounded-full bg-red-500 group-hover:bg-red-400 transition-colors flex items-center justify-center shadow-lg shadow-red-500/30">
              <Square className="w-5 h-5 text-white fill-white" />
            </div>
          </button>
        )}

        <div className="w-14 text-center">
          <span className="text-[11px] text-neutral-400">
            {isRecording ? `${(10 - recordedSeconds).toFixed(0)}s còn` : 'Tối đa 10s'}
          </span>
        </div>
      </div>
    </div>
  );
}
