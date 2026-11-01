import { useState } from 'react';
import { useStore } from '../lib/createStore';
import { formatTime, plural } from '../lib/format';
import { trackById } from '../store/library';
import { clearUpcoming, jumpTo, moveInQueue, player, removeFromQueue } from '../store/player';
import { closePanel, ui } from '../store/ui';
import { Artwork } from './Artwork';
import { Equalizer } from './common';
import { Icon } from './Icon';
import { SoundView } from './SoundPanel';

const UPCOMING_LIMIT = 100;

function QueueView() {
  const order = useStore(player, (s) => s.order);
  const index = useStore(player, (s) => s.index);
  const playing = useStore(player, (s) => s.playing);
  const current = index >= 0 ? trackById(order[index]) : undefined;
  const upcoming = order.slice(index + 1);
  const shown = upcoming.slice(0, UPCOMING_LIMIT);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (!current) {
    return (
      <div className="panel-empty">
        <Icon name="queue" size={28} />
        <p>Your queue is empty.</p>
        <span>Play a song or use “Add to queue” on any track.</span>
      </div>
    );
  }

  return (
    <div className="queue">
      <h3 className="panel-label">Now playing</h3>
      <div className="queue-item is-current">
        <Artwork seed={current.album} size={44} artId={current.artId} />
        <div className="queue-text">
          <div className="queue-title">{current.title}</div>
          <div className="queue-sub">{current.artist}</div>
        </div>
        <Equalizer active={playing} />
      </div>

      <div className="panel-label-row">
        <h3 className="panel-label">Up next · {plural(upcoming.length, 'song')}</h3>
        {upcoming.length > 0 && (
          <button type="button" className="link-btn" onClick={clearUpcoming}>
            Clear
          </button>
        )}
      </div>
      {upcoming.length === 0 && <p className="panel-note">Nothing queued after this song.</p>}
      <ul className="queue-list">
        {shown.map((id, i) => {
          const t = trackById(id);
          if (!t) return null;
          const position = index + 1 + i;
          return (
            <li
              key={`${id}-${position}`}
              className={`queue-item${dragFrom === position ? ' dragging' : ''}${dragOver === position && dragFrom !== position ? ' drop-target' : ''}`}
              draggable
              onDragStart={(e) => {
                setDragFrom(position);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(position));
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(position);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) moveInQueue(dragFrom, position);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
            >
              <button type="button" className="queue-hit" onClick={() => jumpTo(position)} aria-label={`Play ${t.title}`}>
                <Artwork seed={t.album} size={40} artId={t.artId} />
                <div className="queue-text">
                  <div className="queue-title">{t.title}</div>
                  <div className="queue-sub">{t.artist}</div>
                </div>
                <span className="queue-time">{formatTime(t.duration)}</span>
              </button>
              <div className="queue-move">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveInQueue(position, position - 1)}
                  disabled={position === index + 1}
                  aria-label={`Move ${t.title} up`}
                >
                  <Icon name="chevronUp" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveInQueue(position, position + 1)}
                  disabled={position === order.length - 1}
                  aria-label={`Move ${t.title} down`}
                >
                  <Icon name="chevronDown" size={14} />
                </button>
              </div>
              <button
                type="button"
                className="icon-btn queue-remove"
                onClick={() => removeFromQueue(position)}
                aria-label={`Remove ${t.title} from queue`}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {upcoming.length > shown.length && (
        <p className="panel-note">…and {(upcoming.length - shown.length).toLocaleString()} more</p>
      )}
    </div>
  );
}

function LyricsView() {
  const currentId = useStore(player, (s) => s.currentId);
  const track = currentId ? trackById(currentId) : undefined;
  return (
    <div className="panel-empty">
      <Icon name="lyrics" size={28} />
      <p>Lyrics aren’t available yet</p>
      <span>
        {track ? `Lyrics for “${track.title}” will appear here ` : 'Lyrics will appear here '}
        once lyrics support is added in a later update.
      </span>
    </div>
  );
}

export function SidePanel() {
  const panel = useStore(ui, (s) => s.panel);
  if (!panel) return null;
  return (
    <>
      <div className="panel-scrim" onClick={closePanel} />
      <aside className="side-panel" aria-label={panel === 'queue' ? 'Queue' : panel === 'sound' ? 'Sound' : 'Lyrics'}>
        <header className="panel-header">
          <div className="panel-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={panel === 'queue'} className={panel === 'queue' ? 'on' : ''} onClick={() => ui.set({ panel: 'queue' })}>
              Queue
            </button>
            <button type="button" role="tab" aria-selected={panel === 'sound'} className={panel === 'sound' ? 'on' : ''} onClick={() => ui.set({ panel: 'sound' })}>
              Sound
            </button>
            <button type="button" role="tab" aria-selected={panel === 'lyrics'} className={panel === 'lyrics' ? 'on' : ''} onClick={() => ui.set({ panel: 'lyrics' })}>
              Lyrics
            </button>
          </div>
          <button type="button" className="icon-btn" onClick={closePanel} aria-label="Close panel">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="panel-body">{panel === 'queue' ? <QueueView /> : panel === 'sound' ? <SoundView /> : <LyricsView />}</div>
      </aside>
    </>
  );
}
