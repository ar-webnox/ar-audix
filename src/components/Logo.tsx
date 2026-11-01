import { useEffect, useId, useState, type CSSProperties } from 'react';

/**
 * AR AUDIX brand mark.
 *
 * The monogram is one geometric construction: a slanted stem that is both the leg of the "A"
 * and the stem of the "R", an angular bowl that closes the "R" under the apex, and a diagonal
 * leg that is both the right leg of the "A" and the leg of the "R". The AUDIX wordmark is drawn
 * as custom angular letterforms (no web font), so it stays crisp and identical everywhere.
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

/** Wordmark letterforms, cap height 20, stroke 4.4, positioned left to right. */
const LETTERS: { x: number; d: string }[] = [
  { x: 0, d: 'M1.4 20 9 0 16.6 20M4.8 13.8h8.4' },
  { x: 22.2, d: 'M2.2 0V14.2L6 17.8h5.8l3.8-3.6V0' },
  { x: 44.4, d: 'M2.2 2.2h8.2l6.1 6v3.8l-6.1 6H2.2Z' },
  { x: 68.4, d: 'M2.2 0V20' },
  { x: 77.6, d: 'M1.6 0 15.4 20M15.4 0 1.6 20' },
];

/** The entrance plays on the first mount after a page load only. */
let introPlayed = false;

const vars = (v: Record<string, number>) => v as unknown as CSSProperties;

function Defs({ uid, withClip }: { uid: string; withClip: boolean }) {
  return (
    <defs>
      <linearGradient id={`${uid}-metal`} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="72" y2="60">
        <stop offset="0" className="lg-hi" />
        <stop offset="0.4" className="lg-base" />
        <stop offset="0.58" className="lg-lo" />
        <stop offset="0.8" className="lg-base" />
        <stop offset="1" className="lg-hi" />
      </linearGradient>
      {withClip && (
        <>
          <clipPath id={`${uid}-glyph`}>
            {PIECES.map((p) => (
              <path key={p.d} d={p.d} clipRule={p.rule} />
            ))}
          </clipPath>
          <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </>
      )}
    </defs>
  );
}

function Symbol({ uid, animated }: { uid: string; animated: boolean }) {
  return (
    <g>
      {PIECES.map((p, i) => (
        <path key={p.d} className="lg-fill" d={p.d} fillRule={p.rule} fill={`url(#${uid}-metal)`} style={vars({ '--i': i })} />
      ))}
      {animated &&
        PIECES.map((p, i) => (
          <path key={`o${p.d}`} className="lg-ol" d={p.d} pathLength={100} style={vars({ '--i': i })} />
        ))}
      {animated && (
        <g clipPath={`url(#${uid}-glyph)`}>
          <g className="lg-sheen">
            <rect x="-30" y="-4" width="22" height="72" fill={`url(#${uid}-sheen)`} transform="skewX(-20)" />
          </g>
        </g>
      )}
    </g>
  );
}

/** The AR monogram on its own (Settings → About). */
export function LogoMark({ size = 32 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 72 64" width={(size * 72) / 64} height={size} role="img" aria-label="AR AUDIX" className="logo-mark logo-art">
      <Defs uid={uid} withClip={false} />
      <Symbol uid={uid} animated={false} />
    </svg>
  );
}

/** Monogram + AUDIX wordmark (sidebar brand). */
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
        viewBox="0 0 210 64"
        width={Math.round((h * 210) / 64)}
        height={h}
        aria-hidden="true"
        focusable="false"
        className={`logo-art${intro ? ' logo-intro' : ''}`}
      >
        <Defs uid={uid} withClip />
        <mask id={`${uid}-wm`} maskUnits="userSpaceOnUse" x="-6" y="-6" width="112" height="32">
          <linearGradient id={`${uid}-wipe`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.93" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <g transform="skewX(-20)">
            <rect className="lg-wipe" x="-110" y="-8" width="240" height="36" fill={`url(#${uid}-wipe)`} />
          </g>
        </mask>
        <Symbol uid={uid} animated />
        <g transform="translate(86 19) scale(1.3)" mask={`url(#${uid}-wm)`}>
          <g className="lg-slide">
            <g className="lg-word" fill="none" strokeWidth="4.4" strokeLinejoin="miter" strokeMiterlimit="6">
              {LETTERS.map((l) => (
                <path key={l.x} d={l.d} transform={`translate(${l.x} 0)`} />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </a>
  );
}
