import type { Track } from '../types';
import { queryAccess, requestAccess, type Access, type DirHandleLike, type FileHandleLike } from './fsa';

const DB_NAME = 'ar-audix';
const DB_VERSION = 3;
const TRACKS = 'tracks';
const FILES = 'files';
const ARTWORK = 'artwork';
/** Handles to songs that stay where they are on the device (no audio copy). */
const HANDLES = 'handles';
/** Handles to folders the user picked; one permission covers every song inside. */
const ROOTS = 'roots';

interface HandleRecord {
  handle: FileHandleLike;
  root?: string;
}

/** Why a song could not be opened: the browser needs permission again or the original is gone. */
export type FileProblem = 'permission' | 'missing';
const problems = new Map<string, FileProblem>();
export const fileProblem = (id: string): FileProblem | undefined => problems.get(id);

export type SaveResult = 'ok' | 'memory' | 'quota';
const isQuota = (e: unknown): boolean => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);

let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Files imported this session, so playback still works if IndexedDB is unavailable. */
const sessionFiles = new Map<string, File>();
/** Same idea for cover thumbnails. */
const sessionArtwork = new Map<string, Blob>();
const rootCache = new Map<string, DirHandleLike>();

let blockedHandler: (() => void) | null = null;
/** Called when another open tab running an older version blocks the database upgrade. */
export function onDbBlocked(handler: () => void): void {
  blockedHandler = handler;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(TRACKS)) d.createObjectStore(TRACKS, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES);
        if (!d.objectStoreNames.contains(ARTWORK)) d.createObjectStore(ARTWORK);
        // Version 3 adds the two stores for linked songs. Nothing existing is touched or moved.
        if (!d.objectStoreNames.contains(HANDLES)) d.createObjectStore(HANDLES);
        if (!d.objectStoreNames.contains(ROOTS)) d.createObjectStore(ROOTS);
      };
      req.onsuccess = () => {
        const d = req.result;
        // Let a newer version of the app upgrade the database instead of being blocked by this tab.
        d.onversionchange = () => {
          d.close();
          dbPromise = null;
        };
        resolve(d);
      };
      req.onerror = () => resolve(null);
      // An older tab still has the database open. The request stays pending and continues
      // as soon as that tab closes, so the library is not mistaken for empty.
      req.onblocked = () => blockedHandler?.();
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getRoot(id: string): Promise<DirHandleLike | undefined> {
  const cached = rootCache.get(id);
  if (cached) return cached;
  const d = await openDb();
  if (!d) return undefined;
  try {
    const h = (await request(d.transaction(ROOTS, 'readonly').objectStore(ROOTS).get(id))) as DirHandleLike | undefined;
    if (h) rootCache.set(id, h);
    return h;
  } catch {
    return undefined;
  }
}

/** Opens a linked song's original file, asking for permission only when allowed to. */
async function openLinked(id: string, rec: HandleRecord, prompt: boolean): Promise<File | null> {
  const target: FileHandleLike | DirHandleLike = rec.root ? ((await getRoot(rec.root)) ?? rec.handle) : rec.handle;
  const read = async (): Promise<File | 'denied' | null> => {
    try {
      return await rec.handle.getFile();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        problems.set(id, 'missing');
        return null;
      }
      return 'denied';
    }
  };
  if ((await queryAccess(target)) === 'granted') {
    const r = await read();
    if (r !== 'denied') return r;
  }
  if (!prompt || (await requestAccess(target)) !== 'granted') {
    if (!problems.has(id)) problems.set(id, 'permission');
    return null;
  }
  const r = await read();
  if (r === 'denied') {
    problems.set(id, 'permission');
    return null;
  }
  return r;
}

