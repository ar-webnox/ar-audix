# AR AUDIX

A premium local music player for the browser. Your music stays on your device: files are copied into the browser's own storage (IndexedDB) and are never uploaded anywhere.

## Run it

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Requires Node 18+. Works in current Chrome, Edge, Firefox and Safari. Folder selection depends on the browser (`webkitdirectory`); dragging a folder in works in all major browsers.

## Stack

React 19, TypeScript, Vite. No UI, state or icon libraries: state lives in a small `useSyncExternalStore` store (`src/lib/createStore.ts`), playback uses a single native `HTMLAudioElement`, and the icon set is in `src/components/Icon.tsx`.

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

## Step 1 scope

Included: layout and navigation, bottom player (seek, volume/mute, speed, shuffle, repeat, queue, lyrics placeholder), import via files / folder / drag-and-drop, persistent library, favorites, playlists, recently played, search, accent colour setting, keyboard shortcuts, responsive layout.

Not yet included: embedded text-tag reading (title/artist/album still come from file names and folder structure), real lyrics, equalizer, light theme. Embedded cover art is read from MP3 (ID3v2.2–2.4), M4A, FLAC, Ogg Vorbis and Opus files and stored once per distinct cover; songs without one show a generated placeholder.

## Keyboard shortcuts

Space play/pause · ← → seek 5s · ↑ ↓ volume · M mute · N / P next / previous · S shuffle · R repeat · Q queue · / search
