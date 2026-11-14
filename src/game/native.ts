import { Capacitor } from '@capacitor/core';

/**
 * Thin native bridge. On iOS (Capacitor) saves go to the Preferences plugin, which iOS doesn't evict
 * the way it can evict WebView localStorage, and haptics use the Taptic Engine. On the web both fall
 * back gracefully. Plugins are imported lazily so the web bundle doesn't pay for them up front.
 */
export const isNative = Capacitor.isNativePlatform();

export async function prefGet(key: string): Promise<string | null> {
  if (isNative) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      if (value !== null) return value;
    } catch {
      /* fall back to localStorage */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function prefSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
  if (isNative) void import('@capacitor/preferences').then(({ Preferences }) => Preferences.set({ key, value })).catch(() => {});
}

export function prefRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  if (isNative) void import('@capacitor/preferences').then(({ Preferences }) => Preferences.remove({ key })).catch(() => {});
}

export type HapticKind = 'light' | 'medium' | 'heavy';

export function haptic(kind: HapticKind) {
  if (isNative) {
    void import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) =>
        Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy }),
      )
      .catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(kind === 'light' ? 8 : kind === 'medium' ? 20 : 45);
  } catch {
    /* unsupported */
  }
}
