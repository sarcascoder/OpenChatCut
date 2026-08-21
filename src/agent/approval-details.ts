import { redactTextForAgentRuntime } from './runtime-artifact';

export type ApprovalDetailKind =
  | 'action'
  | 'command'
  | 'url'
  | 'path'
  | 'output'
  | 'target'
  | 'parameter';

export interface ApprovalDetail {
  readonly kind: ApprovalDetailKind;
  readonly label: string;
  readonly value: string;
}

export interface ToolApprovalPresentation {
  readonly summary: string;
  readonly details: readonly ApprovalDetail[];
}

function safeText(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return redactTextForAgentRuntime(raw ?? String(value));
}

function add(
  details: ApprovalDetail[],
  kind: ApprovalDetailKind,
  label: string,
  value: unknown,
): void {
  if (value === undefined || value === null || value === '') return;
  details.push({ kind, label, value: safeText(value) });
}

function runCodeDetails(args: Readonly<Record<string, unknown>>): ApprovalDetail[] {
  const details: ApprovalDetail[] = [];
  add(details, 'command', 'Command', args.command);
  if (Array.isArray(args.files)) {
    for (const file of args.files) {
      if (!file || typeof file !== 'object' || Array.isArray(file)) continue;
      const input = file as Record<string, unknown>;
      add(details, 'path', 'Input path', input.path);
      add(details, 'url', 'Input URL', input.url);
    }
  }
  if (Array.isArray(args.outputs)) {
    for (const output of args.outputs) {
      add(details, 'output', 'Output target', output);
    }
  }
  return details;
}

function designDetails(args: Readonly<Record<string, unknown>>): ApprovalDetail[] {
  const details: ApprovalDetail[] = [];
  add(details, 'action', 'Action', args.action);
  add(details, 'target', 'Style ID', args.presetId);
  add(details, 'target', 'Style name', args.name ?? args.rename);
  return details;
}

const FIELD_DETAILS: ReadonlyArray<readonly [string, ApprovalDetailKind, string]> = [
  ['action', 'action', 'Action'],
  ['command', 'command', 'Command'],
  ['url', 'url', 'URL'],
  ['urls', 'url', 'URL'],
  ['sourceUrl', 'url', 'Source URL'],
  ['filePath', 'path', 'File path'],
  ['inputPath', 'path', 'Input path'],
  ['targetPath', 'path', 'Target path'],
  ['destinationPath', 'output', 'Output target'],
  ['path', 'path', 'Path'],
  ['outputPath', 'output', 'Output target'],
  ['outputs', 'output', 'Output target'],
  ['destination', 'output', 'Output target'],
  ['output', 'output', 'Output target'],
  ['filename', 'output', 'Output name'],
  ['outputTarget', 'output', 'Output target'],
  ['name', 'output', 'Output name'],
  ['repo', 'target', 'Repository'],
  ['slug', 'target', 'Install directory'],
  ['provider', 'parameter', 'Provider'],
  ['track', 'target', 'Track'],
  ['skill', 'target', 'Skills'],
  ['assetId', 'target', 'Asset ID'],
  ['projectId', 'target', 'Project ID'],
  ['skillId', 'target', 'Skill ID'],
  ['templateId', 'target', 'Template ID'],
  ['versionId', 'target', 'Version ID'],
  ['model', 'parameter', 'Model'],
  ['prompt', 'parameter', 'Prompt'],
  ['format', 'parameter', 'Format'],
  ['codec', 'parameter', 'Codec'],
  ['resolution', 'parameter', 'Resolution'],
];

function genericDetails(args: Readonly<Record<string, unknown>>): ApprovalDetail[] {
  const details: ApprovalDetail[] = [];
  for (const [key, kind, label] of FIELD_DETAILS) add(details, kind, label, args[key]);
  return details;
}

export function approvalPresentationFromDetails(
  tool: string,
  details: readonly ApprovalDetail[],
): ToolApprovalPresentation {
  const suffix = details.map((detail) => `${detail.label}=${detail.value}`).join(' · ');
  return { summary: suffix ? `${tool} · ${suffix}` : tool, details };
}

export function formatToolApprovalDetails(
  tool: string,
  args: Readonly<Record<string, unknown>>,
): ToolApprovalPresentation {
  const details = tool === 'run_code'
    ? runCodeDetails(args)
    : tool === 'manage_design_style'
      ? designDetails(args)
      : genericDetails(args);
  if (tool === 'download_media') add(details, 'output', 'Output directory', '/media/uploads/');
  return approvalPresentationFromDetails(tool, details);
}
