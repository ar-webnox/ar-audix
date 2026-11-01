import { useEffect, useRef, useState } from 'react';
import { candidatesFromDataTransfer } from '../lib/audioFiles';
import { useStore } from '../lib/createStore';
import { navigate, paths } from '../lib/router';
import { plural } from '../lib/format';
import {
  addToPlaylist,
  createPlaylist,
  importCandidates,
  library,
  removeFromPlaylist,
  removeTracks,
  renamePlaylist,
  toggleFavorite,
  trackById,
  useFavoriteSet,
} from '../store/library';
import { addToQueue, playNext } from '../store/player';
import {
  askConfirm,
  closeConfirm,
  closeImport,
  closePlaylistDialog,
  closeTrackMenu,
  dismissToast,
  openPlaylistDialog,
  toast,
  ui,
} from '../store/ui';
import { albumKeyOf, artistKeyOf } from '../lib/derive';
import { Button } from './common';
import { Icon } from './Icon';
import { ImportDropzone } from './ImportDropzone';
import { Modal } from './Modal';
import { MenuItems, Popover, type MenuEntry } from './Popover';

/* ---------- toasts ---------- */

export function ToastHost() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'close' : t.kind === 'success' ? 'check' : 'songs'} size={16} />
          <span>{t.message}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- import progress pill ---------- */

export function ImportProgress() {
  const importing = useStore(library, (s) => s.importing);
  if (!importing.active) return null;
  const pct = importing.total > 0 ? (importing.done / importing.total) * 100 : 0;
  return (
    <div className="import-progress" role="status" aria-live="polite">
      <div className="import-progress-text">
        Importing {importing.done.toLocaleString()} of {importing.total.toLocaleString()}
      </div>
      <div className="import-progress-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- import dialog ---------- */

export function ImportDialog() {
  const open = useStore(ui, (s) => s.importOpen);
  if (!open) return null;
  return (
    <Modal title="Import music" onClose={closeImport} width={560}>
      <ImportDropzone onStarted={closeImport} />
      <p className="modal-note">
        <Icon name="shield" size={15} /> Your music stays on this device. Files are copied into this browser’s local storage and are
        never uploaded.
      </p>
    </Modal>
  );
}

/* ---------- window-wide drag and drop ---------- */

export function DropOverlay() {
  const dragging = useStore(ui, (s) => s.dragging);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      ui.set({ dragging: true });
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) ui.set({ dragging: false });
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      ui.set({ dragging: false, importOpen: false });
      if (e.dataTransfer) void candidatesFromDataTransfer(e.dataTransfer).then(importCandidates);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging) return null;
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-card">
        <Icon name="upload" size={34} />
        <strong>Drop to add to your library</strong>
        <span>Audio files and folders are supported</span>
      </div>
    </div>
  );
}

/* ---------- track context menu ---------- */

