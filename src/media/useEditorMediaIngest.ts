import { useCallback, useEffect } from 'react';
import type { AgentReference } from '../agent/context';
import { enqueueVisualAnalysis, refreshVisualAnalysis } from '../agent/progress/visual-analysis-jobs';
import { appendManualLane, identifyManualCues, isManualCaptionEntry, newManualCaptions } from '../captions/manualCaptions';
import { placeMediaAssets, reflowPlacedMediaItems } from '../editor/mediaAssetPlacement';
import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { EditorCommands } from '../editor/store';
import { captionsOnTrack, defaultTrackId, trackKind, type MediaAsset, type ProjectDoc, type TimelineState, type TrackId } from '../editor/types';
import type { Tpl } from '../types';
import { duplicateAssetName } from './assetMenuSelection';
import { classifyExternalFile, parseDroppedCaptions } from './externalFileDrop';
import { createImportContentIdentityHooks } from './importContentIdentity';
import { findMediaNameConflict, MediaImportCancelledError } from './mediaImportConflict';
import { mediaAssetRelinkPatch, uploadedMediaRelinkPatch } from './mediaAssetRelink';
import { importUploadedMedia } from './mobileImport';
import type { MobileUploadRecord } from './mobileUploadApi';
import { createImportTranscriptionGate, createMediaAssetsChatSeed, importMedia, readyMediaAssetsForPaste, type ImportMediaHooks, type ImportTranscriptionStart } from './upload';
import { enqueueTranscription, getTranscribeJob, shouldTranscribe, untranscribedTimelineItemIdsForRevision, type TranscribeJob } from '../transcript/transcribe-jobs';
import { shouldAutoTranscribeIngest } from '../transcript/provider';
import { showAppToast } from '../ui/appToast';

type StartAssetTranscription = (asset: ImportTranscriptionStart['asset'], asrPath?: string | null | Promise<string | null>, markRunning?: boolean) => void;
type ChatSeed = { text: string; nonce: number; references?: AgentReference[] } | null;
type ImportLifecycle = {
  onPlaceholder?: (asset: MediaAsset) => void;
  onAssetUpdated?: (asset: MediaAsset) => void;
  onFailure?: (asset: MediaAsset | null, error: unknown) => void;
};
type ImportToPool = (file: File, onProgress?: (ratio: number) => void, lifecycle?: ImportLifecycle) => Promise<MediaAsset>;
interface PoolImports {
  ingestToPool: (asset: MediaAsset) => void;
  importMobileUpload: (record: MobileUploadRecord) => Promise<void>;
  importToPool: ImportToPool;
}

interface EditorMediaIngestOptions {
  commands: EditorCommands;
  projectId: string;
  assets: MediaAsset[];
  stateRef: { current: TimelineState };
  docRef: { current: ProjectDoc };
  getPlayhead: () => number;
  setChatCollapsed: (collapsed: boolean) => void;
  setChatSeed: (seed: ChatSeed) => void;
}

interface ImportTranscriptionGate {
  uploaded: (info: Parameters<NonNullable<ImportMediaHooks['onUploaded']>>[0]) => ImportTranscriptionStart | null;
  ready: (asset: MediaAsset) => ImportTranscriptionStart | null;
}
interface PoolImportRun {
  commands: EditorCommands;
  stateRef: { current: TimelineState };
  startAssetTranscription: StartAssetTranscription;
  targetId?: string;
  placeholderId: string | null;
  placeholder: MediaAsset | null;
  canonicalizedAsset: MediaAsset | null;
  transcriptionGate: ImportTranscriptionGate;
  lifecycle?: ImportLifecycle;
}

interface PlacedItem {
  assetId: string;
  itemId: string;
  kind: 'video' | 'audio';
  startFrame: number;
  durationInFrames: number;
  autoManaged: boolean;
  pendingAutoWrite?: { fromStartFrame: number; toStartFrame: number };
}

interface DropBatch {
  batchStartFrame: number;
  placedItems: PlacedItem[];
  stoppedReflowKinds: Set<'video' | 'audio'>;
  pendingDurations: Map<string, number>;
}

interface DropContext {
  commands: EditorCommands;
  stateRef: { current: TimelineState };
  startAssetTranscription: StartAssetTranscription;
}

