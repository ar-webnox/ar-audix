/* AR AUDIX service worker: offline app shell.
 *
 * - On install it caches the app shell: index.html, the scripts and styles it references and the
 *   lazily loaded chunks those scripts mention, so the whole app opens without a network.
 * - Pages are served network-first (so updates arrive) and fall back to the cached shell offline.
 * - Hashed build files under /assets/ are cache-first; everything else is refreshed in the background.
 * - Music never passes through here: songs live in the browser's own storage (IndexedDB).
 * Bump VERSION to force every client to rebuild its cache.
 */
const VERSION = 'ar-audix-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './favicon-32.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './maskable-512.png'];

const scope = new URL(self.registration.scope);
const abs = (u, base = scope) => new URL(u, base).href;

async function collectShell() {
  const urls = new Set(CORE.map((u) => abs(u)));
  try {
    const html = await (await fetch(abs('./index.html'), { cache: 'reload' })).text();
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(?:[a-z]+:)?\/\//i.test(u) || u.startsWith(scope.origin));
    for (const ref of refs) urls.add(abs(ref));
    // Follow the entry scripts to find the code-split chunks and styles they load on demand.
    for (const url of [...urls].filter((u) => u.endsWith('.js'))) {
      try {
        const text = await (await fetch(url)).text();
        for (const m of text.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) urls.add(abs(m[1], new URL(url)));
        for (const m of text.matchAll(/["'`](assets\/[A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) urls.add(abs(m[1]));
      } catch {
        /* a chunk that can't be inspected is simply cached when it is first used */
      }
    }
  } catch {
    /* offline during install: the core files below are still attempted */
  }
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const urls = await collectShell();
      await Promise.allSettled(urls.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) (await caches.open(SHELL)).put(abs('./index.html'), fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(abs('./index.html'))) || (await caches.match(abs('./'))) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const immutable = url.pathname.includes('/assets/');
      if (cached && immutable) return cached;
      const refresh = fetch(request)
        .then(async (res) => {
          if (res.ok) (await caches.open(immutable ? SHELL : RUNTIME)).put(request, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) || Response.error();
    })(),
  );
});
