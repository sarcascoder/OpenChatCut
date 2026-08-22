// Maps an opaque id to a canonical, already-admitted media path. The renderer
// references files by id only: paths never appear in a URL, so a hostile
// renderer cannot construct a request for a file it was not given.
//
// The id is generated at random rather than derived from the path (e.g. a
// hash of it). The renderer content this guards against is frequently
// LLM-authored JSX (see src/template-host.ts), and that LLM's own generation
// context routinely already contains literal project file paths (project
// reads, asset browsing, media probing all surface real filenames). A
// path-derived id would let such code compute a valid handle for a file it
// was never given, merely by knowing its path and that path having been
// registered for any other reason — reducing "opaque id" to "the path in a
// disguise anyone with path knowledge can remove". A random id cannot be
// computed from a path at all; it can only be obtained by actually being
// handed one. This matches the convention already used for other
// security-sensitive identifiers in this codebase (see the grantId in
// server/export-destinations.ts and the token in server/mcp-token.ts).
//
// Idempotency (the same path reused twice returns the same id) comes from
// the idByPath cache below, not from the id's derivation, so randomness
// costs nothing here. Resolving an id only ever hands back a string that was
// admitted through resolveAllowedMediaPath at registration time — see that
// function's own TOCTOU note in server/media-roots.ts: this stored string is
// not a guarantee the file is unchanged when a later caller opens it.
import { randomBytes } from 'node:crypto';
import { resolveAllowedMediaPath } from './media-roots.ts';

const byId = new Map<string, string>();
const idByPath = new Map<string, string>();

/** Register an admitted path and return its opaque id, or null when not admitted. */
export async function createMediaHandle(absolutePath: string): Promise<string | null> {
  const canonical = await resolveAllowedMediaPath(absolutePath);
  if (!canonical) return null;
  const existing = idByPath.get(canonical);
  if (existing) return existing;
  const id = randomBytes(16).toString('hex');
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
