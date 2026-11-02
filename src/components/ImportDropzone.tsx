import { FORMAT_LABELS } from '../lib/audioFiles';
import { folderPickingSupported, pickFiles, pickFolder } from '../lib/picker';
import { useStore } from '../lib/createStore';
import { importCandidates, library } from '../store/library';
import { Button } from './common';
import { Icon } from './Icon';

/** Visual drop target plus the file and folder pickers. Dropping works anywhere in the window. */
export function ImportDropzone({ onStarted, compact }: { onStarted?: () => void; compact?: boolean }) {
  const start = (candidates: Parameters<typeof importCandidates>[0]) => {
    onStarted?.();
    void importCandidates(candidates);
  };
  const folders = folderPickingSupported();
  const link = useStore(library, (s) => s.settings.linkFiles);

  return (
    <div className={`dropzone${compact ? ' compact' : ''}`}>
      <div className="dropzone-icon">
        <Icon name="upload" size={compact ? 24 : 30} />
      </div>
      <h3>Drag and drop your music here</h3>
      <p>Drop audio files or entire folders anywhere in this window.</p>
      <div className="dropzone-actions">
        <Button variant="primary" icon="file" onClick={() => pickFiles(start, link)}>
          Select files
        </Button>
        <Button
          icon="folderMusic"
          onClick={() => pickFolder(start, link)}
          disabled={!folders}
          title={folders ? undefined : 'Your browser can’t select folders. Drag a folder in or select files instead.'}
        >
          Select folder
        </Button>
      </div>
      <ul className="format-chips" aria-label="Supported formats">
        {FORMAT_LABELS.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
