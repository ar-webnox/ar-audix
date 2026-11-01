import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../lib/format';

interface SliderProps {
  value: number;
  max: number;
  label: string;
  /** Human readable value for screen readers, e.g. "1:05 of 3:20". */
  valueText?: string;
  disabled?: boolean;
  /** Arrow-key step, in the same unit as `value`. */
  step?: number;
  className?: string;
  /** Fires continuously while dragging, then once with null when the drag ends. */
  onPreview?: (value: number | null) => void;
  /** Fires when the user releases the pointer or presses a key. */
  onCommit: (value: number) => void;
  /** Commit continuously while dragging (used for volume). */
  live?: boolean;
}

/** A pointer-driven slider used for both seeking and volume. */
export function Slider({ value, max, label, valueText, disabled, step = 1, className, onPreview, onCommit, live }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);

  const shown = drag ?? value;
  const pct = max > 0 ? clamp((shown / max) * 100, 0, 100) : 0;

  const valueAt = (e: PointerEvent): number => {
    const rect = ref.current!.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1) * max;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    const v = valueAt(e);
    setDrag(v);
    onPreview?.(v);
    if (live) onCommit(v);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const v = valueAt(e);
    setDrag(v);
    onPreview?.(v);
    if (live) onCommit(v);
  };

  const end = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!dragging.current) return;
    dragging.current = false;
    const v = valueAt(e);
    setDrag(null);
    if (commit && !live) onCommit(v);
    onPreview?.(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'PageUp':
        next = value + step * 5;
        break;
      case 'PageDown':
        next = value - step * 5;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = max;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(clamp(next, 0, max));
  };

  return (
    <div
      ref={ref}
      className={`slider${disabled ? ' disabled' : ''}${drag !== null ? ' dragging' : ''}${className ? ` ${className}` : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, true)}
      onPointerCancel={(e) => end(e, false)}
      onKeyDown={onKeyDown}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}
