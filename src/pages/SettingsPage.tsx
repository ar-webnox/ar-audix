import { useEffect, useState } from 'react';
import { useStore } from '../lib/createStore';
import { formatBytes, formatTotal, plural } from '../lib/format';
import { ACCENTS, clearLibrary, clearRecent, library, updateSettings, useIndex } from '../store/library';
import { askConfirm, toast } from '../store/ui';
import { Button, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← / →', 'Seek 5 seconds'],
  ['↑ / ↓', 'Volume up or down'],
  ['M', 'Mute'],
  ['N / P', 'Next or previous song'],
  ['S', 'Shuffle'],
  ['R', 'Repeat'],
  ['Q', 'Open the queue'],
  ['/', 'Focus search'],
];

export function SettingsPage() {
  const settings = useStore(library, (s) => s.settings);
  const tracks = useStore(library, (s) => s.tracks);
  const persistent = useStore(library, (s) => s.persistent);
  const index = useIndex();
  const customActive = settings.accent === 'custom';
  const customHex =
    settings.customColor ?? ACCENTS.find((a) => a.name === settings.accent)?.color ?? ACCENTS[0].color;
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
  }, [tracks.length]);

  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" />

      <section className="settings-card">
        <h2>Appearance</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">Accent colour</div>
            <div className="setting-help">Used for buttons, highlights and the progress bar.</div>
          </div>
          <div className="swatches" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.name}
                type="button"
                role="radio"
                aria-checked={settings.accent === a.name}
                aria-label={a.label}
                title={a.label}
                className={`swatch${settings.accent === a.name ? ' on' : ''}`}
                style={{ background: a.color }}
                onClick={() => updateSettings({ accent: a.name })}
              >
                {settings.accent === a.name && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row setting-row-sub">
          <div>
            <div className="setting-name">Custom colour</div>
            <div className="setting-help">
              Pick any colour. Very dark colours are lightened slightly so they stay readable on the dark theme.
            </div>
          </div>
          <label className={`custom-color${customActive ? ' on' : ''}`}>
            <input
              type="color"
              className="custom-color-input"
              aria-label="Custom accent colour"
              value={customHex}
              onClick={() => {
                if (!customActive) updateSettings({ accent: 'custom', customColor: customHex });
              }}
              onChange={(e) => updateSettings({ accent: 'custom', customColor: e.target.value })}
            />
            <span className="custom-chip" style={{ background: settings.customColor ?? undefined }} aria-hidden="true">
              {customActive && <Icon name="check" size={16} />}
            </span>
            <span className="custom-hex">{settings.customColor ? settings.customColor.toUpperCase() : 'Choose…'}</span>
          </label>
        </div>
      </section>

      <section className="settings-card">
        <h2>Playback</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">Skip unplayable songs</div>
            <div className="setting-help">If your browser can’t decode a file, move on to the next song automatically.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoSkip}
            aria-label="Skip unplayable songs"
            className={`switch${settings.autoSkip ? ' on' : ''}`}
            onClick={() => updateSettings({ autoSkip: !settings.autoSkip })}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="settings-card">
        <h2>Library</h2>
        <dl className="kv">
          <div>
            <dt>Songs</dt>
            <dd>{tracks.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Albums and artists</dt>
            <dd>
              {plural(index.albums.length, 'album')}, {plural(index.artists.length, 'artist')}
            </dd>
          </div>
          <div>
            <dt>Playtime</dt>
            <dd>{formatTotal(index.totalDuration)}</dd>
          </div>
          <div>
            <dt>Browser storage</dt>
            <dd>
              {usage ? `${formatBytes(usage.usage)} of ${formatBytes(usage.quota)} available` : 'Unavailable'}
              {!persistent && <span className="warn"> · Not saved between visits</span>}
            </dd>
          </div>
        </dl>
        <div className="setting-actions">
          <Button
            icon="clock"
            onClick={() => {
              clearRecent();
              toast('Listening history cleared', 'success');
            }}
          >
            Clear listening history
          </Button>
          <Button
            variant="danger"
            icon="trash"
            disabled={tracks.length === 0}
            onClick={() =>
              askConfirm({
                title: 'Clear your library?',
                message: `This removes ${plural(tracks.length, 'song')} from AR AUDIX, along with your favorites and history. Playlists are kept but emptied. The original files on your computer aren’t touched.`,
                confirmLabel: 'Clear library',
                danger: true,
                onConfirm: () => void clearLibrary().then(() => toast('Library cleared', 'success')),
              })
            }
          >
            Clear library
          </Button>
        </div>
      </section>

      <section className="settings-card">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="settings-card about">
        <LogoMark size={40} />
        <div>
          <div className="setting-name">AR AUDIX 0.1.0</div>
          <div className="setting-help">A local music player. Your files never leave this device.</div>
        </div>
      </section>
    </div>
  );
}
