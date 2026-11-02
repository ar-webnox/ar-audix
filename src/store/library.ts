import { useMemo } from 'react';
import { createStore, useStore } from '../lib/createStore';
import { db, onDbBlocked } from '../lib/db';
import { linkingSupported } from '../lib/fsa';
import { storageEstimate } from '../lib/storageInfo';
import { loadJSON, saveJSON } from '../lib/storage';
import { inferMeta } from '../lib/metadata';
import { readTags, type Tags } from '../lib/tags';
import { extensionOf, isAudioFile, readDuration, type Candidate } from '../lib/audioFiles';
import { buildIndex, type LibraryIndex } from '../lib/derive';
import { formatBytes, hashString, plural } from '../lib/format';
import { applyAppearance } from '../lib/theme';
import { ensureArtwork, forgetArtwork, recompressArtwork } from './artwork';
import { toast } from './ui';
import type { AccentName, Playlist, RecentEntry, Settings, SortName, Track } from '../types';

interface LibraryState {
  tracks: Track[];
  ready: boolean;
  /** False when the browser would not let us keep files between visits. */
  persistent: boolean;
  favorites: string[];
  playlists: Playlist[];
  recent: RecentEntry[];
  settings: Settings;
  importing: { active: boolean; done: number; total: number };
}

interface UserData {
  favorites: string[];
  playlists: Playlist[];
  recent: RecentEntry[];
  settings: Settings;
}

/** The preset accents, in display order. The first one is the default. */
export const ACCENTS: { name: AccentName; label: string; color: string; lightColor: string }[] = [
  { name: 'sky', label: 'Sky', color: '#7cb7ee', lightColor: '#1f6cb8' },
  { name: 'amber', label: 'Amber', color: '#e7b86a', lightColor: '#98600a' },
  { name: 'rose', label: 'Rose', color: '#e58a9b', lightColor: '#b83a56' },
  { name: 'mint', label: 'Mint', color: '#6fd0b0', lightColor: '#12775a' },
  { name: 'violet', label: 'Violet', color: '#a996f0', lightColor: '#5a43c2' },
];

export const defaultSettings: Settings = {
  accent: ACCENTS[0].name,
  autoSkip: true,
  theme: 'dark',
  reduceMotion: false,
  showArtwork: true,
  importTags: true,
  importArtwork: true,
  linkFiles: true,
  defaultSort: { key: 'title', ascending: true },
};
const SORT_KEYS: SortName[] = ['added', 'title', 'artist', 'album', 'duration'];
const saved = loadJSON<Partial<UserData>>('user', {});

/**
 * Validates stored settings. A saved accent is kept as the user's choice. The one exception is
 * "amber" stored without an explicit choice: that was the old default, written to storage
 * automatically, so it follows the new default instead of pinning existing users to it.
 */
function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const stored = raw ?? {};
  const customColor =
    typeof stored.customColor === 'string' && /^#[0-9a-f]{6}$/i.test(stored.customColor)
      ? stored.customColor.toLowerCase()
      : undefined;
  const known = ACCENTS.some((a) => a.name === stored.accent) || (stored.accent === 'custom' && customColor !== undefined);
  const accentChosen = stored.accentChosen === true || (known && stored.accent !== undefined && stored.accent !== 'amber');
  const accent = known && accentChosen ? (stored.accent as AccentName) : defaultSettings.accent;
  return {
    accent,
    customColor,
    accentChosen: accentChosen || undefined,
    autoSkip: typeof stored.autoSkip === 'boolean' ? stored.autoSkip : defaultSettings.autoSkip,
    theme: stored.theme === 'light' || stored.theme === 'system' || stored.theme === 'dark' ? stored.theme : defaultSettings.theme,
    reduceMotion: stored.reduceMotion === true,
    showArtwork: stored.showArtwork !== false,
    importTags: stored.importTags !== false,
    importArtwork: stored.importArtwork !== false,
    linkFiles: stored.linkFiles !== false,
    defaultSort:
      stored.defaultSort && SORT_KEYS.includes(stored.defaultSort.key)
        ? { key: stored.defaultSort.key, ascending: stored.defaultSort.ascending !== false }
        : defaultSettings.defaultSort,
  };
}

