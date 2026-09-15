'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import LoginScreen from '../components/LoginScreen';
import UploadDropzone from '../components/UploadDropzone';
import ImageEditor from '../components/ImageEditor';
import PostScreen from '../components/PostScreen';
import LocketFeed from '../components/LocketFeed';
import ChatScreen from '../components/ChatScreen';
import { Camera, Sparkles, MessageCircle } from 'lucide-react';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const {
    activeTab,
    setActiveTab,
    switchTab,
    hasUnreadMessages,
    setIsEditingOrPosting,
    registerCancelEditing,
  } = useNavigation();

  // Multi-step flow state
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [initialCaption, setInitialCaption] = useState<string | undefined>(undefined);
  const [exportedMedia, setExportedMedia] = useState<{
    blob: Blob;
    previewUrl: string;
    videoBlob?: Blob;
    videoUrl?: string;
  } | null>(null);

  const resetEditingState = useCallback(() => {
    setSelectedImageSrc(null);
    setInitialCaption(undefined);
    setExportedMedia(null);
  }, []);

  useEffect(() => {
    registerCancelEditing(resetEditingState);
  }, [registerCancelEditing, resetEditingState]);

  const isEditingOrPosting = Boolean(exportedMedia || selectedImageSrc);

  useEffect(() => {
    setIsEditingOrPosting(isEditingOrPosting);
  }, [isEditingOrPosting, setIsEditingOrPosting]);

  // 1. Initial Authentication Loading State
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl bg-yellow-400/20 flex items-center justify-center animate-pulse">
            <Camera className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="absolute -inset-1 rounded-3xl border-2 border-yellow-400 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-medium text-neutral-400">
          Connecting to Locket...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated -> Show Login
  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div
      className={`flex-1 flex flex-col justify-center py-4 mx-auto w-full transition-all pb-24 sm:pb-4 ${
        activeTab === 'feed'
          ? 'max-w-[1920px] px-3 sm:px-6 lg:px-8'
          : 'max-w-6xl px-4'
      }`}
    >
      {/* Step A: Post Screen (Media exported, ready to write caption & post) */}
      {exportedMedia && (
        <PostScreen
          imageBlob={exportedMedia.blob}
          previewUrl={exportedMedia.previewUrl}
          videoBlob={exportedMedia.videoBlob}
          videoUrl={exportedMedia.videoUrl}
          onBackToEdit={() => {
            if (exportedMedia.videoBlob) {
              resetEditingState();
            } else {
              setExportedMedia(null);
            }
          }}
          onResetAll={resetEditingState}
          onGoToFeed={() => {
            resetEditingState();
            setActiveTab('feed');
          }}
        />
      )}

      {/* Step B: Image Editor (Raw image loaded, user is editing) */}
      {!exportedMedia && selectedImageSrc && (
        <ImageEditor
          imageSrc={selectedImageSrc}
          onCancel={resetEditingState}
          onComplete={(blob, previewUrl) => {
            setExportedMedia({ blob, previewUrl });
          }}
        />
      )}

      {/* Persistent Tab Containers (Keep-Alive): preserves scroll, loaded images, and chat state */}
      {!isEditingOrPosting && (
        <>
          {/* Desktop Sub-Tabs for Locket Web Internal Features */}
          <div className="hidden sm:flex justify-center mb-5">
            <div className="inline-flex p-1 rounded-2xl bg-[#161822]/90 border border-white/[0.08] shadow-lg gap-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => switchTab('upload')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'upload'
                    ? 'bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Đăng ảnh</span>
              </button>

              <button
                type="button"
                onClick={() => switchTab('feed')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'feed'
                    ? 'bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Locket Feed</span>
              </button>

              <button
                type="button"
                onClick={() => switchTab('chat')}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === 'chat'
                    ? 'bg-yellow-400 text-black font-bold shadow-md shadow-yellow-400/20'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span>Tin nhắn</span>
                {hasUnreadMessages && (
                  <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#161822] animate-pulse" />
                )}
              </button>
            </div>
          </div>

          {/* Tab 1: Upload Dropzone */}
          <div className={`w-full ${activeTab === 'upload' ? 'block' : 'hidden'}`}>
            <UploadDropzone
              onImageSelected={(imageSrc) => {
                setSelectedImageSrc(imageSrc);
              }}
              onVideoSelected={(videoBlob, videoUrl, thumbnailBlob, thumbnailUrl) => {
                setExportedMedia({
                  blob: thumbnailBlob,
                  previewUrl: thumbnailUrl,
                  videoBlob,
                  videoUrl,
                });
              }}
            />
          </div>

          {/* Tab 2: Locket Moments Feed */}
          <div className={`w-full ${activeTab === 'feed' ? 'block' : 'hidden'}`}>
            <LocketFeed
              onRemixMoment={(imageUrl, caption) => {
                setSelectedImageSrc(imageUrl);
                setInitialCaption(caption);
              }}
              onGoToUpload={() => setActiveTab('upload')}
            />
          </div>

          {/* Tab 3: Locket Messages & Deleted Audit */}
          <div className={`w-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
            <ChatScreen />
          </div>
        </>
      )}
    </div>
  );
}
