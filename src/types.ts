export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  trackNo: number | null;
  /** Seconds. 0 when the browser could not report a duration. */
  duration: number;
  fileName: string;
  ext: string;
  size: number;
  mime: string;
  addedAt: number;
  /** Id of the embedded cover in the artwork store. null: scanned, none found. undefined: not scanned yet. */
  artId?: string | null;
  /** True once the file's embedded text tags have been read (and used when present). */
  tagged?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RecentEntry {
  id: string;
  at: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type AccentName = 'sky' | 'amber' | 'rose' | 'mint' | 'violet' | 'custom';

export interface Settings {
  accent: AccentName;
  /** The colour used when accent is 'custom', as #rrggbb. Kept when switching to a preset. */
  customColor?: string;
  /** True once the user picked an accent themselves, so the default can change without overriding it. */
  accentChosen?: boolean;
  autoSkip: boolean;
}

export interface AlbumGroup {
  key: string;
  name: string;
  artist: string;
  trackIds: string[];
  duration: number;
  addedAt: number;
  artId?: string;
}

export interface ArtistGroup {
  key: string;
  name: string;
  trackIds: string[];
  albumKeys: string[];
  duration: number;
}
