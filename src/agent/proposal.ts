// The propose→apply contract. Structural agent edits are
// captured as a PROPOSAL (options → operations), reviewed by the user, then
// committed atomically on approve — the agent never mutates the timeline directly.
// Shape: (Proposal{title,summary,totalImpact,options[]} →
// Option{id,label,recommended,summary,totalImpact,operations[]} →
// Operation{tool,args,action,target,impact,risk,rationale}); we additionally
// carry the store actions per operation so approve can replay them atomically.
import type { AnyAction } from '../editor/store';
import type { ProjectDoc, TimelineState } from '../editor/types';
import { migrateProjectDoc } from '../persist/projectStore';

export interface Operation {
  tool: string;
  args: Record<string, unknown>;
  /** store actions this tool produced — replayed on approve (one atomic commit) */
  actions: AnyAction[];
  action: string; // human verb
  target: string; // what it affects
  impact: string; // per-op impact
  /** Consecutive calls collapsed into this review row. */
  callCount?: number;
  rationale?: string;
}

export interface ProposalOption {
  id: string;
  label: string;
  recommended: boolean;
  summary: string;
  totalImpact: string;
  operations: Operation[];
}

export interface Proposal {
  /** Stable identity for durable proposal events. Omitted only by legacy/external proposals. */
  id?: string;
  title: string;
  summary: string;
  totalImpact: string;
  options: ProposalOption[];
  /** Durable Agent run that produced this proposal. Omitted for legacy/external proposals. */
  agentRunId?: string;
  /** project snapshot at propose time — apply is stale if anything changed */
  baseDoc: ProjectDoc;
  /** draft result — used for the in-player preview */
  resultState: TimelineState;
}

export interface BuiltProposal extends Proposal {
  id: string;
}

// map an agent tool call + the store actions it produced into a display Operation.
const VERB: Record<string, string> = {
  add_motion_graphic: 'Add motion graphic',
  create_motion_graphic: 'Generate motion graphic',
  add_audio: 'Add audio',
  update_item_props: 'Change properties',
  move_item: 'Move clip',
  set_item_timing: 'Change duration/position',
  duplicate_item: 'Duplicate clip',
  remove_item: 'Delete clip',
  split_item: 'Split clip',
  clear_timeline: 'Clear timeline',
  set_aspect_ratio: 'Change aspect ratio',
  set_item_transcript: 'Attach transcript',
  delete_text: 'Delete text = delete video',
  clean_script: 'Clean up voiceover',
  edit_captions: 'Edit captions',
  manage_timelines: 'Manage sequences',
  edit_track: 'Manage tracks',
  manage_media_pool: 'Organize media pool',
  isolate_voice: 'Voice Isolation',
  apply_script: 'Apply script edits',
  manage_effects: 'Effects',
  edit_item: 'Edit clip',
  browse_library: 'Browse library',
};

function targetOf(args: Record<string, unknown>, actions: AnyAction[]): string {
  const name = args.name ?? args.query ?? args.template ?? args.ratio;
  if (typeof name === 'string') return name;
  const id = args.id ?? args.itemId ?? args.timelineId ?? args.targetItemId ?? args.assetId;
  if (typeof id === 'string') return id;
  // fall back to the first added/edited item's or timeline's name
  for (const a of actions) {
    if (a.type === 'add' && a.item?.name) return a.item.name;
    if (a.type === 'tl.create') return a.timeline.name;
    if (a.type === 'tl.duplicate' || a.type === 'tl.rename') return a.name;
  }
  return 'Timeline';
}

