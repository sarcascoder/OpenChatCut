// Maps an opaque id to a canonical, already-admitted media path. The renderer
// references files by id only: paths never appear in a URL, so a hostile
// renderer cannot construct a request for a file it was not given.
//
// The id is a stable hash of the canonical path, so registering the same
// path twice reuses the same id instead of growing the registry. Resolving
// an id only ever hands back a string that was admitted through
// resolveAllowedMediaPath at registration time — see that function's own
// TOCTOU note in server/media-roots.ts: this stored string is not a
// guarantee the file is unchanged when a later caller opens it.
import { createHash } from 'node:crypto';
import { resolveAllowedMediaPath } from './media-roots.ts';

const byId = new Map<string, string>();
const idByPath = new Map<string, string>();

/** Register an admitted path and return its opaque id, or null when not admitted. */
export async function createMediaHandle(absolutePath: string): Promise<string | null> {
  const canonical = await resolveAllowedMediaPath(absolutePath);
  if (!canonical) return null;
  const existing = idByPath.get(canonical);
  if (existing) return existing;
  const id = createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  byId.set(id, canonical);
  idByPath.set(canonical, id);
  return id;
}

/** The canonical path for a known id. Unknown ids resolve to null, never a path. */
export function resolveMediaHandle(id: string): string | null {
  return byId.get(id) ?? null;
}

export function clearMediaHandles(): void {
  byId.clear();
  idByPath.clear();
}
