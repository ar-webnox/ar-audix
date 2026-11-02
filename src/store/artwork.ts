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

/* ---------- ambient colour for Now Playing ---------- */

export interface Tint {
  dark: string;
  light: string;
}
const tints = new Map<string, Tint>();

/** One 8x8 downscale of a thumbnail gives its overall colour; saturated pixels count more than grey ones. */
function tintOf(img: HTMLImageElement): Tint | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    const px = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < px.length; i += 4) {
      const max = Math.max(px[i], px[i + 1], px[i + 2]);
      const min = Math.min(px[i], px[i + 1], px[i + 2]);
      const weight = 0.15 + (max === 0 ? 0 : (max - min) / max);
      r += px[i] * weight; g += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
    }
    return fromRgb(r / w, g / w, b / w);
  } catch {
    return null;
  }
}

/** Dark theme: a muted, fairly dark version. Light theme: a soft pastel version. Text stays readable on both. */
function fromRgb(r: number, g: number, b: number): Tint {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max * 255 === r) h = ((g - b) / 255 / d) % 6;
    else if (max * 255 === g) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
  }
  const hue = Math.round(((h * 60) + 360) % 360);
  const sat = Math.round(Math.min(0.75, Math.max(0.25, s)) * 100);
  return { dark: `hsl(${hue} ${sat}% ${Math.round(Math.min(0.46, Math.max(0.26, l)) * 100)}%)`, light: `hsl(${hue} ${Math.min(sat, 70)}% 72%)` };
}

/** Tint for a placeholder cover, matching the generated placeholder's hue. */
export function placeholderTint(hue: number): Tint {
  return { dark: `hsl(${hue} 32% 30%)`, light: `hsl(${hue} 45% 78%)` };
}

/**
 * The ambient colour for a cover. The previous colour stays until the next one is ready, so changing
 * songs fades from one colour to the other instead of flashing.
 */
export function useArtworkTint(id?: string | null): Tint | null {
  const url = useArtworkUrl(id);
  const [tint, setTint] = useState<Tint | null>(null);
  useEffect(() => {
    if (!id) return setTint(null);
    const known = tints.get(id);
    if (known) return setTint(known);
    if (!url) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      const t = tintOf(img);
      if (t) tints.set(id, t);
      if (live) setTint(t);
    };
    img.src = url;
    return () => {
      live = false;
    };
  }, [id, url]);
  return tint;
}
