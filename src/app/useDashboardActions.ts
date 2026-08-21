import { purgeProjectCascade } from '../persist/mediaCleanup';
import {
  createProject,
  duplicateProject,
  randomProjectName,
  renameProject,
} from '../persist/projectStore';
import { buildProjectExport, importProjectPackage } from '../persist/projectTransfer';
import { emptyProjectDoc, navigateTo } from './appShell';


export interface DashboardActions {
  onOpen: (id: string) => void;
  onNew: () => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (id: string, name: string) => Promise<string>;
  onImport: (file: File) => Promise<string>;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function exportProject(id: string, name: string): Promise<string> {
  const result = await buildProjectExport(id, name);
  downloadBlob(result.blob, result.filename);
  return result.mediaMissing.length
    ? `Exported "${name}"; ${result.mediaMissing.length} asset(s) unavailable on both ends, not bundled`
    : `Exported "${name}" (${result.mediaTotal} assets included)`;
}

async function importProject(file: File, refresh: () => Promise<void>): Promise<string> {
  try {
    const result = await importProjectPackage(file);
    await refresh();
    return result.mediaMissing.length
      ? `Imported "${result.meta.name}"; ${result.mediaMissing.length} asset(s) missing (${result.mediaMissing.map((source: string) => source.split('/').pop()).join(', ')})`
      : `Imported "${result.meta.name}" (assets ${result.mediaRestored}/${result.mediaTotal})`;
  } catch (error) {
    return `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function useDashboardActions(refresh: () => Promise<void>): DashboardActions {
  return {
    onOpen: (id) => navigateTo(`#/editor/${id}`),
    onNew: async () => {
      const project = await createProject(randomProjectName(), emptyProjectDoc());
      await refresh();
      navigateTo(`#/editor/${project.id}`);
    },
    onRename: async (id, name) => { await renameProject(id, name); refresh(); },
    onDuplicate: async (id) => { await duplicateProject(id); refresh(); },
    onDelete: async (id) => { await purgeProjectCascade(id); refresh(); },
    onExport: (id, name) => exportProject(id, name),
    onImport: (file) => importProject(file, refresh),
  };
}
