import { useEffect, useId, useState, type CSSProperties } from 'react';

/**
 * AR AUDIX brand mark.
 *
 * Symbol: the custom angular AR monogram, one geometric construction. A slanted stem is both the
 * leg of the "A" and the stem of the "R", an angular bowl closes the "R" under the apex and a
 * diagonal leg is both the right leg of the "A" and the leg of the "R".
 *
 * Wordmark: "AUDIX" set in Audiowide (Google Fonts, SIL Open Font License 1.1, (c) The Audiowide
 * Project Authors). The glyph outlines are embedded below as SVG paths, so the wordmark is identical
 * everywhere (app, favicon-sized contexts, installed PWA), needs no font request and cannot cause
 * a layout shift or a flash of fallback text.
 *
 * Colours come from the theme tokens (--accent for the symbol, --text for the wordmark).
 * The entrance animation is pure CSS/SVG and plays once per page load (see `introPlayed`).
 */

const STEM = 'M2 60 27 4H39L14 60Z';
const BOWL =
  'M43 4H53L67 16V25L57 35H29.2L43 4ZM49 13H53L57 17V22L53 26H43.2L49 13Z';
const LEG = 'M41 39H53.5L70 60H57.5Z';
const PIECES = [
  { d: STEM, rule: 'nonzero' as const },
  { d: BOWL, rule: 'evenodd' as const },
  { d: LEG, rule: 'nonzero' as const },
];

/** Audiowide "AUDIX" outlines (cap height 20, left to right: A U D I X), already positioned and tracked. */
const WORD = [
  'M21.73 20H18.1V15.09H5.36V20H1.73V10Q1.73 7.81 2.48 5.97Q3.24 4.13 4.57 2.8Q5.91 1.48 7.74 0.74Q9.57 0 11.73 0H19.9Q20.28 0 20.61 0.14Q20.95 0.28 21.2 0.53Q21.45 0.78 21.59 1.12Q21.73 1.45 21.73 1.83ZM5.36 11.46H18.1V3.63H11.73Q11.56 3.63 11.03 3.68Q10.49 3.72 9.78 3.92Q9.08 4.11 8.3 4.52Q7.52 4.92 6.86 5.63Q6.21 6.35 5.78 7.41Q5.36 8.48 5.36 10Z',
  'M47.74 18.17Q47.74 18.56 47.6 18.9Q47.46 19.23 47.21 19.48Q46.96 19.72 46.62 19.86Q46.29 20 45.91 20H37.74Q36.58 20 35.39 19.75Q34.21 19.5 33.1 18.97Q31.99 18.45 31.01 17.64Q30.04 16.83 29.31 15.73Q28.57 14.62 28.16 13.19Q27.74 11.76 27.74 10V0H31.36V10Q31.36 11.53 31.79 12.59Q32.21 13.65 32.87 14.37Q33.52 15.08 34.31 15.48Q35.09 15.89 35.79 16.08Q36.5 16.28 37.03 16.32Q37.57 16.37 37.74 16.37H44.11V0H47.74Z',
  'M74.11 11.63Q74.11 13.46 73.47 14.99Q72.84 16.53 71.72 17.64Q70.61 18.74 69.07 19.37Q67.54 20 65.74 20H55.95Q55.56 20 55.22 19.86Q54.89 19.72 54.64 19.48Q54.4 19.23 54.26 18.9Q54.12 18.56 54.12 18.17V1.83Q54.12 1.45 54.26 1.12Q54.4 0.78 54.64 0.53Q54.89 0.28 55.22 0.14Q55.56 0 55.95 0H65.74Q67.54 0 69.07 0.63Q70.61 1.26 71.72 2.36Q72.84 3.47 73.47 5.01Q74.11 6.56 74.11 8.37ZM70.48 8.37Q70.48 7.31 70.14 6.43Q69.8 5.55 69.17 4.93Q68.54 4.31 67.67 3.97Q66.8 3.63 65.74 3.63H57.75V16.37H65.74Q66.8 16.37 67.67 16.03Q68.54 15.69 69.17 15.07Q69.8 14.45 70.14 13.58Q70.48 12.71 70.48 11.63Z',
  'M83.52 20H79.89V0H83.52Z',
  'M99.09 7.14 105.2 0H110.15L101.55 10.03L110.1 20H105.17L99.09 12.91L93.04 20H88.1L96.64 10.03L88.07 0H92.98Z'
];
const WORD_SCALE = 1.2;
/** Heights of the small waveform that sits under the wordmark. */
const BARS = [3, 5, 8, 5, 9, 12, 7, 4, 10, 12, 8, 5, 11, 7, 4, 9, 6, 3, 5, 4, 2, 3];

