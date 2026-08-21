import { Icon } from '../components/icons';
import type { ExportDestination } from './exportDestination';

interface ExportDestinationBarProps {
  busy: boolean;
  choosing: boolean;
  destination: ExportDestination;
  onChoose: () => Promise<void>;
}

export function ExportDestinationBar({
  busy,
  choosing,
  destination,
  onChoose,
}: ExportDestinationBarProps) {
  const downloads = destination.type === 'downloads';
  const file = destination.type === 'browser-file' || destination.type === 'desktop-file';
  return (
    <div className="cc-export-destination">
      <span className="cc-export-destination-icon"><Icon name="folder" size={16} /></span>
      <span className="cc-export-destination-copy">
        <small>Save to</small>
        <strong title={destination.label}>{downloads ? 'Browser downloads' : destination.label}</strong>
        {!file && (
          <i>{downloads ? 'The browser controls the download location' : 'Files are written directly to the selected folder'}</i>
        )}
      </span>
      <button type="button" onClick={() => void onChoose()} disabled={busy || choosing}>
        {choosing ? 'Choosing…' : downloads ? 'Choose…' : 'Change…'}
      </button>
    </div>
  );
}
