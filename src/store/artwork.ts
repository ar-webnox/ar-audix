import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { encodeBitmap, extractPicture, hashBytes, makeThumbnail } from '../lib/artwork';

/** Object URLs for thumbnails that have been loaded this session, by artwork id. */
const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();
/** Ids known to be stored already, so identical covers are never decoded twice. */
const stored = new Set<string>();
const unusable = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();

/**
 * Reads a file's embedded cover and stores it once. Returns the artwork id or null when the
 * file has no usable cover. Identical covers (same bytes, e.g. every song of an album) share one id.
 */
export async function ensureArtwork(file: Blob): Promise<string | null> {
  const picture = await extractPicture(file);
  if (!picture) return null;
  const id = hashBytes(picture.bytes);
  if (stored.has(id)) return id;
  if (unusable.has(id)) return null;

  let job = inflight.get(id);
  if (!job) {
    job = (async () => {
      if (await db.hasArtwork(id)) {
        stored.add(id);
        return id;
      }
      const thumbnail = await makeThumbnail(picture.bytes, picture.mime);
      if (!thumbnail) {
        unusable.add(id);
        return null;
      }
      await db.putArtwork(id, thumbnail);
      stored.add(id);
      return id;
    })().finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  return job;
}

export function getArtworkUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let job = loading.get(id);
  if (!job) {
    job = db
      .getArtwork(id)
      .then((blob) => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        urls.set(id, url);
        return url;
      })
      .finally(() => loading.delete(id));
    loading.set(id, job);
  }
  return job;
}

/** Drops cached object URLs for artwork that was deleted. */
export function forgetArtwork(ids: string[]): void {
  for (const id of ids) {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
    stored.delete(id);
  }
}

/** The thumbnail URL for an artwork id (loaded once, then shared by every component). */
export function useArtworkUrl(id?: string | null): string | null {
  const [loaded, setLoaded] = useState<{ id: string; url: string } | null>(null);
  const cached = id ? urls.get(id) : undefined;

  useEffect(() => {
    if (!id || urls.has(id)) return;
    let live = true;
    void getArtworkUrl(id).then((url) => {
      if (live && url) setLoaded({ id, url });
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!id) return null;
  if (cached) return cached;
  return loaded?.id === id ? loaded.url : null;
}

/**
 * Re-encodes thumbnails stored by earlier versions (JPEG/PNG) as WebP, but only where that saves at least
 * 20%. A thumbnail is replaced only after the new one was produced successfully.
 */
export async function recompressArtwork(): Promise<{ count: number; saved: number }> {
  let count = 0;
  let saved = 0;
  for (const item of await db.listArtwork()) {
    if (item.type === 'image/webp' || item.size < 16_000) continue;
    const blob = await db.getArtwork(item.id);
    if (!blob) continue;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob);
      const next = await encodeBitmap(bitmap);
      if (next && next.type === 'image/webp' && next.size <= item.size * 0.8 && (await db.putArtwork(item.id, next))) {
        count++;
        saved += item.size - next.size;
      }
    } catch {
      // Keep the existing thumbnail.
    } finally {
      bitmap?.close();
    }
  }
  return { count, saved };
}