export const db = {
  async loadTracks(): Promise<{ tracks: Track[]; persistent: boolean }> {
    const d = await openDb();
    if (!d) return { tracks: [], persistent: false };
    try {
      const tx = d.transaction(TRACKS, 'readonly');
      const tracks = (await request(tx.objectStore(TRACKS).getAll())) as Track[];
      return { tracks, persistent: true };
    } catch {
      return { tracks: [], persistent: false };
    }
  },

  /** Stores a copy of the audio in the browser. 'memory': kept for this session only. */
  async saveTrack(track: Track, file: File): Promise<SaveResult> {
    sessionFiles.set(track.id, file);
    const d = await openDb();
    if (!d) return 'memory';
    try {
      const tx = d.transaction([TRACKS, FILES], 'readwrite');
      tx.objectStore(TRACKS).put(track);
      tx.objectStore(FILES).put(file, track.id);
      await finished(tx);
      return 'ok';
    } catch (e) {
      return isQuota(e) ? 'quota' : 'memory';
    }
  },

  /** Stores only the song's details and a handle to the original file (no audio copy). False if that is not possible. */
  async saveLinked(track: Track, handle: FileHandleLike, root?: string): Promise<boolean> {
    const d = await openDb();
    if (!d) return false;
    try {
      const tx = d.transaction([TRACKS, HANDLES], 'readwrite');
      tx.objectStore(TRACKS).put({ ...track, src: 'link' });
      tx.objectStore(HANDLES).put({ handle, root } satisfies HandleRecord, track.id);
      await finished(tx);
      return true;
    } catch {
      return false;
    }
  },

  async saveRoot(id: string, handle: DirHandleLike): Promise<void> {
    rootCache.set(id, handle);
    const d = await openDb();
    if (!d) return;
    try {
      const tx = d.transaction(ROOTS, 'readwrite');
      tx.objectStore(ROOTS).put(handle, id);
      await finished(tx);
    } catch {
      // The handle still works for this session.
    }
  },

  /**
   * Replaces a stored copy with a handle to the original, after checking that the original can be read.
   * The copy is deleted in the same transaction that stores the handle and only when the check passed.
   * Returns the number of bytes freed (0 when nothing was replaced).
   */
  async adoptLink(id: string, handle: FileHandleLike, root?: string): Promise<number> {
    const d = await openDb();
    if (!d) return 0;
    try {
      const file = await handle.getFile();
      await file.slice(0, 4096).arrayBuffer(); // must be readable
      const tx = d.transaction([TRACKS, FILES, HANDLES], 'readwrite');
      const track = (await request(tx.objectStore(TRACKS).get(id))) as Track | undefined;
      if (!track || file.size !== track.size || file.name !== track.fileName) {
        tx.abort();
        return 0;
      }
      const hadCopy = (await request(tx.objectStore(FILES).getKey(id))) !== undefined;
      tx.objectStore(HANDLES).put({ handle, root } satisfies HandleRecord, id);
      tx.objectStore(TRACKS).put({ ...track, src: 'link' });
      tx.objectStore(FILES).delete(id);
      await finished(tx);
      sessionFiles.delete(id);
      problems.delete(id);
      return hadCopy ? track.size : 0;
    } catch {
      return 0;
    }
  },

  async updateTracks(tracks: Track[]): Promise<void> {
    const d = await openDb();
    if (!d || tracks.length === 0) return;
    try {
      const tx = d.transaction(TRACKS, 'readwrite');
      for (const t of tracks) tx.objectStore(TRACKS).put(t);
      await finished(tx);
    } catch {
      // The in-memory state is already updated.
    }
  },

  /** Returns false when the thumbnail could only be kept in memory for this session. */
  async putArtwork(id: string, blob: Blob): Promise<boolean> {
    sessionArtwork.set(id, blob);
    const d = await openDb();
    if (!d) return false;
    try {
      const tx = d.transaction(ARTWORK, 'readwrite');
      tx.objectStore(ARTWORK).put(blob, id);
      await finished(tx);
      return true;
    } catch {
      return false;
    }
  },

  async hasArtwork(id: string): Promise<boolean> {
    if (sessionArtwork.has(id)) return true;
    const d = await openDb();
    if (!d) return false;
    try {
      const tx = d.transaction(ARTWORK, 'readonly');
      return (await request(tx.objectStore(ARTWORK).getKey(id))) !== undefined;
    } catch {
      return false;
    }
  },

  async getArtwork(id: string): Promise<Blob | null> {
    const cached = sessionArtwork.get(id);
    if (cached) return cached;
    const d = await openDb();
    if (!d) return null;
    try {
      const tx = d.transaction(ARTWORK, 'readonly');
      const blob = (await request(tx.objectStore(ARTWORK).get(id))) as Blob | undefined;
      return blob ?? null;
    } catch {
      return null;
    }
  },

  async deleteArtwork(ids: string[]): Promise<void> {
    ids.forEach((id) => sessionArtwork.delete(id));
    const d = await openDb();
    if (!d || ids.length === 0) return;
    try {
      const tx = d.transaction(ARTWORK, 'readwrite');
      for (const id of ids) tx.objectStore(ARTWORK).delete(id);
      await finished(tx);
    } catch {
      // Ignore.
    }
  },

  /**
   * The audio for a song: the stored copy or the original file through its handle.
   * `prompt: true` (only from a click or tap) lets the browser ask the user for permission again.
   * When this returns null, `fileProblem(id)` says whether permission or the file itself is missing.
   */
  async getFile(id: string, options: { prompt?: boolean } = {}): Promise<File | null> {
    problems.delete(id);
    const cached = sessionFiles.get(id);
    if (cached) return cached;
    const d = await openDb();
    if (!d) return null;
    try {
      const tx = d.transaction([FILES, HANDLES], 'readonly');
      const file = (await request(tx.objectStore(FILES).get(id))) as File | undefined;
      if (file) return file;
      const rec = (await request(tx.objectStore(HANDLES).get(id))) as HandleRecord | undefined;
      return rec ? await openLinked(id, rec, options.prompt === true) : null;
    } catch {
      return null;
    }
  },

  /** How many linked songs there are and how many the browser lets us read right now (no prompt). */
  async linkedAccess(): Promise<{ linked: number; ready: number; folders: number }> {
    const d = await openDb();
    if (!d) return { linked: 0, ready: 0, folders: 0 };
    try {
      const recs = (await request(d.transaction(HANDLES, 'readonly').objectStore(HANDLES).getAll())) as HandleRecord[];
      const targets = new Map<string, FileHandleLike | DirHandleLike>();
      const counts = new Map<string, number>();
      for (const [i, r] of recs.entries()) {
        const key = r.root ? `root:${r.root}` : `file:${i}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!targets.has(key)) targets.set(key, r.root ? ((await getRoot(r.root)) ?? r.handle) : r.handle);
      }
      let ready = 0;
      let folders = 0;
      for (const [key, h] of targets) {
        if (key.startsWith('root:')) folders++;
        if ((await queryAccess(h)) === 'granted') ready += counts.get(key) ?? 0;
      }
      return { linked: recs.length, ready, folders };
    } catch {
      return { linked: 0, ready: 0, folders: 0 };
    }
  },

  /**
   * Asks the browser for permission to read one folder (or file) that is not readable yet.
   * Must run inside a click or tap. Returns how many still need permission afterwards.
   */
  async requestNextAccess(): Promise<{ asked: boolean; remaining: number }> {
    const d = await openDb();
    if (!d) return { asked: false, remaining: 0 };
    const recs = (await request(d.transaction(HANDLES, 'readonly').objectStore(HANDLES).getAll())) as HandleRecord[];
    const pending: (FileHandleLike | DirHandleLike)[] = [];
    const seen = new Set<string>();
    for (const r of recs) {
      if (r.root) {
        if (seen.has(r.root)) continue;
        seen.add(r.root);
      }
      const target = r.root ? ((await getRoot(r.root)) ?? r.handle) : r.handle;
      if ((await queryAccess(target)) !== 'granted') pending.push(target);
    }
    if (pending.length === 0) return { asked: false, remaining: 0 };
    const state: Access = await requestAccess(pending[0]);
    return { asked: true, remaining: pending.length - (state === 'granted' ? 1 : 0) };
  },

  /** What the browser is holding for AR AUDIX, split by kind. Reads sizes only, never the audio itself. */
  async usageBreakdown(): Promise<{ copies: number; copyFiles: number; artwork: number; artworkCount: number; links: number }> {
    const out = { copies: 0, copyFiles: 0, artwork: 0, artworkCount: 0, links: 0 };
    const d = await openDb();
    if (!d) return out;
    const sum = (store: string, add: (v: Blob) => void) =>
      new Promise<void>((resolve) => {
        const req = d.transaction(store, 'readonly').objectStore(store).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return resolve();
          add(c.value as Blob);
          c.continue();
        };
        req.onerror = () => resolve();
      });
    await sum(FILES, (f) => {
      out.copies += f.size;
      out.copyFiles++;
    });
    await sum(ARTWORK, (b) => {
      out.artwork += b.size;
      out.artworkCount++;
    });
    try {
      out.links = await request(d.transaction(HANDLES, 'readonly').objectStore(HANDLES).count());
    } catch {
      // Ignore.
    }
    return out;
  },

  async listArtwork(): Promise<{ id: string; size: number; type: string }[]> {
    const d = await openDb();
    if (!d) return [];
    return new Promise((resolve) => {
      const out: { id: string; size: number; type: string }[] = [];
      const req = d.transaction(ARTWORK, 'readonly').objectStore(ARTWORK).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        const b = c.value as Blob;
        out.push({ id: String(c.key), size: b.size, type: b.type });
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  },

  /**
   * Removes stored data that no song in the library refers to (leftovers from interrupted imports or
   * removed songs). Only things whose id is not in the given sets are deleted; songs are never touched.
   */
  async removeOrphans(trackIds: Set<string>, artIds: Set<string>): Promise<{ files: number; bytes: number; artwork: number }> {
    const out = { files: 0, bytes: 0, artwork: 0 };
    const d = await openDb();
    if (!d) return out;
    const prune = (store: string, keep: Set<string>, onRemove: (v: unknown) => void) =>
      new Promise<void>((resolve) => {
        const tx = d.transaction(store, 'readwrite');
        const req = tx.objectStore(store).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return;
          if (!keep.has(String(c.key))) {
            onRemove(c.value);
            c.delete();
          }
          c.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => resolve();
      });
    await prune(FILES, trackIds, (v) => {
      out.files++;
      out.bytes += (v as Blob).size ?? 0;
    });
    await prune(HANDLES, trackIds, () => undefined);
    await prune(ARTWORK, artIds, (v) => {
      out.artwork++;
      out.bytes += (v as Blob).size ?? 0;
    });
    return out;
  },

  async deleteTracks(ids: string[]): Promise<void> {
    ids.forEach((id) => sessionFiles.delete(id));
    const d = await openDb();
    if (!d || ids.length === 0) return;
    try {
      const tx = d.transaction([TRACKS, FILES, HANDLES], 'readwrite');
      for (const id of ids) {
        tx.objectStore(TRACKS).delete(id);
        tx.objectStore(FILES).delete(id);
        tx.objectStore(HANDLES).delete(id);
      }
      await finished(tx);
    } catch {
      // Nothing more to do; the in-memory state is already updated.
    }
  },

  async clear(): Promise<void> {
    sessionFiles.clear();
    sessionArtwork.clear();
    rootCache.clear();
    problems.clear();
    const d = await openDb();
    if (!d) return;
    try {
      const tx = d.transaction([TRACKS, FILES, ARTWORK, HANDLES, ROOTS], 'readwrite');
      tx.objectStore(TRACKS).clear();
      tx.objectStore(FILES).clear();
      tx.objectStore(HANDLES).clear();
      tx.objectStore(ROOTS).clear();
      tx.objectStore(ARTWORK).clear();
      await finished(tx);
    } catch {
      // Ignore.
    }
  },
};