export const library = createStore<LibraryState>({
  tracks: [],
  ready: false,
  persistent: true,
  favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
  playlists: Array.isArray(saved.playlists) ? saved.playlists : [],
  recent: Array.isArray(saved.recent) ? saved.recent : [],
  settings: sanitizeSettings(saved.settings),
  importing: { active: false, done: 0, total: 0 },
});

/* ---------- derived data ---------- */

let indexFor: Track[] | null = null;
let indexCache: LibraryIndex = buildIndex([]);

export function getIndex(): LibraryIndex {
  const tracks = library.get().tracks;
  if (tracks !== indexFor) {
    indexFor = tracks;
    indexCache = buildIndex(tracks);
  }
  return indexCache;
}

export function trackById(id: string): Track | undefined {
  return getIndex().byId.get(id);
}

/** Library index (albums, artists, lookups) that updates when tracks change. */
export function useIndex(): LibraryIndex {
  const tracks = useStore(library, (s) => s.tracks);
  return useMemo(() => {
    void tracks;
    return getIndex();
  }, [tracks]);
}

export function useFavoriteSet(): Set<string> {
  const favorites = useStore(library, (s) => s.favorites);
  return useMemo(() => new Set(favorites), [favorites]);
}

/** Tracks for a list of ids, skipping any that no longer exist. */
export function resolveTracks(ids: string[]): Track[] {
  const { byId } = getIndex();
  const out: Track[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (t) out.push(t);
  }
  return out;
}

/* ---------- init & persistence ---------- */

// Apply the accent as soon as this module loads, before React renders anything.
applyAppearance(library.get().settings);

let started = false;

export async function initLibrary(): Promise<void> {
  if (started) return;
  started = true;
  onDbBlocked(() =>
    toast('Close other AR AUDIX tabs so your library can finish updating.', 'error'),
  );

  let lastUser = pickUser();
  let timer: ReturnType<typeof setTimeout> | undefined;
  library.subscribe(() => {
    const next = pickUser();
    if (
      next.favorites === lastUser.favorites &&
      next.playlists === lastUser.playlists &&
      next.recent === lastUser.recent &&
      next.settings === lastUser.settings
    )
      return;
    lastUser = next;
    clearTimeout(timer);
    timer = setTimeout(() => saveJSON('user', lastUser), 250);
  });

  const { tracks, persistent } = await db.loadTracks();
  library.set({ tracks, ready: true, persistent });
  void backfillArtwork().then(backfillTags);
}

function pickUser(): UserData {
  const s = library.get();
  return { favorites: s.favorites, playlists: s.playlists, recent: s.recent, settings: s.settings };
}

/* ---------- import ---------- */

function trackIdFor(file: File): string {
  const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
  return `${hashString(fingerprint).toString(36)}-${file.size.toString(36)}`;
}

