import { theme } from '../../theme';
import type { SelectedPreviewStatus } from '../../gl/previewAdapter';

function fallbackReasonText(status: SelectedPreviewStatus): string {
  if (status.fallbackReason === 'webgl-unavailable') return 'WebGL2 unavailable';
  if (status.fallbackReason === 'unsupported-media') return 'Media type does not support texture preview';
  if (status.fallbackReason === 'missing-shader') return 'Shader resource missing';
  if (status.fallbackReason === 'shader-error') return 'Shader compilation or runtime failure';
  if (status.fallbackReason === 'unsupported-transition') return 'Transition does not support GL';
  return 'Resource not ready yet';
}

export function PreviewFidelityStatus({ status }: { status?: SelectedPreviewStatus }) {
  if (!status || status.phase === 'inactive') return null;
  const fallback = status.phase === 'fallback';
  const label = status.phase === 'ready'
    ? 'Real GL preview · shares parameters with export'
    : status.phase === 'waiting'
      ? 'Preparing real GL preview…'
      : status.adapter === 'css-transition'
        ? 'CSS fallback preview · does not represent the export'
        : 'Source fallback · effects not shown';
  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 24,
      padding: '4px 6px', border: `0.5px solid ${fallback ? theme.accent : theme.border}`,
      borderRadius: 4, color: fallback ? theme.text : theme.textMuted,
      background: theme.panelAlt, fontSize: 10.5, lineHeight: 1.35,
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto', background: fallback ? theme.accent : status.phase === 'ready' ? theme.success : theme.textDim }} />
      <span>{label}{fallback ? ` · ${fallbackReasonText(status)}` : ''}</span>
    </div>
  );
}