function finishTranscription(job: TranscribeJob, projectId: string, commands: EditorCommands, stateRef: { current: TimelineState }, docRef: { current: ProjectDoc }): void {
  const currentAsset = docRef.current.assets.find((asset) => asset.id === job.assetId);
  const currentJob = getTranscribeJob(projectId, job.assetId);
  if (!currentAsset || sourceRevisionOf(currentAsset) !== job.sourceRevision
    || !currentJob || currentJob.generation !== job.generation
    || currentJob.sourceRevision !== job.sourceRevision) return;
  if (job.status === 'done' && job.words?.length) {
    commands.setAssetTranscription(job.assetId, {
      transcript: job.words,
      transcribeStatus: 'done',
      transcribeError: undefined,
    });
    for (const itemId of untranscribedTimelineItemIdsForRevision(stateRef.current.items, job.sourceRevision)) {
      commands.setItemTranscript(itemId, job.words);
    }
  } else if (job.status === 'failed') {
    commands.setAssetTranscription(job.assetId, {
      transcribeStatus: 'failed',
      transcribeError: job.error,
    });
  }
}

function poolImportHooks(run: PoolImportRun, onProgress?: (ratio: number) => void): ImportMediaHooks {
  return {
    onProgress,
    ...createImportContentIdentityHooks({
      getAssets: () => run.stateRef.current.assets ?? [],
      onCanonical: (canonical, duplicateId) => {
        run.canonicalizedAsset = canonical;
        run.commands.canonicalizeMediaAsset(run.targetId ?? duplicateId, canonical.id);
      },
    }),
    onPlaceholder: (asset) => {
      if (run.targetId) return;
      run.placeholderId = asset.id;
      run.placeholder = asset;
      run.commands.addAsset(asset);
      run.lifecycle?.onPlaceholder?.(asset);
    },
    onUploaded: (info) => {
      if (!run.targetId) run.commands.relinkMediaAsset(info.id, uploadedMediaRelinkPatch(info));
      const start = run.transcriptionGate.uploaded(info);
      if (start && shouldAutoTranscribeIngest()) run.startAssetTranscription(start.asset, start.asrPath);
    },
    onReady: (asset) => {
      const ready = run.targetId ? { ...asset, id: run.targetId } : asset;
      run.commands.relinkMediaAsset(ready.id, mediaAssetRelinkPatch(ready));
      const start = run.transcriptionGate.ready(ready);
      if (start && shouldAutoTranscribeIngest()) run.startAssetTranscription(start.asset, start.asrPath);
      if (ready.kind !== 'audio') refreshVisualAnalysis(ready);
    },
  };
}

async function importAssetToPool(file: File, onProgress: ((ratio: number) => void) | undefined, lifecycle: ImportLifecycle | undefined, context: Pick<EditorMediaIngestOptions, 'commands' | 'stateRef'>, startAssetTranscription: StartAssetTranscription): Promise<MediaAsset> {
  const existing = findMediaNameConflict(context.stateRef.current.assets ?? [], file.name);
  if (existing && !window.confirm(`Asset “${existing.name}” already exists. Overwriting also replaces the copy already used on the timeline.`)) throw new MediaImportCancelledError();
  const run: PoolImportRun = {
    commands: context.commands,
    stateRef: context.stateRef,
    startAssetTranscription,
    targetId: existing?.id,
    placeholderId: null,
    placeholder: null,
    canonicalizedAsset: null,
    transcriptionGate: createImportTranscriptionGate(existing?.id),
    lifecycle,
  };
  try {
    const imported = await importMedia(file, context.stateRef.current.fps, poolImportHooks(run, onProgress));
    const ready = run.canonicalizedAsset ?? (run.targetId ? { ...imported, id: run.targetId } : imported);
    lifecycle?.onAssetUpdated?.(ready);
    return ready;
  } catch (error) {
    if (run.placeholderId) context.commands.removeMediaAsset(run.placeholderId);
    lifecycle?.onFailure?.(run.placeholder, error);
    throw error;
  }
}

function nextStartForKind(batch: DropBatch, kind: 'video' | 'audio'): number {
  return batch.placedItems
    .filter((item) => item.kind === kind)
    .reduce(
      (frame, item) => frame + Math.max(1, item.durationInFrames),
      batch.batchStartFrame,
    );
}

