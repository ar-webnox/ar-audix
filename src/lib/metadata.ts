export interface InferredMeta {
  title: string;
  artist: string;
  album: string;
  trackNo: number | null;
}

export const UNKNOWN_ARTIST = 'Unknown Artist';
export const UNKNOWN_ALBUM = 'Unknown Album';

/**
 * Infers display metadata from the file name and folder structure.
 *   "Artist/Album/03 - Title.mp3"  -> artist, album, track 3, title
 *   "Artist - Title.mp3"           -> artist, title
 */
export function inferMeta(path: string): InferredMeta {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop() ?? path;
  const base = fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();

  let name = base;
  let trackNo: number | null = null;
  const numbered = name.match(/^(\d{1,3})\s*[-._)]+\s*(.+)$/);
  if (numbered) {
    trackNo = parseInt(numbered[1], 10);
    name = numbered[2].trim();
  }

  let title = name;
  let fileArtist: string | null = null;
  const dash = name.split(/\s+[-–—]\s+/);
  if (dash.length >= 2 && dash[0].trim() && dash.slice(1).join(' - ').trim()) {
    fileArtist = dash[0].trim();
    title = dash.slice(1).join(' - ').trim();
  }

  let album = UNKNOWN_ALBUM;
  let folderArtist: string | null = null;
  if (parts.length >= 2) {
    album = parts[parts.length - 1];
    folderArtist = parts[parts.length - 2];
  } else if (parts.length === 1) {
    album = parts[0];
  }

  return {
    title: title || base || fileName,
    artist: folderArtist ?? fileArtist ?? UNKNOWN_ARTIST,
    album,
    trackNo,
  };
}
