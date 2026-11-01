import { createStore } from '../lib/createStore';
import { db } from '../lib/db';
import { loadJSON, saveJSON } from '../lib/storage';
import { clamp } from '../lib/format';
import { getArtworkUrl } from './artwork';
import { library, onTracksRemoved, pushRecent, trackById } from './library';
import { toast } from './ui';
import { fx, registerDecks, resumeAudio } from './fx';
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
  /** Changes whenever playback moves to the other audio element, so listeners can re-attach. */
  deck: number;
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
  deck: 0,
});

/**
 * Playback uses two HTML5 audio elements ("decks"): one plays, the other preloads the next song
 * so it can start instantly (gapless) or overlap the end of the current one (crossfade).
 * `audio` always points at the deck that is currently playing.
 */
function makeDeck(): HTMLAudioElement {
  const el = new Audio();
  el.preload = 'auto';
  el.volume = player.get().volume;
  el.muted = player.get().muted;
  el.defaultPlaybackRate = player.get().rate;
  el.playbackRate = player.get().rate;
  return el;
}
const decks = [makeDeck(), makeDeck()];
registerDecks(decks);
export let audio: HTMLAudioElement = decks[0];

const deckUrls = new Map<HTMLAudioElement, string>();
let preload: { id: string; deck: HTMLAudioElement } | null = null;
let transition: { outgoing: HTMLAudioElement; incoming: HTMLAudioElement; timer: ReturnType<typeof setInterval> } | null = null;
let resumeAt: { id: string; time: number } | null = null;
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

function setDeckSource(deck: HTMLAudioElement, file: Blob | null): void {
  const old = deckUrls.get(deck);
  if (old) {
    URL.revokeObjectURL(old);
    deckUrls.delete(deck);
  }
  if (file) {
    const url = URL.createObjectURL(file);
    deckUrls.set(deck, url);
    deck.src = url;
  } else {
    deck.pause();
    deck.removeAttribute('src');
    deck.load();
  }
}

const idleDeck = () => (audio === decks[0] ? decks[1] : decks[0]);

function stopCompletely(): void {
  loadToken++;
  cancelTransition();
  clearPreload();
  setDeckSource(audio, null);
  recordedFor = null;
  resumeAt = null;
  player.set({ currentId: null, queue: [], order: [], index: -1, playing: false, loading: false, duration: 0 });
  updateMediaSession(null);
}

/* ---------- gapless & crossfade ---------- */

/** The song that will follow the current one, or null at the end of the queue (or on repeat one). */
function wantedNext(): string | null {
  const { order, index, repeat } = player.get();
  if (index < 0 || repeat === 'one' || order.length < 2) return null;
  if (index + 1 < order.length) return order[index + 1];
  return repeat === 'all' ? order[0] : null;
}

function clearPreload(): void {
  preloadToken++;
  if (preload) {
    setDeckSource(preload.deck, null);
    preload = null;
  }
}

let preloadToken = 0;
let preloadTimer: ReturnType<typeof setTimeout> | undefined;

/** Loads the upcoming song into the idle deck so it is ready to start without a gap. */
async function preloadNext(): Promise<void> {
  const id = wantedNext();
  if (!id || transition) return;
  if (preload?.id === id) return;
  clearPreload();
  const token = preloadToken;
  const file = await db.getFile(id);
  if (token !== preloadToken || !file || transition) return;
  const deck = idleDeck();
  setDeckSource(deck, file);
  deck.volume = 0;
  deck.defaultPlaybackRate = player.get().rate;
  deck.playbackRate = player.get().rate;
  deck.load();
  preload = { id, deck };
}

function schedulePreload(): void {
  clearTimeout(preloadTimer);
  preloadTimer = setTimeout(() => void preloadNext(), 500);
}

/** Ends a crossfade at once: the old deck is silenced and the new one plays at full volume. */
function cancelTransition(): void {
  if (!transition) return;
  const { outgoing, incoming, timer } = transition;
  clearInterval(timer);
  transition = null;
  setDeckSource(outgoing, null);
  incoming.volume = player.get().volume;
  outgoing.volume = player.get().volume;
  schedulePreload();
}

