import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { formatTotal, plural } from '../lib/format';
import { playAll, shuffleAll } from '../lib/actions';
import { resolveTracks, library, useIndex } from '../store/library';
import { openImport } from '../store/ui';
import { AlbumCardFor, Button, EmptyState, PageHeader } from '../components/common';
import { Artwork } from '../components/Artwork';
import { SongList } from '../components/SongList';
import { artistKeyOf } from '../lib/derive';
import { paths } from '../lib/router';

export function AlbumsPage() {
  const { albums } = useIndex();
  const ready = useStore(library, (s) => s.ready);
  return (
    <div className="page">
      <PageHeader title="Albums" subtitle={albums.length ? plural(albums.length, 'album') : undefined} />
      {ready && albums.length === 0 ? (
        <EmptyState icon="album" title="No albums yet" description="Albums are built from your folders and file names as you import music.">
          <Button variant="primary" icon="upload" onClick={openImport}>
            Import music
          </Button>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {albums.map((a) => (
            <AlbumCardFor key={a.key} album={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AlbumDetailPage({ albumKey }: { albumKey: string }) {
  const index = useIndex();
  const album = index.albumByKey.get(albumKey);
  const tracks = useMemo(() => (album ? resolveTracks(album.trackIds) : []), [album]);

  if (!album) {
    return (
      <div className="page">
        <EmptyState icon="album" title="Album not found" description="It may have been removed from your library.">
          <a className="btn btn-secondary" href="#/albums">
            Back to albums
          </a>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-art">
          <Artwork seed={album.name} artId={album.artId} />
        </div>
        <div className="detail-text">
          <span className="eyebrow">Album</span>
          <h1>{album.name}</h1>
          <p className="detail-meta">
            {album.artist === 'Various Artists' ? (
              album.artist
            ) : (
              <a href={paths.artist(artistKeyOf(album.artist))}>{album.artist}</a>
            )}
            <span aria-hidden="true"> · </span>
            {plural(tracks.length, 'song')}
            <span aria-hidden="true"> · </span>
            {formatTotal(album.duration)}
          </p>
          <div className="detail-actions">
            <Button variant="primary" icon="play" onClick={() => playAll(album.trackIds)}>
              Play
            </Button>
            <Button icon="shuffle" onClick={() => shuffleAll(album.trackIds)}>
              Shuffle
            </Button>
          </div>
        </div>
      </div>
      <SongList tracks={tracks} />
    </div>
  );
}
