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
// Installed (or uninstalled) while this page is open, e.g. the app was opened from the home screen.
matchMedia('(display-mode: standalone)').addEventListener('change', () => pwa.set({ installed: standalone() }));
window.addEventListener('appinstalled', () => {
  deferred = null;
  pwa.set({ canInstall: false, installed: true });
  toast('AR AUDIX is installed.', 'success');
});

/** True on phones and tablets, where the sidebar should still explain how to install when the browser gives no prompt. */
export const isTouchDevice = (): boolean => matchMedia('(pointer: coarse)').matches;

/** How to install when the browser offers no install prompt (iOS Safari or Android before Chrome offers it). */
export function installGuide(ios: boolean): { title: string; message: string } {
  return ios
    ? { title: 'Install on iPhone or iPad', message: 'In Safari, tap the Share button, then “Add to Home Screen”. Other iOS browsers may offer the same in their menu.' }
    : { title: 'Install AR AUDIX', message: 'Open your browser’s menu (⋮) and choose “Install app” or “Add to Home screen”. If you don’t see it yet, use the app for a moment and check again.' };
}

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