function startTransition(seconds: number): void {
  const id = wantedNext();
  if (!id || !preload || preload.id !== id || transition || preload.deck.readyState < 3) return;
  const incoming = preload.deck;
  const outgoing = audio;
  preload = null;
  const { order, index } = player.get();
  const nextIndex = index + 1 < order.length ? index + 1 : 0;
  const track = trackById(id);
  const target = () => player.get().volume;

  audio = incoming;
  recordedFor = null;
  failStreak = 0;
  player.set({ currentId: id, index: nextIndex, duration: track?.duration ?? 0, deck: player.get().deck + 1, loading: false });
  updateMediaSession(track ?? null);
  incoming.volume = seconds > 0 ? 0 : target();
  incoming.play().catch(() => {
    // Could not start the preloaded deck: fall back to a normal load of the same song.
    cancelTransition();
    void loadAndPlay(id);
  });

  const started = performance.now();
  const timer = setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / (seconds * 1000 || 1));
    // Equal-power curves keep the perceived loudness steady through the overlap.
    incoming.volume = target() * Math.sin((t * Math.PI) / 2);
    outgoing.volume = target() * Math.cos((t * Math.PI) / 2);
    if (t >= 1) cancelTransition();
  }, 40);
  transition = { outgoing, incoming, timer };
  if (seconds === 0) {
    // Gapless: nothing to fade, just let the old deck finish silently.
    outgoing.volume = 0;
    cancelTransition();
  }
  schedulePreload();
}

let gaplessTimer: ReturnType<typeof setTimeout> | undefined;

