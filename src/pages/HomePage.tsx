import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { formatTotal, greeting, plural } from '../lib/format';
import { playAll, playFrom, shuffleAll } from '../lib/actions';
import { library, resolveTracks, useIndex } from '../store/library';
import { openImport } from '../store/ui';
import { AlbumCardFor, Button, EmptyState, MediaCard, PageHeader, Section, StatTile } from '../components/common';
import { SongList } from '../components/SongList';
import { paths } from '../lib/router';
import { albumKeyOf } from '../lib/derive';

export function HomePage() {
  const index = useIndex();
  const ready = useStore(library, (s) => s.ready);
  const tracks = useStore(library, (s) => s.tracks);
  const recent = useStore(library, (s) => s.recent);
  const favorites = useStore(library, (s) => s.favorites);

  const recentTracks = useMemo(() => resolveTracks(recent.map((r) => r.id)).slice(0, 6), [recent, tracks]);
  const favoriteTracks = useMemo(() => resolveTracks(favorites).slice(0, 5), [favorites, tracks]);
  const newestAlbums = useMemo(
    () => [...index.albums].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6),
    [index],
  );

  if (!ready) return <div className="page" aria-busy="true" />;

  if (tracks.length === 0) {
    return (
      <div className="page">
        <PageHeader title={greeting()} subtitle="Welcome to AR AUDIX" />
        <EmptyState
          icon="songs"
          title="Your library is empty"
          description="Import songs from your computer to start listening. Everything stays on this device."
        >
          <Button variant="primary" icon="upload" onClick={openImport}>
            Import music
          </Button>
        </EmptyState>
      </div>
    );
  }

  const allIds = tracks.map((t) => t.id);
  const recentIds = recentTracks.map((t) => t.id);

  return (
    <div className="page">
      <PageHeader
        title={greeting()}
        subtitle={`${plural(tracks.length, 'song')} in your library`}
        actions={
          <>
            <Button variant="primary" icon="play" onClick={() => playAll(allIds)}>
              Play all
            </Button>
            <Button icon="shuffle" onClick={() => shuffleAll(allIds)}>
              Shuffle
            </Button>
          </>
        }
      />

      <div className="stats">
        <StatTile label="Songs" value={tracks.length.toLocaleString()} />
        <StatTile label="Albums" value={index.albums.length.toLocaleString()} />
        <StatTile label="Artists" value={index.artists.length.toLocaleString()} />
        <StatTile label="Total playtime" value={formatTotal(index.totalDuration)} />
      </div>

      {recentTracks.length > 0 && (
        <Section title="Continue listening" action={<a className="section-link" href="#/recent">See all</a>}>
          <div className="card-grid">
            {recentTracks.map((t) => (
              <MediaCard
                key={t.id}
                href={paths.album(albumKeyOf(t.album))}
                title={t.title}
                subtitle={t.artist}
                seed={t.album}
                artId={t.artId}
                onPlay={() => playFrom(recentIds, t.id)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Recently added" action={<a className="section-link" href="#/albums">All albums</a>}>
        <div className="card-grid">
          {newestAlbums.map((a) => (
            <AlbumCardFor key={a.key} album={a} />
          ))}
        </div>
      </Section>

      {favoriteTracks.length > 0 && (
        <Section title="Your favorites" action={<a className="section-link" href="#/favorites">See all</a>}>
          <SongList tracks={favoriteTracks} />
        </Section>
      )}
    </div>
  );
}
