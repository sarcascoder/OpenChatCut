import { Icon } from '../components/icons';
import { EXPORT_ACTION_LABELS, type ExportWorkflowModel } from './useExportDialogModel';
import type { ExportPhase, ExportProgress, ExportTab } from './useExportWorkflow';

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const PHASE_LABELS: Record<ExportPhase, string> = {
  queued: 'Waiting to render',
  preparing: 'Preparing media',
  rendering: 'Rendering',
  finalizing: 'Finalizing file',
  verifying: 'Running quality checks',
  downloading: 'Downloading',
  completed: 'Export complete',
  failed: 'Export failed',
  cancelled: 'Cancelled',
};

function exportEta(progress: ExportProgress, elapsedMs: number): number | null {
  if (progress.phase !== 'rendering' || progress.percent < 3 || progress.percent >= 99) return null;
  return elapsedMs * (100 - progress.percent) / progress.percent;
}

function ExportProgressView({ progress, clock }: { progress: ExportProgress; clock: number }) {
  const label = PHASE_LABELS[progress.phase];
  const elapsedMs = (progress.finishedAt ?? clock) - progress.startedAt;
  const etaMs = exportEta(progress, elapsedMs);
  return (
    <div className={`cc-export-progress ${progress.phase}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
      <div className="cc-export-progress-head">
        <strong>{label}</strong><span>{progress.percent}%</span>
      </div>
      <div className="cc-export-progress-track" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress.percent / 100})` }} />
      </div>
      <div className="cc-export-progress-meta">
        {progress.processedFrames !== undefined && progress.totalFrames !== undefined && (
          <span>{`Rendered ${progress.processedFrames}/${progress.totalFrames} frames`}</span>
        )}
        {progress.detail && <span>{progress.detail}</span>}
        <span>{`Elapsed ${formatDuration(elapsedMs)}`}</span>
        {etaMs !== null && etaMs < 24 * 60 * 60_000 && (
          <span>{`About ${formatDuration(etaMs)} remaining`}</span>
        )}
        {progress.outputSize !== undefined && <span>{`File size ${formatBytes(progress.outputSize)}`}</span>}
      </div>
    </div>
  );
}

interface ExportFooterProps {
  tab: ExportTab;
  outputName: string;
  videoSummary: string;
  disabled: boolean;
  workflow: ExportWorkflowModel;
}

export function ExportFooter({ tab, outputName, videoSummary, disabled, workflow }: ExportFooterProps) {
  const { busy, cancelExport, clock, progress, renderEngine, run } = workflow;
  const cancellablePhase = progress?.phase === 'queued'
    || progress?.phase === 'preparing'
    || progress?.phase === 'rendering';
  const cancellable = !!busy && cancellablePhase
    && (renderEngine === 'checking' || renderEngine === 'browser' || renderEngine === 'server');
  return (
    <footer className={`cc-export-footer${progress ? ' has-progress' : ''}`}>
      {progress && <ExportProgressView progress={progress} clock={clock} />}
      <div className="cc-export-output">
        <span>{progress?.phase === 'completed' ? 'Created' : tab === 'video' ? 'Output settings' : 'Output'}</span>
        <strong>{tab === 'video' ? videoSummary : outputName}</strong>
        {tab === 'video' && <small title={outputName}>{outputName}</small>}
      </div>
      {cancellable && (
        <button type="button" className="cc-export-cancel" onClick={cancelExport}>Cancel</button>
      )}
      <button type="button" className="cc-export-cta" onClick={() => void run()} disabled={disabled}>
        {!busy && <Icon name={progress?.phase === 'completed' ? 'check' : 'download'} size={17} />}
        {busy ? `${progress?.percent ?? 0}%` : progress?.phase === 'completed' ? 'Done'
          : progress?.phase === 'failed' ? 'Retry' : EXPORT_ACTION_LABELS[tab]}
      </button>
    </footer>
  );
}
