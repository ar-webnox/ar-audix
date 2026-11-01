import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Artwork, initialsOf } from './Artwork';
import { paths } from '../lib/router';
import { playAll } from '../lib/actions';

/* ---------- buttons ---------- */

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  small?: boolean;
}

export function Button({ variant = 'secondary', icon, small, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}${small ? ' btn-sm' : ''}`} {...rest}>
      {icon && <Icon name={icon} size={small ? 16 : 18} />}
      {children}
    </button>
  );
}

/* ---------- page structure ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/* ---------- cards ---------- */

interface CardProps {
  href?: string;
  title: string;
  subtitle: string;
  seed: string;
  round?: boolean;
  initials?: string;
  artId?: string | null;
  onPlay?: () => void;
  playLabel?: string;
}

/** A browsing card with artwork, a hover play button, and a link to its detail page. */
export function MediaCard({ href, title, subtitle, seed, round, initials, artId, onPlay, playLabel }: CardProps) {
  const body = (
    <>
      <Artwork seed={seed} round={round} initials={initials} artId={artId} />
      <div className="card-title" title={title}>
        {title}
      </div>
      <div className="card-sub" title={subtitle}>
        {subtitle}
      </div>
    </>
  );
  return (
    <div className={`card${round ? ' card-round' : ''}`}>
      {href ? (
        <a className="card-link" href={href}>
          {body}
        </a>
      ) : (
        <div className="card-link">{body}</div>
      )}
      {onPlay && (
        <button type="button" className="card-play" onClick={onPlay} aria-label={playLabel ?? `Play ${title}`}>
          <Icon name="play" size={20} />
        </button>
      )}
    </div>
  );
}

export function AlbumCardFor({
  album,
}: {
  album: { key: string; name: string; artist: string; trackIds: string[]; artId?: string };
}) {
  return (
    <MediaCard
      href={paths.album(album.key)}
      title={album.name}
      subtitle={album.artist}
      seed={album.name}
      artId={album.artId}
      onPlay={() => playAll(album.trackIds)}
    />
  );
}

export function ArtistCardFor({ artist }: { artist: { key: string; name: string; trackIds: string[] } }) {
  return (
    <MediaCard
      href={paths.artist(artist.key)}
      title={artist.name}
      subtitle={`${artist.trackIds.length} ${artist.trackIds.length === 1 ? 'song' : 'songs'}`}
      seed={artist.name}
      round
      initials={initialsOf(artist.name)}
      onPlay={() => playAll(artist.trackIds)}
    />
  );
}

/** Animated bars shown on the song that is currently playing. */
export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className={`eq${active ? ' eq-active' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
