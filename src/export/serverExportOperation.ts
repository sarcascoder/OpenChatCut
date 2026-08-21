import type { BackgroundExportJobSetters, ExportJobStore } from './backgroundExportStore';
import { isAbortError } from './browserExport';
import { recordExport } from '../persist/exportHistoryStore';
import {
  ensureExportDestinationWritable,
  ExportDestinationError,
  exportDestinationErrorMessage,
  exportDestinationFilename,
  exportHistoryDestinationId,
  writeUrlToDestination,
  type ExportDestination,
} from './exportDestination';
import { recordExportPerformance } from './exportRoutePlanner';
import {
  createExportFailure,
  exportFailureFrom,
} from './exportFailure';
import { createExportVerifier } from './exportQaOperation';
import {
  checkServerExportDelivery,
  claimServerExportDelivery,
  hasServerExportDestinationAuthority,
  listServerExportJobs,
  markServerExportDeliveryAmbiguous,
  markServerExportOutputReady,
  markServerExportTargetCommitted,
  rebindServerExportJob,
  releaseServerExportDelivery,
  renewServerExportDelivery,
  type PersistedServerExportJob,
  type ServerExportDeliveryClaim,
} from './serverExportRecovery';
import {
  pollExport,
  renderCompleted,
  retireAndDeleteExportJob,
  type ExportCodec,
  type ExportFormat,
  type ServerExportContext,
} from './serverExportRenderOperation';
import type {
  ExportJobResult,
  UseExportWorkflowOptions,
} from './exportWorkflowTypes';
export { isServerRenderError, ServerRenderError } from './serverExportRenderOperation';

function updateActualEngine(context: ServerExportContext, completed: ExportJobResult): void {
  if (!completed.encoder) return;
  context.setEngineInfo(completed.encoder);
  if (completed.encoderFallbackReason) context.setEngineReason(completed.encoderFallbackReason);
}

