import { createStore } from '../lib/createStore';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface TrackMenuState {
  trackId: string;
  anchor: AnchorRect;
  /** Set when the menu is opened from a playlist page. */
  playlistId?: string;
}

export interface PlaylistDialogState {
  mode: 'create' | 'rename';
  playlistId?: string;
  /** Tracks to put into the playlist right after it is created. */
  addTrackIds?: string[];
}

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface UIState {
  toasts: Toast[];
  panel: null | 'queue' | 'lyrics' | 'sound';
  importOpen: boolean;
  sidebarOpen: boolean;
  dragging: boolean;
  trackMenu: TrackMenuState | null;
  playlistDialog: PlaylistDialogState | null;
  confirm: ConfirmState | null;
}

export const ui = createStore<UIState>({
  toasts: [],
  panel: null,
  importOpen: false,
  sidebarOpen: false,
  dragging: false,
  trackMenu: null,
  playlistDialog: null,
  confirm: null,
});

let toastId = 1;

export function toast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = toastId++;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 4500);
}

export function dismissToast(id: number): void {
  ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function openPanel(panel: 'queue' | 'lyrics' | 'sound'): void {
  ui.set((s) => ({ panel: s.panel === panel ? null : panel }));
}

export function closePanel(): void {
  ui.set({ panel: null });
}

export function openImport(): void {
  ui.set({ importOpen: true, sidebarOpen: false });
}

export function closeImport(): void {
  ui.set({ importOpen: false });
}

export function setSidebarOpen(open: boolean): void {
  ui.set({ sidebarOpen: open });
}

export function openTrackMenu(trackId: string, anchor: AnchorRect, playlistId?: string): void {
  ui.set({ trackMenu: { trackId, anchor, playlistId } });
}

export function closeTrackMenu(): void {
  ui.set({ trackMenu: null });
}

export function openPlaylistDialog(state: PlaylistDialogState): void {
  ui.set({ playlistDialog: state, trackMenu: null });
}

export function closePlaylistDialog(): void {
  ui.set({ playlistDialog: null });
}

export function askConfirm(state: ConfirmState): void {
  ui.set({ confirm: state, trackMenu: null });
}

export function closeConfirm(): void {
  ui.set({ confirm: null });
}
