import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { plural } from '../lib/format';
import { normalizeKey } from '../lib/format';
import { searchTracks } from '../lib/derive';
import { library, useIndex } from '../store/library';
import { AlbumCardFor, ArtistCardFor, EmptyState, PageHeader, Section } from '../components/common';
import { SongList } from '../components/SongList';

export function SearchPage({ query }: { query: string }) {
  const tracks = useStore(library, (s) => s.tracks);
  const index = useIndex();
  const q = normalizeKey(query);

  const songs = useMemo(() => searchTracks(tracks, query), [tracks, query]);
  const albums = useMemo(() => index.albums.filter((a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)).slice(0, 12), [index, q]);
  const artists = useMemo(() => index.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 12), [index, q]);

  const nothing = songs.length === 0 && albums.length === 0 && artists.length === 0;

  return (
    <div className="page">
      <PageHeader title="Search" subtitle={q ? `Results for “${query.trim()}”` : 'Type to search your library'} />
      {nothing ? (
        <EmptyState
          icon="search"
          title={tracks.length === 0 ? 'Your library is empty' : 'No matches'}
          description={tracks.length === 0 ? 'Import some music, then search it here.' : 'Try a different spelling, or search by artist or album.'}
        />
      ) : (
        <>
          {artists.length > 0 && (
            <Section title="Artists">
              <div className="card-grid">
                {artists.map((a) => (
                  <ArtistCardFor key={a.key} artist={a} />
                ))}
              </div>
            </Section>
          )}
          {albums.length > 0 && (
            <Section title="Albums">
              <div className="card-grid">
                {albums.map((a) => (
                  <AlbumCardFor key={a.key} album={a} />
                ))}
              </div>
            </Section>
          )}
          {songs.length > 0 && (
            <Section title={`Songs · ${plural(songs.length, 'match', 'matches')}`}>
              <SongList tracks={songs} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
