import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  loadAgentRuntimeSidecar,
  subscribeAgentRuntime,
  type AgentApprovalRecord,
  type AgentArtifactIndexEntry,
  type AgentCheckpointRecord,
  type AgentRunEvent,
  type AgentToolOutcomeKind,
  type AgentRunRecord,
  type AgentRuntimeSidecar,
} from '../../persist/agentRuntimeStore';
import { serverEventsForRun, serverRunTerminalReason, isServerRunRecord } from './serverRunInspector';
import { theme, themeAlpha } from '../../theme';
import { Icon } from '../icons';

type PopoverBox = { left: number; top: number; width: number; maxHeight: number };

const compactNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const mono: CSSProperties = { fontFamily: 'Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace' };

function useRuntimeSidecar(projectId: string, refreshKey: boolean) {
  const [sidecar, setSidecar] = useState<AgentRuntimeSidecar | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSidecar(null);
    setLoading(true);
    setFailed(false);
    const refresh = async () => {
      try {
        const next = await loadAgentRuntimeSidecar(projectId);
        if (alive) { setSidecar(next); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void refresh();
    const unsubscribe = subscribeAgentRuntime(projectId, () => { void refresh(); });
    return () => { alive = false; unsubscribe(); };
  }, [projectId, refreshKey]);
  return { sidecar, loading, failed };
}

function usePopoverBox(open: boolean, anchor: HTMLElement | null): PopoverBox | null {
  const [box, setBox] = useState<PopoverBox | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor) { setBox(null); return; }
    const place = () => {
      const trigger = anchor.getBoundingClientRect();
      const boundary = anchor.closest<HTMLElement>('[data-cc-chat-popover-boundary]')?.getBoundingClientRect();
      const margin = 8;
      const availableWidth = Math.max(240, (boundary?.width ?? window.innerWidth) - margin * 2);
      const width = Math.min(380, availableWidth, window.innerWidth - margin * 2);
      const minLeft = Math.max(margin, (boundary?.left ?? 0) + margin);
      const maxLeft = Math.min(window.innerWidth - width - margin, (boundary?.right ?? window.innerWidth) - width - margin);
      const left = Math.max(minLeft, Math.min(trigger.right - width, Math.max(minLeft, maxLeft)));
      const top = Math.min(trigger.bottom + 6, window.innerHeight - 120);
      setBox({ left, top, width, maxHeight: Math.max(112, window.innerHeight - top - margin) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, open]);
  return box;
}

function statusLabel(status: string): string {
  return {
    running: 'Running', waiting_approval: 'Awaiting approval', awaiting_user: 'Awaiting reply',
    completed: 'Completed', failed: 'Failed', aborted: 'Cancelled', interrupted: 'Interrupted',
  }[status] ?? 'Unknown status';
}

function statusColor(status: string): string {
  if (status === 'completed') return theme.success;
  if (status === 'failed') return theme.danger;
  if (status === 'waiting_approval' || status === 'awaiting_user') return theme.gold;
  if (status === 'running') return theme.accent;
  return theme.textDim;
}

function numberText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? compactNumber.format(value) : undefined;
}
function percentText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : undefined;
}


function validTime(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value).toLocaleString()
    : '—';
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function contextMetric(context: unknown, key: string): unknown {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined;
  return Reflect.get(context, key);
}
function cacheMissLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return {
    none: 'Cache hit',
    first_request: 'First request',
    model_changed: 'Model changed',
    system_prompt_changed: 'System prompt changed',
    tool_surface_changed: 'Tool surface changed',
    idle_ttl_expired: 'Cache expired',
    unknown: 'Unconfirmed reason',
  }[value];
}


function isOutcomeKind(value: unknown): value is AgentToolOutcomeKind {
  return typeof value === 'string' && [
    'success', 'validation_failed', 'denied', 'aborted_before_side_effect',
    'stale', 'retryable_failure', 'outcome_unknown', 'terminal_failure',
  ].includes(value);
}


function validToolOutcomes(events: unknown): AgentRunEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter((event): event is AgentRunEvent =>
    !!event && typeof event === 'object' && 'type' in event && event.type === 'tool_outcome');
}

