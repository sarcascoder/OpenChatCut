import type { ApprovalDetail } from '../../agent/approval-details';
import { theme } from '../../theme';

const mono = 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace';

export function ApprovalDetails({
  details,
  argsDigest,
  operationId,
}: {
  details?: readonly ApprovalDetail[];
  argsDigest?: string;
  operationId?: string;
}) {
  if (!details?.length && !argsDigest && !operationId) return null;
  return (
    <div style={{ marginTop: 7, display: 'grid', gap: 5 }}>
      {details?.map((detail, index) => (
        <div key={`${detail.kind}-${detail.label}-${index}`} style={{ display: 'grid', gap: 2 }}>
          <span style={{ color: theme.textDim, fontSize: 10.5 }}>{detail.label}</span>
          <code style={{ color: theme.text, fontFamily: mono, fontSize: 11, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {detail.value}
          </code>
        </div>
      ))}
      {operationId && (
        <div style={{ color: theme.textDim, fontFamily: mono, fontSize: 10.5, overflowWrap: 'anywhere' }}>
          Operation ID {operationId}
        </div>
      )}
      {argsDigest && (
        <div style={{ color: theme.textDim, fontFamily: mono, fontSize: 10.5, overflowWrap: 'anywhere' }}>
          Args digest {argsDigest}
        </div>
      )}
    </div>
  );
}
