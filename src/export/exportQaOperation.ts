import type { TimelineState } from '../editor/types';
import { runExportQa, type ExportQaRequest } from './autoQa';
import {
  captionLayoutQaIssues,
  exportQaExpectations,
  mergeExportQaIssues,
  timelineCutTimesSeconds,
} from './quality';
import type {
  ExportJobResult,
  StateSetter,
  ExportProgress,
  ExportQaUiState,
} from './exportWorkflowTypes';

interface ExportQaContext {
  fps: number;
  setBusy: StateSetter<string | null>;
  setProgress: StateSetter<ExportProgress | null>;
  setQa: StateSetter<ExportQaUiState | null>;
  state: TimelineState;
}

function qaRequest(state: TimelineState, completed: ExportJobResult, fps: number): ExportQaRequest {
  const baseline = exportQaExpectations(state);
  const expected = {
    ...baseline,
    durationSeconds: completed.durationSeconds ?? baseline.durationSeconds,
    width: completed.width ?? baseline.width,
    height: completed.height ?? baseline.height,
    fps: completed.fps ?? fps,
  };
  const sourceStart = completed.sourceStartSeconds ?? 0;
  const cutTimesSeconds = timelineCutTimesSeconds(state, 24)
    .map((seconds) => Number((seconds - sourceStart).toFixed(4)))
    .filter((seconds) => seconds > 0 && seconds < expected.durationSeconds)
    .slice(0, 8);
  return { src: completed.path!, ...expected, cutTimesSeconds, maxEvidenceCuts: 8 };
}

function beginQa(context: ExportQaContext): void {
  context.setBusy('Checking export quality…');
  context.setQa({ status: 'running', attempts: 0 });
  context.setProgress((current) => current ? {
    ...current,
    phase: 'verifying',
    percent: 99,
    detail: 'Checking video, audio, edit points, and caption safe areas; transient failures retry up to three times',
  } : current);
}

async function verifyCompletedExport(
  context: ExportQaContext,
  completed: ExportJobResult,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  if (!completed.path) return;
  beginQa(context);
  try {
    const result = await runExportQa(
      qaRequest(context.state, completed, context.fps),
      { signal },
    );
    signal?.throwIfAborted();
    const report = mergeExportQaIssues(result.response.report, captionLayoutQaIssues(context.state));
    const mediaType = result.response.evidence?.mediaType ?? 'image/jpeg';
    const base64 = result.response.evidence?.base64;
    context.setQa({
      status: report.issues.length ? 'issues' : 'passed',
      attempts: result.attempts,
      report,
      ...(base64 ? { evidenceUrl: `data:${mediaType};base64,${base64}` } : {}),
    });
  } catch (reason) {
    signal?.throwIfAborted();
    const message = reason instanceof Error ? reason.message : String(reason);
    context.setQa({ status: 'error', attempts: 0, message });
  }
}

export function createExportVerifier(context: ExportQaContext) {
  return (completed: ExportJobResult, signal?: AbortSignal) => verifyCompletedExport(context, completed, signal);
}