export async function importCandidates(candidates: Candidate[]): Promise<void> {
  if (library.get().importing.active) {
    toast('An import is already running. Please wait for it to finish.');
    return;
  }
  const audio = candidates.filter((c) => isAudioFile(c.file));
  const ignored = candidates.length - audio.length;
  if (audio.length === 0) {
    toast(
      candidates.length === 0 ? 'No files were found to import.' : 'None of those files are supported audio formats.',
      'error',
    );
    return;
  }

  const settings = library.get().settings;
  const link = settings.linkFiles && linkingSupported();
  const existing = new Map(library.get().tracks.map((t) => [t.id, t]));
  const known = new Set(existing.keys());
  const fresh: { c: Candidate; id: string }[] = [];
  const relink: { c: Candidate; id: string }[] = [];
  let duplicates = 0;
  for (const c of audio) {
    const id = trackIdFor(c.file);
    if (known.has(id)) {
      duplicates++;
      // The same song picked again with a picker that keeps the original in place: if we hold a copy,
      // it can be replaced by a link (see "Free up space" in Settings). Otherwise the link is just refreshed.
      if (link && c.handle && existing.get(id)) relink.push({ c, id });
    } else {
      known.add(id);
      fresh.push({ c, id });
    }
  }

  // Songs that will be copied into the browser must fit in what the browser says is left.
  const copyBytes = fresh.reduce((n, f) => n + (link && f.c.handle ? 0 : f.c.file.size), 0);
  if (copyBytes > 0) {
    const est = await storageEstimate();
    if (est && est.quota > 0 && copyBytes > est.quota - est.usage) {
      toast(
        `Not enough browser storage for these songs (${formatBytes(copyBytes)} needed, about ${formatBytes(Math.max(0, est.quota - est.usage))} left). ` +
          (linkingSupported() ? 'Turn on “Keep songs in their original place” in Settings or remove some songs.' : 'Remove some songs first.'),
        'error',
      );
      return;
    }
  }

  let freed = 0;
  let relinked = 0;
  if (relink.length > 0) {
    library.set({ importing: { active: true, done: 0, total: relink.length + fresh.length } });
    const roots = new Set<string>();
    for (const { c, id } of relink) {
      if (c.root && !roots.has(c.root.id)) {
        roots.add(c.root.id);
        await db.saveRoot(c.root.id, c.root.handle);
      }
      const hadCopy = existing.get(id)?.src !== 'link';
      const bytes = await db.adoptLink(id, c.handle!, c.root?.id);
      if (hadCopy && bytes > 0) {
        freed += bytes;
        relinked++;
        // Remember the embedded Title and Artist, since the song will no longer be read from a stored copy.
        const read = await readTags(c.file).catch((): Tags => ({}));
        const embedded = { title: read.title, artist: read.artist };
        library.set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, src: 'link' as const, embedded } : t)) }));
        void db.updateTracks(library.get().tracks.filter((t) => t.id === id));
      }
    }
  }
  if (fresh.length === 0) {
    library.set({ importing: { active: false, done: 0, total: 0 } });
    toast(
      relinked > 0
        ? `Linked ${plural(relinked, 'song')} to the original files and freed ${formatBytes(freed)}.`
        : `Already in your library: ${plural(duplicates, 'song')} skipped.`,
      relinked > 0 ? 'success' : undefined,
    );
    return;
  }
  const savedRoots = new Set<string>();
  let quotaHit = false;

  library.set({ importing: { active: true, done: 0, total: fresh.length } });
  let pending: Track[] = [];
  let added = 0;
  let failed = 0;
  let unsaved = 0;
  let done = 0;
  let cursor = 0;
  const addedAt = Date.now();

  const flush = () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    library.set((s) => ({ tracks: [...s.tracks, ...batch] }));
  };

  const worker = async () => {
    while (cursor < fresh.length) {
      const { c, id } = fresh[cursor++];
      const duration = await readDuration(c.file);
      if (duration < 0) {
        failed++;
      } else {
        const { importArtwork, importTags } = library.get().settings;
        const artId = importArtwork ? await ensureArtwork(c.file).catch(() => null) : null;
        const meta = inferMeta(c.path);
        // Tags are read for display even when "read song info" is off, so a linked song never has to be reopened just to be listed.
        const read = importTags || (link && c.handle) ? await readTags(c.file) : null;
        const tags = importTags && read ? read : {};
        const track: Track = {
          id,
          title: tags.title ?? meta.title,
          artist: tags.artist ?? meta.artist,
          album: tags.album ?? meta.album,
          trackNo: tags.trackNo ?? meta.trackNo,
          tagged: importTags,
          duration,
          fileName: c.file.name,
          ext: extensionOf(c.file.name),
          size: c.file.size,
          mime: c.file.type,
          addedAt: addedAt + added,
          artId,
          embedded: read ? { title: read.title, artist: read.artist } : undefined,
        };
        let stored = false;
        if (link && c.handle) {
          if (c.root && !savedRoots.has(c.root.id)) {
            savedRoots.add(c.root.id);
            await db.saveRoot(c.root.id, c.root.handle);
          }
          stored = await db.saveLinked(track, c.handle, c.root?.id);
          if (stored) track.src = 'link';
        }
        if (!stored) {
          const res = await db.saveTrack(track, c.file);
          if (res === 'quota') quotaHit = true;
          if (res !== 'ok') unsaved++;
        }
        pending.push(track);
        added++;
        if (pending.length >= 25) flush();
      }
      done++;
      library.set({ importing: { active: true, done, total: fresh.length } });
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, fresh.length) }, worker));
  flush();
  library.set({ importing: { active: false, done, total: fresh.length } });

  const parts: string[] = [];
  if (added) parts.push(`Added ${plural(added, 'song')}`);
  if (relinked) parts.push(`${plural(relinked, 'existing song')} linked, ${formatBytes(freed)} freed`);
  if (duplicates) parts.push(`${plural(duplicates, 'duplicate')} skipped`);
  if (failed) parts.push(`${plural(failed, 'file')} couldn’t be read`);
  if (ignored) parts.push(`${plural(ignored, 'non-audio file')} ignored`);
  toast(parts.join(' · '), added > 0 ? 'success' : 'error');

  if (unsaved > 0) {
    library.set({ persistent: false });
    toast(
      quotaHit
        ? 'Your device ran out of storage space, so some songs will be gone after you close this tab. Free up space or keep songs in their original place (Settings → Library).'
        : 'Your browser wouldn’t store some files, so they will be gone after you close this tab.',
      'error',
    );
  }
}

