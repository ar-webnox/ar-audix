import { AUDIO_ACCEPT, candidatesFromFiles, type Candidate } from './audioFiles';

let active: HTMLInputElement | null = null;

function pick(configure: (input: HTMLInputElement) => void, onPicked: (c: Candidate[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  configure(input);
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onPicked(candidatesFromFiles(files));
    if (active === input) active = null;
  });
  active = input; // keep a reference so the element is not collected before it fires
  input.click();
}

export function pickFiles(onPicked: (c: Candidate[]) => void): void {
  pick((input) => {
    input.multiple = true;
    input.accept = AUDIO_ACCEPT;
  }, onPicked);
}

export function folderPickingSupported(): boolean {
  if (typeof document === 'undefined') return false;
  return 'webkitdirectory' in document.createElement('input');
}

export function pickFolder(onPicked: (c: Candidate[]) => void): void {
  pick((input) => {
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, onPicked);
}
