import { useEffect, useRef, useCallback } from 'react';
import { useAppStore, AppTab } from '../store/useAppStore';

const TABS: AppTab[] = [
  'dashboard', 'signals', 'charts', 'news', 'calendar',
  'risk', 'history', 'watchlist', 'admin', 'profile',
];

/**
 * Swipe-left / swipe-right gesture hook for mobile tab switching.
 * Attaches to the document. Minimum horizontal swipe = 60px.
 */
export function useSwipeNavigation() {
  const { activeTab, setActiveTab } = useAppStore();
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;

      // Only horizontal swipes that are > 60px and not primarily vertical
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;

      const idx = TABS.indexOf(activeTab);
      if (dx < 0 && idx < TABS.length - 1) {
        setActiveTab(TABS[idx + 1]);
        if ('vibrate' in navigator) navigator.vibrate(15);
      } else if (dx > 0 && idx > 0) {
        setActiveTab(TABS[idx - 1]);
        if ('vibrate' in navigator) navigator.vibrate(15);
      }
    },
    [activeTab, setActiveTab]
  );

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);
}