/* ---------- track removal ---------- */

type RemovalListener = (ids: string[]) => void;
const removalListeners = new Set<RemovalListener>();

export function onTracksRemoved(listener: RemovalListener): void {
  removalListeners.add(listener);
}

function dropFromUserData(ids: Set<string>): Partial<LibraryState> {
  const s = library.get();
  return {
    favorites: s.favorites.filter((id) => !ids.has(id)),
    recent: s.recent.filter((r) => !ids.has(r.id)),
    playlists: s.playlists.map((p) =>
      p.trackIds.some((id) => ids.has(id))
        ? { ...p, trackIds: p.trackIds.filter((id) => !ids.has(id)), updatedAt: Date.now() }
        : p,
    ),
  };
}

/** Deletes cover thumbnails that no remaining song uses. */
function releaseArtwork(removed: Track[]): void {
  const inUse = new Set(library.get().tracks.map((t) => t.artId));
  const orphaned = [...new Set(removed.map((t) => t.artId))].filter((id): id is string => !!id && !inUse.has(id));
  if (orphaned.length === 0) return;
  forgetArtwork(orphaned);
  void db.deleteArtwork(orphaned);
}

export async function removeTracks(ids: string[]): Promise<void> {
  const set = new Set(ids);
  const removed = library.get().tracks.filter((t) => set.has(t.id));
  removalListeners.forEach((l) => l(ids));
  library.set((s) => ({ tracks: s.tracks.filter((t) => !set.has(t.id)), ...dropFromUserData(set) }));
  releaseArtwork(removed);
  await db.deleteTracks(ids);
}

export async function clearLibrary(): Promise<void> {
  const removed = library.get().tracks;
  const ids = removed.map((t) => t.id);
  removalListeners.forEach((l) => l(ids));
  const set = new Set(ids);
  library.set((s) => ({ tracks: [], ...dropFromUserData(set), playlists: s.playlists.map((p) => ({ ...p, trackIds: [] })) }));
  forgetArtwork(removed.map((t) => t.artId).filter((id): id is string => !!id));
  await db.clear();
}

/* ---------- cover art for songs imported before artwork support ---------- */

/** Scans songs that have never been checked for embedded artwork, a few at a time. */
async function backfillArtwork(): Promise<void> {
  const todo = library.get().tracks.filter((t) => t.artId === undefined).map((t) => t.id);
  if (todo.length === 0) return;

  const found = new Map<string, string | null>();
  const flush = () => {
    if (found.size === 0) return;
    const batch = new Map(found);
    found.clear();
    library.set((s) => ({ tracks: s.tracks.map((t) => (batch.has(t.id) ? { ...t, artId: batch.get(t.id) } : t)) }));
    void db.updateTracks(library.get().tracks.filter((t) => batch.has(t.id)));
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const id = todo[cursor++];
      if (!trackById(id)) continue;
      const file = await db.getFile(id);
      if (!file) continue; // unreadable right now (for example, permission needed): try again next time
      const artId = await ensureArtwork(file).catch(() => null);
      found.set(id, artId);
      if (found.size >= 25) flush();
    }
  };
  await Promise.all([worker(), worker()]);
  flush();
}

