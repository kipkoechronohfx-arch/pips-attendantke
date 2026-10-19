/**
 * Global notification service — Browser Push + Haptic
 */

export const notifService = {
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  send(title: string, body: string, icon = '/logo.jpg') {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body,
      icon,
      badge: '/logo.jpg',
      tag: 'fsp-signal',
      renotify: true,
      silent: false,
    } as NotificationOptions & { renotify?: boolean });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 7000);
  },

  /** Signal-specific helper */
  signalAlert(symbol: string, direction: string, confidence: number) {
    this.send(
      `📊 ${symbol} ${direction} Signal`,
      `Confidence ${confidence}% — Tap to view setup`,
    );
  },

  /** Haptic vibration for Android/mobile */
  haptic(pattern: number | number[] = 40) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  },

  hapticLight() { this.haptic(20); },
  hapticMedium() { this.haptic([30, 20, 30]); },
  hapticSignal() { this.haptic([50, 30, 80]); },
};