function Metric({ label, value, title }: { label: string; value: string | number | undefined; title?: string }) {
  return <span style={metric} title={title ?? label}><span style={{ color: theme.textDim }}>{label}</span> {value ?? '—'}</span>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section style={section}>
    <h4 style={sectionTitle} title={hint}>{title}{hint && <Icon name="info" size={11} />}</h4>
    {children}
  </section>;
}

function ContextSection({ run }: { run: AgentRunRecord; }) {
  const context = run.context;
  // Cache writes only matter for providers that support explicit cache writes (e.g. Anthropic); DeepSeek
  // and friends only have server-side prompt caching and never report them. Hide it when unset, to avoid a meaningless —.
  const cacheWriteTokens = numberText(contextMetric(context, 'cacheWriteTokens'));
  return <Section title="Context and tools" hint="Token usage, cache and tool-surface info for this run and the latest model request.">
    <div style={subheadInSection}>Latest model request</div>
    <div style={metrics}>
      <Metric label="Input" title="Input tokens in the latest model request (prompt + tool results)." value={numberText(contextMetric(context, 'inputTokens'))} />
      <Metric label="Output" title="Output tokens returned by the latest model request." value={numberText(contextMetric(context, 'outputTokens'))} />
      <Metric label="System" title="Input tokens used by the system prompt." value={numberText(contextMetric(context, 'systemTokens'))} />
      <Metric label="History" title="Input tokens used by the conversation history." value={numberText(contextMetric(context, 'historyTokens'))} />
    </div>
    <div style={subheadInSection}>Cache</div>
    <div style={metrics}>
      <Metric label="Cache read" title="Cache reads: input tokens served from an existing cache this request." value={numberText(contextMetric(context, 'cacheReadTokens'))} />
      {cacheWriteTokens !== undefined && (
        <Metric label="Cache write" title="Cache writes: input tokens written to the cache this request (only some models)." value={cacheWriteTokens} />
      )}
      <Metric label="Uncached" title="Uncached: input tokens that were not cached and had to be computed." value={numberText(contextMetric(context, 'noCacheTokens'))} />
      <Metric label="Hit rate" title="Share of total inputs served from cache across this run." value={percentText(contextMetric(context, 'cacheHitRatio'))} />
      <Metric label="Diagnosis" title="Why the cache last missed, to see why savings were not realized." value={cacheMissLabel(contextMetric(context, 'cacheMissReason'))} />
    </div>
    <div style={subheadInSection}>Tools</div>
    <div style={metrics}>
      <Metric label="Active tools" title="Number of tools the model could call on the latest request." value={numberText(contextMetric(context, 'activeToolCount'))} />
      <Metric label="Tool schemas" title="Number of tool schemas sent to the model with the request." value={numberText(contextMetric(context, 'toolSchemaCount'))} />
      <Metric label="Schema chars" title="Total characters of all tool schemas, a rough measure of tool-surface size." value={numberText(contextMetric(context, 'toolSchemaChars'))} />
    </div>
    <div style={subheadInSection}>Run totals</div>
    <div style={metrics}>
      <Metric label="Model requests" title="Total model requests issued so far in this run." value={numberText(contextMetric(context, 'modelRequestCount'))} />
      <Metric label="Total input" title="Sum of input tokens across all model requests in this run." value={numberText(contextMetric(context, 'totalInputTokens'))} />
      <Metric label="Fresh input" title="Input tokens actually computed from scratch (no cache hit) across this run." value={numberText(contextMetric(context, 'totalFreshInputTokens'))} />
      <Metric label="Total output" title="Sum of output tokens across all model requests in this run." value={numberText(contextMetric(context, 'totalOutputTokens'))} />
      <Metric label="Retries" title="Times this run automatically retried a model request after a transient error." value={numberText(contextMetric(context, 'totalRetryCount'))} />
      <Metric label="Media inputs" title="Number of images sent to the model in this run." value={numberText(contextMetric(context, 'totalMediaInputs'))} />
    </div>
  </Section>;
}

