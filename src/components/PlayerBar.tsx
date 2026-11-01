import { useEffect, useState } from 'react';
import { useStore } from '../lib/createStore';
import { formatTime } from '../lib/format';
import { albumKeyOf, artistKeyOf } from '../lib/derive';
import { paths } from '../lib/router';
import { library, toggleFavorite, trackById, useFavoriteSet } from '../store/library';
import {
  PLAYBACK_RATES,
  audio,
  cycleRepeat,
  next,
  player,
  previous,
  seek,
  setRate,
  setVolume,
  toggleMute,
  togglePlay,
  toggleShuffle,
} from '../store/player';
import { openPanel, ui, type AnchorRect } from '../store/ui';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { MenuItems, Popover, rectOf } from './Popover';
import { Slider } from './Slider';

/** Current playback position, refreshed ~10 times a second while playing. */
function useAudioTime(): number {
  const playing = useStore(player, (s) => s.playing);
  const currentId = useStore(player, (s) => s.currentId);
  const [time, setTime] = useState(() => audio.currentTime);

  useEffect(() => {
    const sync = () => setTime(audio.currentTime);
    sync();
    audio.addEventListener('seeked', sync);
    audio.addEventListener('emptied', sync);
    audio.addEventListener('loadedmetadata', sync);
    let raf = 0;
    if (playing) {
      const tick = () => {
        setTime((prev) => (Math.abs(audio.currentTime - prev) >= 0.1 ? audio.currentTime : prev));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      audio.removeEventListener('seeked', sync);
      audio.removeEventListener('emptied', sync);
      audio.removeEventListener('loadedmetadata', sync);
    };
  }, [playing, currentId]);

  return time;
}

function SeekBar() {
  const time = useAudioTime();
  const duration = useStore(player, (s) => s.duration);
  const currentId = useStore(player, (s) => s.currentId);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? time;
  const total = duration || 0;

  return (
    <div className="seek-row">
      <span className="time" aria-hidden="true">
        {formatTime(shown)}
      </span>
      <Slider
        className="seek"
        label="Seek"
        value={time}
        max={total}
        step={5}
        disabled={!currentId || total <= 0}
        valueText={`${formatTime(shown)} of ${formatTime(total)}`}
        onPreview={setPreview}
        onCommit={seek}
      />
      <span className="time" aria-hidden="true">
        {formatTime(total)}
      </span>
    </div>
  );
}

function VolumeControl() {
  const volume = useStore(player, (s) => s.volume);
  const muted = useStore(player, (s) => s.muted);
  const level = muted ? 0 : volume;
  const icon = level === 0 ? 'volumeMute' : level < 0.5 ? 'volumeLow' : 'volume';
  return (
    <div className="volume">
      <button
        type="button"
        className="icon-btn"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
      >
        <Icon name={icon} size={19} />
      </button>
      <Slider
        className="volume-slider"
        label="Volume"
        value={level * 100}
        max={100}
        step={5}
        live
        valueText={`${Math.round(level * 100)} percent`}
        onCommit={(v) => setVolume(v / 100)}
      />
    </div>
  );
}

function SpeedControl() {
  const rate = useStore(player, (s) => s.rate);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <>
      <button
        type="button"
        data-popover-trigger
        className="speed-btn"
        onClick={(e) => setAnchor(anchor ? null : rectOf(e.currentTarget))}
        aria-label={`Playback speed ${rate}x`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
      >
        {rate}x
      </button>
      {anchor && (
        <Popover anchor={anchor} align="end" preferAbove label="Playback speed" onClose={() => setAnchor(null)}>
          <MenuItems
            entries={PLAYBACK_RATES.map((r) => ({
              id: String(r),
              label: r === 1 ? 'Normal (1x)' : `${r}x`,
              checked: r === rate,
              onSelect: () => {
                setRate(r);
                setAnchor(null);
              },
            }))}
          />
        </Popover>
      )}
    </>
  );
}

export function PlayerBar() {
  const currentId = useStore(player, (s) => s.currentId);
  const playing = useStore(player, (s) => s.playing);
  const loading = useStore(player, (s) => s.loading);
  const shuffle = useStore(player, (s) => s.shuffle);
  const repeat = useStore(player, (s) => s.repeat);
  const panel = useStore(ui, (s) => s.panel);
  const tracks = useStore(library, (s) => s.tracks);
  const favorites = useFavoriteSet();
  const track = currentId ? trackById(currentId) : undefined;
  void tracks; // re-render if the current track's metadata changes

  const idle = !track;

  return (
    <footer className="player" aria-label="Music player">
      <div className="player-info">
        {track ? (
          <>
            <Artwork seed={track.album} size={56} className="player-art" artId={track.artId} />
            <div className="player-text">
              <div className="player-title" title={track.title}>
                {track.title}
              </div>
              <div className="player-sub" title={track.artist}>
                <a href={paths.artist(artistKeyOf(track.artist))}>{track.artist}</a>
              </div>
              <div className="player-album" title={track.album}>
                <a href={paths.album(albumKeyOf(track.album))}>{track.album}</a>
              </div>
            </div>
            <button
              type="button"
              className={`icon-btn player-fav${favorites.has(track.id) ? ' on' : ''}`}
              onClick={() => toggleFavorite(track.id)}
              aria-label={favorites.has(track.id) ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorites.has(track.id)}
            >
              <Icon name="heart" size={19} filled={favorites.has(track.id)} />
            </button>
          </>
        ) : (
          <>
            <div className="player-art player-art-empty" aria-hidden="true">
              <Icon name="songs" size={22} />
            </div>
            <div className="player-text">
              <div className="player-title muted">Nothing playing</div>
              <div className="player-sub">Pick a song to get started</div>
            </div>
          </>
        )}
      </div>

      <div className="player-center">
        <div className="transport">
          <button
            type="button"
            className={`icon-btn toggle${shuffle ? ' on' : ''}`}
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title="Shuffle"
          >
            <Icon name="shuffle" size={19} />
          </button>
          <button type="button" className="icon-btn" onClick={previous} disabled={idle} aria-label="Previous" title="Previous">
            <Icon name="prev" size={22} />
          </button>
          <button
            type="button"
            className={`play-btn${loading && playing ? ' is-loading' : ''}`}
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={24} />
          </button>
          <button type="button" className="icon-btn" onClick={() => next()} disabled={idle} aria-label="Next" title="Next">
            <Icon name="next" size={22} />
          </button>
          <button
            type="button"
            className={`icon-btn toggle${repeat !== 'off' ? ' on' : ''}`}
            onClick={cycleRepeat}
            aria-label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            aria-pressed={repeat !== 'off'}
            title={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          >
            <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={19} />
          </button>
        </div>
        <SeekBar />
      </div>

      <div className="player-extra">
        <button
          type="button"
          className={`icon-btn toggle${panel === 'lyrics' ? ' on' : ''}`}
          onClick={() => openPanel('lyrics')}
          aria-label="Lyrics"
          aria-pressed={panel === 'lyrics'}
          title="Lyrics"
        >
          <Icon name="lyrics" size={19} />
        </button>
        <button
          type="button"
          className={`icon-btn toggle${panel === 'sound' ? ' on' : ''}`}
          onClick={() => openPanel('sound')}
          aria-label="Equalizer and sound settings"
          aria-pressed={panel === 'sound'}
          title="Equalizer and sound (E)"
        >
          <Icon name="sliders" size={19} />
        </button>
        <button
          type="button"
          className={`icon-btn toggle${panel === 'queue' ? ' on' : ''}`}
          onClick={() => openPanel('queue')}
          aria-label="Queue"
          aria-pressed={panel === 'queue'}
          title="Queue"
        >
          <Icon name="queue" size={19} />
        </button>
        <SpeedControl />
        <VolumeControl />
      </div>
    </footer>
  );
}
