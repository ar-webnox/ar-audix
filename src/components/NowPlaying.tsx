import { useEffect, useRef } from 'react';
import { useStore } from '../lib/createStore';
import { albumKeyOf, artistKeyOf } from '../lib/derive';
import { paths } from '../lib/router';
import { PLAYBACK_RATES, cycleRepeat, next, player, previous, setRate, setVolume, toggleMute, togglePlay, toggleShuffle } from '../store/player';
import { ensureGraph, fx } from '../store/fx';
import { toggleFavorite, trackById, useFavoriteSet } from '../store/library';
import { closeNowPlaying, openPanel, ui } from '../store/ui';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { SeekBar } from './PlayerBar';
import { Visualizer } from './SoundPanel';
import { Slider } from './Slider';

/** Full-screen Now Playing: big cover, full controls. Opened from the player bar. */
export default function NowPlaying() {
  const currentId = useStore(player, (s) => s.currentId);
  const playing = useStore(player, (s) => s.playing);
  const loading = useStore(player, (s) => s.loading);
  const shuffle = useStore(player, (s) => s.shuffle);
  const repeat = useStore(player, (s) => s.repeat);
  const volume = useStore(player, (s) => s.volume);
  const muted = useStore(player, (s) => s.muted);
  const rate = useStore(player, (s) => s.rate);
  const visualizer = useStore(fx, (s) => s.visualizer);
  const favorites = useFavoriteSet();
  const track = currentId ? trackById(currentId) : undefined;
  const root = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);

  useEffect(() => {
    root.current?.focus();
    if (visualizer) void ensureGraph();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNowPlaying();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visualizer]);

  // Nothing to show once the queue is cleared.
  useEffect(() => {
    if (!track) closeNowPlaying();
  }, [track]);

  if (!track) return null;
  const level = muted ? 0 : volume;
  const nextRate = () => setRate(PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length]);
  const open = (panel: 'queue' | 'sound' | 'lyrics') => {
    closeNowPlaying();
    if (ui.get().panel !== panel) openPanel(panel);
  };
  const link = (href: string) => () => closeNowPlaying() ?? void (location.hash = href.replace(/^#/, ''));

  return (
    <div
      ref={root}
      className="nowplaying"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      tabIndex={-1}
      onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => {
        // A downward swipe that starts near the top closes the view.
        const start = touchY.current;
        touchY.current = null;
        if (start !== null && start < 160 && e.changedTouches[0].clientY - start > 90) closeNowPlaying();
      }}
    >
      <header className="np-head">
        <button type="button" className="icon-btn" onClick={closeNowPlaying} aria-label="Close Now Playing">
          <Icon name="chevronDown" size={24} />
        </button>
        <span className="np-head-title">Now Playing</span>
        <button type="button" className="icon-btn" onClick={() => open('queue')} aria-label="Open queue">
          <Icon name="queue" size={20} />
        </button>
      </header>

      <div className="np-body">
        <div className="np-art-wrap">
          <Artwork seed={track.album} className="np-art" artId={track.artId} />
        </div>
        <div className="np-meta">
          <div className="np-titles">
            <h2 className="np-title" title={track.title}>
              {track.title}
            </h2>
            <div className="np-sub">
              <a href={paths.artist(artistKeyOf(track.artist))} onClick={link(paths.artist(artistKeyOf(track.artist)))}>
                {track.artist}
              </a>
            </div>
            <div className="np-album">
              <a href={paths.album(albumKeyOf(track.album))} onClick={link(paths.album(albumKeyOf(track.album)))}>
                {track.album}
              </a>
            </div>
          </div>
          <button
            type="button"
            className={`icon-btn np-fav${favorites.has(track.id) ? ' on' : ''}`}
            onClick={() => toggleFavorite(track.id)}
            aria-label={favorites.has(track.id) ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={favorites.has(track.id)}
          >
            <Icon name="heart" size={24} filled={favorites.has(track.id)} />
          </button>
        </div>

        <SeekBar />

        <div className="np-transport">
          <button type="button" className={`icon-btn toggle${shuffle ? ' on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
            <Icon name="shuffle" size={22} />
          </button>
          <button type="button" className="icon-btn" onClick={previous} aria-label="Previous">
            <Icon name="prev" size={28} />
          </button>
          <button type="button" className={`play-btn np-play${loading && playing ? ' is-loading' : ''}`} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={30} />
          </button>
          <button type="button" className="icon-btn" onClick={() => next()} aria-label="Next">
            <Icon name="next" size={28} />
          </button>
          <button
            type="button"
            className={`icon-btn toggle${repeat !== 'off' ? ' on' : ''}`}
            onClick={cycleRepeat}
            aria-label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            aria-pressed={repeat !== 'off'}
          >
            <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={22} />
          </button>
        </div>

        <div className="np-volume">
          <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} aria-pressed={muted}>
            <Icon name={level === 0 ? 'volumeMute' : level < 0.5 ? 'volumeLow' : 'volume'} size={22} />
          </button>
          <Slider
            className="np-volume-slider"
            label="Volume"
            value={level * 100}
            max={100}
            step={5}
            live
            valueText={`${Math.round(level * 100)} percent`}
            onCommit={(v) => setVolume(v / 100)}
          />
        </div>

        <div className="np-actions">
          <button type="button" className="chip" onClick={nextRate} aria-label={`Playback speed ${rate}x. Tap to change.`}>
            {rate}x
          </button>
          <button type="button" className="chip" onClick={() => open('sound')}>
            <Icon name="sliders" size={15} /> Sound
          </button>
          <button type="button" className="chip" onClick={() => open('queue')}>
            <Icon name="queue" size={15} /> Queue
          </button>
        </div>

        {visualizer && (
          <div className="np-viz">
            <Visualizer />
          </div>
        )}
      </div>
    </div>
  );
}
