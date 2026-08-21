
/** Compare user-visible filenames, not paths, before a pool import. */
export function normalizeMediaName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase();
}

export function findMediaNameConflict<T extends { id: string; name: string }>(
  assets: ReadonlyArray<T>,
  incomingName: string,
): T | undefined {
  const normalized = normalizeMediaName(incomingName);
  return assets.find((asset) => normalizeMediaName(asset.name) === normalized);
}

/** User chose Cancel in the shared same-name import prompt. */
export class MediaImportCancelledError extends Error {
  constructor() {
    super('Cancelled uploading a same-name asset');
    this.name = 'MediaImportCancelledError';
  }
}

export function isMediaImportCancelled(error: unknown): error is MediaImportCancelledError {
  return error instanceof MediaImportCancelledError;
}

/** Convert internal/server import failures into localized, user-facing status text. */
export function mediaImportErrorMessage(error: unknown): string {
  if (isMediaImportCancelled(error)) return 'Cancelled uploading a same-name asset';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const partFailure = message.match(/part\s+(\d+)\s+failed\s*\((\d+)\)/i);
  if (partFailure) return `Uploading part ${partFailure[1]!} failed (${partFailure[2]!})`;
  if (/upload session not found or expired/i.test(message)) return 'Upload session expired; re-import';
  if (/server returned no media path/i.test(message)) return 'Server did not return a media save path; retry';
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'Network connection failed; check your network and retry';
  }
  const compatibilityDetail = message.match(/^\u89c6\u9891\u517c\u5bb9\u6027\u5904\u7406\u5931\u8d25\uff1a(.+)$/u)?.[1]?.trim();
  if ((compatibilityDetail && !/[\u3400-\u9fff]/u.test(compatibilityDetail))
    || /video compatibility (?:check|processing) failed|media normalization failed|\bffmpeg\b|\bffprobe\b|timed out after/i.test(message)) {
    return 'Video compatibility processing failed; retry';
  }
  const httpFailure = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpFailure) return `Media request failed (${httpFailure[1]!})`;
  if (/[\u3400-\u9fff]/u.test(message)) return message;
  return 'Failed to import media; retry';
}
