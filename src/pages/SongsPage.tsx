import { useMemo, useState } from 'react';
import { useStore } from '../lib/createStore';
import { plural } from '../lib/format';
import { playAll, shuffleAll } from '../lib/actions';
import { sortTracks, type SortKey } from '../lib/derive';
import { library } from '../store/library';
import { openImport } from '../store/ui';
import { Button, EmptyState, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { SongList } from '../components/SongList';

const SORT_OPTIONS: { key: SortKey; label: string; defaultAscending: boolean }[] = [
  { key: 'added', label: 'Date added', defaultAscending: false },
  { key: 'title', label: 'Title', defaultAscending: true },
  { key: 'artist', label: 'Artist', defaultAscending: true },
  { key: 'album', label: 'Album', defaultAscending: true },
  { key: 'duration', label: 'Duration', defaultAscending: false },
];

export function SongsPage() {
  const tracks = useStore(library, (s) => s.tracks);
  const ready = useStore(library, (s) => s.ready);
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [ascending, setAscending] = useState(true);
  const sorted = useMemo(() => sortTracks(tracks, sortKey, ascending), [tracks, sortKey, ascending]);
  const ids = sorted.map((t) => t.id);

  if (ready && tracks.length === 0) {
    return (
      <div className="page">
        <PageHeader title="All Songs" />
        <EmptyState icon="songs" title="No songs yet" description="Import some music and every track will show up here.">
          <Button variant="primary" icon="upload" onClick={openImport}>
            Import music
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="All Songs"
        subtitle={plural(tracks.length, 'song')}
        actions={
          <>
            <Button variant="primary" icon="play" onClick={() => playAll(ids)}>
              Play
            </Button>
            <Button icon="shuffle" onClick={() => shuffleAll(ids)}>
              Shuffle
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <label className="sort-select">
          <span>Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const option = SORT_OPTIONS.find((o) => o.key === e.target.value)!;
              setSortKey(option.key);
              setAscending(option.defaultAscending);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setAscending((a) => !a)}
          aria-label={ascending ? 'Ascending order. Switch to descending.' : 'Descending order. Switch to ascending.'}
        >
          <Icon name={ascending ? 'chevronUp' : 'chevronDown'} size={16} />
          {ascending ? 'Ascending' : 'Descending'}
        </button>
      </div>
      <SongList tracks={sorted} />
    </div>
  );
}
