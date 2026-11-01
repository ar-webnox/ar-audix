import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/createStore';
import { formatBytes, formatTotal } from '../lib/format';
import { library, useIndex } from '../store/library';
import { PageHeader, Section, StatTile } from '../components/common';
import { Icon } from '../components/Icon';
import { ImportDropzone } from '../components/ImportDropzone';
import { SongList } from '../components/SongList';

export function MyMusicPage() {
  const index = useIndex();
  const tracks = useStore(library, (s) => s.tracks);
  const ready = useStore(library, (s) => s.ready);
  const [usage, setUsage] = useState<number | null>(null);

  const totalSize = useMemo(() => tracks.reduce((sum, t) => sum + t.size, 0), [tracks]);
  const formats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) counts.set(t.ext.toUpperCase() || 'OTHER', (counts.get(t.ext.toUpperCase() || 'OTHER') ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [tracks]);
  const newest = useMemo(() => [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8), [tracks]);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => undefined);
  }, [tracks.length]);

  return (
    <div className="page">
      <PageHeader title="My Music" subtitle="Your local library: add music, and see what’s inside." />

      <ImportDropzone compact />

      {ready && tracks.length > 0 && (
        <>
          <div className="stats">
            <StatTile label="Songs" value={tracks.length.toLocaleString()} />
            <StatTile label="Albums" value={index.albums.length.toLocaleString()} />
            <StatTile label="Artists" value={index.artists.length.toLocaleString()} />
            <StatTile label="Library size" value={formatBytes(totalSize)} />
          </div>

          <div className="info-grid">
            <div className="info-card">
              <h3>Formats</h3>
              <ul className="format-list">
                {formats.map(([ext, count]) => (
                  <li key={ext}>
                    <span>{ext}</span>
                    <span className="muted">{count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="info-card">
              <h3>Storage</h3>
              <p className="info-big">{usage !== null ? formatBytes(usage) : '–'}</p>
              <p className="muted">Used by AR AUDIX in this browser. Total playtime {formatTotal(index.totalDuration)}.</p>
            </div>
            <a className="info-card info-link" href="#/songs">
              <Icon name="songs" size={22} />
              <h3>Browse all songs</h3>
              <p className="muted">Sort and search every track.</p>
            </a>
          </div>

          <Section title="Recently added" action={<a className="section-link" href="#/songs">See all songs</a>}>
            <SongList tracks={newest} />
          </Section>
        </>
      )}
    </div>
  );
}
