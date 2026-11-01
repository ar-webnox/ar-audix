import { useMemo } from 'react';
import { createStore, useStore } from '../lib/createStore';
import { db, onDbBlocked } from '../lib/db';
import { loadJSON, saveJSON } from '../lib/storage';
import { inferMeta } from '../lib/metadata';
import { readTags, type Tags } from '../lib/tags';
import { extensionOf, isAudioFile, readDuration, type Candidate } from '../lib/audioFiles';
import { buildIndex, type LibraryIndex } from '../lib/derive';
import { hashString, plural } from '../lib/format';
import { applyAccent } from '../lib/theme';
import { ensureArtwork, forgetArtwork } from './artwork';
import { toast } from './ui';
import type { AccentName, Playlist, RecentEntry, Settings, Track } from '../types';

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
export const ACCENTS: { name: AccentName; label: string; color: string }[] = [
  { name: 'sky', label: 'Sky', color: '#7cb7ee' },
  { name: 'amber', label: 'Amber', color: '#e7b86a' },
  { name: 'rose', label: 'Rose', color: '#e58a9b' },
  { name: 'mint', label: 'Mint', color: '#6fd0b0' },
  { name: 'violet', label: 'Violet', color: '#a996f0' },
];

const defaultSettings: Settings = { accent: ACCENTS[0].name, autoSkip: true };
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
applyAccent(library.get().settings.accent, library.get().settings.customColor);

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

  const known = new Set(library.get().tracks.map((t) => t.id));
  const fresh: { c: Candidate; id: string }[] = [];
  let duplicates = 0;
  for (const c of audio) {
    const id = trackIdFor(c.file);
    if (known.has(id)) duplicates++;
    else {
      known.add(id);
      fresh.push({ c, id });
    }
  }
  if (fresh.length === 0) {
    toast(`Already in your library: ${plural(duplicates, 'song')} skipped.`);
    return;
  }

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
        const artId = await ensureArtwork(c.file).catch(() => null);
        const meta = inferMeta(c.path);
        const tags = await readTags(c.file);
        const track: Track = {
          id,
          title: tags.title ?? meta.title,
          artist: tags.artist ?? meta.artist,
          album: tags.album ?? meta.album,
          trackNo: tags.trackNo ?? meta.trackNo,
          tagged: true,
          duration,
          fileName: c.file.name,
          ext: extensionOf(c.file.name),
          size: c.file.size,
          mime: c.file.type,
          addedAt: addedAt + added,
          artId,
        };
        if (!(await db.saveTrack(track, c.file))) unsaved++;
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
  if (duplicates) parts.push(`${plural(duplicates, 'duplicate')} skipped`);
  if (failed) parts.push(`${plural(failed, 'file')} couldn’t be read`);
  if (ignored) parts.push(`${plural(ignored, 'non-audio file')} ignored`);
  toast(parts.join(' · '), added > 0 ? 'success' : 'error');

  if (unsaved > 0) {
    library.set({ persistent: false });
    toast(
      'Your browser wouldn’t store some files, so they will be gone after you close this tab.',
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
      const artId = file ? await ensureArtwork(file).catch(() => null) : null;
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
      found.set(id, file ? await readTags(file) : {});
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
  if (patch.accent !== undefined || patch.customColor !== undefined) applyAccent(settings.accent, settings.customColor);
}
