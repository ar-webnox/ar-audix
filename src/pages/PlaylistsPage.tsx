import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { formatTotal, plural } from '../lib/format';
import { playAll, shuffleAll } from '../lib/actions';
import { navigate, paths } from '../lib/router';
import { deletePlaylist, library, resolveTracks } from '../store/library';
import { askConfirm, openPlaylistDialog } from '../store/ui';
import { Button, EmptyState, MediaCard, PageHeader } from '../components/common';
import { Artwork } from '../components/Artwork';
import { SongList } from '../components/SongList';

export function PlaylistsPage() {
  const playlists = useStore(library, (s) => s.playlists);
  const tracks = useStore(library, (s) => s.tracks);
  const create = () => openPlaylistDialog({ mode: 'create' });

  return (
    <div className="page">
      <PageHeader
        title="Playlists"
        subtitle={playlists.length ? plural(playlists.length, 'playlist') : undefined}
        actions={
          <Button variant="primary" icon="plus" onClick={create}>
            New playlist
          </Button>
        }
      />
      {playlists.length === 0 ? (
        <EmptyState
          icon="playlist"
          title="Create your first playlist"
          description="Group songs however you like. Add tracks from the “…” menu on any song."
        >
          <Button variant="primary" icon="plus" onClick={create}>
            New playlist
          </Button>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {playlists.map((p) => {
            const items = resolveTracks(p.trackIds);
            const count = items.length;
            void tracks;
            return (
              <MediaCard
                key={p.id}
                href={paths.playlist(p.id)}
                title={p.name}
                subtitle={plural(count, 'song')}
                seed={p.id}
                artId={items.find((t) => t.artId)?.artId}
                onPlay={count > 0 ? () => playAll(p.trackIds) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlaylistDetailPage({ playlistId }: { playlistId: string }) {
  const playlists = useStore(library, (s) => s.playlists);
  const libraryTracks = useStore(library, (s) => s.tracks);
  const playlist = playlists.find((p) => p.id === playlistId);
  const tracks = useMemo(() => (playlist ? resolveTracks(playlist.trackIds) : []), [playlist, libraryTracks]);

  if (!playlist) {
    return (
      <div className="page">
        <EmptyState icon="playlist" title="Playlist not found" description="It may have been deleted.">
          <a className="btn btn-secondary" href="#/playlists">
            Back to playlists
          </a>
        </EmptyState>
      </div>
    );
  }

  const ids = tracks.map((t) => t.id);
  const total = tracks.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-art">
          <Artwork seed={playlist.id} artId={tracks.find((t) => t.artId)?.artId} />
        </div>
        <div className="detail-text">
          <span className="eyebrow">Playlist</span>
          <h1>{playlist.name}</h1>
          <p className="detail-meta">
            {plural(tracks.length, 'song')}
            {tracks.length > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                {formatTotal(total)}
              </>
            )}
          </p>
          <div className="detail-actions">
            <Button variant="primary" icon="play" disabled={ids.length === 0} onClick={() => playAll(ids)}>
              Play
            </Button>
            <Button icon="shuffle" disabled={ids.length === 0} onClick={() => shuffleAll(ids)}>
              Shuffle
            </Button>
            <Button variant="ghost" icon="edit" onClick={() => openPlaylistDialog({ mode: 'rename', playlistId: playlist.id })}>
              Rename
            </Button>
            <Button
              variant="ghost"
              icon="trash"
              onClick={() =>
                askConfirm({
                  title: 'Delete playlist?',
                  message: `“${playlist.name}” will be deleted. The songs stay in your library.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => {
                    deletePlaylist(playlist.id);
                    navigate('/playlists');
                  },
                })
              }
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
      {tracks.length === 0 ? (
        <EmptyState icon="songs" title="This playlist is empty" description="Open the “…” menu on any song and choose “Add to playlist”." />
      ) : (
        <SongList tracks={tracks} playlistId={playlist.id} />
      )}
    </div>
  );
}
