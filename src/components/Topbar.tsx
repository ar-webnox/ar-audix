import { useEffect, useRef, useState } from 'react';
import { navigate, paths, useRoute } from '../lib/router';
import { openImport, setSidebarOpen } from '../store/ui';
import { Icon } from './Icon';

export function Topbar() {
  const route = useRoute();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPage = useRef('/');

  useEffect(() => {
    if (route.name === 'search') setText((prev) => (prev === route.param ? prev : route.param));
    else {
      setText('');
      lastPage.current = route.path;
    }
  }, [route.name, route.param, route.path]);

  const onChange = (value: string) => {
    setText(value);
    if (value.trim() === '') navigate(lastPage.current, true);
    else navigate(paths.search(value), route.name === 'search');
  };

  const clear = () => {
    setText('');
    navigate(lastPage.current, true);
    inputRef.current?.focus();
  };

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
        <Icon name="menu" size={22} />
      </button>
      <div className="history-nav">
        <button type="button" className="icon-btn" onClick={() => history.back()} aria-label="Back" title="Back">
          <Icon name="chevronLeft" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => history.forward()} aria-label="Forward" title="Forward">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      <div className="search">
        <Icon name="search" size={18} className="search-icon" />
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          value={text}
          placeholder="Search songs, albums, artists"
          aria-label="Search your library"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (text) clear();
              else inputRef.current?.blur();
            }
          }}
        />
        {text ? (
          <button type="button" className="search-clear" onClick={clear} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        ) : (
          <kbd className="search-kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      <button type="button" className="btn btn-primary topbar-import" onClick={openImport}>
        <Icon name="plus" size={18} />
        <span>Import</span>
      </button>
    </header>
  );
}
