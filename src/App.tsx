import { useEffect, useRef } from 'react';
import { useRoute } from './lib/router';
import { initLibrary } from './store/library';
import { nudgeVolume, cycleRepeat, next, previous, seekBy, toggleMute, togglePlay, toggleShuffle } from './store/player';
import { openPanel } from './store/ui';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { PlayerBar } from './components/PlayerBar';
import { SidePanel } from './components/SidePanel';
import { ConfirmDialog, DropOverlay, ImportDialog, ImportProgress, PlaylistDialog, ToastHost, TrackMenuHost } from './components/Overlays';
import { EmptyState } from './components/common';
import { HomePage } from './pages/HomePage';
import { MyMusicPage } from './pages/MyMusicPage';
import { SongsPage } from './pages/SongsPage';
import { AlbumDetailPage, AlbumsPage } from './pages/AlbumsPage';
import { ArtistDetailPage, ArtistsPage } from './pages/ArtistsPage';
import { PlaylistDetailPage, PlaylistsPage } from './pages/PlaylistsPage';
import { FavoritesPage, RecentPage } from './pages/CollectionPages';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

function Page() {
  const route = useRoute();
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'my-music':
      return <MyMusicPage />;
    case 'songs':
      return <SongsPage />;
    case 'albums':
      return <AlbumsPage />;
    case 'album':
      return <AlbumDetailPage albumKey={route.param} />;
    case 'artists':
      return <ArtistsPage />;
    case 'artist':
      return <ArtistDetailPage artistKey={route.param} />;
    case 'playlists':
      return <PlaylistsPage />;
    case 'playlist':
      return <PlaylistDetailPage playlistId={route.param} />;
    case 'favorites':
      return <FavoritesPage />;
    case 'recent':
      return <RecentPage />;
    case 'search':
      return <SearchPage query={route.param} />;
    case 'settings':
      return <SettingsPage />;
    default:
      return (
        <div className="page">
          <EmptyState icon="search" title="Page not found" description="That page doesn’t exist.">
            <a className="btn btn-secondary" href="#/">
              Go home
            </a>
          </EmptyState>
        </div>
      );
  }
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      const onButton = tag === 'BUTTON' || tag === 'A' || el?.getAttribute('role') === 'slider' || el?.getAttribute('role')?.startsWith('menuitem');
      if (document.querySelector('.modal, .popover')) return;

      switch (e.key) {
        case ' ':
          if (onButton) return;
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (onButton) return;
          e.preventDefault();
          seekBy(5);
          break;
        case 'ArrowLeft':
          if (onButton) return;
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowUp':
          if (onButton) return;
          e.preventDefault();
          nudgeVolume(0.05);
          break;
        case 'ArrowDown':
          if (onButton) return;
          e.preventDefault();
          nudgeVolume(-0.05);
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'n':
        case 'N':
          next();
          break;
        case 'p':
        case 'P':
          previous();
          break;
        case 's':
        case 'S':
          toggleShuffle();
          break;
        case 'r':
        case 'R':
          cycleRepeat();
          break;
        case 'q':
        case 'Q':
          openPanel('queue');
          break;
        case '/':
          e.preventDefault();
          document.getElementById('global-search')?.focus();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const route = useRoute();
  const scrollRef = useRef<HTMLElement>(null);
  useShortcuts();

  useEffect(() => {
    void initLibrary();
  }, []);

  // Detail pages start at the top. Search keeps its place while the query changes.
  useEffect(() => {
    if (route.name !== 'search') scrollRef.current?.scrollTo({ top: 0 });
  }, [route.path, route.name]);

  return (
    <div className="app">
      <Sidebar />
      <div className="workspace">
        <Topbar />
        <main ref={scrollRef} className="content" data-scroll-root id="main" tabIndex={-1}>
          <Page />
        </main>
      </div>
      <PlayerBar />
      <SidePanel />
      <ImportProgress />
      <ImportDialog />
      <TrackMenuHost />
      <PlaylistDialog />
      <ConfirmDialog />
      <ToastHost />
      <DropOverlay />
    </div>
  );
}
