import { useState } from 'react';
import type { MediaAsset } from '../editor/types';
import { exportMediaAsset } from './assetExport';

interface AssetExportButtonProps {
  asset: MediaAsset;
  fps: number;
  onError: (message: string) => void;
  onComplete?: () => void;
}

export function AssetExportButton({ asset, fps, onError, onComplete }: AssetExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const label = asset.kind === 'motion-graphic' ? 'Export transparent MOV' : 'Download original';
  const run = async () => {
    setBusy(true);
    onError('');
    try {
      await exportMediaAsset(asset, fps);
      onComplete?.();
    } catch (error) {
      onError(`Media export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} title={label} aria-label={`${label}: ${asset.name}`}
      onClick={(event) => { event.stopPropagation(); void run(); }}>
      {busy ? 'Exporting…' : label}
    </button>
  );
}