/** The entrance plays on the first mount after a page load only. */
let introPlayed = false;

const vars = (v: Record<string, number>) => v as unknown as CSSProperties;

function Defs({ uid, withWord }: { uid: string; withWord: boolean }) {
  return (
    <defs>
      <linearGradient id={`${uid}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="72" y2="60">
        <stop offset="0" className="lg-hi" />
        <stop offset="0.4" className="lg-base" />
        <stop offset="0.58" className="lg-lo" />
        <stop offset="0.8" className="lg-base" />
        <stop offset="1" className="lg-hi" />
      </linearGradient>
      {withWord && (
        <>
          <clipPath id={`${uid}-glyph`}>
            {WORD.map((d) => (
              <path key={d} d={d} />
            ))}
          </clipPath>
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </>
      )}
    </defs>
  );
}

function Symbol({ uid }: { uid: string }) {
  return (
    <g>
      {PIECES.map((p) => (
        <path key={p.d} className="lg-fill" d={p.d} fillRule={p.rule} fill={`url(#${uid}-metal)`} />
      ))}
    </g>
  );
}

/** The AR monogram on its own (Settings → About). */
export function LogoMark({ size = 32 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 72 64" width={(size * 72) / 64} height={size} role="img" aria-label="AR AUDIX" className="logo-mark logo-art">
      <Defs uid={uid} withWord={false} />
      <Symbol uid={uid} />
    </svg>
  );
}

/** Monogram + Audiowide AUDIX wordmark (sidebar brand). */
export function Logo({ compact = false }: { compact?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const [intro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);
  const h = compact ? 30 : 36;
  return (
    <a className="logo" href="#/" aria-label="AR AUDIX home">
      <svg
        viewBox="0 0 220 64"
        width={Math.round((h * 220) / 64)}
        height={h}
        aria-hidden="true"
        focusable="false"
        className={`logo-art${intro ? ' logo-intro' : ''}`}
      >
        <Defs uid={uid} withWord />
        <mask id={`${uid}-wm`} maskUnits="userSpaceOnUse" x="-6" y="-6" width="128" height="32">
          <linearGradient id={`${uid}-wipe`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.93" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <g transform="skewX(-20)">
            <rect className="lg-wipe" x="-110" y="-8" width="270" height="36" fill={`url(#${uid}-wipe)`} />
          </g>
        </mask>

        {/* sound-wave pulse around the symbol */}
        <circle className="lg-ring" cx="36" cy="32" r="31" />
        <circle className="lg-ring lg-ring2" cx="36" cy="32" r="31" />

        <g className="lg-sym">
          <Symbol uid={uid} />
        </g>

        {/* waveform under the wordmark */}
        <g className="lg-bars" transform="translate(87 47)">
          {BARS.map((bh, i) => (
            <g key={i} className="lg-bar" style={vars({ '--i': i })}>
              <rect className="lg-bar-in" x={i * 6} y={-bh / 2} width="2.2" height={bh} rx="1.1" style={vars({ '--i': i })} />
            </g>
          ))}
        </g>

        <g transform={`translate(83.9 11) scale(${WORD_SCALE})`} mask={`url(#${uid}-wm)`}>
          <g className="lg-slide">
            <g className="lg-word">
              {WORD.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g clipPath={`url(#${uid}-glyph)`}>
              <g className="lg-sheen">
                <rect x="-30" y="-4" width="22" height="28" fill={`url(#${uid}-sheen)`} transform="skewX(-20)" />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </a>
  );
}