async function writeCompletedWithLease(
  context: ServerExportContext,
  filename: string,
  path: string,
  renderId: string,
  claim: ServerExportDeliveryClaim,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let renewing = false;
  const heartbeat = setInterval(() => {
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    void renewServerExportDelivery(renderId, claim)
      .then((active) => {
        if (!active) controller.abort(new Error('Export recovery ownership expired'));
      })
      .catch((error: unknown) => controller.abort(error))
      .finally(() => { renewing = false; });
  }, 40_000);
  try {
    await writeUrlToDestination(context.destination, filename, path, controller.signal);
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function saveCompleted(
  context: ServerExportContext,
  format: ExportFormat,
  codec: ExportCodec,
  completed: ExportJobResult,
  renderId: string,
  claim: ServerExportDeliveryClaim,
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  context.setBusy('Saving…');
  context.setProgress((current) => current ? {
    ...current,
    phase: 'downloading',
    percent: 99,
    detail: 'Writing to the selected destination',
  } : current);
  const renewed = await renewServerExportDelivery(renderId, claim);
  if (!renewed || !await checkServerExportDelivery(renderId, renewed)) {
    throw new ExportDestinationError('Export recovery ownership expired. Try again.');
  }
  signal?.throwIfAborted();
  const ext = format === 'audio' ? 'mp3' : codec === 'vp8' ? 'webm' : 'mp4';
  const filename = completed.name ?? `${context.options.base}.${ext}`;
  const ambiguousDownload = context.destination.type === 'downloads';
  context.beginTargetCommit();
  let targetCommitted = false;
  try {
    if (ambiguousDownload) await markServerExportDeliveryAmbiguous(renderId, renewed);
    if (!await checkServerExportDelivery(renderId, renewed)) {
      throw new ExportDestinationError('Export recovery ownership expired. Try again.');
    }
    await writeCompletedWithLease(
      context,
      filename,
      completed.path!,
      renderId,
      renewed,
      signal,
    );
    if (ambiguousDownload) {
      context.endTargetCommit();
    } else {
      await markServerExportTargetCommitted(renderId, renewed);
      context.markTargetCommitted();
      targetCommitted = true;
    }
  } catch (error) {
    if (!targetCommitted) context.endTargetCommit();
    throw error;
  }
  context.setProgress((current) => current ? { ...current, outputSize: completed.sizeBytes } : current);
  const destinationId = exportHistoryDestinationId(context.destination);
  const historyName = exportDestinationFilename(context.destination, filename);
  void recordExport({
    name: historyName,
    format,
    codec,
    sizeBytes: completed.sizeBytes,
    createdAt: Date.now(),
    ...(destinationId ? { destinationId } : {}),
  });
  return targetCommitted;
}

function recordServerPerformance(context: ServerExportContext, completed: ExportJobResult, startedAt: number): void {
  if (!completed.encoder || !completed.width || !completed.height) return;
  recordExportPerformance(completed.encoder, {
    width: completed.width,
    height: completed.height,
    frames: Math.max(1, Math.round((completed.durationSeconds ?? 0) * (completed.fps ?? context.options.fps))),
    elapsedMs: performance.now() - startedAt,
  });
}

async function exportMedia(
  context: ServerExportContext,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<ExportJobResult> {
  if (format === 'video') context.setRenderEngine('server');
  const codec = format === 'audio' ? 'mp3' : context.options.codec;
  const startedAt = performance.now();
  const { renderId, completed } = await renderCompleted(context, format, codec, signal);
  let targetCommitted = false;
  let claim: ServerExportDeliveryClaim | null = null;
  try {
    if (format === 'video') updateActualEngine(context, completed);
    signal?.throwIfAborted();
    if (format === 'video' && context.autoQaEnabled) {
      await context.verifyCompletedExport(completed, signal);
      signal?.throwIfAborted();
    }
    claim = await claimServerExportDelivery(renderId);
    if (!claim) throw new ExportDestinationError('This export is being recovered in another window. Please try again shortly.');
    targetCommitted = await saveCompleted(context, format, codec, completed, renderId, claim, signal);
    if (format === 'video') recordServerPerformance(context, completed, startedAt);
    return completed;
  } finally {
    if (claim) await releaseServerExportDelivery(renderId, claim).catch(() => undefined);
    if (targetCommitted) {
      await retireAndDeleteExportJob(renderId).catch(() => false);
    }
  }
}

export function createServerExporter(context: ServerExportContext) {
  return (format: ExportFormat, signal?: AbortSignal) => exportMedia(context, format, signal);
}

interface ResumePersistedServerExportsOptions {
  exportJobs: ExportJobStore;
  projectId: string;
}

const RESELECT_RECOVERY_DESTINATION = 'Access to the export destination expired. Choose the export location again and retry.';

function recoveredContext(
  record: PersistedServerExportJob,
  destination: ExportDestination,
  setters: BackgroundExportJobSetters,
): ServerExportContext {
  const options: UseExportWorkflowOptions = {
    state: record.state,
    projectName: 'Recovered export',
    projectId: record.projectId,
    base: record.base,
    tab: record.format,
    codec: record.codec === 'vp8' ? 'vp8' : 'h264',
    resolution: '1080p',
    fps: record.fps,
    subtitleFormat: 'srt',
    subtitleCaptions: null,
    nleFormat: 'fcp_xml',
    includeMg: false,
    mgItems: [],
    onClose: () => undefined,
  };
  return {
    autoQaEnabled: record.autoQaEnabled,
    destination,
    options,
    targetPath: record.targetPath,
    verifyCompletedExport: createExportVerifier({
      fps: record.fps,
      state: record.state,
      ...setters,
    }),
    ...setters,
  };
}

async function runRecoveredServerExport(
  record: PersistedServerExportJob,
  setters: BackgroundExportJobSetters,
  signal: AbortSignal,
  initialClaim: ServerExportDeliveryClaim | null = null,
): Promise<void> {
  let claim = initialClaim;
  let targetCommitted = record.stage === 'target-committed';
  setters.setClock(Date.now());
  setters.setBusy('Resuming export…');
  setters.setRenderEngine(record.format === 'video' ? 'server' : 'idle');
  try {
    if (targetCommitted) {
      setters.markTargetCommitted();
    } else {
      if (record.stage === 'delivery-ambiguous') {
        throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
      }
      if (!hasServerExportDestinationAuthority(record.destination)) {
        throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
      }
      const context = recoveredContext(record, record.destination, setters);
      const startedAt = performance.now();
      signal.throwIfAborted();
      await ensureExportDestinationWritable(record.destination).catch((error: unknown) => {
        if (record.destination.type === 'browser-directory' || record.destination.type === 'browser-file') {
          throw new ExportDestinationError(RESELECT_RECOVERY_DESTINATION);
        }
        throw error;
      });
      const completed = await pollExport(context, record.renderId, signal);
      if (record.stage === 'polling') await markServerExportOutputReady(record.renderId, claim ?? undefined);
      if (record.format === 'video') updateActualEngine(context, completed);
      signal.throwIfAborted();
      if (record.format === 'video' && record.autoQaEnabled) {
        await context.verifyCompletedExport(completed, signal);
        signal.throwIfAborted();
      }
      claim ??= await claimServerExportDelivery(record.renderId);
      if (!claim) throw new ExportDestinationError('This export is being recovered in another window. Please try again shortly.');
      targetCommitted = await saveCompleted(
        context,
        record.format,
        record.codec,
        completed,
        record.renderId,
        claim,
        signal,
      );
      if (record.format === 'video') recordServerPerformance(context, completed, startedAt);
    }
    const finishedAt = Date.now();
    setters.setClock(finishedAt);
    setters.setProgress((current) => current ? {
      ...current,
      phase: 'completed',
      percent: 100,
      finishedAt,
    } : current);
  } catch (reason) {
    const cancelled = isAbortError(reason);
    const existing = exportFailureFrom(reason);
    const message = exportDestinationErrorMessage(reason);
    const failure = existing ?? createExportFailure({
      stage: cancelled ? 'cancel' : reason instanceof ExportDestinationError ? 'destination' : 'render',
      code: cancelled ? 'export_cancelled'
        : reason instanceof ExportDestinationError ? 'export_destination_failed' : 'export_failed',
      retryable: !cancelled,
      targetPath: record.targetPath,
      message: cancelled ? 'Export cancelled' : message,
    });
    setters.setFailure(failure);
    setters.setError(failure.message);
    setters.setProgress((current) => current ? {
      ...current,
      phase: cancelled ? 'cancelled' : 'failed',
      finishedAt: Date.now(),
    } : current);
  } finally {
    if (claim) await releaseServerExportDelivery(record.renderId, claim).catch(() => undefined);
    if (targetCommitted) {
      await retireAndDeleteExportJob(record.renderId).catch(() => false);
    }
    setters.setBusy(null);
  }
}

/** Reattach this editor to durable server renders accepted before a browser refresh. */
export async function resumePersistedServerExports({
  exportJobs,
  projectId,
}: ResumePersistedServerExportsOptions): Promise<void> {
  const records = await listServerExportJobs(projectId);
  for (const record of records) {
    exportJobs.recover({
      id: `server-export-${record.renderId}`,
      label: record.label,
      targetPath: record.targetPath,
      createdAt: record.createdAt,
      execute: ({ signal, setters }) => runRecoveredServerExport(record, setters, signal),
    });
  }
}

interface RebindPersistedServerExportOptions {
  destination: ExportDestination;
  exportJobs: ExportJobStore;
  renderId: string;
  targetPath: string;
}

export async function rebindAndResumePersistedServerExport({
  destination,
  exportJobs,
  renderId,
  targetPath,
}: RebindPersistedServerExportOptions): Promise<string> {
  const claim = await claimServerExportDelivery(renderId);
  if (!claim) throw new ExportDestinationError('This export is being recovered in another window. Please try again shortly.');
  let rebound: PersistedServerExportJob;
  try {
    rebound = await rebindServerExportJob(renderId, destination, targetPath, claim);
  } catch (error) {
    await releaseServerExportDelivery(renderId, claim).catch(() => undefined);
    throw error;
  }
  return exportJobs.start({
    label: rebound.label,
    targetPath,
    execute: ({ signal, setters }) => runRecoveredServerExport(rebound, setters, signal, claim),
  });
}

export async function retirePersistedServerExport(renderId: string): Promise<boolean> {
  return retireAndDeleteExportJob(renderId);
}
