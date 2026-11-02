import { useStore } from '../lib/createStore';
import { useRoute, type RouteName } from '../lib/router';
import { installGuide, isTouchDevice, promptInstall, usePwa } from '../lib/pwa';
import { library } from '../store/library';
import { askConfirm, openImport, setSidebarOpen, ui } from '../store/ui';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  match: RouteName[];
  count?: number;
}

export function Sidebar() {
  const route = useRoute();
  const { canInstall, installed, ios } = usePwa();
  // Without a browser prompt (iOS Safari or Chrome before it offers one) phones still get a button that explains how.
  const showGuide = !installed && !canInstall && (ios || isTouchDevice());
  const open = useStore(ui, (s) => s.sidebarOpen);
  const songCount = useStore(library, (s) => s.tracks.length);
  const favoriteCount = useStore(library, (s) => s.favorites.length);
  const playlistCount = useStore(library, (s) => s.playlists.length);

  const browse: NavItem[] = [
    { label: 'Home', href: '#/', icon: 'home', match: ['home'] },
    { label: 'My Music', href: '#/my-music', icon: 'library', match: ['my-music'] },
    { label: 'All Songs', href: '#/songs', icon: 'songs', match: ['songs'], count: songCount },
    { label: 'Albums', href: '#/albums', icon: 'album', match: ['albums', 'album'] },
    { label: 'Artists', href: '#/artists', icon: 'artist', match: ['artists', 'artist'] },
  ];
  const collection: NavItem[] = [
    { label: 'Playlists', href: '#/playlists', icon: 'playlist', match: ['playlists', 'playlist'], count: playlistCount },
    { label: 'Favorites', href: '#/favorites', icon: 'heart', match: ['favorites'], count: favoriteCount },
    { label: 'Recently Played', href: '#/recent', icon: 'clock', match: ['recent'] },
  ];

  const renderItem = (item: NavItem) => {
    const active = item.match.includes(route.name);
    return (
      <a
        key={item.href}
        href={item.href}
        className={`nav-item${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon name={item.icon} size={19} />
        <span>{item.label}</span>
        {item.count !== undefined && item.count > 0 && <span className="nav-count">{item.count.toLocaleString()}</span>}
      </a>
    );
  };

  return (
    <>
      <div className={`sidebar-scrim${open ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <Logo />
          <button type="button" className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="nav">
          <div className="nav-group">
            <div className="nav-heading">Browse</div>
            {browse.map(renderItem)}
          </div>
          <div className="nav-group">
            <div className="nav-heading">Collection</div>
            {collection.map(renderItem)}
          </div>
        </nav>

        <div className="sidebar-foot">
          <button type="button" className="btn btn-primary btn-block" onClick={openImport}>
            <Icon name="upload" size={18} />
            Import music
          </button>
          {!installed && (canInstall || showGuide) && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setSidebarOpen(false);
                if (canInstall) void promptInstall();
                else {
                  const g = installGuide(ios);
                  askConfirm({ title: g.title, message: g.message, confirmLabel: 'Got it', onConfirm: () => undefined });
                }
              }}
            >
              <Icon name="download" size={18} />
              Install app
            </button>
          )}
          {renderItem({ label: 'Settings', href: '#/settings', icon: 'settings', match: ['settings'] })}
        </div>
      </aside>
    </>
  );
}
