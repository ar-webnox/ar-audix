import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Track } from '../types';
import { useStore } from '../lib/createStore';
import { formatTime } from '../lib/format';
import { albumKeyOf, artistKeyOf } from '../lib/derive';
import { paths } from '../lib/router';
import { playFrom } from '../lib/actions';
import { toggleFavorite, useFavoriteSet } from '../store/library';
import { player } from '../store/player';
import { useTags } from '../store/tags';
import { UNKNOWN_ARTIST } from '../lib/metadata';
import { openTrackMenu } from '../store/ui';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { Equalizer } from './common';

const ROW_HEIGHT = 58;
const OVERSCAN = 8;

interface RowProps {
  track: Track;
  position: number;
  current: boolean;
  playing: boolean;
  favorite: boolean;
  playlistId?: string;
  onPlay: (id: string) => void;
}

/** What the list shows: the embedded Title, else the whole file name; the embedded Artist beneath. */
function useRowLabel(track: Track): { title: string; artist: string } {
  const tags = useTags(track.id, track.embedded);
  const base = track.fileName.replace(/\.[^.]+$/, '').trim();
  // an artist that was only guessed by splitting "A - B" in the file name is not real artist data
  const guessed = base.toLowerCase().includes(`${track.artist} - ${track.title}`.toLowerCase());
  return {
    title: tags?.title || base || track.title,
    artist: tags?.artist || (guessed ? UNKNOWN_ARTIST : track.artist),
  };
}

const SongRow = memo(function SongRow({ track, position, current, playing, favorite, playlistId, onPlay }: RowProps) {
  const openMenu = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openTrackMenu(track.id, { top: r.top, left: r.left, right: r.right, bottom: r.bottom }, playlistId);
  };
  const label = useRowLabel(track);
  const onContext = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    openTrackMenu(track.id, { top: e.clientY, left: e.clientX, right: e.clientX, bottom: e.clientY }, playlistId);
  };

  return (
    <div
      className={`song-row${current ? ' is-current' : ''}`}
      style={{ transform: `translateY(${position * ROW_HEIGHT}px)`, height: ROW_HEIGHT }}
      role="row"
      aria-rowindex={position + 1}
      onDoubleClick={() => onPlay(track.id)}
      onContextMenu={onContext}
    >
      <button
        type="button"
        className="song-index"
        onClick={() => onPlay(track.id)}
        aria-label={current && playing ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        {current ? (
          <span className="song-index-now">
            <Equalizer active={playing} />
            <Icon name={playing ? 'pause' : 'play'} size={16} className="song-index-icon" />
          </span>
        ) : (
          <>
            <span className="song-num">{position + 1}</span>
            <Icon name="play" size={16} className="song-index-icon" />
          </>
        )}
      </button>
      <div className="song-main" role="cell">
        <Artwork seed={track.album} size={40} artId={track.artId} />
        <div className="song-text">
          <div className="song-title" title={label.title}>
            {label.title}
          </div>
          {label.artist === track.artist ? (
            <a className="song-artist" href={paths.artist(artistKeyOf(track.artist))}>
              {track.artist}
            </a>
          ) : (
            <span className="song-artist">{label.artist}</span>
          )}
        </div>
      </div>
      <a className="song-album" role="cell" href={paths.album(albumKeyOf(track.album))} title={track.album}>
        {track.album}
      </a>
      <button
        type="button"
        className={`icon-btn song-fav${favorite ? ' on' : ''}`}
        onClick={() => toggleFavorite(track.id)}
        aria-label={favorite ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
        aria-pressed={favorite}
      >
        <Icon name="heart" size={18} filled={favorite} />
      </button>
      <span className="song-duration" role="cell">
        {track.duration > 0 ? formatTime(track.duration) : '–:––'}
      </span>
      <button
        type="button"
        data-popover-trigger
        className="icon-btn song-more"
        onClick={openMenu}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
      >
        <Icon name="more" size={18} />
      </button>
    </div>
  );
});

interface SongListProps {
  tracks: Track[];
  /** Set on playlist pages so the menu can offer "Remove from this playlist". */
  playlistId?: string;
}

/** A windowed song table: only the rows near the viewport are in the DOM. */
export function SongList({ tracks, playlistId }: SongListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(tracks.length, 30) });
  const currentId = useStore(player, (s) => s.currentId);
  const playing = useStore(player, (s) => s.playing);
  const favorites = useFavoriteSet();

  const ids = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onPlay = useCallback((id: string) => playFrom(idsRef.current, id), []);

  useLayoutEffect(() => {
    const el = listRef.current;
    const root = el?.closest<HTMLElement>('[data-scroll-root]');
    if (!el || !root) return;
    const update = () => {
      const offset = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(-offset / ROW_HEIGHT) - OVERSCAN);
      const last = Math.min(tracks.length, Math.ceil((-offset + root.clientHeight) / ROW_HEIGHT) + OVERSCAN);
      setRange((prev) => (prev.start === first && prev.end === last ? prev : { start: first, end: last }));
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      root.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tracks.length]);

  const visible = tracks.slice(range.start, range.end);

  return (
    <div className="song-table" role="table" aria-label="Songs" aria-rowcount={tracks.length}>
      <div className="song-head" role="row">
        <span className="song-head-index">#</span>
        <span>Title</span>
        <span className="song-head-album">Album</span>
        <span />
        <span className="song-head-duration">
          <Icon name="clock" size={15} />
        </span>
        <span />
      </div>
      <div ref={listRef} className="song-body" style={{ height: tracks.length * ROW_HEIGHT }}>
        {visible.map((track, i) => (
          <SongRow
            key={track.id}
            track={track}
            position={range.start + i}
            current={track.id === currentId}
            playing={playing}
            favorite={favorites.has(track.id)}
            playlistId={playlistId}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}
