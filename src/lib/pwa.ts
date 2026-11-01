import { createStore, useStore } from './createStore';
import { askConfirm, toast } from '../store/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const pwa = createStore({
  /** The browser offered installation and the prompt has not been used yet. */
  canInstall: false,
  /** Running as an installed app. */
  installed: standalone(),
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
});

export const usePwa = () => useStore(pwa, (s) => s);

let deferred: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep the prompt for our own Install button
  deferred = e as BeforeInstallPromptEvent;
  pwa.set({ canInstall: true });
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  pwa.set({ canInstall: false, installed: true });
  toast('AR AUDIX is installed.', 'success');
});

/** Shows the browser's install prompt. Only works after the browser has offered it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  pwa.set({ canInstall: false });
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

/** Registers the offline service worker (production builds only) and offers updates. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        const offerUpdate = (worker: ServiceWorker) =>
          askConfirm({
            title: 'Update available',
            message: 'A new version of AR AUDIX is ready. Reload now to use it? Playback will stop.',
            confirmLabel: 'Reload',
            onConfirm: () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              worker.postMessage('SKIP_WAITING');
            },
          });
        if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
          });
        });
      })
      .catch(() => undefined); // The app works without it; it just won't be available offline.
  });
  window.addEventListener('offline', () => toast('You’re offline. Your library and the app still work.'));
}
