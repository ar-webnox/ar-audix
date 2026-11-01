import { createStore } from '../lib/createStore';
import { loadJSON, saveJSON } from '../lib/storage';
import { clamp } from '../lib/format';

/** Centre frequencies of the 10-band equalizer, in Hz. */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_RANGE = 12; // dB, either direction

export const EQ_PRESETS: { id: string; label: string; gains: number[] }[] = [
  { id: 'normal', label: 'Normal', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Bass Boost', gains: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] },
  { id: 'pop', label: 'Pop', gains: [-1, 2, 4, 5, 3, 0, -1, -1, -2, -2] },
  { id: 'rock', label: 'Rock', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
  { id: 'classical', label: 'Classical', gains: [0, 0, 0, 0, 0, 0, -3, -3, -3, -5] },
  { id: 'vocal', label: 'Vocal', gains: [-2, -3, -3, 1, 4, 4, 3, 1, 0, -1] },
];

export const MAX_CROSSFADE = 12;

interface FxState {
  /** A preset id, or 'custom' when the sliders were moved by hand. */
  preset: string;
  gains: number[];
  /** Seconds of overlap between songs; 0 turns crossfade off. */
  crossfade: number;
  /** Start the next song the instant this one ends (when crossfade is off). */
  gapless: boolean;
  /** 'off': audio plays directly; 'ready': routed through the equalizer graph. */
  graph: 'off' | 'ready' | 'unavailable';
}

type Saved = Pick<FxState, 'preset' | 'gains' | 'crossfade' | 'gapless'>;
const saved = loadJSON<Partial<Saved>>('fx', {});
const savedGains =
  Array.isArray(saved.gains) && saved.gains.length === EQ_BANDS.length
    ? saved.gains.map((g) => clamp(Number(g) || 0, -EQ_RANGE, EQ_RANGE))
    : EQ_PRESETS[0].gains;

export const fx = createStore<FxState>({
  preset: typeof saved.preset === 'string' ? saved.preset : 'normal',
  gains: savedGains,
  crossfade: clamp(Number(saved.crossfade) || 0, 0, MAX_CROSSFADE),
  gapless: saved.gapless !== false,
  graph: 'off',
});

fx.subscribe(() => {
  const { preset, gains, crossfade, gapless } = fx.get();
  saveJSON('fx', { preset, gains, crossfade, gapless } satisfies Saved);
});

/* ---------- Web Audio graph ----------
 * Each deck's <audio> element feeds: 10 filters -> analyser -> speakers.
 * The graph is only built once it is needed (a non-flat equalizer or the visualizer), because an
 * element routed into a context can't be un-routed. Until then playback is completely untouched. */

const decks = new Set<HTMLAudioElement>();
let ctx: AudioContext | null = null;
let filters: BiquadFilterNode[] = [];
let analyser: AnalyserNode | null = null;
let building: Promise<boolean> | null = null;

export function registerDecks(elements: HTMLAudioElement[]): void {
  elements.forEach((el) => decks.add(el));
}

const isFlat = (gains: number[]) => gains.every((g) => g === 0);

/** True when the audio must go through the graph to sound right. */
export const needsGraph = () => !isFlat(fx.get().gains);

function applyGains(): void {
  if (!ctx || filters.length === 0) return;
  const { gains } = fx.get();
  filters.forEach((f, i) => f.gain.setTargetAtTime(gains[i] ?? 0, ctx!.currentTime, 0.015));
}

/** Builds the graph on first use. Resolves false when it could not be started (try again later). */
export function ensureGraph(): Promise<boolean> {
  if (fx.get().graph === 'ready') return Promise.resolve(true);
  if (fx.get().graph === 'unavailable') return Promise.resolve(false);
  building ??= (async () => {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        fx.set({ graph: 'unavailable' });
        return false;
      }
      ctx ??= new Ctor();
      if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
      // A context that refuses to run would silence everything routed into it, so don't route yet.
      if (ctx.state !== 'running') return false;
      filters = EQ_BANDS.map((freq, i) => {
        const f = ctx!.createBiquadFilter();
        f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = fx.get().gains[i] ?? 0;
        return f;
      });
      filters.forEach((f, i) => i > 0 && filters[i - 1].connect(f));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      filters[filters.length - 1].connect(analyser);
      analyser.connect(ctx.destination);
      for (const el of decks) ctx.createMediaElementSource(el).connect(filters[0]);
      fx.set({ graph: 'ready' });
      return true;
    } catch {
      fx.set({ graph: 'unavailable' });
      return false;
    } finally {
      building = null;
    }
  })();
  return building;
}

/** Called when playback starts, so a context the browser suspended never leaves the player silent. */
export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  else if (!ctx && needsGraph()) void ensureGraph();
}

export function setPreset(id: string): void {
  const preset = EQ_PRESETS.find((p) => p.id === id);
  if (!preset) return;
  fx.set({ preset: id, gains: [...preset.gains] });
  if (!isFlat(preset.gains)) void ensureGraph().then(applyGains);
  else applyGains();
}

export function setBandGain(band: number, gain: number): void {
  const gains = [...fx.get().gains];
  gains[band] = clamp(Math.round(gain * 2) / 2, -EQ_RANGE, EQ_RANGE);
  const match = EQ_PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]));
  fx.set({ gains, preset: match ? match.id : 'custom' });
  void ensureGraph().then(applyGains);
}

export const setCrossfade = (seconds: number) => fx.set({ crossfade: clamp(Math.round(seconds), 0, MAX_CROSSFADE) });
export const setGapless = (on: boolean) => fx.set({ gapless: on });

let spectrum = new Uint8Array(0);

/** The current spectrum (0-255 per bin), or null when no analyser is running. */
export function readSpectrum(): Uint8Array | null {
  if (!analyser || !ctx || ctx.state !== 'running') return null;
  if (spectrum.length !== analyser.frequencyBinCount) spectrum = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(spectrum);
  return spectrum;
}
