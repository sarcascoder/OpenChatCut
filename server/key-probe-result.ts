export interface ProbeResult {
  ok: boolean;
  message: string;
  status?: number;
  latencyMs?: number;
  models?: string[];
}

export function sanitizeProbeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Convert a provider response into a user-facing connectivity conclusion. */
export function classifyStatus(status: number, bodyText: string): ProbeResult {
  if (status === 401 || status === 403) {
    return { ok: false, status, message: `Authentication failed (HTTP ${status}) · the key is invalid, expired, or lacks access to this endpoint` };
  }
  if (status === 404) {
    return { ok: false, status, message: 'Probe endpoint 404 · the Base URL may be wrong (or this service does not recognize this probe path)' };
  }
  if (status === 429) {
    return { ok: true, status, message: 'Authentication passed (HTTP 429 rate limited, so the key is valid)' };
  }
  const detail = sanitizeProbeText(bodyText);
  return { ok: false, status, message: `HTTP ${status}${detail ? ` · ${detail}` : ''}` };
}

/** Distinguish transport failures from rejected credentials. */
export function networkMessage(error: unknown): string {
  const raw = error instanceof Error
    ? `${error.name}: ${error.message}${error.cause instanceof Error ? ` (${error.cause.message})` : ''}`
    : String(error);
  if (/timeout|abort/i.test(raw)) {
    return 'Connection timed out · the service is unreachable or the network is restricted (a proxy may be needed), not a sign the key is wrong';
  }
  return `Network unreachable · ${sanitizeProbeText(raw)} · this machine cannot reach the service (a proxy may be needed), not a sign the key is wrong`;
}