function CheckpointSection({ checkpoint }: { checkpoint?: AgentCheckpointRecord; }) {
  // Same treatment as the archived-results block: hide the section entirely when
  // this run made no context checkpoint, since "no checkpoint on this run" is the
  // normal state and an always-visible empty block is not helpful.
  if (!checkpoint) return null;
  return <Section title="Context checkpoint" hint="A summary checkpoint saved when a long conversation was compacted; shows how context was trimmed.">
    <div style={detailLine}>{checkpoint.summary || 'No summary'}</div>
    <div style={subtle}>{`${numberText(checkpoint.sourceMessageCount) ?? '—'} source messages`}</div>
    <code title={checkpoint.sourceDigest} style={digest}>{checkpoint.sourceDigest}</code>
    {checkpoint.summaryDigest && <code title={checkpoint.summaryDigest} style={digest}>{checkpoint.summaryDigest}</code>}
  </Section>;
}

function outcomeLabel(event: AgentRunEvent): string {
  const kind = event.outcome?.kind;
  if (!isOutcomeKind(kind)) return 'Unknown outcome';
  const labels: Record<AgentToolOutcomeKind, string> = {
    success: 'Success',
    validation_failed: 'Validation failed',
    denied: 'Denied',
    aborted_before_side_effect: 'Aborted before side effect',
    stale: 'Stale',
    retryable_failure: 'Retryable failure',
    outcome_unknown: 'Outcome unknown',
    terminal_failure: 'Terminal failure',
  };
  return labels[kind];
}

