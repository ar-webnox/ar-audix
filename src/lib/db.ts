import type { Track } from '../types';

const DB_NAME = 'ar-audix';
const DB_VERSION = 2;
const TRACKS = 'tracks';
const FILES = 'files';
const ARTWORK = 'artwork';

let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Files imported this session, so playback still works if IndexedDB is unavailable. */
const sessionFiles = new Map<string, File>();
/** Same idea for cover thumbnails. */
const sessionArtwork = new Map<string, Blob>();

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

  /** Returns false when the track could only be kept in memory for this session. */
  async saveTrack(track: Track, file: File): Promise<boolean> {
    sessionFiles.set(track.id, file);
    const d = await openDb();
    if (!d) return false;
    try {
      const tx = d.transaction([TRACKS, FILES], 'readwrite');
      tx.objectStore(TRACKS).put(track);
      tx.objectStore(FILES).put(file, track.id);
      await finished(tx);
      return true;
    } catch {
      return false;
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

  async getFile(id: string): Promise<File | null> {
    const cached = sessionFiles.get(id);
    if (cached) return cached;
    const d = await openDb();
    if (!d) return null;
    try {
      const tx = d.transaction(FILES, 'readonly');
      const file = (await request(tx.objectStore(FILES).get(id))) as File | undefined;
      return file ?? null;
    } catch {
      return null;
    }
  },

  async deleteTracks(ids: string[]): Promise<void> {
    ids.forEach((id) => sessionFiles.delete(id));
    const d = await openDb();
    if (!d || ids.length === 0) return;
    try {
      const tx = d.transaction([TRACKS, FILES], 'readwrite');
      for (const id of ids) {
        tx.objectStore(TRACKS).delete(id);
        tx.objectStore(FILES).delete(id);
      }
      await finished(tx);
    } catch {
      // Nothing more to do; the in-memory state is already updated.
    }
  },

  async clear(): Promise<void> {
    sessionFiles.clear();
    sessionArtwork.clear();
    const d = await openDb();
    if (!d) return;
    try {
      const tx = d.transaction([TRACKS, FILES, ARTWORK], 'readwrite');
      tx.objectStore(TRACKS).clear();
      tx.objectStore(FILES).clear();
      tx.objectStore(ARTWORK).clear();
      await finished(tx);
    } catch {
      // Ignore.
    }
  },
};
