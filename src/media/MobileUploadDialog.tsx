import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { Icon } from '../components/icons';
import type { MobileUploadRecord, MobileUploadSession } from './mobileUploadApi';
import { useMobileUploadSession } from './useMobileUploadSession';
import './mobile-upload.css';

interface MobileUploadDialogProps {
  onClose: () => void;
  onImport: (record: MobileUploadRecord) => Promise<void>;
}

const QR_SIZE_PX = 192;
const CLOCK_INTERVAL_MS = 1000;

function useQrDataUrl(url: string): { dataUrl: string; error: boolean } {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    if (!url) { setDataUrl(''); return; }
    let active = true;
    void toDataURL(url, { width: QR_SIZE_PX, margin: 1, errorCorrectionLevel: 'M' })
      .then((data) => { if (active) setDataUrl(data); })
      .catch(() => { if (active) { setDataUrl(''); setError(true); } });
    return () => { active = false; };
  }, [url]);
  return { dataUrl, error };
}

function SessionBody({ session, imported }: { session: MobileUploadSession; imported: number }) {
  const [selectedUrl, setSelectedUrl] = useState(session.urls[0] ?? '');
  const [now, setNow] = useState(Date.now());
  const { dataUrl: qrDataUrl, error: qrError } = useQrDataUrl(selectedUrl);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((session.expiresAt - now) / CLOCK_INTERVAL_MS));
  const copyLink = () => {
    void navigator.clipboard.writeText(selectedUrl)
      .catch(() => { window.prompt('Copy failed. Copy the link manually.', selectedUrl); });
  };
  return <div className="cc-mobile-upload-body">
    <div className="cc-mobile-upload-qr">{qrDataUrl ? <img src={qrDataUrl} alt="Phone upload QR code" /> : <span>{qrError ? 'Could not generate the QR code. Copy the link instead.' : 'Generating QR code…'}</span>}</div>
    <div className="cc-mobile-upload-instructions">
      <ol><li>Connect your phone and computer to the same Wi-Fi</li><li>Scan the QR code with your phone camera</li><li>Choose media; completed uploads appear in the media pool automatically</li></ol>
      {session.urls.length > 1 && <label>Local network address<select value={selectedUrl} onChange={(event) => setSelectedUrl(event.target.value)}>{session.urls.map((url) => <option key={url} value={url}>{new URL(url).host}</option>)}</select></label>}
      <div className="cc-mobile-upload-link"><code>{selectedUrl}</code><button type="button" onClick={copyLink}>Copy link</button></div>
      <p>{seconds > 0 ? `Channel closes in ${seconds} seconds` : 'The upload channel expired. Close and try again.'}</p>
      <div className="cc-mobile-upload-count"><span className="cc-mobile-upload-live" />{`${imported} media files received and imported`}</div>
    </div>
  </div>;
}

function DialogHeader({ close }: { close: () => void }) {
  return <header><div><strong>Upload from phone</strong><span>Scan to choose video, images, or audio from your phone</span></div><button type="button" autoFocus aria-label="Close" onClick={close}><Icon name="x" size={18} /></button></header>;
}

export function MobileUploadDialog({ onClose, onImport }: MobileUploadDialogProps) {
  const { session, error, imported, finish } = useMobileUploadSession(onImport);
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    void finish().finally(onClose);
  };
  return <div className="cc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload from phone" onClick={close}>
    <div className="cc-mobile-upload-dialog" onClick={(event) => event.stopPropagation()}>
      <DialogHeader close={close} />
      {!session && !error && <div className="cc-mobile-upload-loading">Opening a local network upload channel…</div>}
      {session && <SessionBody session={session} imported={imported} />}
      {error && <div className="cc-mobile-upload-error">{`Phone upload unavailable: ${error}`}</div>}
      <footer><span>Only media upload is temporarily available for this session. The editor and API keys remain private.</span><button type="button" disabled={closing} onClick={close}>{closing ? 'Finishing imports…' : 'Done'}</button></footer>
    </div>
  </div>;
}
