'use client';

import React, { useRef, useState } from 'react';
import {
  Image as ImageIcon,
  UploadCloud,
  AlertCircle,
  Video,
  Camera,
  Film,
} from 'lucide-react';
import VideoRecorder from './VideoRecorder';

export function extractVideoThumbnail(
  videoBlobOrUrl: Blob | string,
): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    const objectUrl =
      typeof videoBlobOrUrl === 'string'
        ? videoBlobOrUrl
        : URL.createObjectURL(videoBlobOrUrl);
    video.src = objectUrl;

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = Math.min(video.videoWidth, video.videoHeight) || 720;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas context not available');
        }

        // Center crop 1:1 square
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const previewUrl = URL.createObjectURL(blob);
              resolve({ blob, previewUrl });
            } else {
              reject(new Error('Failed to create thumbnail blob'));
            }
          },
          'image/webp',
          0.85,
        );
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video for thumbnail extraction'));
    };
  });
}

interface UploadDropzoneProps {
  onImageSelected: (imageSrc: string) => void;
  onVideoSelected?: (
    videoBlob: Blob,
    videoUrl: string,
    thumbnailBlob: Blob,
    thumbnailUrl: string,
  ) => void;
}

export default function UploadDropzone({
  onImageSelected,
  onVideoSelected,
}: UploadDropzoneProps) {
  const [activeMode, setActiveMode] = useState<'file' | 'camera'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);

    try {
      const isVideo =
        file.type.startsWith('video/') ||
        file.name.endsWith('.mp4') ||
        file.name.endsWith('.webm') ||
        file.name.endsWith('.mov');

      if (isVideo) {
        // Video check: max 15MB
        if (file.size > 15 * 1024 * 1024) {
          setError('Video quá lớn (tối đa 15MB). Vui lòng chọn file ngắn hơn.');
          setIsProcessing(false);
          return;
        }

        // Check duration with hidden video element
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        const videoUrl = URL.createObjectURL(file);
        tempVideo.src = videoUrl;

        await new Promise<void>((resolve, reject) => {
          tempVideo.onloadedmetadata = () => resolve();
          tempVideo.onerror = () => reject(new Error('Không thể đọc file video.'));
        });

        if (tempVideo.duration > 10.8) {
          setError(
            `Video dài ${tempVideo.duration.toFixed(1)}s. Locket chỉ hỗ trợ video tối đa 10 giây. Vui lòng chọn video ngắn hơn.`,
          );
          setIsProcessing(false);
          return;
        }

        // Extract 1:1 thumbnail
        const thumb = await extractVideoThumbnail(file);

        if (onVideoSelected) {
          onVideoSelected(file, videoUrl, thumb.blob, thumb.previewUrl);
        }
      } else {
        // Photo check: max 10MB
        const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validImageTypes.includes(file.type)) {
          setError('Vui lòng chọn định dạng ảnh (JPEG, PNG, WebP) hoặc video (MP4, WebM, MOV).');
          setIsProcessing(false);
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          setError('Ảnh quá lớn (tối đa 10MB).');
          setIsProcessing(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            onImageSelected(e.target.result);
          }
        };
        reader.onerror = () => {
          setError('Không thể đọc file ảnh. Vui lòng thử lại.');
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      console.debug('File handle info:', err);
      setError(err.message || 'Lỗi khi xử lý file tải lên.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-auto py-4">
      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-center gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-2xl w-fit mx-auto mb-6 shadow-lg">
        <button
          type="button"
          onClick={() => {
            setActiveMode('file');
            setError(null);
          }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeMode === 'file'
              ? 'bg-yellow-400 text-black shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Tải file (Ảnh / Video)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMode('camera');
            setError(null);
          }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeMode === 'camera'
              ? 'bg-yellow-400 text-black shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Quay Camera (10s)</span>
        </button>
      </div>

      {/* Mode 1: File Dropzone */}
      {activeMode === 'file' && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`group relative border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? 'border-yellow-400 bg-yellow-400/10 scale-[1.01]'
              : 'border-[#2D313E] hover:border-yellow-400/60 bg-[#16181F] hover:bg-[#1A1D26]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-[#1F222B] group-hover:bg-yellow-400/20 text-yellow-400 flex items-center justify-center transition-all duration-300 shadow-inner group-hover:scale-110">
            {isDragging ? (
              <UploadCloud className="w-10 h-10 animate-bounce" />
            ) : (
              <div className="flex items-center gap-1">
                <ImageIcon className="w-7 h-7" />
                <Film className="w-6 h-6 text-yellow-300" />
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
            Chọn hoặc kéo thả Ảnh & Video
          </h3>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto mb-6">
            Tải ảnh (JPEG, PNG, WebP) hoặc video ngắn tối đa 10 giây (MP4, WebM, MOV) để đăng lên Locket.
          </p>

          <div className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-yellow-400 hover:bg-yellow-300 text-black font-semibold text-sm transition-all shadow-md shadow-yellow-400/10">
            <UploadCloud className="w-4 h-4" />
            <span>{isProcessing ? 'Đang đọc file...' : 'Chọn file từ máy tính'}</span>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5 text-yellow-400/80" />
              Ảnh: Tối đa 10MB
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-yellow-400/80" />
              Video: Tối đa 10s (≤ 15MB)
            </span>
            <span>•</span>
            <span>Khung vuông 1:1</span>
          </div>
        </div>
      )}

      {/* Mode 2: Camera Recorder */}
      {activeMode === 'camera' && (
        <VideoRecorder
          onVideoRecorded={async (videoBlob, videoUrl) => {
            setIsProcessing(true);
            try {
              const thumb = await extractVideoThumbnail(videoBlob);
              if (onVideoSelected) {
                onVideoSelected(videoBlob, videoUrl, thumb.blob, thumb.previewUrl);
              }
            } catch (err: any) {
              setError('Không thể trích xuất thumbnail từ video đã quay.');
            } finally {
              setIsProcessing(false);
            }
          }}
          onCancel={() => setActiveMode('file')}
        />
      )}

      {error && (
        <div className="mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-xs text-red-300 font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}