function stopAutoReflowFrom(batch: DropBatch, kind: 'video' | 'audio', itemId: string): void {
  let stop = false;
  for (const candidate of batch.placedItems) {
    if (candidate.kind !== kind) continue;
    if (candidate.itemId === itemId) stop = true;
    if (!stop) continue;
    candidate.autoManaged = false;
    delete candidate.pendingAutoWrite;
  }
  batch.stoppedReflowKinds.add(kind);
}

function reconcilePlacedItem(batch: DropBatch, item: PlacedItem, placementStartFrame: number, context: DropContext): void {
  const live = context.stateRef.current.items.find((candidate) => candidate.id === item.itemId);
  if (!live) return stopAutoReflowFrom(batch, item.kind, item.itemId);
  const pending = item.pendingAutoWrite;
  if (live.startFrame === item.startFrame) delete item.pendingAutoWrite;
  else if (!pending || pending.toStartFrame !== item.startFrame
    || live.startFrame !== pending.fromStartFrame) {
    stopAutoReflowFrom(batch, item.kind, item.itemId);
    return;
  }
  if (item.startFrame === placementStartFrame) return;
  const fromStartFrame = item.pendingAutoWrite?.fromStartFrame ?? live.startFrame;
  item.startFrame = placementStartFrame;
  item.pendingAutoWrite = { fromStartFrame, toStartFrame: placementStartFrame };
  context.commands.setItemTiming(item.itemId, { startFrame: placementStartFrame });
}

function reflowPlacedBatch(batch: DropBatch, context: DropContext): void {
  for (const placement of reflowPlacedMediaItems(batch.placedItems, batch.batchStartFrame)) {
    const item = batch.placedItems.find((candidate) => candidate.itemId === placement.itemId);
    if (item?.autoManaged) reconcilePlacedItem(batch, item, placement.startFrame, context);
  }
}

function updatePlacedAsset(batch: DropBatch, asset: MediaAsset, context: DropContext): void {
  batch.pendingDurations.set(asset.id, asset.durationInFrames);
  const item = batch.placedItems.find((candidate) => candidate.assetId === asset.id);
  if (!item) return;
  item.durationInFrames = Math.max(1, asset.durationInFrames);
  reflowPlacedBatch(batch, context);
}

function removePlacedAsset(batch: DropBatch, assetId: string, context: DropContext): void {
  const index = batch.placedItems.findIndex((candidate) => candidate.assetId === assetId);
  if (index < 0) return;
  const [{ itemId }] = batch.placedItems.splice(index, 1);
  context.commands.removeItem(itemId);
  context.commands.removeMediaAsset(assetId);
  reflowPlacedBatch(batch, context);
}

function timelineImportHooks(batch: DropBatch, context: DropContext, placeholder: { id: string | null }, resolve: (asset: MediaAsset) => void): ImportMediaHooks {
  return {
    ...createImportContentIdentityHooks({
      getAssets: () => context.stateRef.current.assets ?? [],
      onCanonical: (canonical, duplicateId) => {
        const placement = batch.placedItems.find((candidate) => candidate.assetId === duplicateId);
        if (placement) placement.assetId = canonical.id;
        context.commands.canonicalizeMediaAsset(duplicateId, canonical.id);
        updatePlacedAsset(batch, canonical, context);
      },
    }),
    onPlaceholder: (asset) => {
      placeholder.id = asset.id;
      context.commands.addAsset(asset);
      resolve(asset);
    },
    onUploaded: (info) => {
      context.commands.relinkMediaAsset(info.id, uploadedMediaRelinkPatch(info));
      context.startAssetTranscription(info, info.asrPath);
    },
    onReady: (asset) => {
      context.commands.relinkMediaAsset(asset.id, mediaAssetRelinkPatch(asset));
      if (asset.kind !== 'audio') refreshVisualAnalysis(asset);
      updatePlacedAsset(batch, asset, context);
    },
  };
}

function awaitTimelinePlaceholder(file: File, batch: DropBatch, context: DropContext): Promise<MediaAsset> {
  const { promise, resolve, reject } = Promise.withResolvers<MediaAsset>();
  const placeholder = { id: null as string | null };
  void importMedia(
    file,
    context.stateRef.current.fps,
    timelineImportHooks(batch, context, placeholder, resolve),
  ).catch((error) => {
    if (!placeholder.id) reject(error);
    else removePlacedAsset(batch, placeholder.id, context);
    showAppToast(error instanceof Error ? error.message : 'Import failed', { error: true });
  });
  return promise;
}

