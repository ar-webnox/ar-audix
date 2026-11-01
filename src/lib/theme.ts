import { saveJSON } from './storage';

/** The lightest surface accent-coloured text can land on in the current (dark) theme. */
const DARK_SURFACE = '#1e2228';
const INK_DARK = '#0b0c0f';
const INK_LIGHT = '#ffffff';

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

function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

/**
 * Turns any picked colour into a safe accent: very dark colours are lightened until they are
 * readable as text and icons on `surface`, and the colour used on top of filled accent
 * surfaces (buttons) is chosen for the best contrast.
 */
export function resolveAccent(hex: string, surface: string = DARK_SURFACE): { accent: string; ink: string } {
  let accent = hex.toLowerCase();
  for (let amount = 0.05; contrastRatio(accent, surface) < 4.5 && amount <= 1; amount += 0.05) {
    accent = lighten(hex, amount);
  }
  const ink = contrastRatio(accent, INK_DARK) >= contrastRatio(accent, INK_LIGHT) ? INK_DARK : INK_LIGHT;
  return { accent, ink };
}

/**
 * Applies the accent to the whole document. Presets are defined in CSS; a custom colour sets
 * two CSS variables that the same stylesheet derives everything else from.
 * A small snapshot is also stored so index.html can apply it before the first paint.
 */
export function applyAccent(accent: string, customColor?: string): void {
  const root = document.documentElement;
  root.dataset.accent = accent;
  if (accent === 'custom' && customColor) {
    const { accent: color, ink } = resolveAccent(customColor);
    root.style.setProperty('--accent-custom', color);
    root.style.setProperty('--accent-ink', ink);
    saveJSON('theme', { accent, color, ink });
  } else {
    root.style.removeProperty('--accent-custom');
    root.style.removeProperty('--accent-ink');
    saveJSON('theme', { accent });
  }
}
