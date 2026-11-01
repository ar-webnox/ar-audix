import { saveJSON } from './storage';
import type { ThemeMode } from '../types';

export type Scheme = 'dark' | 'light';

/** The surface accent-coloured text is most likely to sit on, per scheme (the strictest case). */
const SURFACES: Record<Scheme, string> = { dark: '#1e2228', light: '#e6e3de' };
const INK_DARK = '#0b0c0f';
const INK_LIGHT = '#ffffff';
const CHROME: Record<Scheme, string> = { dark: '#0a0b0e', light: '#f5f4f1' };

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(hex: string, target: number, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([r + (target - r) * amount, g + (target - g) * amount, b + (target - b) * amount]);
}

/**
 * Turns any picked colour into a safe accent: on the dark scheme very dark colours are lightened,
 * on the light scheme very light colours are darkened, until they are readable as text and icons on
 * the scheme's surfaces. The colour used on top of filled accent surfaces (buttons) is chosen for
 * the best contrast.
 */
export function resolveAccent(hex: string, scheme: Scheme = 'dark'): { accent: string; ink: string } {
  const surface = SURFACES[scheme];
  const target = scheme === 'dark' ? 255 : 0;
  let accent = hex.toLowerCase();
  for (let amount = 0.05; contrastRatio(accent, surface) < 4.5 && amount <= 1; amount += 0.05) {
    accent = mix(hex, target, amount);
  }
  const ink = contrastRatio(accent, INK_DARK) >= contrastRatio(accent, INK_LIGHT) ? INK_DARK : INK_LIGHT;
  return { accent, ink };
}

export function systemScheme(): Scheme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const schemeOf = (mode: ThemeMode): Scheme => (mode === 'system' ? systemScheme() : mode);

export interface Appearance {
  theme: ThemeMode;
  accent: string;
  customColor?: string;
  reduceMotion?: boolean;
}

/**
 * Applies theme, accent and motion preference to the whole document at once. Presets are defined
 * in CSS; a custom colour sets two CSS variables that the same stylesheet derives everything else
 * from. A snapshot is also stored so index.html can apply it before the first paint (no flash).
 */
export function applyAppearance({ theme, accent, customColor, reduceMotion }: Appearance): void {
  const root = document.documentElement;
  const scheme = schemeOf(theme);
  root.dataset.theme = scheme;
  root.dataset.accent = accent;
  if (reduceMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[scheme]);

  let custom: Record<Scheme, { color: string; ink: string }> | undefined;
  if (accent === 'custom' && customColor) {
    const dark = resolveAccent(customColor, 'dark');
    const light = resolveAccent(customColor, 'light');
    custom = { dark: { color: dark.accent, ink: dark.ink }, light: { color: light.accent, ink: light.ink } };
    root.style.setProperty('--accent-custom', custom[scheme].color);
    root.style.setProperty('--accent-ink', custom[scheme].ink);
  } else {
    root.style.removeProperty('--accent-custom');
    root.style.removeProperty('--accent-ink');
  }
  saveJSON('theme', { mode: theme, accent, custom, motion: reduceMotion ? 'reduced' : undefined });
}