export function TrackMenuHost() {
  const menu = useStore(ui, (s) => s.trackMenu);
  const playlists = useStore(library, (s) => s.playlists);
  const favorites = useFavoriteSet();
  const [view, setView] = useState<'root' | 'playlists'>('root');

  useEffect(() => setView('root'), [menu]);

  if (!menu) return null;
  const track = trackById(menu.trackId);
  if (!track) return null;
  const id = track.id;

  const rootEntries: MenuEntry[] = [
    { id: 'next', label: 'Play next', icon: 'queue', onSelect: () => (playNext([id]), closeTrackMenu()) },
    { id: 'queue', label: 'Add to queue', icon: 'plus', onSelect: () => (addToQueue([id]), closeTrackMenu()) },
    { id: 'playlist', label: 'Add to playlist', icon: 'playlist', hasSubmenu: true, onSelect: () => setView('playlists') },
    {
      id: 'fav',
      label: favorites.has(id) ? 'Remove from favorites' : 'Add to favorites',
      icon: 'heart',
      onSelect: () => (toggleFavorite(id), closeTrackMenu()),
    },
    {
      id: 'album',
      label: 'Go to album',
      icon: 'album',
      separatorBefore: true,
      onSelect: () => (navigate(paths.album(albumKeyOf(track.album)).slice(1)), closeTrackMenu()),
    },
    {
      id: 'artist',
      label: 'Go to artist',
      icon: 'artist',
      onSelect: () => (navigate(paths.artist(artistKeyOf(track.artist)).slice(1)), closeTrackMenu()),
    },
  ];
  if (menu.playlistId) {
    const pid = menu.playlistId;
    rootEntries.push({
      id: 'unlist',
      label: 'Remove from this playlist',
      icon: 'close',
      separatorBefore: true,
      onSelect: () => (removeFromPlaylist(pid, id), closeTrackMenu()),
    });
  }
  rootEntries.push({
    id: 'remove',
    label: 'Remove from library',
    icon: 'trash',
    danger: true,
    separatorBefore: !menu.playlistId,
    onSelect: () =>
      askConfirm({
        title: 'Remove from library?',
        message: `“${track.title}” will be removed from AR AUDIX. The original file on your computer isn’t touched.`,
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () => void removeTracks([id]),
      }),
  });

  const playlistEntries: MenuEntry[] = [
    {
      id: 'new',
      label: 'New playlist…',
      icon: 'plus',
      onSelect: () => openPlaylistDialog({ mode: 'create', addTrackIds: [id] }),
    },
    ...playlists.map((p) => ({
      id: p.id,
      label: p.name,
      icon: 'playlist' as const,
      checked: p.trackIds.includes(id) ? true : undefined,
      onSelect: () => {
        const added = addToPlaylist(p.id, [id]);
        toast(added ? `Added to “${p.name}”` : `Already in “${p.name}”`, added ? 'success' : 'info');
        closeTrackMenu();
      },
    })),
  ];

  return (
    <Popover anchor={menu.anchor} align="start" label={`Options for ${track.title}`} onClose={closeTrackMenu}>
      {view === 'playlists' && (
        <button type="button" className="menu-back" onClick={() => setView('root')}>
          <Icon name="chevronLeft" size={16} /> Add to playlist
        </button>
      )}
      <MenuItems entries={view === 'root' ? rootEntries : playlistEntries} />
    </Popover>
  );
}

/* ---------- playlist + confirm dialogs ---------- */

export function PlaylistDialog() {
  const dialog = useStore(ui, (s) => s.playlistDialog);
  const playlists = useStore(library, (s) => s.playlists);
  const existing = dialog?.playlistId ? playlists.find((p) => p.id === dialog.playlistId) : undefined;
  const [name, setName] = useState('');

  useEffect(() => {
    setName(dialog?.mode === 'rename' ? (existing?.name ?? '') : '');
  }, [dialog, existing?.name]);

  if (!dialog) return null;
  const rename = dialog.mode === 'rename';

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    if (rename && dialog.playlistId) {
      renamePlaylist(dialog.playlistId, value);
    } else {
      const created = createPlaylist(value, dialog.addTrackIds ?? []);
      toast(
        dialog.addTrackIds?.length ? `Created “${created.name}” with ${plural(dialog.addTrackIds.length, 'song')}` : `Created “${created.name}”`,
        'success',
      );
      if (!dialog.addTrackIds?.length) navigate(paths.playlist(created.id).slice(1));
    }
    closePlaylistDialog();
  };

  return (
    <Modal
      title={rename ? 'Rename playlist' : 'New playlist'}
      onClose={closePlaylistDialog}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={closePlaylistDialog}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            {rename ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field-label" htmlFor="playlist-name">
          Name
        </label>
        <input
          id="playlist-name"
          data-autofocus
          className="field"
          value={name}
          maxLength={80}
          placeholder="My playlist"
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Modal>
  );
}

export function ConfirmDialog() {
  const confirm = useStore(ui, (s) => s.confirm);
  if (!confirm) return null;
  return (
    <Modal
      title={confirm.title}
      onClose={closeConfirm}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={closeConfirm} data-autofocus>
            Cancel
          </Button>
          <Button
            variant={confirm.danger ? 'danger' : 'primary'}
            onClick={() => {
              closeConfirm();
              confirm.onConfirm();
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-text">{confirm.message}</p>
    </Modal>
  );
}