function impactOf(actions: AnyAction[]): string {
  let add = 0, del = 0, mod = 0, addSeq = 0, delSeq = 0;
  for (const a of actions) {
    if (a.type === 'add' || a.type === 'duplicate' || a.type === 'split') add++;
    else if (a.type === 'remove') del++;
    else if (a.type === 'tl.create' || a.type === 'tl.duplicate') addSeq++;
    else if (a.type === 'tl.delete') delSeq++;
    else if (a.type === 'tl.switch') continue; // navigation, not an edit
    else mod++;
  }
  const parts: string[] = [];
  if (addSeq) parts.push(`+${addSeq} sequences`);
  if (delSeq) parts.push(`−${delSeq} sequences`);
  if (add) parts.push(`+${add} clips`);
  if (del) parts.push(`−${del} clips`);
  if (mod) parts.push(`${mod} changes`);
  return parts.join(' · ') || 'No changes';
}

export function buildOperation(tool: string, args: Record<string, unknown>, actions: AnyAction[]): Operation {
  return {
    tool,
    args,
    actions,
    action: VERB[tool] ?? tool,
    target: targetOf(args, actions),
    impact: impactOf(actions),
    rationale: typeof args.rationale === 'string' ? args.rationale : undefined,
  };
}

function stableArgs(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableArgs).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableArgs(record[key])}`).join(',')}}`;
}

/** Group only exact duplicate consecutive calls without changing replay order. */
export function compactOperations(operations: Operation[]): Operation[] {
  const compacted: Operation[] = [];
  for (const operation of operations) {
    const previous = compacted.at(-1);
    if (
      !previous
      || previous.tool !== operation.tool
      || previous.target !== operation.target
      || stableArgs(previous.args) !== stableArgs(operation.args)
    ) {
      compacted.push(operation);
      continue;
    }
    const actions = [...previous.actions, ...operation.actions];
    compacted[compacted.length - 1] = {
      ...operation,
      actions,
      impact: impactOf(actions),
      callCount: (previous.callCount ?? 1) + (operation.callCount ?? 1),
    };
  }
  return compacted;
}

// wrap collected operations into a single-option proposal (operations lacking
// explicit options are auto-wrapped into one recommended option).
export function buildProposal(
  operations: Operation[],
  assistantText: string,
  baseDoc: ProjectDoc,
  resultState: TimelineState,
  agentRunId?: string,
): BuiltProposal {
  const compacted = compactOperations(operations);
  const totalImpact = impactOf(compacted.flatMap((o) => o.actions));
  const summary = assistantText.trim() || `${compacted.length} edits`;
  return {
    id: crypto.randomUUID(),
    title: 'Agent edit proposal',
    summary,
    totalImpact,
    options: [{ id: 'opt-1', label: 'Apply all', recommended: true, summary, totalImpact, operations: compacted }],
    baseDoc,
    resultState,
    ...(agentRunId ? { agentRunId } : {}),
  };
}

/**
 * Stale when the live project no longer matches the snapshot used to build the
 * proposal. In-session, ProjectDoc updates are immutable → reference inequality
 * is enough and cheap. After IDB rehydrate, baseDoc is a deep clone and may have
 * passed migrateProjectDoc (track normalization, etc.), so fall back to
 * structural equality of *normalized* docs.
 */
export function projectDocsDiffer(baseDoc: ProjectDoc, currentDoc: ProjectDoc): boolean {
  if (baseDoc === currentDoc) return false;
  try {
    const left = migrateProjectDoc(baseDoc) ?? baseDoc;
    const right = migrateProjectDoc(currentDoc) ?? currentDoc;
    return JSON.stringify(left) !== JSON.stringify(right);
  } catch {
    return true;
  }
}

export function isProposalStale(proposal: Proposal, currentDoc: ProjectDoc): boolean {
  return projectDocsDiffer(proposal.baseDoc, currentDoc);
}

/** Generated files are durable side effects: save assets now, propose only timeline edits. */
export function partitionProposalActions(actions: AnyAction[]): { persistent: AnyAction[]; proposed: AnyAction[] } {
  return {
    persistent: actions.filter((action) => action.type === 'addAsset'),
    proposed: actions.filter((action) => action.type !== 'addAsset'),
  };
}
