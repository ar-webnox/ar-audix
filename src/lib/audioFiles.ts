/** A file picked or dropped by the user, with its path relative to the picked folder. */
export interface Candidate {
  file: File;
  path: string;
}

export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'flac',
  'weba',
  'webm',
  'aif',
  'aiff',
] as const;

/** Value for an <input type="file"> accept attribute. */
export const AUDIO_ACCEPT = `audio/*,${AUDIO_EXTENSIONS.map((e) => `.${e}`).join(',')}`;

export const FORMAT_LABELS = ['MP3', 'WAV', 'M4A', 'AAC', 'OGG', 'FLAC', 'OPUS', 'AIFF'];

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function isAudioFile(file: File): boolean {
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) return true;
  return file.type.startsWith('audio/');
}

export function candidatesFromFiles(files: File[]): Candidate[] {
  return files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: Candidate[]): Promise<void> {
  try {
    if (entry.isFile) {
      const file = await fileOf(entry as FileSystemFileEntry);
      out.push({ file, path: entry.fullPath.replace(/^\//, '') || file.name });
    } else if (entry.isDirectory) {
      const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
      for (const child of children) await walk(child, out);
    }
  } catch {
    // Skip entries the browser refuses to read.
  }
}

/** Collects files (including whole folders) from a drop event. */
export async function candidatesFromDataTransfer(dt: DataTransfer): Promise<Candidate[]> {
  // Entries must be grabbed synchronously, before the event handler yields.
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }
  if (entries.length === 0 && loose.length === 0) loose.push(...Array.from(dt.files ?? []));

  const out: Candidate[] = candidatesFromFiles(loose);
  for (const entry of entries) await walk(entry, out);
  return out;
}

/**
 * Reads a file's duration using the browser's own decoder.
 * Resolves to -1 when the browser cannot decode the file.
 */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(-1), 12000);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) ? probe.duration : 0);
    probe.onerror = () => finish(-1);
    probe.src = url;
  });
}
