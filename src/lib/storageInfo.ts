/**
 * What the browser reports about storage for this app.
 *
 * `navigator.storage.estimate()` returns an *estimate* chosen by the browser: `usage` is what this site
 * stores and `quota` is the most the browser is currently willing to give it. The quota is not set by
 * AR AUDIX and is not fixed: it depends on the browser, the free disk space and the browsing mode
 * (private windows get far less) and browsers may round or pad the numbers on purpose.
 */
export interface StorageEstimate {
  usage: number;
  quota: number;
}

export async function storageEstimate(): Promise<StorageEstimate | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

export async function isStoragePersistent(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}

/** Asks the browser not to clear this site's data automatically. The browser decides; it may say no. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export type StorageLevel = 'ok' | 'low' | 'critical';

/** 'low' above 80% of the browser's current allowance, 'critical' above 92%. */
export function storageLevel(e: StorageEstimate | null): StorageLevel {
  if (!e || e.quota <= 0) return 'ok';
  const used = e.usage / e.quota;
  return used >= 0.92 ? 'critical' : used >= 0.8 ? 'low' : 'ok';
}
