import { useSyncExternalStore } from 'react';

export type RouteName =
  | 'home'
  | 'my-music'
  | 'songs'
  | 'albums'
  | 'album'
  | 'artists'
  | 'artist'
  | 'playlists'
  | 'playlist'
  | 'favorites'
  | 'recent'
  | 'settings'
  | 'search'
  | 'not-found';

export interface Route {
  name: RouteName;
  param: string;
  /** Hash path such as "/albums/abc". */
  path: string;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHash(hash: string): Route {
  const path = '/' + hash.replace(/^#\/?/, '');
  const [, first = '', ...rest] = path.split('/');
  const param = decode(rest.join('/'));
  const simple: Record<string, RouteName> = {
    '': 'home',
    'my-music': 'my-music',
    songs: 'songs',
    albums: 'albums',
    artists: 'artists',
    playlists: 'playlists',
    favorites: 'favorites',
    recent: 'recent',
    settings: 'settings',
  };
  const detail: Record<string, RouteName> = {
    albums: 'album',
    artists: 'artist',
    playlists: 'playlist',
    search: 'search',
  };
  if (rest.length === 0 && first in simple) return { name: simple[first], param: '', path };
  if (first === 'search') return { name: 'search', param, path };
  if (rest.length > 0 && first in detail && param) return { name: detail[first], param, path };
  return { name: 'not-found', param: '', path };
}

let current = parseHash(typeof location === 'undefined' ? '' : location.hash);

function subscribe(listener: () => void): () => void {
  const onChange = () => {
    current = parseHash(location.hash);
    listener();
  };
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): Route {
  const next = parseHash(location.hash);
  if (next.path !== current.path) current = next;
  return current;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function navigate(path: string, replace = false): void {
  const target = `#${path}`;
  if (replace) location.replace(target);
  else location.hash = target;
}

export const paths = {
  album: (key: string) => `#/albums/${encodeURIComponent(key)}`,
  artist: (key: string) => `#/artists/${encodeURIComponent(key)}`,
  playlist: (id: string) => `#/playlists/${encodeURIComponent(id)}`,
  search: (q: string) => `/search/${encodeURIComponent(q)}`,
};