/** Watches the playing deck and starts the next song just before this one ends. */
setInterval(() => {
  if (transition || audio.paused || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const { crossfade, gapless } = fx.get();
  const remaining = (audio.duration - audio.currentTime) / (audio.playbackRate || 1);
  let overlap = Math.min(crossfade, audio.duration / 3);
  if (overlap < 1) overlap = 0;
  if (overlap === 0 && !gapless) return;
  if (!preload || preload.id !== wantedNext()) return;
  if (overlap > 0) {
    if (remaining <= overlap) startTransition(overlap);
  } else if (remaining <= 0.4 && gaplessTimer === undefined) {
    // Start the next song on the exact end of this one rather than on the next poll.
    gaplessTimer = setTimeout(() => {
      gaplessTimer = undefined;
      if (!audio.paused) startTransition(0);
    }, Math.max(0, remaining * 1000 - 30));
  }
}, 150);

/* ---------- loading ---------- */

async function loadAndPlay(id: string, autoplay = true): Promise<void> {
  const token = ++loadToken;
  cancelTransition();
  clearTimeout(gaplessTimer);
  gaplessTimer = undefined;
  const track = trackById(id);
  player.set({ currentId: id, loading: true, duration: track?.duration ?? 0 });
  const file = track ? await db.getFile(id) : null;
  if (token !== loadToken) return;
  if (!track || !file) {
    handleUnplayable(id, 'The file is no longer available.');
    return;
  }
  const deck = audio;
  setDeckSource(deck, file);
  deck.volume = player.get().volume;
  deck.defaultPlaybackRate = player.get().rate;
  deck.playbackRate = player.get().rate;
  if (resumeAt && resumeAt.id === id) {
    const time = resumeAt.time;
    resumeAt = null;
    deck.addEventListener(
      'loadedmetadata',
      () => {
        if (Number.isFinite(deck.duration) && time < deck.duration - 1) deck.currentTime = time;
      },
      { once: true },
    );
  }
  updateMediaSession(track);
  schedulePreload();
  if (!autoplay) {
    player.set({ playing: false, loading: false });
    return;
  }
  try {
    await deck.play();
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
  if (!transition) audio.volume = volume;
  decks.forEach((d) => (d.muted = volume === 0));
  player.set({ volume, muted: volume === 0 });
}

export function toggleMute(): void {
  const muted = !player.get().muted;
  if (!muted && player.get().volume === 0) {
    setVolume(0.5);
    return;
  }
  decks.forEach((d) => (d.muted = muted));
  player.set({ muted });
}

export function nudgeVolume(delta: number): void {
  const { volume, muted } = player.get();
  setVolume((muted ? 0 : volume) + delta);
}

export function setRate(rate: number): void {
  decks.forEach((d) => {
    d.defaultPlaybackRate = rate;
    d.playbackRate = rate;
  });
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

/** Moves an upcoming song to another position in the queue. Positions index into the play order. */
export function moveInQueue(from: number, to: number): void {
  const { order, queue, index, shuffle } = player.get();
  if (from <= index || to <= index || from >= order.length || to >= order.length || from === to) return;
  const moved = [...order];
  const [id] = moved.splice(from, 1);
  moved.splice(to, 0, id);
  player.set({ order: moved, queue: shuffle ? queue : moved });
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

let lastResumeSave = 0;

function wire(el: HTMLAudioElement): void {
  // Only the deck that is currently playing may change player state.
  const live = (fn: () => void) => () => {
    if (el === audio) fn();
  };
  el.addEventListener(
    'playing',
    live(() => {
      failStreak = 0;
      const { currentId } = player.get();
      player.set({ playing: true, loading: false });
      resumeAudio();
      if (currentId && recordedFor !== currentId) {
        recordedFor = currentId;
        pushRecent(currentId);
      }
    }),
  );
  el.addEventListener('pause', live(() => !el.ended && player.set({ playing: false })));
  el.addEventListener('waiting', live(() => player.set({ loading: true })));
  el.addEventListener('canplay', live(() => player.set({ loading: false })));
  el.addEventListener(
    'loadedmetadata',
    live(() => {
      if (Number.isFinite(el.duration)) player.set({ duration: el.duration });
    }),
  );
  el.addEventListener(
    'timeupdate',
    live(() => {
      const now = Date.now();
      const { currentId } = player.get();
      if (currentId && now - lastResumeSave > 2000) {
        lastResumeSave = now;
        saveJSON('resume', { id: currentId, time: el.currentTime });
      }
    }),
  );
  el.addEventListener(
    'ended',
    live(() => {
      if (player.get().repeat === 'one') {
        el.currentTime = 0;
        el.play().catch(() => player.set({ playing: false }));
        return;
      }
      recordedFor = null;
      next(true);
    }),
  );
  el.addEventListener('error', () => {
    if (!el.getAttribute('src')) return;
    if (el !== audio) {
      // A preloaded song that can't be decoded: forget it; it will be reported when it is reached.
      if (preload?.deck === el) clearPreload();
      return;
    }
    const id = player.get().currentId;
    if (id) handleUnplayable(id, 'This format isn’t supported by your browser.');
  });
}
decks.forEach(wire);

// Re-plan the preload whenever the upcoming song, queue or repeat mode changes.
let plannedFor = '';
player.subscribe(() => {
  const key = `${player.get().currentId}|${wantedNext()}`;
  if (key === plannedFor) return;
  plannedFor = key;
  if (preload && preload.id !== wantedNext()) clearPreload();
  if (player.get().currentId) schedulePreload();
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

/* ---------- queue & position survive a refresh ---------- */

interface SavedQueue {
  queue: string[];
  order: string[];
  index: number;
  currentId: string | null;
}

let queueTimer: ReturnType<typeof setTimeout> | undefined;
let savedRefs: unknown[] = [];
player.subscribe(() => {
  const { queue, order, index, currentId } = player.get();
  const refs = [queue, order, index, currentId];
  if (refs.every((r, i) => r === savedRefs[i])) return;
  savedRefs = refs;
  clearTimeout(queueTimer);
  queueTimer = setTimeout(() => saveJSON('queue', { queue, order, index, currentId } satisfies SavedQueue), 300);
});

/** Puts the queue and the current song back (paused, at the saved position) after the library has loaded. */
export function restoreSession(): void {
  if (player.get().currentId) return;
  const saved = loadJSON<Partial<SavedQueue>>('queue', {});
  const resume = loadJSON<{ id?: string; time?: number }>('resume', {});
  const known = (id: unknown): id is string => typeof id === 'string' && trackById(id) !== undefined;
  if (!Array.isArray(saved.order) || !known(saved.currentId)) return;
  const order = saved.order.filter(known);
  const queue = (Array.isArray(saved.queue) ? saved.queue : order).filter(known);
  const currentId = saved.currentId;
  const index = order[saved.index ?? -1] === currentId ? (saved.index as number) : order.indexOf(currentId);
  if (index < 0) return;
  player.set({ queue, order, index });
  if (resume.id === currentId && typeof resume.time === 'number') resumeAt = { id: currentId, time: resume.time };
  void loadAndPlay(currentId, false);
}
