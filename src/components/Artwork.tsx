import { useState, type CSSProperties } from 'react';
import { hashString } from '../lib/format';
import { useStore } from '../lib/createStore';
import { library } from '../store/library';
import { useArtworkUrl } from '../store/artwork';
import { Icon } from './Icon';

interface ArtworkProps {
  /** Anything stable (usually the album or artist name) that decides the colour. */
  seed: string;
  /** Pixel size. Omit to fill the parent width as a square. */
  size?: number;
  round?: boolean;
  /** Show initials instead of a music glyph (used for artists and playlists). */
  initials?: string;
  className?: string;
  /** Embedded cover to show instead of the generated placeholder. */
  artId?: string | null;
}

/** The song's embedded cover when it has one, otherwise a deterministic, muted placeholder. */
export function Artwork({ seed, size, round, initials, className, artId }: ArtworkProps) {
  const show = useStore(library, (st) => st.settings.showArtwork);
  const url = useArtworkUrl(show ? artId : undefined);
  const [broken, setBroken] = useState<string | null>(null);
  const cover = url !== null && broken !== url ? url : null;
  const hue = hashString(seed.toLowerCase()) % 360;
  const style: CSSProperties = {
    background: `linear-gradient(145deg, hsl(${hue} 30% 33%), hsl(${(hue + 34) % 360} 34% 17%))`,
    ...(size ? { width: size, height: size } : {}),
  };
  return (
    <div
      className={`artwork${round ? ' artwork-round' : ''}${size ? '' : ' artwork-fluid'}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {cover ? (
        <img className="artwork-img" src={cover} alt="" draggable={false} onError={() => setBroken(cover)} />
      ) : initials ? (
        <span className="artwork-initials">{initials}</span>
      ) : (
        <Icon name="songs" size="38%" />
      )}
    </div>
  );
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words[0][0] + (words.length > 1 ? words[1][0] : '')).toUpperCase();
}