async function importDroppedCaptions(file: File, trackId: TrackId, startFrame: number, context: DropContext): Promise<void> {
  try {
    const snapshot = context.stateRef.current;
    const captionTrackId = trackKind(snapshot, trackId) === 'caption'
      ? trackId
      : defaultTrackId(snapshot, 'caption');
    if (!captionTrackId) throw new Error('Create a caption track first');
    const words = identifyManualCues(parseDroppedCaptions(
      file.name,
      await file.text(),
      Math.max(0, startFrame) * 1000 / snapshot.fps,
    ));
    if (!words.length) throw new Error('The caption file has no usable content');
    const current = captionsOnTrack(snapshot, captionTrackId) ?? newManualCaptions();
    const withLane = current.sourceEntries?.some(isManualCaptionEntry)
      ? current
      : { ...current, ...appendManualLane(current, snapshot.items) };
    const lane = withLane.sourceEntries?.find(isManualCaptionEntry);
    if (!lane) throw new Error('Could not create a caption track');
    context.commands.setCaptions({
      ...withLane,
      enabled: true,
      sourceEntries: withLane.sourceEntries?.map((entry) => entry.id === lane.id
        ? { ...entry, words: [...(entry.words ?? []), ...words] }
        : entry),
    }, captionTrackId);
  } catch (error) {
    showAppToast(error instanceof Error ? error.message : 'Failed to read the caption file', { error: true });
  }
}

async function placeDroppedMedia(file: File, mediaKind: MediaAsset['kind'], trackId: TrackId, batch: DropBatch, context: DropContext): Promise<string | null> {
  try {
    const asset = await awaitTimelinePlaceholder(file, batch, context);
    const kind = mediaKind === 'audio' ? 'audio' : 'video';
    const snapshot = context.stateRef.current;
    const destination = trackKind(snapshot, trackId) === kind
      ? trackId
      : defaultTrackId(snapshot, kind);
    const itemStartFrame = nextStartForKind(batch, kind);
    const itemId = context.commands.addMediaItem(asset, {
      track: destination ?? undefined,
      startFrame: itemStartFrame,
    });
    batch.placedItems.push({
      assetId: asset.id,
      itemId,
      kind,
      startFrame: itemStartFrame,
      durationInFrames: batch.pendingDurations.get(asset.id) ?? asset.durationInFrames,
      autoManaged: !batch.stoppedReflowKinds.has(kind),
    });
    return itemId;
  } catch (error) {
    showAppToast(error instanceof Error ? error.message : 'Import failed', { error: true });
    return null;
  }
}

async function dropFilesToTimeline(files: File[], trackId: TrackId, startFrame: number, context: DropContext): Promise<void> {
  const batch: DropBatch = {
    batchStartFrame: Math.max(0, Math.round(startFrame)),
    placedItems: [],
    stoppedReflowKinds: new Set(),
    pendingDurations: new Map(),
  };
  const addedIds: string[] = [];
  for (const file of files) {
    const target = classifyExternalFile(file);
    if (!target) {
      showAppToast(`Unsupported file: “${file.name}”`, { error: true });
    } else if (target.type === 'caption') {
      await importDroppedCaptions(file, trackId, startFrame, context);
    } else {
      const itemId = await placeDroppedMedia(file, target.mediaKind, trackId, batch, context);
      if (itemId) addedIds.push(itemId);
    }
  }
  if (addedIds.length) context.commands.selectItems(addedIds);
}

function useAssetTranscription(options: EditorMediaIngestOptions): StartAssetTranscription {
  const { assets, commands, projectId, stateRef, docRef } = options;
  const start = useCallback<StartAssetTranscription>((asset, asrPath, markRunning = true) => {
    if (!shouldTranscribe(asset.kind)) return;
    if (markRunning) {
      commands.setAssetTranscription(asset.id, {
        transcribeStatus: 'running',
        transcribeError: undefined,
      });
    }
    enqueueTranscription(projectId, asset, {
      asrPath,
      getCurrentAsset: () => docRef.current.assets.find((candidate) => candidate.id === asset.id),
      onComplete: (job) => finishTranscription(job, projectId, commands, stateRef, docRef),
    });
  }, [commands, docRef, projectId, stateRef]);
  useEffect(() => {
    for (const asset of assets) {
      if ((asset.kind === 'audio' || asset.kind === 'video')
        && asset.src && asset.transcribeStatus === 'running') {
        start(asset, undefined, false);
      }
    }
  }, [assets, start]);
  return start;
}

