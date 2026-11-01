import { createStore } from '../lib/createStore';
import { db } from '../lib/db';
import { loadJSON, saveJSON } from '../lib/storage';
import { clamp } from '../lib/format';
import { getArtworkUrl } from './artwork';
import { library, onTracksRemoved, pushRecent, trackById } from './library';
import { toast } from './ui';
import type { RepeatMode, Track } from '../types';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface PlayerState {
  currentId: string | null;
  /** The queue in its original order. */
  queue: string[];
  /** The order tracks will actually play in (shuffled when shuffle is on). */
  order: string[];
  /** Position of the current track within `order`. */
  index: number;
  playing: boolean;
  loading: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  rate: number;
  duration: number;
}

interface SavedPrefs {
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

const prefs = loadJSON<Partial<SavedPrefs>>('player', {});

export const player = createStore<PlayerState>({
  currentId: null,
  queue: [],
  order: [],
  index: -1,
  playing: false,
  loading: false,
  shuffle: prefs.shuffle === true,
  repeat: prefs.repeat === 'all' || prefs.repeat === 'one' ? prefs.repeat : 'off',
  volume: typeof prefs.volume === 'number' ? clamp(prefs.volume, 0, 1) : 0.8,
  muted: prefs.muted === true,
  rate: PLAYBACK_RATES.includes(prefs.rate ?? 0) ? (prefs.rate as number) : 1,
  duration: 0,
});

/** The single HTML5 audio element used for all playback. */
export const audio = new Audio();
audio.preload = 'auto';
audio.volume = player.get().volume;
audio.muted = player.get().muted;
audio.defaultPlaybackRate = player.get().rate;
audio.playbackRate = player.get().rate;

let objectUrl: string | null = null;
let loadToken = 0;
let failStreak = 0;
let recordedFor: string | null = null;

/* ---------- helpers ---------- */

function shuffled(ids: string[], first: string | null): string[] {
  const rest = ids.filter((id, i) => !(first !== null && id === first && ids.indexOf(id) === i));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first !== null && ids.includes(first) ? [first, ...rest] : rest;
}

function releaseSource(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function stopCompletely(): void {
  loadToken++;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  releaseSource();
  recordedFor = null;
  player.set({ currentId: null, queue: [], order: [], index: -1, playing: false, loading: false, duration: 0 });
  updateMediaSession(null);
}

/* ---------- loading ---------- */

async function loadAndPlay(id: string, autoplay = true): Promise<void> {
  const token = ++loadToken;
  const track = trackById(id);
  player.set({ currentId: id, loading: true, duration: track?.duration ?? 0 });
  const file = track ? await db.getFile(id) : null;
  if (token !== loadToken) return;
  if (!track || !file) {
    handleUnplayable(id, 'The file is no longer available.');
    return;
  }
  releaseSource();
  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;
  audio.defaultPlaybackRate = player.get().rate;
  audio.playbackRate = player.get().rate;
  updateMediaSession(track);
  if (!autoplay) {
    player.set({ playing: false, loading: false });
    return;
  }
  try {
    await audio.play();
  } catch (err) {
    if (token !== loadToken) return;
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError') player.set({ playing: false, loading: false });
    else if (name !== 'AbortError') handleUnplayable(id, 'This format isn’t supported by your browser.');
  }
}

function handleUnplayable(id: string, reason: string): void {
  const track = trackById(id);
  toast(`Can’t play “${track?.title ?? 'this song'}”. ${reason}`, 'error');
  failStreak++;
  const { order, index } = player.get();
  const canSkip =
    library.get().settings.autoSkip && failStreak < order.length && (index + 1 < order.length || player.get().repeat === 'all');
  if (canSkip) {
    next(true);
  } else {
    failStreak = 0;
    player.set({ playing: false, loading: false });
  }
}

/* ---------- transport ---------- */

export function playContext(ids: string[], startId?: string, options: { shuffle?: boolean } = {}): void {
  const list = ids.filter((id) => trackById(id));
  if (list.length === 0) return;
  const shuffle = options.shuffle ?? player.get().shuffle;
  const start = startId && list.includes(startId) ? startId : shuffle ? list[Math.floor(Math.random() * list.length)] : list[0];
  const order = shuffle ? shuffled(list, start) : list;
  failStreak = 0;
  player.set({ queue: list, order, index: order.indexOf(start), shuffle });
  void loadAndPlay(start);
}

export function shufflePlay(ids: string[]): void {
  playContext(ids, undefined, { shuffle: true });
}

export function togglePlay(): void {
  const { currentId, order } = player.get();
  if (!currentId) {
    const all = library.get().tracks.map((t) => t.id);
    if (all.length) playContext(all, order[0]);
    return;
  }
  if (!audio.src) {
    void loadAndPlay(currentId);
    return;
  }
  if (audio.paused) {
    audio.play().catch(() => player.set({ playing: false }));
  } else {
    audio.pause();
  }
}

function jump(index: number): void {
  const { order } = player.get();
  if (index < 0 || index >= order.length) return;
  player.set({ index });
  void loadAndPlay(order[index]);
}

export function jumpTo(index: number): void {
  failStreak = 0;
  jump(index);
}

export function next(auto = false): void {
  const { order, index, repeat } = player.get();
  if (order.length === 0) return;
  if (index + 1 < order.length) return jump(index + 1);
  if (repeat === 'all' || !auto) return jump(0);
  // End of the queue with repeat off: stop on the first track, ready to play again.
  player.set({ index: 0, playing: false });
  void loadAndPlay(order[0], false);
}

export function previous(): void {
  const { order, index, repeat } = player.get();
  if (order.length === 0) return;
  if (audio.currentTime > 3 || (index === 0 && repeat !== 'all')) {
    audio.currentTime = 0;
    return;
  }
  jump(index === 0 ? order.length - 1 : index - 1);
}

export function seek(seconds: number): void {
  if (!audio.src) return;
  const limit = Number.isFinite(audio.duration) ? audio.duration : player.get().duration;
  audio.currentTime = clamp(seconds, 0, limit || 0);
}

export function seekBy(delta: number): void {
  seek(audio.currentTime + delta);
}

/* ---------- modes & levels ---------- */

export function toggleShuffle(): void {
  const { shuffle, queue, currentId } = player.get();
  const on = !shuffle;
  if (!currentId || queue.length === 0) {
    player.set({ shuffle: on });
    return;
  }
  if (on) player.set({ shuffle: true, order: shuffled(queue, currentId), index: 0 });
  else player.set({ shuffle: false, order: queue, index: Math.max(0, queue.indexOf(currentId)) });
}

export function cycleRepeat(): void {
  const order: RepeatMode[] = ['off', 'all', 'one'];
  const current = player.get().repeat;
  player.set({ repeat: order[(order.indexOf(current) + 1) % order.length] });
}

export function setVolume(value: number): void {
  const volume = clamp(value, 0, 1);
  audio.volume = volume;
  audio.muted = volume === 0;
  player.set({ volume, muted: volume === 0 });
}

export function toggleMute(): void {
  const muted = !player.get().muted;
  if (!muted && player.get().volume === 0) {
    setVolume(0.5);
    return;
  }
  audio.muted = muted;
  player.set({ muted });
}

export function nudgeVolume(delta: number): void {
  const { volume, muted } = player.get();
  setVolume((muted ? 0 : volume) + delta);
}

export function setRate(rate: number): void {
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  player.set({ rate });
}

/* ---------- queue editing ---------- */

function insertIntoQueue(ids: string[], where: 'next' | 'last'): void {
  const list = ids.filter((id) => trackById(id));
  if (list.length === 0) return;
  const { currentId, order, queue, index } = player.get();
  if (!currentId || order.length === 0) {
    playContext(list, list[0]);
    return;
  }
  const orderAt = where === 'next' ? index + 1 : order.length;
  const queueAt = where === 'next' ? queue.indexOf(currentId) + 1 : queue.length;
  player.set({
    order: [...order.slice(0, orderAt), ...list, ...order.slice(orderAt)],
    queue: [...queue.slice(0, queueAt), ...list, ...queue.slice(queueAt)],
  });
  toast(where === 'next' ? 'Will play next' : 'Added to queue', 'success');
}

export const playNext = (ids: string[]) => insertIntoQueue(ids, 'next');
export const addToQueue = (ids: string[]) => insertIntoQueue(ids, 'last');

export function removeFromQueue(position: number): void {
  const { order, queue, index } = player.get();
  const id = order[position];
  if (id === undefined) return;
  if (position === index) {
    const remaining = order.filter((_, i) => i !== position);
    if (remaining.length === 0) return stopCompletely();
    const queueAt = queue.indexOf(id);
    player.set({
      order: remaining,
      queue: queue.filter((_, i) => i !== queueAt),
      index: Math.min(position, remaining.length - 1),
    });
    void loadAndPlay(remaining[Math.min(position, remaining.length - 1)]);
    return;
  }
  const queueAt = queue.indexOf(id);
  player.set({
    order: order.filter((_, i) => i !== position),
    queue: queue.filter((_, i) => i !== queueAt),
    index: position < index ? index - 1 : index,
  });
}

export function clearUpcoming(): void {
  const { order, index, queue, currentId } = player.get();
  if (index < 0) return;
  const keep = order.slice(0, index + 1);
  const keepSet = new Set(keep);
  player.set({
    order: keep,
    queue: queue.filter((id) => keepSet.has(id) || id === currentId),
  });
}

onTracksRemoved((ids) => {
  const gone = new Set(ids);
  const { currentId, order, queue, index } = player.get();
  if (order.length === 0) return;
  const removedBefore = order.slice(0, index).filter((id) => gone.has(id)).length;
  const remaining = order.filter((id) => !gone.has(id));
  const remainingQueue = queue.filter((id) => !gone.has(id));
  if (remaining.length === 0) return stopCompletely();
  if (currentId && gone.has(currentId)) {
    const nextIndex = Math.min(Math.max(0, index - removedBefore), remaining.length - 1);
    player.set({ order: remaining, queue: remainingQueue, index: nextIndex });
    void loadAndPlay(remaining[nextIndex], !audio.paused);
  } else {
    player.set({ order: remaining, queue: remainingQueue, index: index - removedBefore });
  }
});

/* ---------- audio element events ---------- */

audio.addEventListener('playing', () => {
  failStreak = 0;
  const { currentId } = player.get();
  player.set({ playing: true, loading: false });
  if (currentId && recordedFor !== currentId) {
    recordedFor = currentId;
    pushRecent(currentId);
  }
});
audio.addEventListener('pause', () => {
  if (!audio.ended) player.set({ playing: false });
});
audio.addEventListener('waiting', () => player.set({ loading: true }));
audio.addEventListener('canplay', () => player.set({ loading: false }));
audio.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audio.duration)) player.set({ duration: audio.duration });
});
audio.addEventListener('ended', () => {
  if (player.get().repeat === 'one') {
    audio.currentTime = 0;
    audio.play().catch(() => player.set({ playing: false }));
    return;
  }
  recordedFor = null;
  next(true);
});
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  const id = player.get().currentId;
  if (id) handleUnplayable(id, 'This format isn’t supported by your browser.');
});

/* ---------- system media controls ---------- */

function updateMediaSession(track: Track | null): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = track
    ? new MediaMetadata({ title: track.title, artist: track.artist, album: track.album })
    : null;
  if (track?.artId) {
    // Add the cover to the system media controls once it has loaded.
    void getArtworkUrl(track.artId).then((src) => {
      if (!src || player.get().currentId !== track.id) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [{ src }],
      });
    });
  }
}

if ('mediaSession' in navigator) {
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => togglePlay()],
    ['pause', () => audio.pause()],
    ['previoustrack', () => previous()],
    ['nexttrack', () => next()],
    ['seekto', (d) => seek(d.seekTime ?? 0)],
  ];
  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Not every browser supports every action.
    }
  }
}

/* ---------- persistence of preferences ---------- */

player.subscribe(() => {
  const { volume, muted, rate, shuffle, repeat } = player.get();
  saveJSON('player', { volume, muted, rate, shuffle, repeat } satisfies SavedPrefs);
});
