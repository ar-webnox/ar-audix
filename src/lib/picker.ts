import { AUDIO_ACCEPT, candidatesFromFiles, type Candidate } from './audioFiles';
import { isCancel, linkingSupported, pickDirectoryHandle, pickFileHandles } from './fsa';

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

/** Opens the browser's own file chooser that keeps references to the originals, falling back to the plain one. */
function pickLinked(source: () => Promise<Candidate[]>, fallback: () => void, onPicked: (c: Candidate[]) => void): void {
  void source()
    .then((c) => {
      if (c.length > 0) onPicked(c);
    })
    .catch((e) => {
      if (!isCancel(e)) fallback();
    });
}

/** `link`: keep the songs where they are (supported browsers only) instead of copying them into the browser. */
export function pickFiles(onPicked: (c: Candidate[]) => void, link = false): void {
  const plain = () => pickPlainFiles(onPicked);
  if (link && linkingSupported()) pickLinked(pickFileHandles, plain, onPicked);
  else plain();
}

function pickPlainFiles(onPicked: (c: Candidate[]) => void): void {
  pick((input) => {
    input.multiple = true;
    input.accept = AUDIO_ACCEPT;
  }, onPicked);
}

export function folderPickingSupported(): boolean {
  if (typeof document === 'undefined') return false;
  if (linkingSupported()) return true;
  return 'webkitdirectory' in document.createElement('input');
}

export function pickFolder(onPicked: (c: Candidate[]) => void, link = false): void {
  const plain = () => pickPlainFolder(onPicked);
  if (link && linkingSupported()) pickLinked(pickDirectoryHandle, plain, onPicked);
  else plain();
}

function pickPlainFolder(onPicked: (c: Candidate[]) => void): void {
  pick((input) => {
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, onPicked);
}