function usePoolImports(options: EditorMediaIngestOptions, start: StartAssetTranscription): PoolImports {
  const { commands, stateRef } = options;
  const ingestToPool = useCallback((asset: MediaAsset) => {
    const autoTranscribe = shouldTranscribe(asset.kind) && shouldAutoTranscribeIngest();
    commands.addAsset(autoTranscribe ? { ...asset, transcribeStatus: 'running' } : asset);
    if (autoTranscribe) start(asset);
    if (asset.kind !== 'audio') enqueueVisualAnalysis(asset);
  }, [commands, start]);
  const importMobileUpload = useCallback(async (record: MobileUploadRecord) => {
    ingestToPool(await importUploadedMedia(record, stateRef.current.fps));
  }, [ingestToPool, stateRef]);
  const importToPool = useCallback((
    file: File,
    onProgress?: (ratio: number) => void,
    lifecycle?: ImportLifecycle,
  ) => importAssetToPool(
    file, onProgress, lifecycle, { commands, stateRef }, start,
  ), [commands, start, stateRef]);
  return { ingestToPool, importMobileUpload, importToPool };
}

function useTimelineImports(
  options: EditorMediaIngestOptions,
  start: StartAssetTranscription,
  importToPool: ImportToPool,
) {
  const { commands, stateRef, getPlayhead } = options;
  const dropExternalFilesToTimeline = useCallback((files: File[], trackId: TrackId, startFrame: number) => (
    dropFilesToTimeline(files, trackId, startFrame, { commands, stateRef, startAssetTranscription: start })
  ), [commands, start, stateRef]);
  const addMediaAssetsToTimeline = useCallback((assets: MediaAsset[]) => {
    placeMediaAssets({
      assetIds: assets.map((asset) => asset.id),
      assets,
      startFrame: getPlayhead(),
      add: (asset, frame) => commands.addMediaItem(asset, { startFrame: frame }),
      select: commands.selectItems,
    });
  }, [commands, getPlayhead]);
  const importToCanvas = useCallback(async (file: File, onProgress?: (ratio: number) => void) => {
    const asset = await importToPool(file, onProgress);
    commands.addMediaItem(asset);
  }, [commands, importToPool]);
  return { dropExternalFilesToTimeline, addMediaAssetsToTimeline, importToCanvas };
}

function useMediaPaste(options: EditorMediaIngestOptions) {
  const { commands, stateRef } = options;
  return useCallback((assets: MediaAsset[], folderId?: string) => {
    const readyAssets = readyMediaAssetsForPaste(assets, stateRef.current.assets ?? []);
    if (!readyAssets.length) return;
    commands.batch(readyAssets.map((asset) => ({
      type: 'addAsset' as const,
      asset: {
        ...asset,
        id: `asset_${crypto.randomUUID()}`,
        name: duplicateAssetName(asset.name, 'copy'),
        folderId,
      },
    })), 'Paste media');
  }, [commands, stateRef]);
}

function useMediaAISeeds(options: EditorMediaIngestOptions) {
  const { setChatCollapsed, setChatSeed } = options;
  const useMediaAI = useCallback((assets: MediaAsset[]) => {
    const seed = createMediaAssetsChatSeed(assets);
    if (!seed) return;
    setChatCollapsed(false);
    setChatSeed(seed);
  }, [setChatCollapsed, setChatSeed]);
  const useTemplateAI = useCallback((tpl: Tpl) => {
    setChatCollapsed(false);
    setChatSeed({
      text: `Using template "${tpl.name}" as a style reference, generate a similar animation with create_motion_graphic: @${tpl.name} `,
      nonce: Date.now(),
      references: [{ id: tpl.id, name: tpl.name, kind: 'template' }],
    });
  }, [setChatCollapsed, setChatSeed]);
  return { useMediaAI, useTemplateAI };
}

export function useEditorMediaIngest(options: EditorMediaIngestOptions) {
  const startAssetTranscription = useAssetTranscription(options);
  const pool = usePoolImports(options, startAssetTranscription);
  const timeline = useTimelineImports(options, startAssetTranscription, pool.importToPool);
  const pasteMediaAssets = useMediaPaste(options);
  const ai = useMediaAISeeds(options);
  return {
    startAssetTranscription,
    ...pool,
    ...timeline,
    pasteMediaAssets,
    ...ai,
  };
}
