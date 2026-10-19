import { useEffect } from 'react';
import { useAppStore, AppTab } from '../store/useAppStore';

const KEY_MAP: Record<string, AppTab> = {
  d: 'dashboard',
  s: 'signals',
  c: 'charts',
  n: 'news',
  e: 'calendar',
  r: 'risk',
  h: 'history',
  w: 'watchlist',
  a: 'admin',
  p: 'profile',
};

/**
 * Global keyboard shortcut hook.
 * Skips when focus is inside an input / textarea / select.
 */
export function useKeyboardShortcuts() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
        return;
      }

      const tab = KEY_MAP[e.key.toLowerCase()];
      if (tab) {
        e.preventDefault();
        setActiveTab(tab);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab, setShortcutsOpen, shortcutsOpen]);
}
