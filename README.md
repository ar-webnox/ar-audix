# AR AUDIX

A premium local music player for the browser. Your music stays on your device and is never uploaded anywhere. In Chrome and Edge on a computer the songs stay where they are and AR AUDIX only stores a reference to them; in other browsers they are copied into the browser's own storage (IndexedDB).

## Run it

```bash
npm install
npm run dev        # development server (service worker is not registered in dev)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (use this to test the PWA)
```

Requires Node 18+. Works in current Chrome, Edge, Firefox and Safari; some features differ by browser (see "Browser limitations").

## Install as an app (PWA)

The production build is an installable Progressive Web App. It must be served over **HTTPS** (or `http://localhost`).

- **Windows / desktop Chrome or Edge:** open the app, then use the **Install app** button in the sidebar (shown when the browser offers installation) or the install icon in the address bar.
- **Android Chrome:** use the **Install app** button or the browser menu → *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*. Safari has no install prompt.

The app shell works offline after the first visit. The service worker caches only the app's own files; your music lives in the browser's IndexedDB and is never uploaded.

## Browser limitations

- AR AUDIX cannot read your folders on its own. You choose files or a folder (or drag them in); permissions are never bypassed.
- **Chrome / Edge on a computer** (File System Access API): songs stay in their original place and only a reference is stored, so the library uses almost no storage. After you close and reopen the app the browser may ask for permission to read the music again (one prompt per picked folder; Settings → Library → *Allow access*). If you move or delete a file, that song can't play until you pick it again.
- **Other browsers** (Firefox, Safari, Chrome on Android/iOS) cannot keep a reference, so each imported song is **copied into the browser's storage**. That uses as much space as the songs themselves.
- Songs already stored as copies can be switched to references: Settings → Library → Storage → *Free up space*, then pick the folder they came from. Copies are only removed for songs whose original was found and is readable.
- The storage figure shown is the browser's own estimate of this site's usage and allowance. AR AUDIX does not set a limit; the allowance depends on the browser and the device's free space and can change.
- Browsers may clear site data under storage pressure or when you clear browsing data. Back up important music elsewhere.
- Firefox and Safari do not offer a folder picker the way Chrome does; folder selection uses `webkitdirectory` and dragging a folder in is the fallback.
- Safari does not fire an install prompt and may limit background audio and storage.
- Some formats (for example FLAC or Opus) are not playable in every browser. Unplayable songs can be skipped automatically (Settings → Playback).
- Crossfade, gapless playback, equalizer and visualizer use the Web Audio API and need a user gesture (a click) before sound can start.

## Stack

React 19, TypeScript, Vite. No UI, state or icon libraries: state lives in a small `useSyncExternalStore` store (`src/lib/createStore.ts`), playback uses a single native `HTMLAudioElement` and the icon set is in `src/components/Icon.tsx`.

## Structure

```
src/
  lib/          pure helpers: formatting, file detection, metadata inference,
                IndexedDB, routing, grouping/sorting/search
  store/        library.ts (tracks, favorites, playlists, recent, settings, import)
                player.ts  (audio element, queue, shuffle/repeat, volume, speed)
                ui.ts      (toasts, dialogs, menus, panels)
  components/   Sidebar, Topbar, PlayerBar, SidePanel (queue + lyrics placeholder),
                SongList (windowed), dialogs, shared UI
  pages/        Home, My Music, All Songs, Albums, Artists, Playlists,
                Favorites, Recently Played, Search, Settings
  styles/app.css  design tokens and all styles
```

## Features

Library and playback: import via files / folder / drag-and-drop, persistent library, embedded tag and cover-art reading (MP3, M4A, FLAC, Ogg, Opus), favorites, playlists, recently played, search, queue with reordering, shuffle / repeat, speed, gapless playback, crossfade, 10-band equalizer with presets and an audio visualizer.

Settings: dark / light / system theme (applied before first paint, no flash), accent presets and a custom accent colour (adjusted automatically for readable contrast), reduced motion, default speed / volume / shuffle / repeat, crossfade, equalizer preset, visualizer, import and artwork preferences, default sorting, library clear (with confirmation), reset settings, app and version info. Everything is stored locally.

Mobile: responsive layout, safe-area spacing, touch-sized controls and a full-screen Now Playing view.

## Configuration

- `src/config/app.ts` - app name, tagline and version.
- `src/config/links.ts` - website and social links shown in Settings → About. Social links are placeholders; empty entries are hidden until you fill them in.

## Keyboard shortcuts

Space play/pause · ← → seek 5s · ↑ ↓ volume · M mute · N / P next / previous · S shuffle · R repeat · Q queue · / search
