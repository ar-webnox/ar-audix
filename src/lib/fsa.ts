import { AUDIO_EXTENSIONS, extensionOf, isAudioFile, type Candidate, type DropResolver } from './audioFiles';

/**
 * File System Access helpers.
 *
 * Browsers that support it (desktop Chrome, Edge and other Chromium browsers) let the user pick files or a
 * folder and give the page a *handle* to each original. AR AUDIX stores only the handle, so the music is
 * not copied into the browser. The browser asks the user for permission whenever it needs it again
 * (typically after the app has been closed); nothing here bypasses that.
 * Browsers without it (Safari, Firefox, Chrome on Android) fall back to the regular pickers and keep a copy.
 */

type Permission = 'granted' | 'denied' | 'prompt';
interface PermissionOptions {
  mode?: 'read' | 'readwrite';
}

export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  queryPermission?(options?: PermissionOptions): Promise<Permission>;
  requestPermission?(options?: PermissionOptions): Promise<Permission>;
}

export interface DirHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandleLike | DirHandleLike>;
  queryPermission?(options?: PermissionOptions): Promise<Permission>;
  requestPermission?(options?: PermissionOptions): Promise<Permission>;
}

interface PickerWindow {
  showOpenFilePicker?: (options?: unknown) => Promise<FileHandleLike[]>;
  showDirectoryPicker?: (options?: unknown) => Promise<DirHandleLike>;
}

const w = (): PickerWindow => (typeof window === 'undefined' ? {} : (window as unknown as PickerWindow));

/** True when the browser can keep references to the user's original files instead of copying them. */
export function linkingSupported(): boolean {
  return typeof w().showOpenFilePicker === 'function' && typeof w().showDirectoryPicker === 'function' && window.isSecureContext;
}

const newRootId = (): string => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** True when the user closed the picker without choosing anything. */
export const isCancel = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export async function pickFileHandles(): Promise<Candidate[]> {
  const handles = await w().showOpenFilePicker!({
    multiple: true,
    types: [{ description: 'Audio files', accept: { 'audio/*': AUDIO_EXTENSIONS.map((e) => `.${e}`) } }],
  });
  const all = await inChunks(handles, 40, async (handle): Promise<Candidate | null> => {
    try {
      const file = await handle.getFile();
      return { file, path: file.name, handle };
    } catch {
      return null;
    }
  });
  return all.filter((c): c is Candidate => c !== null);
}

/** Collects every audio file in a folder (and its sub-folders) as linked candidates. */
export async function walkDirectory(dir: DirHandleLike, prefix = dir.name, root = { id: newRootId(), handle: dir }): Promise<Candidate[]> {
  const handles: { handle: FileHandleLike; path: string }[] = [];
  const dirs: DirHandleLike[] = [];
  try {
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        if ((AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(entry.name))) handles.push({ handle: entry, path: `${prefix}/${entry.name}` });
      } else dirs.push(entry);
    }
  } catch {
    return [];
  }
  const own = await inChunks(handles, 40, async ({ handle, path }): Promise<Candidate | null> => {
    try {
      return { file: await handle.getFile(), path, handle, root };
    } catch {
      return null;
    }
  });
  const out = own.filter((c): c is Candidate => c !== null && isAudioFile(c.file));
  for (const d of dirs) out.push(...(await walkDirectory(d, `${prefix}/${d.name}`, root)));
  return out;
}

export async function pickDirectoryHandle(): Promise<Candidate[]> {
  const dir = await w().showDirectoryPicker!({ mode: 'read', id: 'ar-audix-music' });
  return walkDirectory(dir);
}

/** For drag and drop: dropped files and folders come with handles in Chromium browsers. */
export function dropResolver(): DropResolver | null {
  if (!linkingSupported()) return null;
  return (item) => {
    const get = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileHandleLike | DirHandleLike | null> }).getAsFileSystemHandle;
    if (typeof get !== 'function') return null;
    return get
      .call(item)
      .then(async (h): Promise<Candidate[] | null> => {
        if (!h) return null;
        if (h.kind === 'file') {
          const file = await h.getFile();
          return [{ file, path: file.name, handle: h }];
        }
        return walkDirectory(h);
      })
      .catch(() => null);
  };
}

/* ---------- permissions ---------- */

export type Access = 'granted' | 'prompt' | 'denied';

export async function queryAccess(h: FileHandleLike | DirHandleLike): Promise<Access> {
  if (typeof h.queryPermission !== 'function') return 'granted';
  try {
    return await h.queryPermission({ mode: 'read' });
  } catch {
    return 'denied';
  }
}

/** Must run inside a click or tap. Shows the browser's own permission prompt. */
export async function requestAccess(h: FileHandleLike | DirHandleLike): Promise<Access> {
  if (typeof h.requestPermission !== 'function') return 'granted';
  try {
    return await h.requestPermission({ mode: 'read' });
  } catch {
    return 'denied';
  }
}
