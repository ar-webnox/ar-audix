import { player, playContext, shufflePlay, togglePlay } from '../store/player';

/** Play a list of tracks from a given track; toggles pause if that track is already current. */
export function playFrom(ids: string[], trackId: string): void {
  if (player.get().currentId === trackId && player.get().queue.length > 0) {
    togglePlay();
    return;
  }
  playContext(ids, trackId);
}

export function playAll(ids: string[]): void {
  if (ids.length === 0) return;
  playContext(ids, ids[0], { shuffle: false });
}

export function shuffleAll(ids: string[]): void {
  if (ids.length === 0) return;
  shufflePlay(ids);
}
