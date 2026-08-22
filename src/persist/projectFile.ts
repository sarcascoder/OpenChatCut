// The .occ project file: a ProjectDoc wrapped in a self-describing envelope.
// Serialization is deterministic so the file diffs cleanly in version control.
import type { ProjectDoc } from '../editor/projectTypes';
import { migrateProjectDoc } from './projectStore';

export const PROJECT_FILE_FORMAT = 'openchatcut-project';
export const PROJECT_FILE_EXTENSION = '.occ';
/** Envelope schema version — bumped only when the envelope itself changes, not the document. */
export const PROJECT_FILE_SCHEMA_VERSION = 1;

export interface ProjectFileEnvelope {
  format: string;
  schemaVersion: number;
  appVersion: string;
  projectId: string;
  doc: ProjectDoc;
}

export function serializeProjectFile(
  doc: ProjectDoc,
  opts: { projectId: string; appVersion: string },
): string {
  const envelope: ProjectFileEnvelope = {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
    appVersion: opts.appVersion,
    projectId: opts.projectId,
    doc,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function parseProjectFile(
  text: string,
): { ok: true; envelope: ProjectFileEnvelope } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not valid JSON' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
  const value = raw as Record<string, unknown>;
  if (value.format !== PROJECT_FILE_FORMAT) return { ok: false, error: 'not an OpenChatCut project file' };
  if (typeof value.schemaVersion !== 'number') return { ok: false, error: 'missing schemaVersion' };
  if (value.schemaVersion > PROJECT_FILE_SCHEMA_VERSION) {
    return { ok: false, error: 'written by a newer version of OpenChatCut' };
  }
  if (!value.doc || typeof value.doc !== 'object') return { ok: false, error: 'missing project document' };

  // Reuse the store's migration so an older document opens exactly as it would from the store.
  const doc = migrateProjectDoc(value.doc);
  if (!doc) return { ok: false, error: 'unsupported project document version' };

  return {
    ok: true,
    envelope: {
      format: PROJECT_FILE_FORMAT,
      schemaVersion: value.schemaVersion,
      appVersion: typeof value.appVersion === 'string' ? value.appVersion : '',
      projectId: typeof value.projectId === 'string' ? value.projectId : '',
      doc,
    },
  };
}
