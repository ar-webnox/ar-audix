import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { formatTotal, plural } from '../lib/format';
import { playAll, shuffleAll } from '../lib/actions';
import { library, resolveTracks, useIndex } from '../store/library';
import { openImport } from '../store/ui';
import { AlbumCardFor, ArtistCardFor, Button, EmptyState, PageHeader, Section } from '../components/common';
import { Artwork, initialsOf } from '../components/Artwork';
import { SongList } from '../components/SongList';

export function ArtistsPage() {
  const { artists } = useIndex();
  const ready = useStore(library, (s) => s.ready);
  return (
    <div className="page">
      <PageHeader title="Artists" subtitle={artists.length ? plural(artists.length, 'artist') : undefined} />
      {ready && artists.length === 0 ? (
        <EmptyState icon="artist" title="No artists yet" description="Artists appear here once you import music.">
          <Button variant="primary" icon="upload" onClick={openImport}>
            Import music
          </Button>
        </EmptyState>
      ) : (
        <div className="card-grid">
          {artists.map((a) => (
            <ArtistCardFor key={a.key} artist={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ArtistDetailPage({ artistKey }: { artistKey: string }) {
  const index = useIndex();
  const artist = index.artistByKey.get(artistKey);
  const tracks = useMemo(() => (artist ? resolveTracks(artist.trackIds) : []), [artist]);
  const albums = useMemo(
    () => (artist ? artist.albumKeys.map((k) => index.albumByKey.get(k)).filter((a) => a !== undefined) : []),
    [artist, index],
  );

  if (!artist) {
    return (
      <div className="page">
        <EmptyState icon="artist" title="Artist not found" description="They may have been removed from your library.">
          <a className="btn btn-secondary" href="#/artists">
            Back to artists
          </a>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-art detail-art-round">
          <Artwork seed={artist.name} round initials={initialsOf(artist.name)} />
        </div>
        <div className="detail-text">
          <span className="eyebrow">Artist</span>
          <h1>{artist.name}</h1>
          <p className="detail-meta">
            {plural(albums.length, 'album')}
            <span aria-hidden="true"> · </span>
            {plural(tracks.length, 'song')}
            <span aria-hidden="true"> · </span>
            {formatTotal(artist.duration)}
          </p>
          <div className="detail-actions">
            <Button variant="primary" icon="play" onClick={() => playAll(artist.trackIds)}>
              Play
            </Button>
            <Button icon="shuffle" onClick={() => shuffleAll(artist.trackIds)}>
              Shuffle
            </Button>
          </div>
        </div>
      </div>
      {albums.length > 0 && (
        <Section title="Albums">
          <div className="card-grid">
            {albums.map((a) => (
              <AlbumCardFor key={a.key} album={a} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Songs">
        <SongList tracks={tracks} />
      </Section>
    </div>
  );
}
