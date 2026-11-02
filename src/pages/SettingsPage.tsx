import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../lib/createStore';
import { formatBytes, formatTotal, plural } from '../lib/format';
import { promptInstall, usePwa } from '../lib/pwa';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '../config/app';
import { BUILT_BY, SOCIAL_LINKS } from '../config/links';
import { ACCENTS, clearLibrary, clearRecent, importCandidates, library, optimizeStorage, resetSettings, updateSettings, useIndex } from '../store/library';
import { db } from '../lib/db';
import { linkingSupported } from '../lib/fsa';
import { pickFiles, pickFolder } from '../lib/picker';
import { isStoragePersistent, requestPersistence, storageEstimate, storageLevel, type StorageEstimate } from '../lib/storageInfo';
import { EQ_PRESETS, MAX_CROSSFADE, fx, resetFx, setCrossfade, setGapless, setPreset, setVisualizer } from '../store/fx';
import { PLAYBACK_RATES, player, setRate, setVolume, toggleShuffle } from '../store/player';
import { askConfirm, openImport, openPanel, toast } from '../store/ui';
import { schemeOf } from '../lib/theme';
import type { RepeatMode, SortName, ThemeMode } from '../types';
import { Button, PageHeader } from '../components/common';
import { Icon, type IconName } from '../components/Icon';
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
  ['E', 'Open equalizer and sound'],
  ['/', 'Focus search'],
];

const THEMES: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'system', label: 'System', icon: 'monitor' },
];

const SORTS: { value: string; label: string }[] = [
  { value: 'title:asc', label: 'Title (A to Z)' },
  { value: 'title:desc', label: 'Title (Z to A)' },
  { value: 'artist:asc', label: 'Artist (A to Z)' },
  { value: 'album:asc', label: 'Album (A to Z)' },
  { value: 'added:desc', label: 'Newest first' },
  { value: 'added:asc', label: 'Oldest first' },
  { value: 'duration:desc', label: 'Longest first' },
  { value: 'duration:asc', label: 'Shortest first' },
];

