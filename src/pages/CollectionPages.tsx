import { useMemo } from 'react';
import { useStore } from '../lib/createStore';
import { plural } from '../lib/format';
import { playAll, shuffleAll } from '../lib/actions';
import { clearRecent, library, resolveTracks } from '../store/library';
import { Button, EmptyState, PageHeader } from '../components/common';
import { SongList } from '../components/SongList';

export function FavoritesPage() {
  const favorites = useStore(library, (s) => s.favorites);
  const libraryTracks = useStore(library, (s) => s.tracks);
  const tracks = useMemo(() => resolveTracks(favorites), [favorites, libraryTracks]);
  const ids = tracks.map((t) => t.id);

  return (
    <div className="page">
      <PageHeader
        title="Favorites"
        subtitle={tracks.length ? plural(tracks.length, 'song') : undefined}
        actions={
          tracks.length > 0 && (
            <>
              <Button variant="primary" icon="play" onClick={() => playAll(ids)}>
                Play
              </Button>
              <Button icon="shuffle" onClick={() => shuffleAll(ids)}>
                Shuffle
              </Button>
            </>
          )
        }
      />
      {tracks.length === 0 ? (
        <EmptyState
          icon="heart"
          title="No favorites yet"
          description="Tap the heart next to any song, or in the player, to keep it here."
        />
      ) : (
        <SongList tracks={tracks} />
      )}
    </div>
  );
}

export function RecentPage() {
  const recent = useStore(library, (s) => s.recent);
  const libraryTracks = useStore(library, (s) => s.tracks);
  const tracks = useMemo(() => resolveTracks(recent.map((r) => r.id)), [recent, libraryTracks]);
  const ids = tracks.map((t) => t.id);

  return (
    <div className="page">
      <PageHeader
        title="Recently Played"
        subtitle={tracks.length ? `Your last ${plural(tracks.length, 'song')}` : undefined}
        actions={
          tracks.length > 0 && (
            <>
              <Button variant="primary" icon="play" onClick={() => playAll(ids)}>
                Play
              </Button>
              <Button variant="ghost" icon="trash" onClick={clearRecent}>
                Clear history
              </Button>
            </>
          )
        }
      />
      {tracks.length === 0 ? (
        <EmptyState icon="clock" title="Nothing played yet" description="Songs you listen to will appear here, newest first." />
      ) : (
        <SongList tracks={tracks} />
      )}
    </div>
  );
}
