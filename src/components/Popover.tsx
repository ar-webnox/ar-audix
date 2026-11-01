import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnchorRect } from '../store/ui';
import { Icon, type IconName } from './Icon';

interface PopoverProps {
  anchor: AnchorRect;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  /** Prefer opening above the anchor (used by the bottom player). */
  preferAbove?: boolean;
  label: string;
}

export function rectOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
}

/** A floating panel anchored to a rectangle. Closes on outside press, scroll and Escape. */
export function Popover({ anchor, onClose, children, align = 'start', preferAbove = false, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = align === 'end' ? anchor.right - w : anchor.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
    const below = anchor.bottom + 6;
    const above = anchor.top - h - 6;
    let top = preferAbove ? above : below;
    if (preferAbove && top < margin) top = below;
    if (!preferAbove && top + h > window.innerHeight - margin) top = above >= margin ? above : Math.max(margin, window.innerHeight - h - margin);
    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  });

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (ref.current?.contains(target) || target?.closest('[data-popover-trigger]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])');
    first?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const nextAt = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[nextAt].focus();
  };

  return createPortal(
    <div
      ref={ref}
      className="popover"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface MenuEntry {
  id: string;
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
  separatorBefore?: boolean;
}

export function MenuItems({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((e) => (
        <div key={e.id} role="none">
          {e.separatorBefore && <div className="menu-sep" role="separator" />}
          <button
            type="button"
            role={e.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={e.checked}
            className={`menu-item${e.danger ? ' danger' : ''}${e.checked ? ' checked' : ''}`}
            disabled={e.disabled}
            onClick={e.onSelect}
          >
            {e.icon ? <Icon name={e.icon} size={17} /> : <span className="menu-icon-gap" />}
            <span className="menu-label">{e.label}</span>
            {e.checked && <Icon name="check" size={16} />}
            {e.hasSubmenu && <Icon name="chevronRight" size={16} />}
          </button>
        </div>
      ))}
    </>
  );
}
