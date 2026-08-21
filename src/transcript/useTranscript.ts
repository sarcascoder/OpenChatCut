import { useCallback, useState } from 'react';
import {
  TranscriptionError, preferredTranscriptionProvider, transcribePath, type TranscribeOptions,
} from './provider';
import type { TranscriptResult, TranscriptStatus } from './types';

function transcriptErrorMessage(error: unknown): string {
  if (error instanceof TranscriptionError) {
    if (error.code === 'source-unavailable') {
      return 'The media file is unavailable. Relink it in My Media before transcribing.';
    }
    return preferredTranscriptionProvider() === 'local'
      ? 'Local transcription failed: the model is unavailable or the audio cannot be processed. Check the model download and try again.'
      : 'Cannot reach the transcription service. Check the network and AssemblyAI settings, then try again.';
  }
  return error instanceof Error ? error.message : String(error);
}

// Drives transcription against a same-origin media path.
// Never falls back to a demo sample — caller must pass a real clip src.
export function useTranscript() {
  const [status, setStatus] = useState<TranscriptStatus>('idle');
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setActiveItemId(null);
    setProgressNote(null);
  }, []);

  const run = useCallback(async (
    path: string,
    opts?: TranscribeOptions & { itemId?: string; label?: string },
  ) => {
    setStatus('uploading');
    setError(null);
    setResult(null);
    setActiveItemId(opts?.itemId ?? null);
    setProgressNote(opts?.label ? `Uploading ${opts.label}…` : 'Uploading audio…');
    try {
      const r = await transcribePath(
        path,
        (note) => {
          setStatus('processing');
          setProgressNote(note || (opts?.label ? `Transcribing ${opts.label}…` : 'Transcribing…'));
        },
        { languageCode: opts?.languageCode },
      );
      setResult(r);
      setStatus('done');
      setProgressNote(null);
      return r;
    } catch (e) {
      setError(transcriptErrorMessage(e));
      setStatus('error');
      setProgressNote(null);
      throw e;
    }
  }, []);

  /**
   * Transcribe many clips sequentially. Continues after per-clip failures so
   * one bad segment does not drop the rest of the track (user saw “only one”).
   */
  const runMany = useCallback(async (
    jobs: { path: string; itemId: string; label: string }[],
    onEach: (itemId: string, r: TranscriptResult) => void,
    opts?: TranscribeOptions,
  ) => {
    setError(null);
    setResult(null);
    let last: TranscriptResult | null = null;
    const failures: string[] = [];
    let ok = 0;
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      setActiveItemId(job.itemId);
      setStatus('uploading');
      setProgressNote(`(${i + 1}/${jobs.length}) Uploading ${job.label}…`);
      try {
        const r = await transcribePath(
          job.path,
          () => {
            setStatus('processing');
            setProgressNote(`(${i + 1}/${jobs.length}) Transcribing ${job.label}…`);
          },
          opts,
        );
        last = r;
        setResult(r);
        onEach(job.itemId, r);
        ok += 1;
      } catch (e) {
        const msg = transcriptErrorMessage(e);
        failures.push(`${job.label}: ${msg}`);
        // keep going — partial track is better than abort
      }
    }
    setActiveItemId(null);
    setProgressNote(null);
    if (failures.length && !ok) {
      setError(failures.join('; '));
      setStatus('error');
      throw new Error(failures[0]);
    }
    if (failures.length) {
      setError(`Completed ${ok}/${jobs.length} clips; failed: ${failures.join('; ')}`);
      setStatus('done');
    } else {
      setStatus('done');
      setError(null);
    }
    return last;
  }, []);

  return { status, result, error, activeItemId, progressNote, run, runMany, reset };
}