function Row({ name, help, children, sub }: { name: string; help?: ReactNode; children: ReactNode; sub?: boolean }) {
  return (
    <div className={`setting-row${sub ? ' setting-row-sub' : ''}`}>
      <div>
        <div className="setting-name">{name}</div>
        {help && <div className="setting-help">{help}</div>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Select<T extends string>({ value, label, options, onChange }: { value: T; label: string; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Appearance() {
  const settings = useStore(library, (s) => s.settings);
  const scheme = schemeOf(settings.theme);
  const customActive = settings.accent === 'custom';
  const customHex = settings.customColor ?? ACCENTS.find((a) => a.name === settings.accent)?.color ?? ACCENTS[0].color;
  return (
    <section className="settings-card">
      <h2>Appearance</h2>
      <Row name="Theme" help="Dark, light or follow your device. Changes apply instantly.">
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.mode} type="button" role="radio" aria-checked={settings.theme === t.mode} className={settings.theme === t.mode ? 'on' : ''} onClick={() => updateSettings({ theme: t.mode })}>
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </Row>
      <Row name="Accent colour" help="Used for buttons, highlights and the progress bar.">
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
              style={{ background: scheme === 'light' ? a.lightColor : a.color, color: scheme === 'light' ? '#fff' : '#101010' }}
              onClick={() => updateSettings({ accent: a.name })}
            >
              {settings.accent === a.name && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </Row>
      <Row sub name="Custom colour" help="Pick any colour. Colours that would be hard to read are adjusted slightly for the current theme.">
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
      </Row>
      <Row name="Reduce animations" help="Turns off transitions and the logo animation. Also follows your device’s reduced-motion setting.">
        <Switch on={settings.reduceMotion} label="Reduce animations" onChange={(reduceMotion) => updateSettings({ reduceMotion })} />
      </Row>
    </section>
  );
}

function Playback() {
  const settings = useStore(library, (s) => s.settings);
  const rate = useStore(player, (s) => s.rate);
  const volume = useStore(player, (s) => s.volume);
  const shuffle = useStore(player, (s) => s.shuffle);
  const repeat = useStore(player, (s) => s.repeat);
  const preset = useStore(fx, (s) => s.preset);
  const crossfade = useStore(fx, (s) => s.crossfade);
  const gapless = useStore(fx, (s) => s.gapless);
  const visualizer = useStore(fx, (s) => s.visualizer);
  return (
    <section className="settings-card">
      <h2>Playback</h2>
      <p className="setting-intro">These are remembered and used every time AR AUDIX starts. Changing them in the player does the same.</p>
      <Row name="Default playback speed">
        <Select value={String(rate)} label="Default playback speed" options={PLAYBACK_RATES.map((r) => ({ value: String(r), label: r === 1 ? 'Normal (1x)' : `${r}x` }))} onChange={(v) => setRate(Number(v))} />
      </Row>
      <Row name="Default volume">
        <label className="range-field">
          <input type="range" className="range" min={0} max={100} step={5} value={Math.round(volume * 100)} aria-label="Default volume" onChange={(e) => setVolume(Number(e.target.value) / 100)} />
          <span className="range-value">{Math.round(volume * 100)}%</span>
        </label>
      </Row>
      <Row name="Shuffle" help="Play the queue in a random order.">
        <Switch on={shuffle} label="Shuffle" onChange={(on) => on !== shuffle && toggleShuffle()} />
      </Row>
      <Row name="Repeat">
        <Select<RepeatMode> value={repeat} label="Repeat" options={[{ value: 'off', label: 'Off' }, { value: 'all', label: 'Repeat all' }, { value: 'one', label: 'Repeat one' }]} onChange={(v) => player.set({ repeat: v })} />
      </Row>
      <Row name="Skip unplayable songs" help="If your browser can’t decode a file, move on to the next song automatically.">
        <Switch on={settings.autoSkip} label="Skip unplayable songs" onChange={(autoSkip) => updateSettings({ autoSkip })} />
      </Row>
      <Row name="Crossfade" help="Overlap the end of one song with the start of the next.">
        <label className="range-field">
          <input type="range" className="range" min={0} max={MAX_CROSSFADE} step={1} value={crossfade} aria-label="Crossfade seconds" onChange={(e) => setCrossfade(Number(e.target.value))} />
          <span className="range-value">{crossfade === 0 ? 'Off' : `${crossfade}s`}</span>
        </label>
      </Row>
      <Row name="Gapless playback" help="Start the next song the moment this one ends (when crossfade is off).">
        <Switch on={gapless} label="Gapless playback" onChange={setGapless} />
      </Row>
      <Row name="Equalizer preset" help="Fine-tune the ten bands in the Sound panel.">
        <div className="row-actions">
          <Select value={preset} label="Equalizer preset" options={[...EQ_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]} onChange={setPreset} />
          <Button small icon="sliders" onClick={() => openPanel('sound')}>
            Open
          </Button>
        </div>
      </Row>
      <Row name="Audio visualizer" help="Show the live frequency display in the Sound panel and Now Playing.">
        <Switch on={visualizer} label="Audio visualizer" onChange={setVisualizer} />
      </Row>
    </section>
  );
}

function LibrarySettings() {
  const settings = useStore(library, (s) => s.settings);
  const tracks = useStore(library, (s) => s.tracks);
  const persistent = useStore(library, (s) => s.persistent);
  const index = useIndex();
  const sortValue = `${settings.defaultSort.key}:${settings.defaultSort.ascending ? 'asc' : 'desc'}`;
  return (
    <section className="settings-card">
      <h2>Library</h2>
      <Row name="Default sorting" help="How All Songs is ordered when it opens.">
        <Select
          value={sortValue}
          label="Default sorting"
          options={SORTS}
          onChange={(v) => {
            const [key, dir] = v.split(':');
            updateSettings({ defaultSort: { key: key as SortName, ascending: dir === 'asc' } });
          }}
        />
      </Row>
      <Row name="Show cover art" help="Turn off to use the generated colour covers everywhere (uses a little less memory).">
        <Switch on={settings.showArtwork} label="Show cover art" onChange={(showArtwork) => updateSettings({ showArtwork })} />
      </Row>
      <Row name="Read song info when importing" help="Use the Title, Artist and Album stored inside each file.">
        <Switch on={settings.importTags} label="Read song info when importing" onChange={(importTags) => updateSettings({ importTags })} />
      </Row>
      <Row name="Read cover art when importing" help="Extract the cover art embedded in each file.">
        <Switch on={settings.importArtwork} label="Read cover art when importing" onChange={(importArtwork) => updateSettings({ importArtwork })} />
      </Row>
      <Row
        name="Keep songs in their original place"
        help={
          linkingSupported()
            ? 'Songs stay where they are on your device and are not copied into the browser, so they use almost no storage. Your browser may ask permission to read them again after you reopen the app.'
            : 'Your browser can’t keep songs in their original place, so imported songs are stored inside the browser. Chrome or Edge on a computer can avoid this.'
        }
      >
        {linkingSupported() ? (
          <Switch on={settings.linkFiles} label="Keep songs in their original place" onChange={(linkFiles) => updateSettings({ linkFiles })} />
        ) : (
          <span className="badge">Not available</span>
        )}
      </Row>
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
        {!persistent && (
          <div>
            <dt>Saving</dt>
            <dd>
              <span className="warn">Not saved between visits</span>
            </dd>
          </div>
        )}
      </dl>
      <StorageSection />
      <div className="setting-actions">
        <Button variant="primary" icon="upload" onClick={openImport}>
          Import music
        </Button>
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
              message: `This removes ${plural(tracks.length, 'song')} from AR AUDIX, along with your favorites and history. Playlists are kept but emptied. The original files on your device aren’t touched.`,
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
  );
}

function StorageSection() {
  const tracks = useStore(library, (s) => s.tracks);
  const [est, setEst] = useState<StorageEstimate | null>(null);
  const [parts, setParts] = useState<Awaited<ReturnType<typeof db.usageBreakdown>> | null>(null);
  const [access, setAccess] = useState<{ linked: number; ready: number; folders: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void storageEstimate().then(setEst);
    void db.usageBreakdown().then(setParts);
    void db.linkedAccess().then(setAccess);
    void isStoragePersistent().then(setPersisted);
  };
  useEffect(refresh, [tracks.length]);

  const level = storageLevel(est);
  const copies = tracks.filter((t) => t.src !== 'link');
  const copyBytes = copies.reduce((n, t) => n + t.size, 0);
  const linked = tracks.length - copies.length;
  const listBytes = new Blob([JSON.stringify(tracks)]).size;
  const pct = est && est.quota > 0 ? Math.min(100, (est.usage / est.quota) * 100) : 0;
  const needAccess = access ? access.linked - access.ready : 0;
  const supported = linkingSupported();

  return (
    <div className="storage">
      <h3 className="settings-sub">Storage</h3>
      {level !== 'ok' && est && (
        <div className={`notice ${level === 'critical' ? 'notice-danger' : 'notice-warn'}`} role="alert">
          {level === 'critical' ? 'Browser storage is almost full.' : 'Browser storage is running low.'} AR AUDIX is using {formatBytes(est.usage)} of the
          roughly {formatBytes(est.quota)} your browser currently allows. Free up space below or remove songs you don’t need.
        </div>
      )}
      {est && est.quota > 0 && (
        <div className="meter" role="img" aria-label={`${Math.round(pct)} percent of the browser's storage allowance used`}>
          <span style={{ width: `${Math.max(pct, pct > 0 ? 1 : 0)}%` }} className={level !== 'ok' ? 'meter-' + level : undefined} />
        </div>
      )}
      <dl className="kv">
        <div>
          <dt>Used by AR AUDIX</dt>
          <dd>{est ? formatBytes(est.usage) : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Browser allowance (estimate)</dt>
          <dd>{est && est.quota > 0 ? `about ${formatBytes(est.quota)}` : 'Not reported'}</dd>
        </div>
        <div>
          <dt>Songs copied into the browser</dt>
          <dd>{plural(copies.length, 'song')} · {formatBytes(parts?.copies ?? copyBytes)}</dd>
        </div>
        <div>
          <dt>Songs kept in their original place</dt>
          <dd>{plural(linked, 'song')} · no audio stored</dd>
        </div>
        <div>
          <dt>Cover art</dt>
          <dd>{parts ? `${formatBytes(parts.artwork)} · ${plural(parts.artworkCount, 'cover')}` : '…'}</dd>
        </div>
        <div>
          <dt>Song list</dt>
          <dd>about {formatBytes(listBytes)}</dd>
        </div>
      </dl>
      <p className="setting-help storage-note">
        The allowance is decided by your browser, not by AR AUDIX. It depends on your device’s free space and the browser and it can change; the
        numbers are the browser’s own estimates. Refresh to re-check.
      </p>
      <div className="setting-actions">
        <Button icon="reset" onClick={refresh}>
          Refresh
        </Button>
        <Button
          icon="shield"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void optimizeStorage()
              .then((r) => {
                toast(
                  r.bytesFreed > 0
                    ? `Freed ${formatBytes(r.bytesFreed)}: ${plural(r.artworkRecompressed, 'cover')} compressed, ${plural(r.orphanFiles + r.orphanArtwork, 'leftover item')} removed.`
                    : 'Already tidy. Nothing to free.',
                  'success',
                );
                refresh();
              })
              .catch((e: unknown) => toast(e instanceof Error ? e.message : 'Could not optimize storage.', 'error'))
              .finally(() => setBusy(false));
          }}
        >
          Clean up and compress
        </Button>
        {persisted === false && (
          <Button
            onClick={() =>
              void requestPersistence().then((ok) => {
                toast(ok ? 'Your browser will keep AR AUDIX’s data.' : 'Your browser declined. It may still clear data if the device runs low on space.', ok ? 'success' : undefined);
                refresh();
              })
            }
          >
            Protect from automatic cleanup
          </Button>
        )}
      </div>
      {needAccess > 0 && (
        <Row
          sub
          name="Allow access to your music"
          help={`${plural(needAccess, 'song')} kept in their original place need your permission again. Your browser asks for one folder at a time.`}
        >
          <Button
            variant="primary"
            onClick={() =>
              void db.requestNextAccess().then((r) => {
                if (r.remaining > 0) toast(`${plural(r.remaining, 'folder or file')} still need permission. Press the button again.`);
                refresh();
              })
            }
          >
            Allow access
          </Button>
        </Row>
      )}
      {supported && copies.length > 0 && (
        <Row
          sub
          name="Free up space"
          help={`${plural(copies.length, 'song')} are copied into the browser (${formatBytes(copyBytes)}). Select the folder they came from: AR AUDIX checks each original and only then replaces the copy with a link. Playlists, favorites and history stay as they are and nothing is changed for songs it can’t find.`}
        >
          <div className="row-actions">
            <Button onClick={() => pickFolder((c) => void importCandidates(c), true)} icon="folderMusic">
              Select folder
            </Button>
            <Button onClick={() => pickFiles((c) => void importCandidates(c), true)} icon="file">
              Select files
            </Button>
          </div>
        </Row>
      )}
    </div>
  );
}

function General() {
  const { canInstall, installed, ios } = usePwa();
  return (
    <section className="settings-card">
      <h2>General</h2>
      <Row
        name="Install app"
        help={
          installed
            ? 'AR AUDIX is installed on this device.'
            : canInstall
              ? 'Install AR AUDIX for its own window, a home-screen icon and offline start-up.'
              : ios
                ? 'In Safari, tap Share, then “Add to Home Screen”.'
                : 'Use your browser’s menu: “Install AR AUDIX” (Chrome, Edge) or “Add to Home screen” (Android).'
        }
      >
        {installed ? (
          <span className="badge">Installed</span>
        ) : canInstall ? (
          <Button variant="primary" icon="download" onClick={() => void promptInstall()}>
            Install
          </Button>
        ) : null}
      </Row>
      <Row name="Reset settings" help="Puts every setting on this page back to its default. Your music, playlists and favorites are kept.">
        <Button
          icon="reset"
          onClick={() =>
            askConfirm({
              title: 'Reset all settings?',
              message: 'Theme, accent, playback, equalizer and library preferences return to their defaults. Your music, playlists and favorites are not affected.',
              confirmLabel: 'Reset settings',
              danger: true,
              onConfirm: () => {
                resetSettings();
                resetFx();
                setVolume(0.8);
                setRate(1);
                player.set({ repeat: 'off' });
                if (player.get().shuffle) toggleShuffle();
                toast('Settings reset', 'success');
              },
            })
          }
        >
          Reset settings
        </Button>
      </Row>
      <h3 className="settings-sub">Keyboard shortcuts</h3>
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
  );
}

function About() {
  const links = SOCIAL_LINKS.filter((l) => l.url !== '');
  return (
    <section className="settings-card about-card">
      <div className="about">
        <LogoMark size={44} />
        <div>
          <div className="setting-name">
            {APP_NAME} <span className="version">v{APP_VERSION}</span>
          </div>
          <div className="setting-help">{APP_TAGLINE}</div>
        </div>
      </div>
      <ul className="about-points">
        <li>Your music is copied into this browser’s own storage and never uploaded anywhere.</li>
        <li>Browsers only let AR AUDIX read files and folders you pick and may ask for permission again, so you may need to import again after clearing site data.</li>
      </ul>
      <div className="about-foot">
        <span className="setting-help">
          Built by{' '}
          <a href={BUILT_BY.url} target="_blank" rel="noopener noreferrer">
            {BUILT_BY.name}
          </a>
        </span>
        {links.length > 0 && (
          <ul className="social" aria-label="Links">
            {links.map((l) => (
              <li key={l.id}>
                <a className="social-link" href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                  <Icon name="external" size={13} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" />
      <Appearance />
      <Playback />
      <LibrarySettings />
      <General />
      <About />
    </div>
  );
}