function ToolOutcomeSection({ events }: { events: unknown; }) {
  const outcomes = validToolOutcomes(events).slice(-8).reverse();
  return <Section title="Tool outcomes" hint="Recently called tools and their outcomes (latest 8 only).">
    {outcomes.length === 0 ? <div style={emptyLine}>No tool outcomes</div> : outcomes.map((event) => {
      const detail = firstText(event.outcome?.summary, event.outcome?.code, event.operationId);
      return <div key={event.eventId} style={row}>
        <span style={{ ...statusDot, background: statusColor(event.outcome?.kind === 'success' ? 'completed' : 'failed') }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={rowTitle}><code style={mono}>{textValue(event.toolName) ?? 'Unknown tool'}</code><span>{outcomeLabel(event)}</span></div>
          {detail && <div style={subtle}>{detail}</div>}
        </div>
      </div>;
    })}
  </Section>;
}

function approvalLabel(status: string): string {
  return {
    pending: 'Pending', allowed: 'Allowed', denied: 'Denied',
    expired: 'Stale', cancelled: 'Cancelled',
  }[status] ?? 'Unknown status';
}

function ApprovalSection({ approvals }: { approvals: readonly AgentApprovalRecord[]; }) {
  return <Section title="Approvals" hint="Confirmation / approval records from this run (first 6 only).">
    {approvals.length === 0 ? <div style={emptyLine}>No approval records</div> : approvals.slice(0, 6).map((approval) => {
      const detail = firstText(approval.summary, approval.operationId);
      return <div key={approval.approvalId} style={row}>
        <span style={{ ...statusDot, background: statusColor(approval.status === 'allowed' ? 'completed' : approval.status === 'pending' ? 'waiting_approval' : 'failed') }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={rowTitle}><code style={mono}>{textValue(approval.toolName) ?? 'Unknown tool'}</code><span>{approvalLabel(approval.status)}</span></div>
          {detail && <div style={subtle}>{detail}</div>}
          <code title={approval.argsDigest} style={digest}>Args digest {approval.argsDigest}</code>
        </div>
      </div>;
    })}
  </Section>;
}

function ArtifactSection({ artifacts }: { artifacts: readonly AgentArtifactIndexEntry[]; }) {
  // Hide the section entirely when there is nothing archived: the "Archived results"
  // block is an internal token-optimization diagnostic that is empty for most
  // runs and confusing as an always-visible empty block.
  if (artifacts.length === 0) return null;
  return <Section title="Archived results" hint="Artifacts archived by this run (first 6 only).">
    {artifacts.slice(0, 6).map((artifact) => (
      <div key={artifact.artifactId} style={artifactRow}>
        <div style={rowTitle}><code title={artifact.artifactId} style={mono}>{artifact.artifactId}</code><span>{textValue(artifact.toolName) ?? artifact.kind}</span></div>
        <div style={subtle}>{numberText(artifact.originalChars) ?? '—'} characters · {numberText(artifact.originalBytes) ?? '—'} bytes{artifact.redacted ? ` · ${'redacted'}` : ''}{artifact.binaryOmitted ? ` · ${'binary omitted'}` : ''}</div>
        <code title={artifact.bodySha256} style={digest}>SHA-256 {artifact.bodySha256}</code>
      </div>
    ))}
  </Section>;
}

function InspectorContent({ sidecar, loading, failed }: {
  sidecar: AgentRuntimeSidecar | null;
  loading: boolean;
  failed: boolean;
  
}) {
  if (loading && !sidecar) return <div role="status" style={emptyState}>Loading run record…</div>;
  if (failed && !sidecar) return <div role="alert" style={emptyState}>Unable to load run record</div>;
  const run = sidecar?.runs[0];
  if (!run) return <div style={emptyState}><strong>No runs yet</strong><span>Run details appear here after you send a message. Interrupted operations are never replayed automatically.</span></div>;
  const checkpoint = sidecar.checkpoints.find((item) => item.runId === run.runId);
  const approvals = sidecar.approvals.filter((item) => item.runId === run.runId);
  const artifacts = sidecar.artifacts.filter((item) => item.runId === run.runId);
  // Cumulative totals across every run in this project: the inspector shows the
  // latest run's details, but "how many turns / how many model requests" is a project-wide figure.
  const runCount = sidecar.runs.length;
  const totalModelRequests = sidecar.runs.reduce((sum, item) => {
    const value = contextMetric(item.context, 'modelRequestCount');
    return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);
  const serverRun = isServerRunRecord(run);
  const serverEvents = serverRun ? serverEventsForRun(run) : [];
  const terminalReason = serverRun ? serverRunTerminalReason(run, serverEvents) : undefined;
  return <>
    <div style={runSummary}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ ...statusDot, background: statusColor(run.status) }} />
        <strong style={{ color: theme.text, fontSize: 12.5 }}>{statusLabel(run.status)}</strong>
        {serverRun && <span style={serverBadge}>Server-side</span>}
        <span style={{ marginLeft: 'auto', color: theme.textDim, fontSize: 10.5 }}>{validTime(run.updatedAt)}</span>
      </div>
      <div style={backend}>{textValue(run.backend) ?? 'Unknown backend'} · {textValue(run.modelId) ?? 'Unknown model'}</div>
      <div style={subtle}>{`${numberText(runCount) ?? '0'} runs total · ${numberText(totalModelRequests) ?? '0'} cumulative model requests`}</div>
      <div style={{ ...subtle, marginTop: 4 }}>{run.userInputPreview || 'Request summary was not recorded.'}</div>
    </div>
    {run.status === 'interrupted' && <div role="note" style={interrupted}>This run was interrupted unexpectedly. Nothing will continue or replay automatically. Check external task status before retrying.{terminalReason && <div style={reason}>{terminalReason}</div>}</div>}
    {serverRun && run.status !== 'interrupted' && terminalReason && <div role="note" style={serverReason}>{terminalReason}</div>}
    <ContextSection run={run} />
    <CheckpointSection checkpoint={checkpoint} />
    <ToolOutcomeSection events={run.events} />
    <ApprovalSection approvals={approvals} />
    <ArtifactSection artifacts={artifacts} />
  </>;
}

export function AgentRunInspector({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { sidecar, loading, failed } = useRuntimeSidecar(projectId, open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const box = usePopoverBox(open, triggerRef.current);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }, []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, open]);
  useEffect(() => {
    if (open && box) requestAnimationFrame(() => closeRef.current?.focus());
  }, [box, open]);
  const latest = sidecar?.runs[0];
  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="cc-agent-run-inspector"
      title="Agent Run Inspector" aria-label="Agent Run Inspector" onClick={() => setOpen((value) => !value)}
      className="cc-header-btn" style={trigger}>
      <Icon name="list" size={14} />
      {latest && <span aria-hidden style={{ ...triggerDot, background: statusColor(latest.status) }} />}
    </button>
    {open && box && createPortal(
      <div role="presentation" onPointerDown={close} style={backdrop}>
        <section id="cc-agent-run-inspector" role="dialog" aria-label="Agent Run Inspector"
          onPointerDown={(event) => event.stopPropagation()} style={{ ...popover, ...box }}>
          <header style={header}>
            <div><strong style={{ fontSize: 13 }}>Agent Run Inspector</strong><div style={subtle}>Read-only diagnostics. No operation will be executed or resumed.</div></div>
            <button ref={closeRef} type="button" onClick={close} aria-label="Close" title="Close" className="cc-header-btn" style={closeButton}><Icon name="x" size={14} /></button>
          </header>
          <div style={scroll}><InspectorContent sidecar={sidecar} loading={loading} failed={failed} /></div>
        </section>
      </div>, document.body,
    )}
  </>;
}