/** Reads embedded text tags for songs imported before tag support. Only fills in what a file actually has. */
async function backfillTags(): Promise<void> {
  const todo = library.get().tracks.filter((t) => t.tagged === undefined).map((t) => t.id);
  if (todo.length === 0) return;
  const found = new Map<string, Tags>();
  const flush = () => {
    if (found.size === 0) return;
    const batch = new Map(found);
    found.clear();
    const apply = (t: Track): Track => {
      const tags = batch.get(t.id);
      if (!tags) return t;
      return {
        ...t,
        title: tags.title ?? t.title,
        artist: tags.artist ?? t.artist,
        album: tags.album ?? t.album,
        trackNo: tags.trackNo ?? t.trackNo,
        tagged: true,
      };
    };
    library.set((s) => ({ tracks: s.tracks.map(apply) }));
    void db.updateTracks(library.get().tracks.filter((t) => batch.has(t.id)));
  };
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const id = todo[cursor++];
      if (!trackById(id)) continue;
      const file = await db.getFile(id);
      if (!file) continue; // unreadable right now: try again next time
      found.set(id, await readTags(file));
      if (found.size >= 25) flush();
    }
  };
  await Promise.all([worker(), worker()]);
  flush();
}

/* ---------- favorites, recent ---------- */

export function toggleFavorite(id: string): void {
  library.set((s) => ({
    favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites],
  }));
}

export function pushRecent(id: string): void {
  library.set((s) => ({
    recent: [{ id, at: Date.now() }, ...s.recent.filter((r) => r.id !== id)].slice(0, 100),
  }));
}

export function clearRecent(): void {
  library.set({ recent: [] });
}

/* ---------- playlists ---------- */

function newPlaylistId(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createPlaylist(name: string, trackIds: string[] = []): Playlist {
  const now = Date.now();
  const playlist: Playlist = {
    id: newPlaylistId(),
    name: name.trim() || 'Untitled playlist',
    trackIds: [...new Set(trackIds)],
    createdAt: now,
    updatedAt: now,
  };
  library.set((s) => ({ playlists: [playlist, ...s.playlists] }));
  return playlist;
}

export function renamePlaylist(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  library.set((s) => ({
    playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p)),
  }));
}

export function deletePlaylist(id: string): void {
  library.set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
}

export function addToPlaylist(id: string, trackIds: string[]): number {
  let added = 0;
  library.set((s) => ({
    playlists: s.playlists.map((p) => {
      if (p.id !== id) return p;
      const existing = new Set(p.trackIds);
      const extra = trackIds.filter((t) => !existing.has(t));
      added = extra.length;
      return extra.length ? { ...p, trackIds: [...p.trackIds, ...extra], updatedAt: Date.now() } : p;
    }),
  }));
  return added;
}

export function removeFromPlaylist(id: string, trackId: string): void {
  library.set((s) => ({
    playlists: s.playlists.map((p) =>
      p.id === id ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId), updatedAt: Date.now() } : p,
    ),
  }));
}

/* ---------- settings ---------- */

export function updateSettings(patch: Partial<Settings>): void {
  const settings: Settings = { ...library.get().settings, ...patch };
  if (patch.accent !== undefined) settings.accentChosen = true;
  library.set({ settings });
  // Save right away (not debounced) so a change made just before a refresh is never lost.
  saveJSON('user', pickUser());
  applyAppearance(settings);
}

/** Puts every setting back to its default. The library, playlists and favorites are not touched. */
export function resetSettings(): void {
  library.set({ settings: { ...defaultSettings } });
  saveJSON('user', pickUser());
  applyAppearance(defaultSettings);
}

// Follow the operating system's light/dark switch while the theme is set to "System".
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (library.get().settings.theme === 'system') applyAppearance(library.get().settings);
  });
}

/* ---------- storage maintenance ---------- */

export interface OptimizeResult {
  orphanFiles: number;
  orphanArtwork: number;
  artworkRecompressed: number;
  bytesFreed: number;
}

/**
 * Safe clean-up: deletes stored data that no song refers to and re-encodes stored cover thumbnails more
 * compactly (only when that makes them clearly smaller). Songs, playlists, favorites and settings are never changed.
 */
export async function optimizeStorage(): Promise<OptimizeResult> {
  if (library.get().importing.active) throw new Error('Wait for the import to finish first.');
  const tracks = library.get().tracks;
  const orphans = await db.removeOrphans(
    new Set(tracks.map((t) => t.id)),
    new Set(tracks.map((t) => t.artId).filter((id): id is string => !!id)),
  );
  const art = await recompressArtwork();
  return {
    orphanFiles: orphans.files,
    orphanArtwork: orphans.artwork,
    artworkRecompressed: art.count,
    bytesFreed: orphans.bytes + art.saved,
  };
}
