# AR AUDIX

A premium local music player for the browser. Your music stays on your device: files are copied into the browser's own storage (IndexedDB) and are never uploaded anywhere.

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

- AR AUDIX cannot read your folders on its own. You choose files or a folder (or drag them in) and they are **copied into the browser's storage**. Nothing is re-scanned later and permissions are never bypassed.
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
