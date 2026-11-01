import type { AlbumGroup, ArtistGroup, Track } from '../types';
import { normalizeKey } from './format';

export interface LibraryIndex {
  byId: Map<string, Track>;
  albums: AlbumGroup[];
  artists: ArtistGroup[];
  albumByKey: Map<string, AlbumGroup>;
  artistByKey: Map<string, ArtistGroup>;
  totalDuration: number;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

export function albumKeyOf(album: string): string {
  return normalizeKey(album);
}

export function artistKeyOf(artist: string): string {
  return normalizeKey(artist);
}

export function sortAlbumTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    if (a.trackNo !== null && b.trackNo !== null && a.trackNo !== b.trackNo) return a.trackNo - b.trackNo;
    if (a.trackNo !== null && b.trackNo === null) return -1;
    if (a.trackNo === null && b.trackNo !== null) return 1;
    return compareText(a.title, b.title);
  });
}

export function buildIndex(tracks: Track[]): LibraryIndex {
  const byId = new Map<string, Track>();
  const albumTracks = new Map<string, Track[]>();
  const artistTracks = new Map<string, Track[]>();
  let totalDuration = 0;

  for (const t of tracks) {
    byId.set(t.id, t);
    totalDuration += t.duration;
    const ak = albumKeyOf(t.album);
    const rk = artistKeyOf(t.artist);
    if (!albumTracks.has(ak)) albumTracks.set(ak, []);
    albumTracks.get(ak)!.push(t);
    if (!artistTracks.has(rk)) artistTracks.set(rk, []);
    artistTracks.get(rk)!.push(t);
  }

  const albums: AlbumGroup[] = [];
  for (const [key, list] of albumTracks) {
    const sorted = sortAlbumTracks(list);
    const counts = new Map<string, number>();
    for (const t of sorted) counts.set(t.artist, (counts.get(t.artist) ?? 0) + 1);
    let artist = sorted[0].artist;
    if (counts.size > 1) {
      const [topName, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      artist = topCount / sorted.length > 0.6 ? topName : 'Various Artists';
    }
    albums.push({
      key,
      name: sorted[0].album,
      artist,
      trackIds: sorted.map((t) => t.id),
      duration: sorted.reduce((sum, t) => sum + t.duration, 0),
      addedAt: Math.max(...sorted.map((t) => t.addedAt)),
      artId: sorted.find((t) => t.artId)?.artId ?? undefined,
    });
  }
  albums.sort((a, b) => compareText(a.name, b.name));

  const artists: ArtistGroup[] = [];
  for (const [key, list] of artistTracks) {
    const sorted = [...list].sort(
      (a, b) =>
        compareText(a.album, b.album) || (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || compareText(a.title, b.title),
    );
    artists.push({
      key,
      name: list[0].artist,
      trackIds: sorted.map((t) => t.id),
      albumKeys: [...new Set(sorted.map((t) => albumKeyOf(t.album)))],
      duration: list.reduce((sum, t) => sum + t.duration, 0),
    });
  }
  artists.sort((a, b) => compareText(a.name, b.name));

  return {
    byId,
    albums,
    artists,
    albumByKey: new Map(albums.map((a) => [a.key, a])),
    artistByKey: new Map(artists.map((a) => [a.key, a])),
    totalDuration,
  };
}

export type SortKey = 'added' | 'title' | 'artist' | 'album' | 'duration';

export function sortTracks(tracks: Track[], key: SortKey, ascending: boolean): Track[] {
  const dir = ascending ? 1 : -1;
  const copy = [...tracks];
  copy.sort((a, b) => {
    let r = 0;
    switch (key) {
      case 'added':
        r = a.addedAt - b.addedAt;
        break;
      case 'title':
        r = compareText(a.title, b.title);
        break;
      case 'artist':
        r = compareText(a.artist, b.artist) || compareText(a.album, b.album);
        break;
      case 'album':
        r = compareText(a.album, b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0);
        break;
      case 'duration':
        r = a.duration - b.duration;
        break;
    }
    return r * dir || compareText(a.title, b.title);
  });
  return copy;
}

export function searchTracks(tracks: Track[], query: string): Track[] {
  const tokens = normalizeKey(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return tracks.filter((t) => {
    const hay = `${t.title} ${t.artist} ${t.album}`.toLowerCase();
    return tokens.every((token) => hay.includes(token));
  });
}