const trigger: CSSProperties = { position: 'relative', width: 28, height: 28, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 4, background: 'none', color: theme.textDim, cursor: 'pointer', lineHeight: 0 };
const triggerDot: CSSProperties = { position: 'absolute', right: 2, bottom: 2, width: 5, height: 5, borderRadius: '50%', boxShadow: `0 0 0 1px ${theme.panel}` };
const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 70, background: 'transparent' };
const popover: CSSProperties = { position: 'fixed', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: theme.text, border: `0.5px solid ${theme.borderLight}`, borderRadius: 7, background: theme.panelAlt, boxShadow: `0 14px 42px ${themeAlpha.shadow(0.5)}` };
const header: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '11px 12px', borderBottom: `0.5px solid ${theme.border}` };
const closeButton: CSSProperties = { width: 26, height: 26, display: 'grid', placeItems: 'center', flex: '0 0 auto', padding: 0, border: 0, borderRadius: 4, background: 'transparent', color: theme.textDim, cursor: 'pointer' };
const scroll: CSSProperties = { minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' };
const emptyState: CSSProperties = { minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: 20, color: theme.textDim, fontSize: 11.5, lineHeight: 1.5, textAlign: 'center' };
const runSummary: CSSProperties = { padding: '10px 12px 9px' };
const statusDot: CSSProperties = { width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%' };
const backend: CSSProperties = { marginTop: 6, color: theme.text, fontSize: 11.5, ...mono };
const interrupted: CSSProperties = { margin: '0 12px 8px', padding: 8, border: `0.5px solid ${theme.gold}`, borderRadius: 4, color: theme.text, background: themeAlpha.ink(0.04), fontSize: 11, lineHeight: 1.45 };
const serverBadge: CSSProperties = { padding: '1px 4px', borderRadius: 3, color: theme.accent, background: themeAlpha.accent(0.12), fontSize: 9.5 };
const reason: CSSProperties = { marginTop: 5, color: theme.textDim, fontSize: 10.5 };
const serverReason: CSSProperties = { margin: '0 12px 8px', padding: 8, border: `0.5px solid ${theme.border}`, borderRadius: 4, color: theme.text, background: themeAlpha.ink(0.03), fontSize: 11, lineHeight: 1.45 };
const section: CSSProperties = { padding: '9px 12px', borderTop: `0.5px solid ${theme.border}` };
const sectionTitle: CSSProperties = { margin: '0 0 7px', color: theme.textMuted, fontSize: 10.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 4 };
const subheadInSection: CSSProperties = { margin: '6px 0 4px', color: theme.textMuted, fontSize: 9.5, fontWeight: 650, textTransform: 'uppercase', letterSpacing: 0.3 };
const metrics: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '5px 10px' };
const metric: CSSProperties = { color: theme.text, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' };
const row: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' };
const artifactRow: CSSProperties = { padding: '5px 0' };
const rowTitle: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, color: theme.text, fontSize: 10.5 };
const detailLine: CSSProperties = { color: theme.text, fontSize: 11, lineHeight: 1.45 };
const subtle: CSSProperties = { color: theme.textDim, fontSize: 10.5, lineHeight: 1.4, overflowWrap: 'anywhere' };
const emptyLine: CSSProperties = { color: theme.textDim, fontSize: 10.5 };
const digest: CSSProperties = { display: 'block', marginTop: 5, color: theme.textDim, fontSize: 9.5, lineHeight: 1.35, overflowWrap: 'anywhere', ...mono };
