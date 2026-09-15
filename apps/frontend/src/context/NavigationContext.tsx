'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { chatCache } from '../lib/chatCache';
import LocketGoldModal from '../components/LocketGoldModal';

export type AppTab = 'upload' | 'feed' | 'chat';

interface NavigationContextType {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  isEditingOrPosting: boolean;
  setIsEditingOrPosting: (val: boolean) => void;
  registerCancelEditing: (callback: () => void) => void;
  switchTab: (targetTab: AppTab) => boolean;
  hasUnreadMessages: boolean;
  isGoldModalOpen: boolean;
  setIsGoldModalOpen: (val: boolean) => void;
  openGoldModal: () => void;
  closeGoldModal: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined,
);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<AppTab>('feed');
  const [isEditingOrPosting, setIsEditingOrPosting] = useState<boolean>(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState<boolean>(false);
  const [isGoldModalOpen, setIsGoldModalOpen] = useState<boolean>(false);
  const cancelEditingRef = useRef<(() => void) | null>(null);

  const openGoldModal = useCallback(() => setIsGoldModalOpen(true), []);
  const closeGoldModal = useCallback(() => setIsGoldModalOpen(false), []);

  // Sync unread messages indicator from chatCache
  useEffect(() => {
    setHasUnreadMessages(chatCache.hasUnreadMessages());
    const unsubscribe = chatCache.subscribe(() => {
      setHasUnreadMessages(chatCache.hasUnreadMessages());
    });
    return unsubscribe;
  }, []);

  const registerCancelEditing = useCallback((callback: () => void) => {
    cancelEditingRef.current = callback;
  }, []);

  const switchTab = useCallback(
    (targetTab: AppTab): boolean => {
      if (activeTab === targetTab) return true;

      if (isEditingOrPosting) {
        const confirmed = window.confirm(
          'Bạn đang trong quá trình chỉnh sửa ảnh. Bạn có chắc chắn muốn rời đi? Ảnh chưa lưu sẽ bị hủy.',
        );
        if (!confirmed) {
          return false;
        }
        // Cancel active edit
        if (cancelEditingRef.current) {
          cancelEditingRef.current();
        }
        setIsEditingOrPosting(false);
      }

      setActiveTab(targetTab);
      return true;
    },
    [activeTab, isEditingOrPosting],
  );

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        isEditingOrPosting,
        setIsEditingOrPosting,
        registerCancelEditing,
        switchTab,
        hasUnreadMessages,
        isGoldModalOpen,
        setIsGoldModalOpen,
        openGoldModal,
        closeGoldModal,
      }}
    >
      {children}
      <LocketGoldModal isOpen={isGoldModalOpen} onClose={closeGoldModal} />
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
