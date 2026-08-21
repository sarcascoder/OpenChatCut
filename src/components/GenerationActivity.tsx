import { useCallback, useEffect, useMemo, useState } from 'react';
import { isTerminal, normalizeStatus } from '../agent/progress/job-model';
import {
  listTrackedJobs,
  subscribeTrackedJobs,
  type TrackedJob,
} from '../persist/jobRegistryStore';
import { theme } from '../theme';
import { Icon } from './icons';
import { TopBarIconButton } from './TopBarIconButton';

interface GenerationActivityProps {
  projectId: string;
  onResume?: () => Promise<void>;
}


function operationSummary(job: TrackedJob): string {
  const args = job.submitArgs;
  if (!args) return job.params ? 'Legacy parameter summary (cannot be safely rerun)' : 'Parameter snapshot unavailable';
  const fields = ['provider', 'model', 'mode', 'durationSeconds', 'resolution', 'ratio']
    .flatMap((key) => args[key] === undefined ? [] : [`${key}=${String(args[key])}`]);
  if (typeof args.prompt === 'string' && args.prompt.trim()) {
    const prompt = args.prompt.trim();
    fields.push(prompt.length > 100 ? `${prompt.slice(0, 97)}…` : prompt);
  }
  return fields.join(' · ') || job.toolName || 'Generation Tasks';
}
function isResumable(job: TrackedJob): boolean {
  return !isTerminal(job.status)
    || job.retryClass === 'download-retryable'
    || job.retryClass === 'provider-retryable'
    || job.retryClass === 'restart-recoverable';
}


function relativeTime(timestamp: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${hours} hr ago`
    : `${Math.floor(hours / 24)} d ago`;
}

function statusLabel(status: string): string {
  return {
    pending: 'Pending',
    running: 'Running',
    complete: 'Completed',
    failed: 'Failed',
    not_found: 'Not Found',
  }[normalizeStatus(status)];
}

function retryClassLabel(retryClass: TrackedJob['retryClass']): string | null {
  if (!retryClass || retryClass === 'none') return null;
  return {
    'download-retryable': 'Download Retry Available',
    'provider-retryable': 'Generation Retry Available',
    'restart-recoverable': 'Recoverable After Restart',
    'provider-terminal': 'Not Retryable',
    'legacy-unknown': 'Legacy Task Status Unknown',
  }[retryClass];
}

export function GenerationActivity({ projectId, onResume }: GenerationActivityProps) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setJobs(await listTrackedJobs(projectId));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
    return subscribeTrackedJobs(projectId, () => { void refresh(); });
  }, [projectId, refresh]);

  const activeCount = useMemo(() => jobs.filter(isResumable).length, [jobs]);
  const resume = async () => {
    if (!onResume || resuming) return;
    setResuming(true);
    try {
      await onResume();
      await refresh();
    } finally {
      setResuming(false);
    }
  };

  return (
    <>
      <TopBarIconButton
        icon="sparkles"
        label="Generation Tasks"
        onClick={() => setOpen(true)}
        badge={activeCount > 0 ? (
          <span style={{ position: 'absolute', right: 1, top: 1, minWidth: 13, height: 13, padding: '0 3px', borderRadius: 7, background: theme.accent, color: theme.onAccent, fontSize: 9, lineHeight: '13px', fontWeight: 700 }}>
            {activeCount}
          </span>
        ) : null}
      />
      {open && (
        <div role="presentation" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.28)' }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Generation Tasks"
            onClick={(event) => event.stopPropagation()}
            style={{ position: 'absolute', top: 42, right: 72, width: 'min(460px, calc(100vw - 24px))', maxHeight: 'min(620px, calc(100vh - 64px))', overflow: 'auto', padding: 14, border: `0.5px solid ${theme.border}`, borderRadius: 8, background: theme.panel, boxShadow: '0 18px 48px rgba(0,0,0,0.34)' }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ color: theme.text, fontSize: 13, fontWeight: 650 }}>Generation Tasks</div>
                <div style={{ color: theme.textDim, fontSize: 11, marginTop: 2 }}>Keep checking, downloading, or rerunning tasks after a refresh</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {onResume && activeCount > 0 && (
                  <button type="button" disabled={resuming} onClick={() => { void resume(); }} style={ghostButton}>
                    {resuming ? 'Resuming…' : 'Resume Tasks'}
                  </button>
                )}
                <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={iconButton}><Icon name="x" size={16} /></button>
              </div>
            </header>
            {loading && !jobs.length ? (
              <div style={emptyState}>Loading tasks…</div>
            ) : !jobs.length ? (
              <div style={emptyState}>No generation tasks</div>
            ) : jobs.map((job) => {
              const retryLabel = retryClassLabel(job.retryClass);
              return <article key={job.operationId} style={{ padding: '10px 0', borderTop: `0.5px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: theme.text, fontSize: 12.5, fontWeight: 600 }}>{job.label || job.toolName || 'Generation Tasks'}</strong>
                  <span style={{ color: isTerminal(job.status) ? theme.textDim : theme.accent, fontSize: 11 }}>{statusLabel(job.status)}</span>
                </div>
                <div style={{ color: theme.textDim, fontSize: 11.5, lineHeight: 1.5, marginTop: 4, overflowWrap: 'anywhere' }}>{operationSummary(job)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', color: theme.textDim, fontSize: 10.5, marginTop: 6 }}>
                  <code title={job.operationId} style={{ fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, monospace' }}>{job.operationId}</code>
                  <span>{relativeTime(job.updatedAt)}</span>
                  {job.providerTaskId && <span>Provider task {job.providerTaskId}</span>}
                  {retryLabel && <span>{retryLabel}</span>}
                </div>
                {job.error && <div style={{ color: theme.danger, fontSize: 11, lineHeight: 1.45, marginTop: 6 }}>{job.error}</div>}
                {job.resultPath && (
                  <a href={job.resultPath} target="_blank" rel="noreferrer" style={{ color: theme.accent, display: 'inline-block', fontSize: 11.5, marginTop: 6 }}>
                    Open Result
                  </a>
                )}
                {onResume && isResumable(job) && (
                  <button type="button" disabled={resuming} onClick={() => { void resume(); }} style={{ ...ghostButton, marginTop: 7 }}>
                    {job.status === 'failed' ? 'Retry Recoverable Tasks' : 'Check Progress'}
                  </button>
                )}
              </article>;
            })}
          </section>
        </div>
      )}
    </>
  );
}

const emptyState: React.CSSProperties = { padding: '28px 0', textAlign: 'center', color: theme.textDim, fontSize: 12 };
const iconButton: React.CSSProperties = { border: 'none', background: 'none', color: theme.textDim, cursor: 'pointer', lineHeight: 0, padding: 4 };
const ghostButton: React.CSSProperties = { border: `0.5px solid ${theme.border}`, borderRadius: 5, background: theme.panelAlt, color: theme.text, cursor: 'pointer', padding: '4px 9px', fontSize: 11.5 };
